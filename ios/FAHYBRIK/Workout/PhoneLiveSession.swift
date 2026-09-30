import Foundation
import Observation
import HealthKit
import os

// FH-97 / FH-56 — ONE phone-side live session owner.
// Coach engine = WorkoutSession. Wrist PRIMARY = WatchPrimaryOwner (watchOS).
// This object owns: the `startWatchApp` of the intent (ALWAYS on start, unasked:
// the watch launches by itself, like Apple Entreno / Strava / Nike Run Club),
// the mirrored HK channel Apple hands over, the frame loop, and ONE end delivery.
//
// The link is Apple's. `link` is written ONLY by the mirroring start handler /
// recover (bound), `didDisconnectFromRemoteDeviceWithError` (disconnected) and
// `didChangeTo .ended` (none). No retry TIMER, no launch generation, no
// «recent signal» window: the phone is coach, not connector. The only relaunch
// is event-driven and capped (`handleWatchReachability`), and only after Apple
// answered the previous launch with an error and no mirror channel is bound.

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

    /// Result of the `startWatchApp` of this intent — Apple's answer, surfaced, never looped.
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

    /// What the athlete is told about the watch DURING the workout. Derived only
    /// from Apple's answers (`startWatchApp`, the mirrored session, the disconnect
    /// and `.ended` callbacks): no timer, no guess. It never blocks anything.
    enum WatchStatus: Equatable {
        /// Nothing asked of the watch yet (or the workout is over).
        case none
        /// Apple has not handed the mirrored session over yet.
        case connecting
        /// The mirrored session is bound: the watch is recording.
        case recording
        /// Apple reported an error, a disconnect or the end of the mirror. The
        /// workout goes on; the watch may still be recording on the wrist.
        case offline

        /// Lo que se le dice al atleta. Sin jerga y sin bloquear: siempre puede seguir.
        var frase: String? {
            switch self {
            case .none: return nil
            case .connecting: return "Conectando con el reloj…"
            case .recording: return "Grabando en la muñeca"
            case .offline: return "Sin conexión con el reloj. Puedes seguir entrenando."
            }
        }
    }

    var watchStatus: WatchStatus {
        switch link {
        case .bound: return .recording
        case .disconnected: return .offline
        case .none:
            if wristWasLinked { return .offline }
            switch watchLaunch {
            case .notRequested: return .none
            case .requesting, .launched: return .connecting
            case .failed: return .offline
            }
        }
    }

    @ObservationIgnored var sendOverride: ((_ type: String) -> Void)?
    @ObservationIgnored var isTreadmillLive: () -> Bool = { DeviceHub.shared.treadmillLink.isLive }

    @ObservationIgnored private weak var engine: WorkoutSession?
    @ObservationIgnored private let hk = PhoneMirrorHKChannel()
    /// El plan del entreno en pasos que se le manda a la muñeca (F2): qué, cuándo y con qué huella.
    @ObservationIgnored private let planFeed = PhoneMirrorPlanFeed()
    @ObservationIgnored private var activityKind: String = "mixed"
    /// Lo que quedaba del descanso de la serie en el latido anterior: al pasar de >0 a 0 el descanso acabó solo.
    @ObservationIgnored private var restAntes: Double = 0
    /// FH-96 — one workout intent → one PRIMARY. A second `begin` on the same
    /// staging session (prep UI + ▶ EMPEZAR) must not re-request the wrist.
    @ObservationIgnored private var primaryRequested = false
    /// Apple bound a mirror at some point in this intent (so `link == .none` later
    /// means the mirror ended, not «still connecting»).
    private var wristWasLinked = false
    /// Config of the FIRST launch, reused as is by a relaunch: a different config
    /// would make the wrist finish its live session (FH-96, build 78).
    @ObservationIgnored private var launchConfiguration: HKWorkoutConfiguration?
    @ObservationIgnored private var watchRelaunchCount = 0
    /// Skip reasons already written this intent (`already_requested` repeats on
    /// every `begin`/`start`): the log says each once, not every call.
    @ObservationIgnored private var loggedSkipReasons: Set<String> = []
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
    /// Con cursor la muñeca marca «viejo» lo que depende del móvil a los `MirrorWire.datoViejoTrasS`
    /// (5 s) sin trama: el latido tiene que caer con margen (y aguantar una trama perdida).
    private static let heartbeatConCursor: TimeInterval = 2
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
        wristWasLinked = false
        launchConfiguration = nil
        watchRelaunchCount = 0
        loggedSkipReasons = []
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
            wristWasLinked = false
            launchConfiguration = nil
            watchRelaunchCount = 0
            loggedSkipReasons = []
        }
        DiagnosticsLog.shared.record(.session, .liveBegin, workoutId: session.hkSessionUUID,
                                     detail: "kind=\(activityKind) continuing=\(continuingSamePrimary)")
        DiagnosticsLog.shared.markRunning(workoutId: session.hkSessionUUID, role: "phone")
        guard HKHealthStore.isHealthDataAvailable() else {
            recordLaunchSkipped(.healthUnavailable)
            return
        }
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
        DiagnosticsLog.shared.record(.session, .liveEnd, workoutId: engine?.hkSessionUUID,
                                     detail: "save=\(save) mirror=\(hk.session != nil)")
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
        DiagnosticsLog.shared.record(.link, .liveEndReceived, workoutId: engine?.hkSessionUUID,
                                     detail: "reason=\(ended.reason) phase=\(phase)")
        if let uuid = ended.workoutUuid { endedWorkoutUuid = uuid }
        // La muñeca guardó la sesión que recuperó y empieza otra (FH-56): el entreno sigue en el móvil, y la sesión nueva
        // se espeja sola. Aquí solo se queda con el uuid.
        if ended.reason == MirrorWire.EndReason.recoveredRestart { return }
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
                DiagnosticsLog.shared.record(.link, .mirrorRecovered, error: error,
                                             detail: session == nil ? "none" : "found")
                if let error {
                    log.warning("recoverActiveWorkoutSession: \(error.localizedDescription, privacy: .public)")
                }
                cont.resume(returning: session)
            }
        }
        guard let recovered, hk.session == nil else { return }
        adopt(recovered)
    }

    /// The watch launches ALWAYS and by itself when the workout starts: no question
    /// to the athlete, no wait for calle/cinta. ONE `startWatchApp` per intent; its
    /// result lands in `watchLaunch`. When it decides NOT to launch it says why in
    /// the technical log (`start_watch_app_skipped`), never silently.
    func requestWatchPrimaryIfNeeded() {
        guard HKHealthStore.isHealthDataAvailable() else {
            recordLaunchSkipped(.healthUnavailable)
            return
        }
        let decision = PhoneLiveHandoffPolicy.watchLaunchDecision(
            alreadyRequested: watchLaunch != .notRequested,
            channelBound: hk.session != nil,
            hasEngine: engine != nil && phase == .coaching
        )
        switch decision {
        case .skip(let reason):
            recordLaunchSkipped(reason)
        case .launch:
            launchWatch(config: makeLaunchConfiguration(), detail: "trigger=start")
        }
    }

    /// The wrist became reachable again (`WCSession.reachabilityDidChange`) while the
    /// workout runs. If Apple answered the launch with an error and no mirror is
    /// bound, launch ONCE more (capped per intent). Event-driven, never a timer:
    /// reachability is Apple's own signal, FH-56 stays intact.
    func handleWatchReachability(reachable: Bool) {
        guard reachable, phase == .coaching, HKHealthStore.isHealthDataAvailable() else { return }
        var failed = false
        if case .failed = watchLaunch { failed = true }
        let decision = PhoneLiveHandoffPolicy.watchRelaunchDecision(
            coaching: engine != nil,
            channelBound: hk.session != nil,
            lastLaunchFailed: failed,
            relaunchesDone: watchRelaunchCount
        )
        switch decision {
        case .skip(let reason):
            recordLaunchSkipped(reason, trigger: "reachable")
        case .launch:
            watchRelaunchCount += 1
            // The SAME configuration as the first launch (FH-96).
            launchWatch(config: launchConfiguration ?? makeLaunchConfiguration(),
                        detail: "trigger=reachable attempt=\(watchRelaunchCount)")
        }
    }

    /// Start config. Running with no calle/cinta answer starts as `.outdoor` (see
    /// `WorkoutLocationType.resolve`: never forbid the GPS); the real environment
    /// travels in the frame and the wrist switches activity when it arrives.
    private func makeLaunchConfiguration() -> HKWorkoutConfiguration {
        let config = HKWorkoutConfiguration()
        config.activityType = PhoneMirrorFrameBuilder.activityType(for: activityKind)
        config.locationType = WorkoutLocationType.resolve(
            activityKind: activityKind,
            environment: engine?.runEnvironment
        )
        return config
    }

    private func launchWatch(config: HKWorkoutConfiguration, detail: String) {
        watchLaunch = .requesting
        startWatchAppCallCount += 1
        launchConfiguration = config
        Task { [weak self] in
            guard let self else { return }
            await self.startWatchApp(config, detail: detail)
        }
    }

    private func recordLaunchSkipped(_ reason: PhoneLiveHandoffPolicy.WatchLaunchSkip, trigger: String = "start") {
        guard loggedSkipReasons.insert("\(trigger)/\(reason.rawValue)").inserted else { return }
        DiagnosticsLog.shared.record(
            .link, .startWatchAppSkipped, workoutId: engine?.hkSessionUUID,
            detail: "reason=\(reason.rawValue) trigger=\(trigger) kind=\(activityKind) env=\(engine?.runEnvironment?.rawValue ?? "nil")"
        )
        Self.log.info("startWatchApp skipped: \(reason.rawValue, privacy: .public)")
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
            sendPlanIfNeeded(for: engine)
            send(type: MirrorWire.MessageType.frame, frame)
            lastSentKey = PhoneMirrorFrameBuilder.structuralKey(frame)
            lastSentAt = Date()
            pendingHapticCue = nil
            pendingHapticSeq = nil
        }
    }

    func buildFrame(from session: WorkoutSession) -> MirrorStateFrame {
        PhoneMirrorFrameBuilder.buildFrame(from: session, context: frameContext(for: session))
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
                if let cmd = env.body(as: MirrorCommand.self) { applyCommand(cmd.kind, declaracion: cmd.declaracion, activa: cmd.activa, puntuacion: cmd.puntuacion) }
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
        DiagnosticsLog.shared.record(.link, .mirrorAdopted, workoutId: engine?.hkSessionUUID, outcome: .ok,
                                     detail: "state=\(incoming.state.rawValue) phase=\(phase) engine=\(engine != nil)")
        hk.bind(incoming)
        link = .bound
        planFeed.olvidarEnvio()   // otro canal: la muñeca no tiene aún el plan
        wristWasLinked = true
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
        DiagnosticsLog.shared.record(.session, .adoptAction, workoutId: engine?.hkSessionUUID, detail: "\(action)")
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
        DiagnosticsLog.shared.record(.session, .mirrorEnded, workoutId: engine?.hkSessionUUID,
                                     detail: "phase=\(phase) finished=\(engine?.isFinished == true)")
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
        DiagnosticsLog.shared.record(.link, .remoteDisconnected, workoutId: engine?.hkSessionUUID,
                                     outcome: .failed, code: (error as NSError?)?.code,
                                     domain: (error as NSError?)?.domain, detail: error?.localizedDescription)
        link = .disconnected(error?.localizedDescription)
        // Sin la muñeca no hay quien hable por ella: el móvil recupera su voz.
        AudioCoach.shared.setWristSpeaks(false)
        stopFrameLoop()
        Self.log.warning("remote device disconnected: \(error?.localizedDescription ?? "sin error", privacy: .public)")
    }

    // MARK: - Private

    private func frameContext(for session: WorkoutSession) -> PhoneMirrorFrameContext {
        PhoneMirrorFrameContext(
            isTreadmillLive: isTreadmillLive,
            hapticCue: pendingHapticCue,
            hapticSeq: pendingHapticSeq,
            plan: planFeed.plan(para: session)
        )
    }

    /// El plan, ANTES que la trama que lo usa: si toca mandarlo (canal nuevo, otra huella, la
    /// muñeca lo pidió), sale ahora. Ver `PhoneMirrorPlanFeed`.
    private func sendPlanIfNeeded(for session: WorkoutSession) {
        guard let plan = planFeed.pendienteDeEnvio(para: session) else { return }
        send(type: MirrorWire.MessageType.plan, plan)
        planFeed.marcarEnviado(plan)
    }

    /// Drops the mirrored HK channel and PRIMARY latches — post-workout idle only.
    private func releaseChannel() {
        cancelRelease()
        stopFrameLoop()
        AudioCoach.shared.setWristSpeaks(false)
        hk.unbind()
        link = .none
        primaryRequested = false
        boundSessionId = nil
        watchLaunch = .notRequested
        wristWasLinked = false
        launchConfiguration = nil
        watchRelaunchCount = 0
        loggedSkipReasons = []
    }

    /// FH-100 — post-workout idle: channel released + latches cleared so the
    /// next Empezar is a cold launch.
    private func enterIdle() {
        DiagnosticsLog.shared.markStopped()
        releaseChannel()
        pendingEndSave = nil
        endingSave = nil
        phase = .idle
    }

    private func startWatchApp(_ config: HKWorkoutConfiguration, detail trigger: String) async {
        let outcome: (ok: Bool, error: Error?)
        if let override = startWatchAppOverride {
            // Test seam: replaces Apple's call, authorization sheet included.
            outcome = (await override(config), nil)
        } else {
            try? await healthStore.requestAuthorization(
                toShare: [HKObjectType.workoutType()], read: []
            )
            outcome = await withCheckedContinuation { cont in
                healthStore.startWatchApp(with: config) { ok, error in
                    cont.resume(returning: (ok, error))
                }
            }
        }
        DiagnosticsLog.shared.record(
            .link, .startWatchApp, workoutId: engine?.hkSessionUUID,
            error: outcome.ok ? nil : (outcome.error ?? NSError(domain: "startWatchApp", code: 0)),
            detail: "activity=\(config.activityType.rawValue) location=\(config.locationType.rawValue) \(trigger)"
                + (outcome.ok ? " late=\(watchLaunch != .requesting)" : " error=\(outcome.error?.localizedDescription ?? "sin detalle")")
        )
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
        // La fuerza que lleva el motor sin que el vivo del iPhone esté a la vista: la serie por tiempo se cierra sola y al
        // acabar un descanso se sigue (serie por tiempo desde cero, o el siguiente ejercicio).
        engine.vivoCerrarSerieCumplida()
        if restAntes > 0, engine.restRemainingSeconds <= 0 { engine.vivoAlAcabarDescanso() }
        restAntes = engine.restRemainingSeconds
        let frame = buildFrame(from: engine)
        let key = PhoneMirrorFrameBuilder.structuralKey(frame)
        let now = Date()
        let heartbeat = frame.cursor == nil ? Self.heartbeatInterval : Self.heartbeatConCursor
        if lastSentKey.isEmpty || key != lastSentKey
            || now.timeIntervalSince(lastSentAt) >= heartbeat {
            sendPlanIfNeeded(for: engine)
            send(type: MirrorWire.MessageType.frame, frame)
            lastSentKey = key
            lastSentAt = now
        }
    }

    private func pushFrameNow() {
        guard let engine else { return }
        let frame = buildFrame(from: engine)
        sendPlanIfNeeded(for: engine)
        send(type: MirrorWire.MessageType.frame, frame)
        lastSentKey = PhoneMirrorFrameBuilder.structuralKey(frame)
        lastSentAt = Date()
    }

    private func applyCommand(_ kind: String, declaracion: Vivo.Declaracion? = nil, activa: Bool? = nil, puntuacion: MirrorPuntuacion? = nil) {
        guard let engine else { return }
        switch kind {
        case MirrorWire.CommandKind.advance:
            // Cortar un descanso o cerrar una serie de fuerza lleva, además, lo que decide el motor de la fuerza: la
            // última serie sigue al siguiente ejercicio, «Colócate» abre antes de una isometría (nunca un atasco).
            let eraDescanso = engine.restRemainingSeconds > 0
            engine.applyCommand(kind)
            if eraDescanso { engine.vivoAlAcabarDescanso() } else { engine.vivoTrasCerrarSerie() }
            pushFrameNow()
        case MirrorWire.CommandKind.anotar, MirrorWire.CommandKind.plus30, MirrorWire.CommandKind.undo:
            _ = PhoneMirrorCommandRelay.aplicar(kind, declaracion: declaracion, a: engine)
            pushFrameNow()
        case MirrorWire.CommandKind.vozMuneca:
            _ = PhoneMirrorCommandRelay.aplicar(kind, activa: activa, a: engine)
        case MirrorWire.CommandKind.sync:
            // La muñeca pide el estado y, si no tiene el plan al que apunta, también el plan.
            planFeed.pedirReenvio()
            pushFrameNow()
        case MirrorWire.CommandKind.pause:
            if !engine.isPaused { engine.togglePause() }
        case MirrorWire.CommandKind.resume:
            if engine.isPaused { engine.togglePause() }
        case MirrorWire.CommandKind.ronda, MirrorWire.CommandKind.puntuacion, MirrorWire.CommandKind.deathByFail:
            _ = PhoneMirrorCommandRelay.aplicar(kind, puntuacion: puntuacion, a: engine)
            pushFrameNow()
        case MirrorWire.CommandKind.newLap:
            _ = PhoneMirrorCommandRelay.aplicar(kind, a: engine)
            pushFrameNow()
        default:
            // Un comando que este móvil no conoce (una muñeca más nueva): se registra, no se inventa.
            if case let .pendiente(porQue) = PhoneMirrorCommandRelay.aplicar(kind, a: engine) {
                Self.log.info("comando de la muñeca sin atender: \(porQue, privacy: .public)")
            }
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

    /// Primer fallo de una racha ya contado: no se anota uno por frame.
    private var sendFailing = false

    func send(_ data: Data) {
        guard let session else { return }
        Task { @MainActor [weak self] in
            do {
                try await session.sendToRemoteWorkoutSession(data: data)
                self?.sendFailing = false
            } catch {
                guard let self, !self.sendFailing else { return }
                self.sendFailing = true
                DiagnosticsLog.shared.record(.link, .remoteSendFailed, error: error)
            }
        }
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
        DiagnosticsLog.shared.record(.session, .hkState,
                                     detail: "side=phone-mirror from=\(fromState.rawValue) to=\(toState.rawValue)")
        Task { @MainActor [weak self] in
            self?.channel?.handleStateChange(of: workoutSession, to: toState)
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DiagnosticsLog.shared.record(.session, .hkFailed, error: error, detail: "side=phone-mirror")
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
