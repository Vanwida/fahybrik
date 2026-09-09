import Foundation
import Observation
import HealthKit
import os

// FH-97 — ONE Watch PRIMARY owner. Apple pattern:
// watchOS creates PRIMARY (`handle(_:)` / solo) → `startMirroringToCompanionDevice`;
// iOS receives mirrored session via `workoutSessionMirroringStartHandler`.
// Solo coach motor lives on WatchWorkoutCoordinator; this object owns HK only.

@MainActor
@Observable
final class WatchPrimaryOwner: NSObject {

    static let shared = WatchPrimaryOwner()

    typealias Phase = WatchPrimaryLifecycle.Phase
    typealias Role = WatchPrimaryLifecycle.Role

    private(set) var phase: Phase = .idle
    private(set) var role: Role?

    var showsMirrorHUD: Bool { WatchPrimaryLifecycle.showsMirrorHUD(role: role) }
    var hasLocalSession: Bool { session != nil }
    var isEnding: Bool { phase == .ending }

    var frame: MirrorStateFrame?
    var frameReceivedAt: Date?
    var liveHR: Int?
    var activeKcal: Double = 0
    var distanceMeters: Double = 0
    var builderElapsed: TimeInterval { builder?.elapsedTime ?? 0 }
    var isConnectionLost = false

    var onHeartRate: ((Int) -> Void)?
    var onDistanceDelta: ((Double) -> Void)?

    var liveZone: HRZone? {
        guard let zones = WatchPlanModel.shared.today?.athleteHrZones else { return nil }
        return liveHR.flatMap { zones.zone(forBpm: $0) }
    }

    static let connectionLostAfter: TimeInterval = 15
    static let hrRelayMinInterval: TimeInterval = 1

    static let workoutDataTypes: Set<HKSampleType> = [
        HKObjectType.workoutType(),
        HKQuantityType(.heartRate),
        HKQuantityType(.activeEnergyBurned),
        HKQuantityType(.distanceWalkingRunning)
    ]

    static func requestWorkoutAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let store = HKHealthStore()
        try? await store.requestAuthorization(toShare: workoutDataTypes, read: workoutDataTypes)
    }

    private static let log = Logger(subsystem: Marca.subsistemaLog("primary"), category: "watch-lifecycle")

    let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var hkPaused = false
    private var isTeardownRunning = false
    private var lastHRRelayAt: Date = .distantPast
    private var lastReportedDistance: Double = 0
    private var appliedPlan: WatchHKActivityPlan?
    private var startedPlan: WatchHKActivityPlan?
    private var pendingPlan: WatchHKActivityPlan?
    private let locationGate = WatchRunLocationGate()
    private var lastSignalAt: Date = .distantPast
    private var connectionWatchdog: Timer?
    private var teardownDeadlineTimer: Timer?
    private var pendingStartConfiguration: HKWorkoutConfiguration?
    private var pendingStartRole: Role = .mirror
    private var lastSavedWorkoutUuid: String?

    private override init() { super.init() }

    // MARK: - Start (idempotent)

    func recoverActiveIfNeeded() {
        guard phase == .idle, session == nil else { return }
        store.recoverActiveWorkoutSession { [weak self] incoming, _ in
            guard let incoming else { return }
            Task { @MainActor in
                self?.adopt(incoming, role: .orphan)
            }
        }
    }

    func startFromPhone(configuration: HKWorkoutConfiguration) {
        requestStart(configuration: configuration, role: .mirror)
    }

    func requestAuthorization() async {
        await Self.requestWorkoutAuthorization()
    }

    func startSolo(
        activityType: HKWorkoutActivityType,
        locationType: HKWorkoutSessionLocationType,
        reuseIfPresent: Bool = false
    ) {
        let config = HKWorkoutConfiguration()
        config.activityType = activityType
        config.locationType = locationType
        startSolo(configuration: config, reuseIfPresent: reuseIfPresent)
    }

    func startSolo(configuration: HKWorkoutConfiguration, reuseIfPresent: Bool) {
        if reuseIfPresent, phase == .recording, session != nil {
            role = .solo
            if let pending = pendingPlan { syncSoloActivity(pending) }
            return
        }
        requestStart(configuration: configuration, role: .solo)
    }

    private func requestStart(configuration: HKWorkoutConfiguration, role: Role) {
        if MirrorPrimaryLaunchPolicy.shouldIgnoreRedundantStart(
            isRecording: phase == .recording,
            current: session?.workoutConfiguration,
            incoming: configuration
        ) {
            Self.log.info("startPrimary ignored — already recording compatible PRIMARY")
            return
        }
        if MirrorPrimaryLaunchPolicy.shouldFinishBeforeRestart(
            isRecording: phase == .recording,
            current: session?.workoutConfiguration,
            incoming: configuration
        ) {
            Self.log.warning("PRIMARY leftover phase=\(String(describing: self.phase), privacy: .public) — finishing then starting")
            pendingStartConfiguration = configuration
            pendingStartRole = role
            if phase == .recording { finish(save: true) }
            return
        }
        let standaloneActive = WatchWorkoutCoordinator.shared.phase != .idle
        guard WatchPrimaryLifecycle.acceptsStart(
            current: phase,
            standaloneActive: standaloneActive,
            role: role
        ) else {
            if phase != .idle {
                Self.log.warning("start declined — phase=\(String(describing: self.phase), privacy: .public)")
            }
            return
        }
        Task { await begin(configuration: configuration, role: role) }
    }

    private func begin(configuration: HKWorkoutConfiguration, role: Role) async {
        guard phase == .idle else { return }
        if role == .mirror, WatchWorkoutCoordinator.shared.phase != .idle { return }
        await Self.requestWorkoutAuthorization()
        guard phase == .idle else { return }
        do {
            let created = try HKWorkoutSession(healthStore: store, configuration: configuration)
            bind(created, role: role, configuration: configuration)
            do {
                try await created.startMirroringToCompanionDevice()
            } catch {
                // Phone unreachable; wrist PRIMARY still records.
            }
            let start = Date()
            created.startActivity(with: start)
            await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                builder?.beginCollection(withStart: start) { _, _ in cont.resume() }
            }
            lastSignalAt = start
            if let pending = pendingPlan { syncSoloActivity(pending) }
            if role == .mirror || role == .orphan {
                startConnectionWatchdog()
                requestSyncUntilFirstFrame()
            }
            if role == .mirror { WatchHaptics.start() }
        } catch {
            forceIdle()
        }
    }

    func adopt(_ incoming: HKWorkoutSession, role: Role = .orphan) {
        guard phase == .idle, session == nil else { return }
        if role == .mirror, WatchWorkoutCoordinator.shared.phase != .idle { return }
        bind(incoming, role: role, configuration: incoming.workoutConfiguration)
        lastSignalAt = Date()
        if role == .mirror || role == .orphan {
            startConnectionWatchdog()
            requestSyncUntilFirstFrame()
        }
        WatchHaptics.start()
    }

    private func bind(
        _ incoming: HKWorkoutSession,
        role: Role,
        configuration: HKWorkoutConfiguration
    ) {
        self.role = role
        phase = .recording
        frame = nil
        frameReceivedAt = nil
        liveHR = nil
        activeKcal = 0
        distanceMeters = 0
        isConnectionLost = false
        hkPaused = false
        isTeardownRunning = false
        session = incoming
        incoming.delegate = self
        let liveBuilder = incoming.associatedWorkoutBuilder()
        let dataSource = HKLiveWorkoutDataSource(
            healthStore: store,
            workoutConfiguration: configuration
        )
        WatchHKActivityPlan.enableDistanceCollection(on: dataSource)
        liveBuilder.dataSource = dataSource
        liveBuilder.delegate = self
        builder = liveBuilder
        startedPlan = WatchHKActivityPlan(
            isRunPiece: configuration.activityType == .running,
            activityType: configuration.activityType,
            locationType: configuration.locationType,
            wantsGPS: configuration.activityType == .running && configuration.locationType == .outdoor,
            collectDistance: configuration.activityType == .running
        )
        appliedPlan = startedPlan
    }

    // MARK: - Remote mirror (phone → watch)

    func handleRemote(_ data: Data) {
        guard let envelope = MirrorEnvelope.decoding(data) else { return }
        switch envelope.type {
        case MirrorWire.MessageType.frame:
            if let f = envelope.body(as: MirrorStateFrame.self) { applyFrame(f) }
        case MirrorWire.MessageType.end:
            if let e = envelope.body(as: MirrorEnd.self) { requestEnd(save: e.save, reason: e.save ? MirrorWire.EndReason.phone : MirrorWire.EndReason.discarded) }
        default:
            break
        }
    }

    private func applyFrame(_ f: MirrorStateFrame) {
        frame = f
        frameReceivedAt = Date()
        lastSignalAt = frameReceivedAt ?? Date()
        isConnectionLost = false
        if role == .orphan { role = .mirror }
        applyPhase(f.phase)
        syncRunActivity(from: f)
    }

    private func applyPhase(_ phaseWire: String) {
        switch phaseWire {
        case MirrorWire.Phase.paused: pause()
        case MirrorWire.Phase.active, MirrorWire.Phase.gate, MirrorWire.Phase.countIn: resume()
        default: break
        }
    }

    func sendCommand(_ kind: String) {
        send(type: MirrorWire.MessageType.command, MirrorCommand(kind: kind))
    }

    // MARK: - Activity plan (run piece switches)

    func syncSoloActivity(_ plan: WatchHKActivityPlan) {
        if let dataSource = builder?.dataSource, plan.collectDistance {
            WatchHKActivityPlan.enableDistanceCollection(on: dataSource)
        }
        guard phase == .recording, session != nil else {
            pendingPlan = plan
            return
        }
        applyActivityPlan(plan)
    }

    private func syncRunActivity(from frame: MirrorStateFrame) {
        guard let session else { return }
        let pieceIsRun = frame.tramo?.modalidad == PrescriptionModality.run.rawValue
        let plan = WatchHKActivityPlan.make(
            pieceIsRun: pieceIsRun,
            dayActivityKind: Self.dayKind(from: session.workoutConfiguration.activityType),
            environment: frame.runEnvironment ?? Self.environment(
                dayType: session.workoutConfiguration.activityType,
                sessionLocation: session.workoutConfiguration.locationType
            )
        )
        applyActivityPlan(plan)
    }

    private func applyActivityPlan(_ plan: WatchHKActivityPlan) {
        guard let session else { return }
        if let dataSource = builder?.dataSource, plan.collectDistance {
            WatchHKActivityPlan.enableDistanceCollection(on: dataSource)
        }
        pendingPlan = nil
        if role == .solo {
            applySoloActivityPlan(plan, session: session)
        } else if appliedPlan != plan {
            let sessionMatches = session.workoutConfiguration.activityType == plan.activityType
                && session.workoutConfiguration.locationType == plan.locationType
            if plan.isRunPiece {
                if appliedPlan != nil || !sessionMatches {
                    session.beginNewActivity(configuration: plan.configuration, date: Date(), metadata: nil)
                }
            } else if appliedPlan?.isRunPiece == true {
                session.endCurrentActivity(on: Date())
                session.beginNewActivity(configuration: plan.configuration, date: Date(), metadata: nil)
            }
            appliedPlan = plan
        }
        locationGate.apply(wantsGPS: plan.wantsGPS)
    }

    private func applySoloActivityPlan(_ plan: WatchHKActivityPlan, session: HKWorkoutSession) {
        if appliedPlan == plan { return }
        let matchesStart = appliedPlan == nil
            && startedPlan?.activityType == plan.activityType
            && startedPlan?.locationType == plan.locationType
        if matchesStart {
            appliedPlan = plan
            return
        }
        if plan.isRunPiece {
            session.beginNewActivity(configuration: plan.configuration, date: Date(), metadata: nil)
        } else if appliedPlan?.isRunPiece == true {
            session.endCurrentActivity(on: Date())
            session.beginNewActivity(configuration: plan.configuration, date: Date(), metadata: nil)
        }
        appliedPlan = plan
    }

    // MARK: - Pause / resume

    func pause() {
        guard phase == .recording, !hkPaused else { return }
        session?.pause()
        hkPaused = true
    }

    func resume() {
        guard phase == .recording, hkPaused else { return }
        session?.resume()
        hkPaused = false
    }

    // MARK: - End (always leaves UI within teardown deadline)

    func finishFromPhone(save: Bool) {
        requestEnd(save: save, reason: save ? MirrorWire.EndReason.phone : MirrorWire.EndReason.discarded)
    }

    func finishByAthlete() {
        requestEnd(save: true, reason: MirrorWire.EndReason.athlete)
    }

    func discardByAthlete() {
        requestEnd(save: false, reason: MirrorWire.EndReason.discarded)
    }

    func endPrimary(save: Bool) async -> String? {
        requestEnd(
            save: save,
            reason: save ? MirrorWire.EndReason.athlete : MirrorWire.EndReason.discarded
        )
        while phase == .ending {
            try? await Task.sleep(for: .milliseconds(50))
        }
        defer { lastSavedWorkoutUuid = nil }
        return lastSavedWorkoutUuid
    }

    private func requestEnd(save: Bool, reason: String) {
        guard WatchPrimaryLifecycle.acceptsEnd(current: phase, isTeardownRunning: isTeardownRunning) else { return }
        phase = .ending
        isTeardownRunning = true
        armTeardownDeadline()
        let capturedSession = session
        let capturedBuilder = builder
        Task {
            await performTeardown(
                session: capturedSession,
                builder: capturedBuilder,
                save: save,
                reason: reason
            )
            isTeardownRunning = false
            forceIdle()
        }
    }

    /// NEVER cancelled when save starts — athlete freedom beats perfect persistence.
    private func armTeardownDeadline() {
        teardownDeadlineTimer?.invalidate()
        let deadline = WatchPrimaryLifecycle.teardownDeadlineSeconds
        let timer = Timer.scheduledTimer(withTimeInterval: deadline, repeats: false) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.phase == .ending else { return }
                Self.log.warning("teardown deadline — forcing idle")
                self.forceIdle()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        teardownDeadlineTimer = timer
    }

    private func performTeardown(
        session: HKWorkoutSession?,
        builder: HKLiveWorkoutBuilder?,
        save: Bool,
        reason: String
    ) async {
        stopConnectionWatchdog()
        let now = Date()
        session?.stopActivity(with: now)

        var workoutUuid: String?
        if save, let builder {
            workoutUuid = await saveWorkout(builder: builder, at: now)
            lastSavedWorkoutUuid = workoutUuid
        } else {
            builder?.discardWorkout()
            lastSavedWorkoutUuid = nil
        }

        let endedPacket = MirrorEnvelope.encoding(
            type: MirrorWire.MessageType.ended,
            MirrorEnded(workoutUuid: workoutUuid, reason: reason)
        )
        if let session, let endedPacket {
            try? await session.sendToRemoteWorkoutSession(data: endedPacket)
        }
        session?.end()
        if let session, let endedPacket {
            try? await session.sendToRemoteWorkoutSession(data: endedPacket)
        }
        WatchHaptics.success()
    }

    private func saveWorkout(builder: HKLiveWorkoutBuilder, at date: Date) async -> String? {
        do {
            try await builder.endCollection(at: date)
            let workout = try await builder.finishWorkout()
            return workout?.uuid.uuidString
        } catch {
            return nil
        }
    }

    /// Idempotent — safe from deadline and from teardown completion.
    func forceIdle() {
        guard phase != .idle else { return }
        stopConnectionWatchdog()
        teardownDeadlineTimer?.invalidate()
        teardownDeadlineTimer = nil
        session?.end()
        session = nil
        builder = nil
        appliedPlan = nil
        startedPlan = nil
        pendingPlan = nil
        lastReportedDistance = 0
        locationGate.stop()
        frame = nil
        frameReceivedAt = nil
        liveHR = nil
        activeKcal = 0
        distanceMeters = 0
        isConnectionLost = false
        hkPaused = false
        isTeardownRunning = false
        role = nil
        phase = .idle
        if let pending = pendingStartConfiguration {
            pendingStartConfiguration = nil
            let nextRole = pendingStartRole
            pendingStartRole = .mirror
            Task { await begin(configuration: pending, role: nextRole) }
        }
    }

    // MARK: - Metrics relay

    func relayDistance(_ meters: Double) {
        distanceMeters = meters
        guard let delta = WatchHKActivityPlan.distanceDelta(
            fromCumulative: meters, lastReported: lastReportedDistance
        ) else { return }
        lastReportedDistance = meters
        onDistanceDelta?(delta)
        if role == .mirror || role == .orphan {
            send(type: MirrorWire.MessageType.distance, MirrorDistanceSample(deltaMeters: delta))
        }
    }

    func relayHR(_ bpm: Int) {
        onHeartRate?(bpm)
        guard role == .mirror || role == .orphan else { return }
        let now = Date()
        guard now.timeIntervalSince(lastHRRelayAt) >= Self.hrRelayMinInterval else { return }
        lastHRRelayAt = now
        send(type: MirrorWire.MessageType.hr, MirrorHRSample(bpm: bpm))
    }

    private func applyHR(_ stats: HKStatistics?) {
        guard let q = stats?.mostRecentQuantity() else { return }
        let bpm = Int(q.doubleValue(for: .count().unitDivided(by: .minute())).rounded())
        guard bpm > 0 else { return }
        liveHR = bpm
        relayHR(bpm)
    }

    private func applyEnergy(_ stats: HKStatistics?) {
        guard let q = stats?.sumQuantity() else { return }
        activeKcal = q.doubleValue(for: .kilocalorie())
    }

    func send<P: Encodable>(type: String, _ payload: P) {
        guard let session, let data = MirrorEnvelope.encoding(type: type, payload) else { return }
        Task { try? await session.sendToRemoteWorkoutSession(data: data) }
    }

    private func requestSyncUntilFirstFrame() {
        for delay in [0.5, 2.0, 5.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self, self.phase == .recording, self.frame == nil else { return }
                self.sendCommand(MirrorWire.CommandKind.sync)
            }
        }
    }

    private func startConnectionWatchdog() {
        stopConnectionWatchdog()
        let t = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.checkConnection() }
        }
        RunLoop.main.add(t, forMode: .common)
        connectionWatchdog = t
    }

    private func checkConnection() {
        guard phase == .recording else { return }
        isConnectionLost = Date().timeIntervalSince(lastSignalAt) > Self.connectionLostAfter
    }

    private func stopConnectionWatchdog() {
        connectionWatchdog?.invalidate()
        connectionWatchdog = nil
    }

    private static func dayKind(from type: HKWorkoutActivityType) -> String? {
        switch type {
        case .running: return "running"
        case .functionalStrengthTraining: return "strength"
        case .mixedCardio: return "mixed"
        default: return nil
        }
    }

    private static func environment(
        dayType: HKWorkoutActivityType,
        sessionLocation: HKWorkoutSessionLocationType
    ) -> RunEnvironment? {
        guard dayType == .running else { return nil }
        return sessionLocation == .indoor ? .indoor : .outdoor
    }
}

// MARK: - HKWorkoutSessionDelegate

extension WatchPrimaryOwner: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didReceiveDataFromRemoteWorkoutSession data: [Data]
    ) {
        Task { @MainActor [weak self] in
            for packet in data { self?.handleRemote(packet) }
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor [weak self] in
            guard let self, toState == .ended, self.phase == .recording else { return }
            self.forceIdle()
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didFailWithError error: Error
    ) {
        Task { @MainActor [weak self] in
            guard let self, self.phase != .idle else { return }
            self.forceIdle()
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension WatchPrimaryOwner: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        let hrType = HKQuantityType(.heartRate)
        let kcalType = HKQuantityType(.activeEnergyBurned)
        let distanceType = WatchHKActivityPlan.distanceType
        let hr = collectedTypes.contains(hrType)
        let kcal = collectedTypes.contains(kcalType)
        let distance = collectedTypes.contains(distanceType)
        guard hr || kcal || distance else { return }
        let hrStats = hr ? workoutBuilder.statistics(for: hrType) : nil
        let kcalStats = kcal ? workoutBuilder.statistics(for: kcalType) : nil
        let distStats = distance ? workoutBuilder.statistics(for: distanceType) : nil
        Task { @MainActor [weak self] in
            if hr { self?.applyHR(hrStats) }
            if kcal { self?.applyEnergy(kcalStats) }
            if let q = distStats?.sumQuantity() {
                self?.relayDistance(q.doubleValue(for: .meter()))
            }
        }
    }
}
