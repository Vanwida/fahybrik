import Foundation
import Observation
import HealthKit

// FH-97 — ONE phone-side live session owner.
// Coach engine = WorkoutSession. Wrist PRIMARY = WatchPrimaryOwner.
// This object owns: startWatchApp, mirrored HK channel, frame loop, end delivery.

@MainActor
@Observable
final class PhoneLiveSession {
    static let shared = PhoneLiveSession()

    enum Phase: Equatable { case idle, coaching, ending }

    private(set) var phase: Phase = .idle
    /// HK mirror channel bound — internal; UI must use `wristMirrorLive`.
    private(set) var wristJoined: Bool = false
    /// FH-99 — honest UI truth: recent wrist signal on a live mirror channel.
    var wristMirrorLive: Bool {
        WristMirrorTruth.mirrorIsLive(
            channelBound: channel.session != nil,
            boundAt: mirrorBoundAt,
            lastSignalAt: lastWristSignalAt
        )
    }
    var hasMirroredHKSession: Bool { channel.session != nil }
    private(set) var wristRecordedWorkout: Bool = false
    private(set) var wristFinishedByAthlete: Bool = false
    private(set) var watchJoinStartedAt: Date?

    static let watchJoinHintSeconds: TimeInterval = 9

    @ObservationIgnored var sendOverride: ((_ type: String) -> Void)?
    @ObservationIgnored var isTreadmillLive: () -> Bool = { DeviceHub.shared.treadmillLink.isLive }

    @ObservationIgnored private weak var engine: WorkoutSession?
    @ObservationIgnored private let channel = PhoneMirrorHKChannel()
    @ObservationIgnored private var activityKind: String = "mixed"
    @ObservationIgnored private var didLaunchWatch = false
    @ObservationIgnored private var watchLaunchGeneration = 0
    /// FH-96 — one workout intent → one PRIMARY. Survives a second `begin` on the
    /// same staging session (prep UI + ▶ EMPEZAR) without clearing `didLaunchWatch`.
    @ObservationIgnored private var primaryRequested = false
    @ObservationIgnored private var boundSessionId: ObjectIdentifier?
    @ObservationIgnored private(set) var startWatchAppCallCount = 0
    @ObservationIgnored var startWatchAppOverride: ((HKWorkoutConfiguration) async -> Bool)?
    @ObservationIgnored private var pendingEndSave: Bool?
    @ObservationIgnored private var endedWorkoutUuid: String?
    @ObservationIgnored private var hapticSeq = 0
    @ObservationIgnored private var pendingHapticCue: String?
    @ObservationIgnored private var pendingHapticSeq: Int?
    @ObservationIgnored private var frameTimer: Timer?
    @ObservationIgnored private var lastSentKey = ""
    @ObservationIgnored private var lastSentAt: Date = .distantPast
    @ObservationIgnored private var endDelivery: PhoneMirrorEndDelivery?
    @ObservationIgnored private var didRegisterHandler = false
    @ObservationIgnored private var mirrorBoundAt: Date?
    @ObservationIgnored private var lastWristSignalAt: Date?
    @ObservationIgnored private let healthStore = HKHealthStore()

    private static let frameInterval: TimeInterval = 1
    private static let heartbeatInterval: TimeInterval = 5
    private static let watchLaunchAttempts = 3
    private static let watchLaunchRetrySeconds: TimeInterval = 3

    private init() {
        channel.onIncoming = { [weak self] data in self?.handleIncoming(data) }
        channel.onSessionEnded = { [weak self] in self?.releaseChannel() }
    }

    func resetAthleteEndFlagsForTests() {
        wristFinishedByAthlete = false
        wristRecordedWorkout = false
        pendingEndSave = nil
        endedWorkoutUuid = nil
    }

    /// Test seam — clears PRIMARY binding so the singleton can begin again cleanly.
    func resetPrimaryBindingForTests() {
        primaryRequested = false
        boundSessionId = nil
        didLaunchWatch = false
        startWatchAppCallCount = 0
        startWatchAppOverride = nil
        watchJoinStartedAt = nil
        watchLaunchGeneration = 0
        mirrorBoundAt = nil
        lastWristSignalAt = nil
        engine = nil
        phase = .idle
    }

    var mirrorBoundAtForTests: Date? { mirrorBoundAt }
    var lastWristSignalAtForTests: Date? { lastWristSignalAt }

    func noteWristSignalForTests(at date: Date = Date()) {
        lastWristSignalAt = date
    }

    var launchGenerationForTests: Int { watchLaunchGeneration }
    var primaryRequestedForTests: Bool { primaryRequested }

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
        let continuingSamePrimary =
            boundSessionId == sessionId && primaryRequested

        engine = session
        self.activityKind = activityKind
        phase = .coaching

        if continuingSamePrimary {
            guard HKHealthStore.isHealthDataAvailable() else { return }
            prepare()
            launchWatchIfNeeded()
            startFrameLoop()
            if channel.session != nil { tickFrame() }
            return
        }

        boundSessionId = sessionId
        primaryRequested = true
        endedWorkoutUuid = nil
        wristRecordedWorkout = false
        wristFinishedByAthlete = false
        pendingEndSave = nil
        didLaunchWatch = false
        watchJoinStartedAt = Date()
        endDelivery?.cancel()
        endDelivery = nil
        guard HKHealthStore.isHealthDataAvailable() else { return }
        prepare()
        launchWatchIfNeeded()
        startFrameLoop()
        tickFrame()
    }

    func end(save: Bool) {
        watchLaunchGeneration += 1
        if PhoneLiveHandoffPolicy.phoneEndIsNoOp(wristFinishedByAthlete: wristFinishedByAthlete) { return }
        WatchConnectivityiOSService.shared.endLiveWorkout(save: save)
        phase = .ending
        if channel.session == nil {
            pendingEndSave = save
            return
        }
        pendingEndSave = nil
        deliverEnd(save: save)
    }

    func deliverEnd(save: Bool) {
        if save { wristRecordedWorkout = true }
        stopFrameLoop()
        endDelivery?.cancel()
        let delivery = PhoneMirrorEndDelivery { [weak self] in
            self?.send(type: MirrorWire.MessageType.end, MirrorEnd(save: save))
        } onRelease: { [weak self] in
            self?.releaseChannel()
        }
        endDelivery = delivery
        delivery.start()
    }

    func teardown() { releaseChannel() }

    func consumeWorkoutRef() -> String? {
        defer { endedWorkoutUuid = nil }
        return endedWorkoutUuid
    }

    func attachRecovered(_ incoming: HKWorkoutSession) { adopt(incoming) }

    func launchWatchIfNeeded() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let needsRunEnv = activityKind == "running" && engine?.runEnvironment == nil
        guard PhoneLiveHandoffPolicy.shouldLaunchWatch(
            didLaunch: didLaunchWatch,
            wristJoined: wristJoined,
            hasSession: engine != nil,
            runEnvironmentResolved: !needsRunEnv,
            activityKindIsRunning: activityKind == "running"
        ) else { return }
        didLaunchWatch = true
        watchLaunchGeneration += 1
        let generation = watchLaunchGeneration
        let config = HKWorkoutConfiguration()
        config.activityType = PhoneMirrorFrameBuilder.activityType(for: activityKind)
        config.locationType = WorkoutLocationType.resolve(
            activityKind: activityKind,
            environment: engine?.runEnvironment
        )
        Task { [weak self] in
            guard let self else { return }
            try? await self.healthStore.requestAuthorization(
                toShare: [HKObjectType.workoutType()], read: []
            )
            await self.launchWatchApp(config, generation: generation)
        }
    }

    func pauseRemote() { kickFrame() }
    func resumeRemote() { kickFrame() }

    func kickFrame() {
        guard channel.session != nil, engine != nil else { return }
        tickFrame()
    }

    func sendHapticCue(_ cue: String) {
        guard channel.session != nil else { return }
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
        lastWristSignalAt = Date()
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
                let ended = env.body(as: MirrorEnded.self)
                endedWorkoutUuid = ended?.workoutUuid
                if ended?.reason == MirrorWire.EndReason.athlete {
                    wristRecordedWorkout = true
                    wristFinishedByAthlete = true
                }
                releaseChannel()
            case MirrorWire.MessageType.sensor:
                if let c = env.body(as: MirrorSensorConclusions.self) {
                    engine?.applySensorConclusions(c)
                }
            default: break
            }
        }
    }

    // MARK: - Private

    private var frameContext: PhoneMirrorFrameContext {
        PhoneMirrorFrameContext(
            isTreadmillLive: isTreadmillLive,
            hapticCue: pendingHapticCue,
            hapticSeq: pendingHapticSeq
        )
    }

    private func adopt(_ incoming: HKWorkoutSession) {
        channel.bind(incoming)
        wristJoined = true
        mirrorBoundAt = Date()
        lastWristSignalAt = nil
        if let pending = pendingEndSave {
            pendingEndSave = nil
            deliverEnd(save: pending)
            return
        }
        if PhoneLiveHandoffPolicy.adoptShouldDiscardImmediately(
            pendingEndSave: nil,
            sessionFinished: engine?.isFinished == true,
            hasLiveEngine: engine != nil
        ) {
            deliverEnd(save: false)
            return
        }
        startFrameLoop()
        tickFrame()
    }

    private func releaseChannel() {
        endDelivery?.cancel()
        endDelivery = nil
        stopFrameLoop()
        channel.unbind()
        wristJoined = false
        mirrorBoundAt = nil
        lastWristSignalAt = nil
        primaryRequested = false
        boundSessionId = nil
        didLaunchWatch = false
        if phase == .ending { phase = .idle }
    }

    private func launchWatchApp(_ config: HKWorkoutConfiguration, generation: Int) async {
        for attempt in 1...Self.watchLaunchAttempts {
            guard generation == watchLaunchGeneration, !wristJoined else { return }
            startWatchAppCallCount += 1
            let launched: Bool
            if let override = startWatchAppOverride {
                launched = await override(config)
            } else {
                launched = await withCheckedContinuation { cont in
                    healthStore.startWatchApp(with: config) { ok, _ in cont.resume(returning: ok) }
                }
            }
            if launched || wristJoined { return }
            guard attempt < Self.watchLaunchAttempts else { return }
            try? await Task.sleep(for: .seconds(Self.watchLaunchRetrySeconds))
        }
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
        if WristMirrorTruth.mirrorIsStale(
            channelBound: channel.session != nil,
            lastSignalAt: lastWristSignalAt
        ) {
            releaseChannel()
            return
        }
        guard let engine, channel.session != nil else { return }
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
        channel.send(data)
    }
}

// MARK: - HK channel + end delivery (phone internals)

@MainActor
final class PhoneMirrorHKChannel {
    private(set) var session: HKWorkoutSession?
    private lazy var delegate = PhoneMirrorHKDelegate(channel: self)
    var onIncoming: (([Data]) -> Void)?
    var onSessionEnded: (() -> Void)?

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

    fileprivate func handleStateChange(to state: HKWorkoutSessionState) {
        if state == .ended || state == .stopped { onSessionEnded?() }
    }

    fileprivate func handleFailure() { onSessionEnded?() }

    fileprivate func handleIncoming(_ data: [Data]) { onIncoming?(data) }
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
        Task { @MainActor [weak self] in self?.channel?.handleStateChange(to: toState) }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor [weak self] in self?.channel?.handleFailure() }
    }

    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didReceiveDataFromRemoteWorkoutSession data: [Data]
    ) {
        Task { @MainActor [weak self] in self?.channel?.handleIncoming(data) }
    }
}

@MainActor
final class PhoneMirrorEndDelivery {
    private let sendEnd: () -> Void
    private let onRelease: () -> Void
    private var retryTimer: Timer?
    private var releaseTimer: Timer?
    private var sentCount = 0
    private let startedAt = Date()

    init(sendEnd: @escaping () -> Void, onRelease: @escaping () -> Void) {
        self.sendEnd = sendEnd
        self.onRelease = onRelease
    }

    func start() {
        fireSend()
        scheduleRelease()
    }

    func cancel() {
        retryTimer?.invalidate()
        retryTimer = nil
        releaseTimer?.invalidate()
        releaseTimer = nil
    }

    private func fireSend() {
        sentCount += 1
        sendEnd()
        retryTimer?.invalidate()
        guard PhoneMirrorEndPolicy.shouldScheduleRetry(sentCount: sentCount) else { return }
        let t = Timer(
            timeInterval: PhoneMirrorEndPolicy.retryIntervalSeconds,
            repeats: false
        ) { [weak self] _ in
            Task { @MainActor in self?.fireSend() }
        }
        RunLoop.main.add(t, forMode: .common)
        retryTimer = t
    }

    private func scheduleRelease() {
        releaseTimer?.invalidate()
        let t = Timer(
            timeInterval: PhoneMirrorEndPolicy.releaseChannelAfterSeconds,
            repeats: false
        ) { [weak self] _ in
            Task { @MainActor in
                self?.cancel()
                self?.onRelease()
            }
        }
        RunLoop.main.add(t, forMode: .common)
        releaseTimer = t
    }
}
