import Foundation
import Observation
import HealthKit

// MIRROR MODE — the wrist is PRIMARY. Apple (HealthKit):
// `HKWorkoutSessionType.primary` runs on watchOS;
// `startMirroringToCompanionDevice` (watchOS 10) mirrors to companion iOS;
// iPhone `workoutSessionMirroringStartHandler` receives the mirrored session.
//
// Phone-driven: `startWatchApp` → `handle(_:)` → `startPrimary`.
// Standalone WatchWorkoutCoordinator still owns phone-less sessions.
@MainActor
@Observable
final class MirrorSessionController: NSObject {

    static let shared = MirrorSessionController()

    // MARK: - Published state

    enum State { case idle, recording, ending }
    private(set) var state: State = .idle
    /// Anything but idle → the wrist shows the mirror HUD (RootView gives it
    /// precedence over all standalone/idle content).
    var isActive: Bool { state != .idle }

    /// The last engine snapshot the phone pushed — the HUD renders only what's here,
    /// never a fabricated value.
    private(set) var frame: MirrorStateFrame?
    /// When `frame` landed — the HUD re-bases its local clock from this instant while
    /// the phase is active (it ticks between frames; a new frame re-bases it).
    private(set) var frameReceivedAt: Date?
    /// Wrist HR for the local zone bar (nil until the sensor streams).
    private(set) var liveHR: Int?
    /// No frame within the watchdog window — recording CONTINUES; the controls page
    /// then offers a local save/discard so a lost phone never traps a live HKWorkout.
    private(set) var isConnectionLost = false

    /// Live HR mapped to its zone for the wrist tint.
    ///
    /// Reads the SAME server-resolved bands the phone's engine records against
    /// (pushed with the day and persisted by `WatchPlanModel`). It used to classify
    /// against a hardcoded 190 bpm "for colour only", which meant the wrist could
    /// paint a beat Z3 while the phone filed the same beat as Z2. Nil when the
    /// athlete has no zones: the wrist shows the pulse with no tint, which is the
    /// truth, rather than a colour derived from a made-up ceiling.
    var liveZone: HRZone? {
        guard let zones = WatchPlanModel.shared.today?.athleteHrZones else { return nil }
        return liveHR.flatMap { zones.zone(forBpm: $0) }
    }

    // MARK: - Tuning

    /// Recording keeps going when the phone goes quiet; past this gap the wrist
    /// surfaces a local exit.
    private static let connectionLostAfter: TimeInterval = 15
    /// Minimum spacing between wrist-HR relays to the phone (the sensor collects
    /// faster than the engine needs).
    private static let hrRelayMinInterval: TimeInterval = 1
    /// Confirmation beat on the "Guardando…" screen before returning to idle.
    private static let savedBeat: Duration = .milliseconds(900)

    // MARK: - HealthKit

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    /// Local intent flag so a run of paused frames never double-pauses the session.
    private var hkPaused = false
    /// Set while we drive the teardown, so the session's own `.ended` callback can't
    /// re-enter the close path.
    private var isClosing = false
    private var lastHRRelayAt: Date = .distantPast
    /// Cumulative `distanceWalkingRunning` last sent as a delta.
    private var lastReportedDistance: Double = 0
    private var appliedPlan: WatchHKActivityPlan?
    private let locationGate = WatchRunLocationGate()
    /// Later of "recording started" and "last frame" — the watchdog reference.
    private var lastSignalAt: Date = .distantPast
    private var watchdog: Timer?

    private override init() { super.init() }

    // MARK: - Start

    /// Register a fallback handler. Apple calls this on the companion iPhone;
    /// keeping it here is harmless if a mirrored session ever arrives.
    func prepareToAdopt() {
        store.workoutSessionMirroringStartHandler = { [weak self] incoming in
            Task { @MainActor in self?.adopt(incoming) }
        }
    }

    /// Apple `handle(_:)` after `startWatchApp`: create the PRIMARY, mirror it
    /// to the companion iPhone, start activity + live builder. Do not start a
    /// second coach engine — the phone already owns `WorkoutSession`.
    func startPrimary(configuration: HKWorkoutConfiguration) {
        guard state == .idle, WatchWorkoutCoordinator.shared.phase == .idle else { return }
        Task { await beginPrimary(configuration: configuration) }
    }

    /// Phone launched us with a workout config. Create the primary.
    func start(config: HKWorkoutConfiguration) {
        startPrimary(configuration: config)
    }

    private func beginPrimary(configuration: HKWorkoutConfiguration) async {
        guard state == .idle, WatchWorkoutCoordinator.shared.phase == .idle else { return }
        await LiveWorkoutSession.requestWorkoutAuthorization(store: store)
        guard state == .idle, WatchWorkoutCoordinator.shared.phase == .idle else { return }
        do {
            let created = try HKWorkoutSession(healthStore: store, configuration: configuration)
            let builder = created.associatedWorkoutBuilder()
            let dataSource = HKLiveWorkoutDataSource(
                healthStore: store,
                workoutConfiguration: configuration
            )
            WatchHKActivityPlan.enableDistanceCollection(on: dataSource)
            builder.dataSource = dataSource
            created.delegate = self
            builder.delegate = self
            session = created
            self.builder = builder
            state = .recording
            frame = nil
            frameReceivedAt = nil
            liveHR = nil
            isConnectionLost = false
            hkPaused = false
            isClosing = false
            do {
                try await created.startMirroringToCompanionDevice()
            } catch {
                // Phone unreachable; the primary still records on the wrist.
            }
            let start = Date()
            created.startActivity(with: start)
            await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                builder.beginCollection(withStart: start) { _, _ in
                    cont.resume()
                }
            }
            lastSignalAt = start
            startWatchdog()
            requestSyncUntilFirstFrame()
            WatchHaptics.start()
        } catch {
            resetToIdle()
        }
    }

    /// Take a session Apple delivered already running. Do not `startActivity`.
    func adopt(_ incoming: HKWorkoutSession) {
        guard state == .idle, WatchWorkoutCoordinator.shared.phase == .idle else { return }
        state = .recording
        frame = nil
        frameReceivedAt = nil
        liveHR = nil
        isConnectionLost = false
        hkPaused = false
        isClosing = false
        session = incoming
        incoming.delegate = self
        let builder = incoming.associatedWorkoutBuilder()
        let dataSource = HKLiveWorkoutDataSource(
            healthStore: store,
            workoutConfiguration: incoming.workoutConfiguration
        )
        WatchHKActivityPlan.enableDistanceCollection(on: dataSource)
        builder.dataSource = dataSource
        builder.delegate = self
        self.builder = builder
        lastSignalAt = Date()
        startWatchdog()
        requestSyncUntilFirstFrame()
        WatchHaptics.start()
    }

    // MARK: - Incoming (phone → watch)

    private func handleRemote(_ data: Data) {
        guard let envelope = MirrorEnvelope.decoding(data) else { return }
        switch envelope.type {
        case MirrorWire.MessageType.frame:
            if let f = envelope.body(as: MirrorStateFrame.self) { applyFrame(f) }
        case MirrorWire.MessageType.end:
            if let e = envelope.body(as: MirrorEnd.self) { finish(save: e.save) }
        default:
            break                       // tolerant: a newer phone may speak more types
        }
    }

    private func applyFrame(_ f: MirrorStateFrame) {
        frame = f
        frameReceivedAt = Date()
        lastSignalAt = frameReceivedAt ?? Date()
        isConnectionLost = false
        applyPhase(f.phase)
        syncRunActivity(from: f)
    }

    /// Mirror the engine's pause state onto the HK session so paused/rest minutes
    /// don't accrue kcal and no rest-HR reaches the recording.
    private func applyPhase(_ phase: String) {
        switch phase {
        case MirrorWire.Phase.paused:
            if !hkPaused { session?.pause(); hkPaused = true }
        case MirrorWire.Phase.active, MirrorWire.Phase.gate, MirrorWire.Phase.countIn:
            // The count-in is live recording (the athlete is about to move) — resume
            // the HK session like active/gate, never leave it paused into a tramo.
            if hkPaused { session?.resume(); hkPaused = false }
        default:
            break                       // finished → handled by the end handshake
        }
    }

    /// Pide el frame actual al teléfono hasta que llegue el PRIMERO (0,5 s · 2 s ·
    /// 5 s). Sin esto, una app de watch que arranca en frío con el iPhone ya en
    /// background se quedaba en 0:00 (IMG_2387): el heartbeat del teléfono es un
    /// timer y los timers no corren en background; este comando sí lo despierta.
    private func requestSyncUntilFirstFrame() {
        for delay in [0.5, 2.0, 5.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self, self.state == .recording, self.frame == nil else { return }
                self.sendCommand(MirrorWire.CommandKind.sync)
            }
        }
    }

    // MARK: - Outgoing (watch → phone)

    /// A wrist control tap relayed to the phone's engine (it is the only mutator).
    func sendCommand(_ kind: String) {
        send(type: MirrorWire.MessageType.command, MirrorCommand(kind: kind))
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
        if let dataSource = builder?.dataSource, plan.collectDistance {
            WatchHKActivityPlan.enableDistanceCollection(on: dataSource)
        }
        if appliedPlan != plan {
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

    private func relayDistance(_ meters: Double) {
        guard let delta = WatchHKActivityPlan.distanceDelta(
            fromCumulative: meters, lastReported: lastReportedDistance
        ) else { return }
        lastReportedDistance = meters
        send(type: MirrorWire.MessageType.distance, MirrorDistanceSample(deltaMeters: delta))
    }

    private func relayHR(_ bpm: Int) {
        let now = Date()
        guard now.timeIntervalSince(lastHRRelayAt) >= Self.hrRelayMinInterval else { return }
        lastHRRelayAt = now
        send(type: MirrorWire.MessageType.hr, MirrorHRSample(bpm: bpm))
    }

    private func send<P: Encodable>(type: String, _ payload: P) {
        guard let session, let data = MirrorEnvelope.encoding(type: type, payload) else { return }
        Task { try? await session.sendToRemoteWorkoutSession(data: data) }
    }

    // MARK: - End

    /// Phone-driven end: save (finish the HKWorkout) or discard (the athlete exited
    /// without recording — no workout lands).
    private func finish(save: Bool) {
        guard state == .recording else { return }
        state = .ending
        Task { await closeRecording(save: save) }
    }

    /// Lost-phone exit from the controls page: keep the workout (it lands in Apple
    /// Health; the phone/backend HealthKit sync ingests it later) or drop it. Relay
    /// MirrorEnded too in case the channel revives before teardown.
    func finishLocally() {
        guard state == .recording else { return }
        state = .ending
        Task { await closeRecording(save: true) }
    }

    func discardLocally() {
        guard state == .recording else { return }
        state = .ending
        Task { await closeRecording(save: false) }
    }

    private func closeRecording(save: Bool) async {
        isClosing = true
        stopWatchdog()

        var workoutUuid: String?
        if save {
            workoutUuid = await endAndSave()
        } else {
            builder?.discardWorkout()
        }
        // Relay the finished id BEFORE ending the session (awaited, not fire-and-
        // forget, so it clears the channel first) — best-effort; the fallback is the
        // phone's HealthKit ingest of the same workout, deduped on source_workout_ref.
        if let session, let data = MirrorEnvelope.encoding(
            type: MirrorWire.MessageType.ended, MirrorEnded(workoutUuid: workoutUuid)
        ) {
            try? await session.sendToRemoteWorkoutSession(data: data)
        }
        session?.end()

        WatchHaptics.success()
        try? await Task.sleep(for: Self.savedBeat)
        resetToIdle()
    }

    /// End collection and save the HKWorkout, returning its UUID string (nil on a
    /// save failure). The workout is the source of truth the phone tags its
    /// execution with.
    private func endAndSave() async -> String? {
        guard let builder else { return nil }
        do {
            try await builder.endCollection(at: Date())
            let workout = try await builder.finishWorkout()
            return workout?.uuid.uuidString
        } catch {
            return nil
        }
    }

    private func resetToIdle() {
        stopWatchdog()
        session = nil
        builder = nil
        appliedPlan = nil
        lastReportedDistance = 0
        locationGate.stop()
        frame = nil
        frameReceivedAt = nil
        liveHR = nil
        isConnectionLost = false
        hkPaused = false
        isClosing = false
        state = .idle
    }

    // MARK: - Connection watchdog

    private func startWatchdog() {
        stopWatchdog()
        let t = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.checkConnection() }
        }
        RunLoop.main.add(t, forMode: .common)
        watchdog = t
    }

    private func checkConnection() {
        guard state == .recording else { return }
        isConnectionLost = Date().timeIntervalSince(lastSignalAt) > Self.connectionLostAfter
    }

    private func stopWatchdog() {
        watchdog?.invalidate()
        watchdog = nil
    }
}

// MARK: - HKWorkoutSessionDelegate

extension MirrorSessionController: HKWorkoutSessionDelegate {
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
            guard let self, toState == .ended, !self.isClosing, self.state == .recording else { return }
            // An external end we didn't drive (rare) → return the wrist to idle
            // without a second teardown.
            self.resetToIdle()
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didFailWithError error: Error
    ) {
        Task { @MainActor [weak self] in
            guard let self, !self.isClosing else { return }
            self.resetToIdle()
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension MirrorSessionController: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        let hr = collectedTypes.contains(HKQuantityType(.heartRate))
        let distance = collectedTypes.contains(WatchHKActivityPlan.distanceType)
        guard hr || distance else { return }
        let hrStats = hr ? workoutBuilder.statistics(for: HKQuantityType(.heartRate)) : nil
        let distStats = distance ? workoutBuilder.statistics(for: WatchHKActivityPlan.distanceType) : nil
        Task { @MainActor [weak self] in
            if hr { self?.applyHR(hrStats) }
            if let q = distStats?.sumQuantity() {
                self?.relayDistance(q.doubleValue(for: .meter()))
            }
        }
    }

    @MainActor
    private func applyHR(_ stats: HKStatistics?) {
        guard let q = stats?.mostRecentQuantity() else { return }
        let bpm = Int(q.doubleValue(for: .count().unitDivided(by: .minute())).rounded())
        guard bpm > 0 else { return }
        liveHR = bpm
        relayHR(bpm)
    }
}
