import Foundation
import Observation
import HealthKit
import os

// FH-97 / FH-56 — ONE phone-side live session owner.
// Coach engine = WorkoutSession. Wrist PRIMARY = WatchPrimaryOwner (watchOS).
// This object owns: ONE `startWatchApp` per intent, the mirrored HK channel
// Apple hands over, the frame loop, and ONE end delivery.
//
// The link is Apple's. `link` is written ONLY by the mirroring start handler /
// recover (bound), `didDisconnectFromRemoteDeviceWithError` (disconnected) and
// `didChangeTo .ended` (none). No retry loop, no launch generation, no
// «recent signal» window: the phone is coach, not connector.

@MainActor
@Observable
final class PhoneLiveSession {
    static let shared = PhoneLiveSession()

    enum Phase: Equatable { case idle, coaching, ending }

    /// Apple's mirrored-session link.
    enum Link: Equatable {
        case none
        case bound
        /// Apple reported the remote device disconnected. The wrist PRIMARY
        /// keeps recording; the handle stays until Apple ends it.
        case disconnected(String?)
    }

    /// Result of the ONE `startWatchApp` of this intent — surfaced, never looped.
    enum WatchLaunch: Equatable {
        case notRequested
        case requesting
        case launched
        case failed(String?)
    }

    private(set) var phase: Phase = .idle
    private(set) var link: Link = .none
    private(set) var watchLaunch: WatchLaunch = .notRequested
    /// UI truth: Apple says the mirror is bound. Nothing homemade on top.
    var wristMirrorLive: Bool { link == .bound }
    /// A mirrored HK session is held (bound or disconnected) — the wrist is recording.
    var hasMirroredHKSession: Bool { hk.session != nil }
    private(set) var wristRecordedWorkout: Bool = false
    private(set) var wristFinishedByAthlete: Bool = false
    private(set) var watchJoinStartedAt: Date?

    static let watchJoinHintSeconds: TimeInterval = 9

    @ObservationIgnored var sendOverride: ((_ type: String) -> Void)?
    @ObservationIgnored var isTreadmillLive: () -> Bool = { DeviceHub.shared.treadmillLink.isLive }

    @ObservationIgnored private weak var engine: WorkoutSession?
    @ObservationIgnored private let hk = PhoneMirrorHKChannel()
    @ObservationIgnored private var activityKind: String = "mixed"
    /// FH-96 — one workout intent → one PRIMARY. A second `begin` on the same
    /// staging session (prep UI + ▶ EMPEZAR) must not re-request the wrist.
    @ObservationIgnored private var primaryRequested = false
    @ObservationIgnored private var boundSessionId: ObjectIdentifier?
    @ObservationIgnored private(set) var startWatchAppCallCount = 0
    @ObservationIgnored var startWatchAppOverride: ((HKWorkoutConfiguration) async -> Bool)?
    @ObservationIgnored private var pendingEndSave: Bool?
    /// Save flag of the end in flight — re-sent if the wrist re-mirrors mid-teardown.
    @ObservationIgnored private var endingSave: Bool?
    @ObservationIgnored private var endedWorkoutUuid: String?
    @ObservationIgnored private var hapticSeq = 0
    @ObservationIgnored private var pendingHapticCue: String?
    @ObservationIgnored private var pendingHapticSeq: Int?
    @ObservationIgnored private var frameTimer: Timer?
    @ObservationIgnored private var lastSentKey = ""
    @ObservationIgnored private var lastSentAt: Date = .distantPast
    @ObservationIgnored private var releaseTimer: Timer?
    @ObservationIgnored private var didRegisterHandler = false
    @ObservationIgnored private let healthStore = HKHealthStore()
    @ObservationIgnored private(set) var lastMirrorEndSaveForTests: Bool?

    private static let frameInterval: TimeInterval = 1
    private static let heartbeatInterval: TimeInterval = 5
    private static let log = Logger(subsystem: Marca.subsistemaLog("primary"), category: "phone-live")

    private init() {
        hk.onIncoming = { [weak self] data in self?.handleIncoming(data) }
        hk.onSessionEnded = { [weak self] in self?.handleMirrorSessionEnded() }
        hk.onDisconnected = { [weak self] error in self?.handleRemoteDisconnect(error) }
    }

    func resetAthleteEndFlagsForTests() {
        wristFinishedByAthlete = false
        wristRecordedWorkout = false
        pendingEndSave = nil
        endingSave = nil
        endedWorkoutUuid = nil
        lastMirrorEndSaveForTests = nil
    }

    /// Test seam — clears PRIMARY binding so the singleton can begin again cleanly.
    func resetPrimaryBindingForTests() {
        primaryRequested = false
        boundSessionId = nil
        watchLaunch = .notRequested
        startWatchAppCallCount = 0
        startWatchAppOverride = nil
        watchJoinStartedAt = nil
        link = .none
        engine = nil
        phase = .idle
    }

    var primaryRequestedForTests: Bool { primaryRequested }
    var pendingEndSaveForTests: Bool? { pendingEndSave }

    /// Test seam — Apple's `didDisconnectFromRemoteDeviceWithError` path.
    func simulateRemoteDisconnectForTests(error: String?) {
        handleRemoteDisconnect(error.map { PhoneMirrorLinkError(description: $0) })
    }

    /// FH-96 — prep UI only; drives watch card spinner without `startWatchApp`.
    func noteWatchPrepIntent() {
        watchJoinStartedAt = watchJoinStartedAt ?? Date()
    }

    // MARK: - Lifecycle

    func prepare() {
        Haptics.relayWorkoutCue = { [weak self] cue in
            if Thread.isMainThread { self?.sendHapticCue(cue) }
            else { DispatchQueue.main.async { self?.sendHapticCue(cue) } }
        }
        guard !didRegisterHandler, HKHealthStore.isHealthDataAvailable() else { return }
        didRegisterHandler = true
        healthStore.workoutSessionMirroringStartHandler = { [weak self] incoming in
            Task { @MainActor in self?.adopt(incoming) }
        }
    }

    func begin(session: WorkoutSession, activityKind: String) {
        let sessionId = ObjectIdentifier(session)
        let continuingSamePrimary = boundSessionId == sessionId && primaryRequested

        engine = session
        self.activityKind = activityKind
        phase = .coaching
        cancelRelease()

        if !continuingSamePrimary {
            boundSessionId = sessionId
            primaryRequested = true
            endedWorkoutUuid = nil
            wristRecordedWorkout = false
            wristFinishedByAthlete = false
            pendingEndSave = nil
            endingSave = nil
            watchLaunch = .notRequested
            watchJoinStartedAt = Date()
        }
        guard HKHealthStore.isHealthDataAvailable() else { return }
        prepare()
        requestWatchPrimaryIfNeeded()
        startFrameLoop()
        if hk.session != nil { tickFrame() }
    }

    /// ONE `MirrorEnd` over HK + the durable WCSession aviso (FH-101). The
    /// mirrored handle is released when Apple reports `.ended`, or at the UI
    /// deadline (`PhoneMirrorEndPolicy`) if the wrist is out of reach.
    func end(save: Bool) {
        if PhoneLiveHandoffPolicy.phoneEndIsNoOp(wristFinishedByAthlete: wristFinishedByAthlete) { return }
        guard phase != .ending else { return }
        WatchConnectivityiOSService.shared.endLiveWorkout(save: save)
        phase = .ending
        endingSave = save
        stopFrameLoop()
        if PhoneLiveHandoffPolicy.shouldStagePendingEnd(mirroredSessionPresent: hk.session != nil) {
            pendingEndSave = save
            return
        }
        pendingEndSave = nil
        deliverEnd(save: save)
    }

    func deliverEnd(save: Bool) {
        if save { wristRecordedWorkout = true }
        lastMirrorEndSaveForTests = save
        stopFrameLoop()
        send(type: MirrorWire.MessageType.end, MirrorEnd(save: save))
        scheduleRelease()
    }

    func teardown() { enterIdle() }

    func consumeWorkoutRef() -> String? {
        defer { endedWorkoutUuid = nil }
        return endedWorkoutUuid
    }

    /// FH-101 — single sink for wrist `MirrorEnded` (HK mirror or WCSession).
    /// Idempotent: a duplicate packet must not flip flags back or re-idle mid-workout.
    func applyWristEnded(_ ended: MirrorEnded) {
        if let uuid = ended.workoutUuid { endedWorkoutUuid = uuid }
        guard ended.reason == MirrorWire.EndReason.athlete else {
            enterIdle()
            return
        }
        wristRecordedWorkout = true
        wristFinishedByAthlete = true
        enterIdle()
    }

    /// Apple `recoverActiveWorkoutSession` (iOS 26) — reattach a mirrored
    /// session the wrist is still running. On iOS 18 the handler is the only path.
    func recoverMirroredSessionIfNeeded() async {
        guard hk.session == nil, HKHealthStore.isHealthDataAvailable() else { return }
        guard #available(iOS 26.0, *) else { return }
        prepare()
        let log = Self.log
        let recovered: HKWorkoutSession? = await withCheckedContinuation { cont in
            healthStore.recoverActiveWorkoutSession { session, error in
                if let error {
                    log.warning("recoverActiveWorkoutSession: \(error.localizedDescription, privacy: .public)")
                }
                cont.resume(returning: session)
            }
        }
        guard let recovered, hk.session == nil else { return }
        adopt(recovered)
    }

    /// ONE `startWatchApp` per intent. Result lands in `watchLaunch`; a failure
    /// is said on the watch card, never retried by timer.
    func requestWatchPrimaryIfNeeded() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let isRunning = activityKind == "running"
        guard PhoneLiveHandoffPolicy.shouldRequestWatchPrimary(
            alreadyRequested: watchLaunch != .notRequested,
            channelBound: hk.session != nil,
            hasEngine: engine != nil && phase == .coaching,
            runEnvironmentResolved: !(isRunning && engine?.runEnvironment == nil),
            activityKindIsRunning: isRunning
        ) else { return }
        watchLaunch = .requesting
        startWatchAppCallCount += 1
        let config = HKWorkoutConfiguration()
        config.activityType = PhoneMirrorFrameBuilder.activityType(for: activityKind)
        config.locationType = WorkoutLocationType.resolve(
            activityKind: activityKind,
            environment: engine?.runEnvironment
        )
        Task { [weak self] in
            guard let self else { return }
            await self.startWatchApp(config)
        }
    }

    func kickFrame() {
        guard hk.session != nil, engine != nil else { return }
        tickFrame()
    }

    func sendHapticCue(_ cue: String) {
        guard hk.session != nil else { return }
        hapticSeq += 1
        pendingHapticCue = cue
        pendingHapticSeq = hapticSeq
        send(type: MirrorWire.MessageType.haptic, MirrorHaptic(cue: cue, seq: hapticSeq))
        if let engine {
            var frame = buildFrame(from: engine)
            frame.hapticCue = cue
            frame.hapticSeq = hapticSeq
            send(type: MirrorWire.MessageType.frame, frame)
            lastSentKey = PhoneMirrorFrameBuilder.structuralKey(frame)
            lastSentAt = Date()
            pendingHapticCue = nil
            pendingHapticSeq = nil
        }
    }

    func buildFrame(from session: WorkoutSession) -> MirrorStateFrame {
        PhoneMirrorFrameBuilder.buildFrame(from: session, context: frameContext)
    }

    func structuralKey(_ frame: MirrorStateFrame) -> String {
        PhoneMirrorFrameBuilder.structuralKey(frame)
    }

    func handleIncoming(_ payloads: [Data]) {
        guard !payloads.isEmpty else { return }
        // Data from the wrist is Apple's proof the link is up again (after a
        // disconnect Apple recovered on its own).
        if hk.session != nil, link != .bound {
            link = .bound
            if phase == .coaching { startFrameLoop() }
        }
        for data in payloads {
            guard let env = MirrorEnvelope.decoding(data) else { continue }
            switch env.type {
            case MirrorWire.MessageType.hr:
                if let hr = env.body(as: MirrorHRSample.self) {
                    engine?.injectLiveHR(hr.bpm, source: .healthkit)
                }
            case MirrorWire.MessageType.distance:
                if let d = env.body(as: MirrorDistanceSample.self) {
                    engine?.sampleRunDistance(deltaMeters: d.deltaMeters, source: .healthkit)
                }
            case MirrorWire.MessageType.command:
                if let cmd = env.body(as: MirrorCommand.self) { applyCommand(cmd.kind) }
            case MirrorWire.MessageType.ended:
                if let ended = env.body(as: MirrorEnded.self) {
                    applyWristEnded(ended)
                }
            case MirrorWire.MessageType.sensor:
                if let c = env.body(as: MirrorSensorConclusions.self) {
                    engine?.applySensorConclusions(c)
                }
            default: break
            }
        }
    }

    // MARK: - Adopt (Apple handed us the wrist PRIMARY)

    /// Links and does not decide — except to find the coach plan. Never
    /// `save: false` from here: the recording is the athlete's (FH-56).
    private func adopt(_ incoming: HKWorkoutSession) {
        hk.bind(incoming)
        link = .bound
        watchJoinStartedAt = nil
        cancelRelease()
        Self.log.info("adopted mirrored session state=\(incoming.state.rawValue, privacy: .public) type=\(incoming.type.rawValue, privacy: .public) phase=\(String(describing: self.phase), privacy: .public) engine=\(self.engine != nil, privacy: .public)")
        if let pending = pendingEndSave {
            pendingEndSave = nil
            deliverEnd(save: pending)
            return
        }
        if phase == .ending {
            deliverEnd(save: endingSave ?? true)
            return
        }
        if engine != nil {
            applyAdoptAction(PhoneLiveHandoffPolicy.adoptAction(
                hasEngine: true,
                engineFinished: engine?.isFinished == true,
                hasFreshSnapshot: false
            ))
            return
        }
        Task { await resolveAdoptWithoutEngine() }
    }

    private func resolveAdoptWithoutEngine() async {
        let saved = await WorkoutStateStore.shared.load()
        let fresh = saved.map { WorkoutRecoveryGate.isFresh($0) } ?? false
        guard hk.session != nil else { return }
        // A `begin` may have landed while we read the disk.
        if engine != nil {
            applyAdoptAction(.coach)
            return
        }
        applyAdoptAction(PhoneLiveHandoffPolicy.adoptAction(
            hasEngine: false,
            engineFinished: false,
            hasFreshSnapshot: fresh
        ))
    }

    func applyAdoptAction(_ action: PhoneLiveHandoffPolicy.AdoptAction) {
        switch action {
        case .coach:
            startFrameLoop()
            tickFrame()
        case .reopenFromDisk:
            Self.log.info("adopt without engine — reopening coach plan from disk")
            Task {
                // Reconcile inside `recoverOnLaunch` ends SAVING if the plan is gone.
                await LiveWorkoutResume.shared.recoverOnLaunch(
                    hrZones: LiveWorkoutResume.shared.lastKnownHRZones
                )
            }
        case .endSaving:
            Self.log.warning("adopt without coach plan — ending wrist recording SAVING")
            end(save: true)
        }
    }

    // MARK: - Apple link events

    /// Apple `didChangeTo .ended` (or `didFailWithError`) on the mirrored session.
    /// Mid-coaching: keep the coach, drop the handle, do NOT relaunch — a wrist
    /// that relaunches re-mirrors on its own and lands in the handler again.
    private func handleMirrorSessionEnded() {
        stopFrameLoop()
        hk.unbind()
        link = .none
        if phase == .coaching, engine?.isFinished != true {
            Self.log.warning("mirrored session ended mid-coaching — coach continues without wrist")
            return
        }
        enterIdle()
    }

    /// Apple `didDisconnectFromRemoteDeviceWithError`. Coaching continues; the
    /// wrist still records; the handle stays until Apple ends it.
    private func handleRemoteDisconnect(_ error: Error?) {
        link = .disconnected(error?.localizedDescription)
        stopFrameLoop()
        Self.log.warning("remote device disconnected: \(error?.localizedDescription ?? "sin error", privacy: .public)")
    }

    // MARK: - Private

    private var frameContext: PhoneMirrorFrameContext {
        PhoneMirrorFrameContext(
            isTreadmillLive: isTreadmillLive,
            hapticCue: pendingHapticCue,
            hapticSeq: pendingHapticSeq
        )
    }

    /// Drops the mirrored HK channel and PRIMARY latches — post-workout idle only.
    private func releaseChannel() {
        cancelRelease()
        stopFrameLoop()
        hk.unbind()
        link = .none
        primaryRequested = false
        boundSessionId = nil
        watchLaunch = .notRequested
    }

    /// FH-100 — post-workout idle: channel released + latches cleared so the
    /// next Empezar is a cold launch.
    private func enterIdle() {
        releaseChannel()
        pendingEndSave = nil
        endingSave = nil
        phase = .idle
    }

    private func startWatchApp(_ config: HKWorkoutConfiguration) async {
        try? await healthStore.requestAuthorization(
            toShare: [HKObjectType.workoutType()], read: []
        )
        let outcome: (ok: Bool, error: Error?)
        if let override = startWatchAppOverride {
            outcome = (await override(config), nil)
        } else {
            outcome = await withCheckedContinuation { cont in
                healthStore.startWatchApp(with: config) { ok, error in
                    cont.resume(returning: (ok, error))
                }
            }
        }
        guard watchLaunch == .requesting else { return }
        if outcome.ok {
            watchLaunch = .launched
            Self.log.info("startWatchApp ok")
        } else {
            let why = outcome.error?.localizedDescription
            watchLaunch = .failed(why)
            Self.log.error("startWatchApp failed: \(why ?? "sin error", privacy: .public)")
        }
    }

    private func scheduleRelease() {
        cancelRelease()
        let t = Timer(
            timeInterval: PhoneMirrorEndPolicy.releaseChannelAfterSeconds,
            repeats: false
        ) { [weak self] _ in
            Task { @MainActor in self?.enterIdle() }
        }
        RunLoop.main.add(t, forMode: .common)
        releaseTimer = t
    }

    private func cancelRelease() {
        releaseTimer?.invalidate()
        releaseTimer = nil
    }

    private func startFrameLoop() {
        stopFrameLoop()
        lastSentKey = ""
        lastSentAt = .distantPast
        let t = Timer(timeInterval: Self.frameInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tickFrame() }
        }
        RunLoop.main.add(t, forMode: .common)
        frameTimer = t
    }

    private func stopFrameLoop() {
        frameTimer?.invalidate()
        frameTimer = nil
    }

    private func tickFrame() {
        guard let engine, hk.session != nil, link == .bound else { return }
        let frame = buildFrame(from: engine)
        let key = PhoneMirrorFrameBuilder.structuralKey(frame)
        let now = Date()
        if lastSentKey.isEmpty || key != lastSentKey
            || now.timeIntervalSince(lastSentAt) >= Self.heartbeatInterval {
            send(type: MirrorWire.MessageType.frame, frame)
            lastSentKey = key
            lastSentAt = now
        }
    }

    private func pushFrameNow() {
        guard let engine else { return }
        let frame = buildFrame(from: engine)
        send(type: MirrorWire.MessageType.frame, frame)
        lastSentKey = PhoneMirrorFrameBuilder.structuralKey(frame)
        lastSentAt = Date()
    }

    private func applyCommand(_ kind: String) {
        guard let engine else { return }
        switch kind {
        case MirrorWire.CommandKind.advance:
            engine.applyCommand(kind)
            pushFrameNow()
        case MirrorWire.CommandKind.sync:
            pushFrameNow()
        case MirrorWire.CommandKind.pause:
            if !engine.isPaused { engine.togglePause() }
        case MirrorWire.CommandKind.resume:
            if engine.isPaused { engine.togglePause() }
        case MirrorWire.CommandKind.deathByFail:
            engine.deathByFail()
        default: break
        }
    }

    private func send<P: Encodable>(type: String, _ payload: P) {
        if let sendOverride { sendOverride(type); return }
        guard let data = MirrorEnvelope.encoding(type: type, payload) else { return }
        hk.send(data)
    }
}

/// Test-only stand-in for Apple's disconnect error.
struct PhoneMirrorLinkError: LocalizedError {
    let description: String
    var errorDescription: String? { description }
}

// MARK: - HK channel (phone internals)

@MainActor
final class PhoneMirrorHKChannel {
    private(set) var session: HKWorkoutSession?
    private lazy var delegate = PhoneMirrorHKDelegate(channel: self)
    var onIncoming: (([Data]) -> Void)?
    var onSessionEnded: (() -> Void)?
    var onDisconnected: ((Error?) -> Void)?

    func bind(_ incoming: HKWorkoutSession) {
        incoming.delegate = delegate
        session = incoming
    }

    func unbind() {
        session = nil
    }

    func send(_ data: Data) {
        guard let session else { return }
        Task { try? await session.sendToRemoteWorkoutSession(data: data) }
    }

    /// Events from a session that is no longer ours (a late `.ended` after the
    /// next Empezar already bound a new one) must not touch the live channel.
    fileprivate func isCurrent(_ candidate: HKWorkoutSession) -> Bool {
        session === candidate
    }

    fileprivate func handleStateChange(of candidate: HKWorkoutSession, to state: HKWorkoutSessionState) {
        guard isCurrent(candidate) else { return }
        if state == .ended { onSessionEnded?() }
    }

    fileprivate func handleFailure(of candidate: HKWorkoutSession) {
        guard isCurrent(candidate) else { return }
        onSessionEnded?()
    }

    fileprivate func handleDisconnect(of candidate: HKWorkoutSession, error: Error?) {
        guard isCurrent(candidate) else { return }
        onDisconnected?(error)
    }

    fileprivate func handleIncoming(from candidate: HKWorkoutSession, _ data: [Data]) {
        guard isCurrent(candidate) else { return }
        onIncoming?(data)
    }
}

private final class PhoneMirrorHKDelegate: NSObject, HKWorkoutSessionDelegate {
    weak var channel: PhoneMirrorHKChannel?

    init(channel: PhoneMirrorHKChannel) { self.channel = channel }

    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor [weak self] in
            self?.channel?.handleStateChange(of: workoutSession, to: toState)
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor [weak self] in self?.channel?.handleFailure(of: workoutSession) }
    }

    /// Apple's only «conexión perdida» (iOS 17) — the mirrored session lost its primary.
    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didDisconnectFromRemoteDeviceWithError error: (any Error)?
    ) {
        Task { @MainActor [weak self] in
            self?.channel?.handleDisconnect(of: workoutSession, error: error)
        }
    }

    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didReceiveDataFromRemoteWorkoutSession data: [Data]
    ) {
        Task { @MainActor [weak self] in
            self?.channel?.handleIncoming(from: workoutSession, data)
        }
    }
}
