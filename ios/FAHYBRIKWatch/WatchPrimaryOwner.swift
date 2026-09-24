import Foundation
import Observation
import HealthKit
import os

// FH-97 / FH-56 — ONE Watch PRIMARY owner. Apple pattern:
// watchOS creates PRIMARY (`handle(_:)` / solo / recover) → `startMirroringToCompanionDevice`;
// iOS receives the mirrored session via `workoutSessionMirroringStartHandler`.
// Solo coach motor lives on WatchWorkoutCoordinator; this object owns HK only.
//
// The link to the phone is Apple's (`link`): written only by the result of
// `startMirroringToCompanionDevice`, by `didDisconnectFromRemoteDeviceWithError`
// and by the first packet received. No watchdog, no «connection lost» timer.
// A recovered PRIMARY re-mirrors; a redundant `handle(_:)` re-mirrors; a
// launch never discards the athlete's recording.

@MainActor
@Observable
final class WatchPrimaryOwner: NSObject {

    static let shared = WatchPrimaryOwner()

    typealias Phase = WatchPrimaryLifecycle.Phase
    typealias Role = WatchPrimaryLifecycle.Role
    typealias Link = WatchPrimaryLifecycle.Link

    private(set) var phase: Phase = .idle
    private(set) var role: Role?
    /// Apple's link to the phone. Meaningful while `role == .mirror`.
    private(set) var link: Link = .unlinked(nil)
    /// Last error Apple gave when creating the PRIMARY — never swallowed.
    private(set) var lastStartError: String?

    var showsMirrorHUD: Bool { WatchPrimaryLifecycle.showsMirrorHUD(role: role) }
    var isEnding: Bool { phase == .ending }
    /// «Sin conexión con el iPhone» — from Apple, not from missing frames.
    var phoneUnlinked: Bool { WatchPrimaryLifecycle.phoneUnlinked(role: role, link: link) }
    var linkErrorDescription: String? {
        if case .unlinked(let why) = link { return why }
        return nil
    }

    var frame: MirrorStateFrame?
    var frameReceivedAt: Date?
    var liveHR: Int?
    var activeKcal: Double = 0
    var distanceMeters: Double = 0
    var builderElapsed: TimeInterval { builder?.elapsedTime ?? 0 }

    var onHeartRate: ((Int) -> Void)?
    var onDistanceDelta: ((Double) -> Void)?

    var liveZone: HRZone? {
        guard let zones = WatchPlanModel.shared.today?.athleteHrZones else { return nil }
        return liveHR.flatMap { zones.zone(forBpm: $0) }
    }

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
        let asked = Date()
        do {
            try await store.requestAuthorization(toShare: workoutDataTypes, read: workoutDataTypes)
            // Rápido = ya estaba concedido; lento = la hoja estaba delante en la muñeca (T10).
            let ms = Int(Date().timeIntervalSince(asked) * 1000)
            DiagnosticsLog.shared.record(.session, .hkAuthorization, outcome: .ok, detail: "waited_ms=\(ms)")
        } catch {
            DiagnosticsLog.shared.record(.session, .hkAuthorization, error: error)
        }
    }

    private static let log = Logger(subsystem: Marca.subsistemaLog("primary"), category: "watch-lifecycle")

    let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    /// FH-56 — the HK handle of a session we asked to end, kept until Apple
    /// reports `.ended` (or fails). The UI leaves at the 5 s deadline; the
    /// handle does not. A queued start fires when this clears.
    private var finishing: HKWorkoutSession?
    private var hkPaused = false
    private var lastHRRelayAt: Date = .distantPast
    private var lastReportedDistance: Double = 0
    private var appliedPlan: WatchHKActivityPlan?
    private var startedPlan: WatchHKActivityPlan?
    private var pendingPlan: WatchHKActivityPlan?
    private let locationGate = WatchRunLocationGate()
    private var teardownDeadlineTimer: Timer?
    private var pendingStartConfiguration: HKWorkoutConfiguration?
    private var pendingStartRole: Role = .mirror
    private var lastSavedWorkoutUuid: String?

    private override init() { super.init() }

    // MARK: - Start (idempotent)

    /// Launch / `handleActiveWorkoutRecovery`: Apple hands back the live PRIMARY.
    /// It is adopted as PRIMARY (no orphan role) and asked to mirror again.
    func recoverActiveIfNeeded() {
        guard phase == .idle, session == nil, finishing == nil else { return }
        store.recoverActiveWorkoutSession { [weak self] incoming, error in
            DiagnosticsLog.shared.record(.link, .mirrorRecovered, error: error,
                                         detail: incoming == nil ? "none" : "found state=\(incoming?.state.rawValue ?? -1)")
            Task { @MainActor in
                guard let self else { return }
                if let error {
                    Self.log.warning("recoverActiveWorkoutSession: \(error.localizedDescription, privacy: .public)")
                }
                guard let incoming else { return }
                Self.log.info("recovered PRIMARY state=\(incoming.state.rawValue, privacy: .public) type=\(incoming.type.rawValue, privacy: .public)")
                self.adopt(incoming)
            }
        }
    }

    func startFromPhone(configuration: HKWorkoutConfiguration) {
        DiagnosticsLog.shared.record(.link, .launchedByPhone, outcome: .ok,
                                     detail: "activity=\(configuration.activityType.rawValue) location=\(configuration.locationType.rawValue)")
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

    private func requestStart(configuration: HKWorkoutConfiguration, role incomingRole: Role) {
        if WatchPrimaryLifecycle.shouldForceIdleFromStuckEnding(
            phase: phase,
            hasSession: session != nil || finishing != nil
        ) {
            Self.log.warning("stuck ending without any handle — forcing idle before launch")
            forceIdle()
        }
        if phase == .idle, session != nil {
            Self.log.warning("stale session ref at idle — forcing idle before launch")
            forceIdle()
        }
        let compatible = session.map {
            MirrorPrimaryLaunchPolicy.configurationsCompatible($0.workoutConfiguration, configuration)
        } ?? false
        let action = WatchPrimaryLifecycle.startAction(
            phase: phase,
            hasSession: session != nil,
            isFinishing: finishing != nil,
            currentRole: role,
            incomingRole: incomingRole,
            compatible: compatible
        )
        Self.log.info("start(\(String(describing: incomingRole), privacy: .public)) → \(String(describing: action), privacy: .public) phase=\(String(describing: self.phase), privacy: .public) role=\(String(describing: self.role), privacy: .public)")
        DiagnosticsLog.shared.record(
            .session, .startRequest,
            detail: "incoming=\(incomingRole) action=\(action) phase=\(phase) role=\(role.map { "\($0)" } ?? "none") compatible=\(compatible)"
        )
        switch action {
        case .begin:
            Task { await begin(configuration: configuration, role: incomingRole) }
        case .remirror:
            guard let session else { return }
            Task { await mirror(session) }
        case .finishThenQueue:
            pendingStartConfiguration = configuration
            pendingStartRole = incomingRole
            // Never `save: false` for a launch — the recording is the athlete's.
            requestEnd(save: true, reason: MirrorWire.EndReason.phone)
        case .queue:
            pendingStartConfiguration = configuration
            pendingStartRole = incomingRole
        case .decline:
            break
        }
    }

    private func begin(configuration: HKWorkoutConfiguration, role: Role) async {
        guard phase == .idle, session == nil, finishing == nil else { return }
        await Self.requestWorkoutAuthorization()
        guard phase == .idle, session == nil, finishing == nil else { return }
        let created: HKWorkoutSession
        do {
            created = try HKWorkoutSession(healthStore: store, configuration: configuration)
        } catch {
            // Never mute: the error is state + log. The phone learns it at its
            // next `handle(_:)` (Apple serializes; we do not).
            lastStartError = error.localizedDescription
            Self.log.error("HKWorkoutSession init failed: \(error.localizedDescription, privacy: .public)")
            DiagnosticsLog.shared.record(.session, .hkFailed, error: error, detail: "init role=\(role)")
            forceIdle()
            return
        }
        lastStartError = nil
        if role == .mirror, WatchWorkoutCoordinator.shared.phase != .idle {
            DiagnosticsLog.shared.record(.session, .soloYieldedToMirror, detail: "at=begin")
            WatchWorkoutCoordinator.shared.yieldForPhoneMirror()
        }
        bind(created, role: role, configuration: configuration)
        DiagnosticsLog.shared.record(.session, .primaryBegin, outcome: .ok, detail: "role=\(role)")
        DiagnosticsLog.shared.markRunning(workoutId: nil, role: "watch-\(role)")
        if role == .mirror {
            await mirror(created)
        }
        let start = Date()
        created.startActivity(with: start)
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            builder?.beginCollection(withStart: start) { _, _ in cont.resume() }
        }
        if let pending = pendingPlan { syncSoloActivity(pending) }
        if role == .mirror { WatchHaptics.start() }
    }

    /// `startMirroringToCompanionDevice` — at create, at recover, and on a
    /// redundant `handle(_:)`. The result is the link; the wrist records either way.
    private func mirror(_ target: HKWorkoutSession) async {
        do {
            try await target.startMirroringToCompanionDevice()
            guard target === session else { return }
            link = .mirroring
            Self.log.info("mirroring to companion")
            DiagnosticsLog.shared.record(.link, .mirroringStarted, outcome: .ok)
            sendCommand(MirrorWire.CommandKind.sync)
        } catch {
            guard target === session else { return }
            link = .unlinked(error.localizedDescription)
            Self.log.warning("startMirroringToCompanionDevice failed: \(error.localizedDescription, privacy: .public) — wrist keeps recording")
            DiagnosticsLog.shared.record(.link, .mirroringStarted, error: error)
        }
    }

    /// Recovered PRIMARY — adopted as `.mirror` and asked to mirror again. If
    /// Apple rejects re-mirroring a recovered session the link stays unlinked
    /// with Apple's reason; the HUD says so and the athlete keeps Terminar.
    func adopt(_ incoming: HKWorkoutSession) {
        guard phase == .idle, session == nil, finishing == nil else { return }
        if WatchWorkoutCoordinator.shared.phase != .idle {
            DiagnosticsLog.shared.record(.session, .soloYieldedToMirror, detail: "at=recover")
            WatchWorkoutCoordinator.shared.yieldForPhoneMirror()
        }
        bind(incoming, role: .mirror, configuration: incoming.workoutConfiguration)
        DiagnosticsLog.shared.record(.session, .primaryBegin, outcome: .ok, detail: "role=mirror recovered state=\(incoming.state.rawValue)")
        DiagnosticsLog.shared.markRunning(workoutId: nil, role: "watch-mirror-recovered")
        hkPaused = incoming.state == .paused
        Task { await mirror(incoming) }
        WatchHaptics.start()
    }

    private func bind(
        _ incoming: HKWorkoutSession,
        role: Role,
        configuration: HKWorkoutConfiguration
    ) {
        self.role = role
        phase = .recording
        link = .unlinked(nil)
        frame = nil
        frameReceivedAt = nil
        liveHR = nil
        activeKcal = 0
        distanceMeters = 0
        hkPaused = false
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
        applyPhase(f.phase)
        syncRunActivity(from: f)
    }

    private func applyPhase(_ phaseWire: String) {
        switch phaseWire {
        case MirrorWire.Phase.paused:
            if !hkPaused { pause() }
        case MirrorWire.Phase.active, MirrorWire.Phase.gate, MirrorWire.Phase.countIn:
            if hkPaused { resume() }
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
        guard phase == .recording else { return }
        guard hkPaused else { return }
        session?.resume()
        hkPaused = false
    }

    /// FH-107 — resume even when local latch desynced from phone frame.
    func resumeIfPaused() {
        guard phase == .recording else { return }
        if hkPaused { session?.resume() }
        hkPaused = false
    }

    // MARK: - End (UI always leaves within the deadline; the HK handle waits for `.ended`)

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
        DiagnosticsLog.shared.record(.session, .primaryEnd,
                                     detail: "save=\(save) reason=\(reason) phase=\(phase) accepted=\(WatchPrimaryLifecycle.acceptsEnd(current: phase))")
        guard WatchPrimaryLifecycle.acceptsEnd(current: phase) else { return }
        phase = .ending
        armTeardownDeadline()
        let capturedSession = session
        let capturedBuilder = builder
        finishing = capturedSession
        Task {
            await performTeardown(
                session: capturedSession,
                builder: capturedBuilder,
                save: save,
                reason: reason
            )
            forceIdle()
        }
    }

    /// NEVER cancelled when save starts — athlete freedom beats perfect persistence.
    /// FH-56: releases the UI only; the HK handle lives in `finishing` until `.ended`.
    private func armTeardownDeadline() {
        teardownDeadlineTimer?.invalidate()
        let deadline = WatchPrimaryLifecycle.teardownDeadlineSeconds
        let timer = Timer.scheduledTimer(withTimeInterval: deadline, repeats: false) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.phase == .ending else { return }
                Self.log.warning("teardown deadline — releasing UI; HK handle waits for .ended")
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

        // ONE `MirrorEnded` over HK, awaited before `end()` tears the channel;
        // the durable WCSession aviso (FH-101) is the backup for an athlete end.
        let endedPacket = MirrorEnvelope.encoding(
            type: MirrorWire.MessageType.ended,
            MirrorEnded(workoutUuid: workoutUuid, reason: reason)
        )
        if let session, let endedPacket {
            try? await session.sendToRemoteWorkoutSession(data: endedPacket)
        }
        session?.end()
        let ended = MirrorEnded(workoutUuid: workoutUuid, reason: reason)
        if reason == MirrorWire.EndReason.athlete {
            WatchConnectivityService.shared.notifyPhoneLiveEnded(ended)
        }
        WatchHaptics.success()
    }

    private func saveWorkout(builder: HKLiveWorkoutBuilder, at date: Date) async -> String? {
        do {
            try await builder.endCollection(at: date)
            let workout = try await builder.finishWorkout()
            DiagnosticsLog.shared.record(.save, .hkWorkoutSaved, outcome: workout == nil ? DiagEvent.Outcome.failed : DiagEvent.Outcome.ok,
                                         detail: workout == nil ? "nil_workout" : nil)
            return workout?.uuid.uuidString
        } catch {
            Self.log.error("finishWorkout failed: \(error.localizedDescription, privacy: .public)")
            DiagnosticsLog.shared.record(.save, .hkWorkoutSaved, error: error)
            return nil
        }
    }

    /// FH-100 — single idle sink for the UI + latches. Idempotent. A session
    /// that is not in `finishing` (nobody else will end it) is ended here; the
    /// `finishing` handle is Apple's until `.ended`.
    func forceIdle() {
        teardownDeadlineTimer?.invalidate()
        teardownDeadlineTimer = nil
        if let live = session, live !== finishing { live.end() }
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
        hkPaused = false
        link = .unlinked(nil)
        role = nil
        phase = .idle
        DiagnosticsLog.shared.markStopped()
        DiagnosticsForwarder.forwardPending()
        firePendingStartIfClean()
    }

    /// A queued `handle(_:)` starts only when no handle is left — live or finishing.
    private func firePendingStartIfClean() {
        guard let pending = pendingStartConfiguration,
              WatchPrimaryLifecycle.canFirePendingStart(
                phase: phase,
                hasSession: session != nil,
                isFinishing: finishing != nil
              ) else { return }
        pendingStartConfiguration = nil
        let nextRole = pendingStartRole
        pendingStartRole = .mirror
        Task { await begin(configuration: pending, role: nextRole) }
    }

    private func releaseFinishing(_ ended: HKWorkoutSession) {
        guard finishing === ended else { return }
        finishing = nil
        Self.log.info("finishing handle released (.ended)")
        firePendingStartIfClean()
    }

    // MARK: - Metrics relay

    func relayDistance(_ meters: Double) {
        distanceMeters = meters
        guard let delta = WatchHKActivityPlan.distanceDelta(
            fromCumulative: meters, lastReported: lastReportedDistance
        ) else { return }
        lastReportedDistance = meters
        onDistanceDelta?(delta)
        if role == .mirror {
            send(type: MirrorWire.MessageType.distance, MirrorDistanceSample(deltaMeters: delta))
        }
    }

    func relayHR(_ bpm: Int) {
        onHeartRate?(bpm)
        guard role == .mirror else { return }
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
            guard let self, workoutSession === self.session else { return }
            // A packet from the phone is Apple's proof the link is up.
            if self.link != .mirroring { self.link = .mirroring }
            for packet in data { self.handleRemote(packet) }
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        DiagnosticsLog.shared.record(.session, .hkState, detail: "side=watch from=\(fromState.rawValue) to=\(toState.rawValue)")
        Task { @MainActor [weak self] in
            guard let self else { return }
            Self.log.info("session state \(fromState.rawValue, privacy: .public) → \(toState.rawValue, privacy: .public)")
            guard toState == .ended else { return }
            if workoutSession === self.finishing {
                self.releaseFinishing(workoutSession)
                return
            }
            guard workoutSession === self.session, self.phase != .idle else { return }
            // Apple ended the live PRIMARY on its own: nothing records any more,
            // so the HUD must not claim it does. The phone keeps coaching.
            Self.log.warning("live PRIMARY ended by Apple — leaving HUD")
            self.forceIdle()
        }
    }

    /// Apple's only «conexión perdida» (watchOS 10). The wrist keeps recording;
    /// the HUD says the phone is gone; nothing is retried by timer — the phone
    /// re-requests (`startWatchApp`) or Apple re-mirrors.
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didDisconnectFromRemoteDeviceWithError error: (any Error)?
    ) {
        DiagnosticsLog.shared.record(.link, .remoteDisconnected, outcome: .failed, code: (error as NSError?)?.code,
                                     domain: (error as NSError?)?.domain, detail: error?.localizedDescription)
        Task { @MainActor [weak self] in
            guard let self, workoutSession === self.session else { return }
            self.link = .unlinked(error?.localizedDescription)
            Self.log.warning("remote device disconnected: \(error?.localizedDescription ?? "sin error", privacy: .public)")
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didFailWithError error: Error
    ) {
        DiagnosticsLog.shared.record(.session, .hkFailed, error: error, detail: "side=watch")
        Task { @MainActor [weak self] in
            guard let self else { return }
            Self.log.error("HK session error: \(error.localizedDescription, privacy: .public)")
            if workoutSession === self.finishing {
                self.releaseFinishing(workoutSession)
                return
            }
            guard workoutSession === self.session, self.phase != .idle else { return }
            if self.role == .mirror {
                // Stay on the HUD with Terminar; Apple's `.ended` (if it follows) leaves it.
                self.link = .unlinked(error.localizedDescription)
                return
            }
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
