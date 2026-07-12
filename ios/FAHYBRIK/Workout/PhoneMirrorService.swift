import Foundation
import Observation
import HealthKit

// PHONE side of MIRROR MODE — the 90% session. The athlete drives the workout from
// the iPhone (this app's rich UI runs the ONE engine, WorkoutSession) while the
// Apple Watch RECORDS it (HKWorkoutSession → live HR/kcal, one HKWorkout) and shows
// a glanceable HUD in step. The wrist never runs a second engine that could drift:
// it relays control taps and streams HR, and this service pushes 1 Hz state frames.
//
// Transport is the HealthKit mirrored-session app-data channel, NOT WatchConnectivity
// (see MirrorWireModels). We register the mirroring start handler EARLY, remote-start
// the watch app with an HKWorkoutConfiguration, adopt the mirrored HKWorkoutSession
// when it arrives, and speak MirrorEnvelope both ways. Non-blocking throughout: if the
// wrist never joins, the phone runs the workout alone.
@MainActor
@Observable
final class PhoneMirrorService {
    static let shared = PhoneMirrorService()

    /// TRUE once the mirrored session from the wrist has arrived. Drives the
    /// ActiveWorkout wrist chip and suppresses the phone's own sparse HR reader
    /// (the wrist HR is fresher). Never blocks the workout when it stays false.
    private(set) var wristJoined: Bool = false

    // Weak so a finished/abandoned WorkoutContainer can deallocate its engine even
    // if a mirrored session lingers until its `ended` reply / grace timeout.
    @ObservationIgnored private weak var session: WorkoutSession?
    @ObservationIgnored private var mirrored: HKWorkoutSession?
    @ObservationIgnored private lazy var delegateShim = MirrorSessionDelegate(owner: self)
    @ObservationIgnored private var frameTimer: Timer?
    @ObservationIgnored private var endTimeout: Timer?
    // The last frame's STRUCTURAL signature (phase / titles / progress / zone /
    // presence of a countdown or rest) — the free-running clocks are excluded so a
    // 1 Hz elapsed tick alone never forces a resend (the wrist ticks them locally).
    @ObservationIgnored private var lastSentKey: String = ""
    @ObservationIgnored private var lastSentAt: Date = .distantPast
    // The finished HKWorkout's UUID reported by the wrist on `ended`, held for the
    // post-workout summary to stamp as source_workout_ref (dedupe the HealthKit copy).
    @ObservationIgnored private var endedWorkoutUuid: String?
    @ObservationIgnored private var didRegisterHandler = false

    @ObservationIgnored private let healthStore = HKHealthStore()

    private static let frameInterval: TimeInterval = 1
    // Heartbeat resend even when nothing structural changed, so a wrist that missed
    // a frame re-bases its clocks within a few seconds.
    private static let heartbeatInterval: TimeInterval = 5
    // How long we hold the mirrored session waiting for the wrist's `ended` reply
    // before clearing it — the recording save happens on the wrist, asynchronously.
    private static let endGraceSeconds: TimeInterval = 10

    private init() {}

    // MARK: - Lifecycle

    /// Register the mirrored-session start handler ONCE, as early as possible so a
    /// session started on the wrist is never missed. Idempotent.
    func prepare() {
        guard !didRegisterHandler, HKHealthStore.isHealthDataAvailable() else { return }
        didRegisterHandler = true
        healthStore.workoutSessionMirroringStartHandler = { [weak self] mirrored in
            Task { @MainActor in self?.adopt(mirrored) }
        }
    }

    /// Remote-start the wrist recording for `session`. Non-blocking and silent on
    /// failure: if the watch app never joins, the phone runs the workout alone.
    /// `activityKind` is the watch vocabulary ("running" | "strength" | "hyrox" |
    /// "mixed") — the same string WatchConnectivityiOSService.activityKind emits.
    func begin(session: WorkoutSession, activityKind: String) {
        self.session = session
        endedWorkoutUuid = nil
        guard HKHealthStore.isHealthDataAvailable() else { return }
        prepare()   // safety: never begin without the receive handler live
        let config = HKWorkoutConfiguration()
        config.activityType = Self.activityType(for: activityKind)
        config.locationType = (activityKind == "running") ? .outdoor : .indoor
        // Sharing the workout type is what startWatchApp needs; best-effort, no
        // reprompt once the athlete has decided. Then launch the watch app.
        Task { [weak self] in
            guard let self else { return }
            try? await self.healthStore.requestAuthorization(
                toShare: [HKObjectType.workoutType()], read: []
            )
            self.healthStore.startWatchApp(with: config) { _, _ in
                // Silent: a launch failure just means the phone records alone.
            }
        }
    }

    /// Close the wrist recording: `save == true` finishes it (→ one HKWorkout),
    /// false discards it. We send the intent and keep the mirrored session until the
    /// wrist confirms with `ended` (carrying the workout UUID) or a grace timeout —
    /// the save is asynchronous on the wrist. Called with save=true when the session
    /// enters the summary, save=false on discard/exit. A no-op when no wrist joined.
    func end(save: Bool) {
        guard mirrored != nil else { return }
        send(MirrorWire.MessageType.end, MirrorEnd(save: save))
        stopFrameLoop()
        endTimeout?.invalidate()
        let t = Timer(timeInterval: Self.endGraceSeconds, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.teardown() }
        }
        RunLoop.main.add(t, forMode: .common)
        endTimeout = t
    }

    /// Returns and clears the finished HKWorkout's UUID reported by the wrist (nil
    /// when no wrist recorded, the wrist hasn't replied yet, or it discarded). The
    /// post-workout summary stamps it as the execution's source_workout_ref.
    func consumeWorkoutRef() -> String? {
        let ref = endedWorkoutUuid
        endedWorkoutUuid = nil
        return ref
    }

    // MARK: - Mirrored session adoption

    private func adopt(_ mirrored: HKWorkoutSession) {
        self.mirrored = mirrored
        mirrored.delegate = delegateShim
        wristJoined = true
        startFrameLoop()
        tickFrame()   // push initial state at once, don't wait a whole interval
    }

    private func startFrameLoop() {
        frameTimer?.invalidate()
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

    /// Clear all mirrored state (wrist gone / session ended / grace timeout). Keeps
    /// `endedWorkoutUuid` — the summary consumes it after the session finishes.
    private func teardown() {
        stopFrameLoop()
        endTimeout?.invalidate()
        endTimeout = nil
        mirrored = nil
        wristJoined = false
    }

    private func tickFrame() {
        guard let session, mirrored != nil else { return }
        let frame = buildFrame(from: session)
        let key = structuralKey(frame)
        let now = Date()
        if key != lastSentKey || now.timeIntervalSince(lastSentAt) >= Self.heartbeatInterval {
            send(MirrorWire.MessageType.frame, frame)
            lastSentKey = key
            lastSentAt = now
        }
    }

    // MARK: - Delegate callbacks (hopped to MainActor by the shim)

    func handleStateChange(to state: HKWorkoutSessionState) {
        if state == .ended || state == .stopped { teardown() }
    }

    func handleSessionFailure() { teardown() }

    func handleIncoming(_ payloads: [Data]) {
        for data in payloads {
            guard let env = MirrorEnvelope.decoding(data) else { continue }
            switch env.type {
            case MirrorWire.MessageType.hr:
                if let hr = env.body(as: MirrorHRSample.self) {
                    session?.injectLiveHR(hr.bpm, source: .healthkit)
                }
            case MirrorWire.MessageType.command:
                if let cmd = env.body(as: MirrorCommand.self) { applyCommand(cmd.kind) }
            case MirrorWire.MessageType.ended:
                endedWorkoutUuid = env.body(as: MirrorEnded.self)?.workoutUuid
                teardown()
            default:
                break
            }
        }
    }

    /// Apply a wrist control tap to the engine — the SAME routing the phone's own
    /// primary button uses (ActiveWorkoutView.primaryAction), so a structural block
    /// closes as one completion rather than a single-segment advance. Pause/resume
    /// route through the engine's own togglePause so audio/haptics stay consistent.
    private func applyCommand(_ kind: String) {
        guard let session else { return }
        switch kind {
        case MirrorWire.CommandKind.advance:
            if session.isAwaitingBlockStart { session.beginBlock() }
            else if session.currentBlockIsStructural { session.completeStructuralBlock() }
            else { session.primaryAdvance() }
        case MirrorWire.CommandKind.pause:
            if !session.isPaused { session.togglePause() }
        case MirrorWire.CommandKind.resume:
            if session.isPaused { session.togglePause() }
        default:
            break
        }
    }

    // MARK: - Frame building
    //
    // Reads the SAME accessors the live HUDs read, so the wrist never invents. All
    // content fields are optional — the wrist renders what's present.

    // Internal (not private) so the frame-builder is unit-tested from FAHYBRIKTests —
    // there is no watch test target, so the mirror is verified on the PHONE side here.
    func buildFrame(from session: WorkoutSession) -> MirrorStateFrame {
        let seg = session.currentSegment

        let phase: String
        if session.isFinished { phase = MirrorWire.Phase.finished }
        else if session.isAwaitingBlockStart { phase = MirrorWire.Phase.gate }
        else if session.isPaused { phase = MirrorWire.Phase.paused }
        // The structured-run 3-2-1 pre-roll is its OWN phase (the wrist renders
        // "Prepárate" + a CEIL count-in), distinct from the live active clock.
        else if session.isRunStructureActive && session.isRunCountIn { phase = MirrorWire.Phase.countIn }
        else { phase = MirrorWire.Phase.active }

        // Content lines. A structured run reads from the LEG CURSOR — a mirror of
        // ActiveWorkoutView.modalityHUD, which branches on isRunStructureActive BEFORE
        // the conditioning HUD. The folded-block seg.title / previewWorkLine are frozen
        // across every tramo, so reading them here would pin "tramo 1" on the wrist.
        let lineTitle: String?
        let detailLine: String?
        if session.isRunStructureActive, let leg = session.currentRunLeg {
            let lines = runLegLines(leg)
            lineTitle = lines.title
            detailLine = lines.detail
        } else {
            // #23 — a HYROX dobles relay station reads on the mirrored wrist as the
            // relay ("{partner} hace SkiErg" / "Recupera — siguiente: tú"), not as work
            // the athlete performs. A SHARED station (.split) carries the reparto pact
            // in detailLine ("Tú 60 / Guillem 40 · alterna 250m"); non-dobles keeps the
            // work line. partnerName / splitLine ride on the split when present.
            let relay = seg?.doblesSplit?.role == .partner
            let relayWho = seg?.doblesSplit?.partnerName ?? "Tu compañero"
            let relayStation = seg?.doblesSplit?.stationLabel ?? seg?.title ?? "estación"
            let splitLine = seg?.doblesSplit?.liveSplitLine
            lineTitle = relay ? "\(relayWho) hace \(relayStation)" : seg?.title
            detailLine = relay ? "Recupera — siguiente: tú" : (splitLine ?? seg?.previewWorkLine)
        }

        return MirrorStateFrame(
            phase: phase,
            blockTitle: session.currentBlockRegion?.title,
            lineTitle: lineTitle,
            detailLine: detailLine,
            progressText: progressText(session),
            sessionElapsed: session.elapsedSeconds,
            lapElapsed: session.lapElapsedSeconds,
            countdownRemaining: countdown(session),
            targetZone: seg?.targetZone?.rawValue,
            restRemaining: session.restRemainingSeconds > 0 ? session.restRemainingSeconds : nil
        )
    }

    // A structured-run leg → the wrist's work line + objetivo line, from the SAME leg
    // cursor the phone HUD drives. Reuses the shared RunLegDisplay / RunPaceModel
    // formatting (never a fabricated string): a WORK leg reads its measure + objetivo
    // ("800 m" / "4:25–4:35 /km"); a RECOVERY reads "Recupera <modo>" + its measure.
    private func runLegLines(_ leg: RunLeg) -> (title: String, detail: String?) {
        let measure = RunLegDisplay.measureLabel(leg)
        if leg.isRecovery {
            let mode = RunLegDisplay.recoveryModeWord(leg.recoveryMode)
            return (mode.isEmpty ? "Recupera" : "Recupera \(mode)",
                    measure.isEmpty ? nil : measure)
        }
        return (measure.isEmpty ? "Corre" : measure, leg.objetivoLabel)
    }

    // The fields that gate a resend: everything EXCEPT the free-running clocks
    // (elapsed / countdown value / rest value), which the wrist ticks locally. A
    // countdown or rest merely APPEARING or CLEARING is structural; its value is not.
    // The TRAMO index rides in `progressText` ("TRAMO 2/3"), so a leg change flips the
    // key and resends a fresh frame the instant the tramo advances. Internal so the
    // frame-builder test can assert the leg boundary changes the key.
    func structuralKey(_ f: MirrorStateFrame) -> String {
        [f.phase,
         f.blockTitle ?? "",
         f.lineTitle ?? "",
         f.detailLine ?? "",
         f.progressText ?? "",
         f.targetZone.map(String.init) ?? "",
         f.countdownRemaining != nil ? "cd" : "",
         f.restRemaining != nil ? "rest" : ""
        ].joined(separator: "|")
    }

    // Round/set progress within the current format, mirroring what the live HUD
    // shows. Nil when the format has no meaningful progress counter.
    private func progressText(_ session: WorkoutSession) -> String? {
        // A structured run counts TRAMOS off the leg cursor (mirror of the phone HUD),
        // NOT the rotating machine — whose rotRoundIndex stays frozen at 0 here, which
        // is exactly why the wrist read a stuck "RONDA 1/3" before this branch.
        if session.isRunStructureActive {
            return "TRAMO \(session.runLegNumber)/\(session.runLegTotal)"
        }
        let seg = session.currentSegment
        if seg?.isEMOM == true, let plan = seg?.emomPlan {
            return "RONDA \(min(session.emomIntervalIndex + 1, plan.intervalCount))/\(plan.intervalCount)"
        }
        if session.isConditioningActive, let scheme = seg?.formatScheme {
            switch scheme.presentation {
            case .rotating:
                let total = session.rotTotalRounds
                if total > 0 { return "RONDA \(min(session.rotRoundIndex + 1, total))/\(total)" }
            case .fixed:
                if scheme == .amrap { return "\(session.fixedRoundsDone) rondas" }
                let total = session.fixedListTotal
                if total > 1 { return "\(session.fixedRoundsDone)/\(total)" }
            default:
                break
            }
        }
        if seg?.usesMultiSetStrength == true, !session.setRecords.isEmpty {
            let done = session.setRecords.filter { $0.confirmed }.count
            return "SERIE \(min(done + 1, session.setRecords.count))/\(session.setRecords.count)"
        }
        return nil
    }

    // The active format countdown (count-in, EMOM interval, AMRAP/steady window, or
    // a rotating phase), in seconds — nil when the format runs an open count-up.
    private func countdown(_ session: WorkoutSession) -> Double? {
        // A structured run: the 3-2-1 pre-roll first, then a TIME tramo's count-down;
        // a DISTANCE tramo has NO countdown (nil → the wrist hero shows elapsed/measure,
        // not a fabricated clock). Painting the pre-roll here is what removes the ~3s
        // offset — the phone excludes the count-in from the leg clock, so the wrist must
        // too, instead of counting up a lapElapsed that accrued during the pre-roll.
        if session.isRunStructureActive {
            if session.runCountInRemaining > 0 { return session.runCountInRemaining }
            return session.currentRunLeg?.isTimed == true ? session.runLegRemaining : nil
        }
        let seg = session.currentSegment
        if seg?.isEMOM == true {
            if session.emomCountInRemaining > 0 { return session.emomCountInRemaining }
            return session.emomIntervalRemaining > 0 ? session.emomIntervalRemaining : nil
        }
        if session.isConditioningActive, let scheme = seg?.formatScheme {
            if session.condCountInRemaining > 0 { return session.condCountInRemaining }
            switch scheme.presentation {
            case .fixed, .continuous:
                if seg?.formatTotalSeconds != nil { return session.condRemaining }
            case .rotating:
                return session.rotPhaseRemaining > 0 ? session.rotPhaseRemaining : nil
            default:
                break
            }
        }
        return nil
    }

    // MARK: - Sending

    private func send<P: Encodable>(_ type: String, _ payload: P) {
        guard let mirrored, let data = MirrorEnvelope.encoding(type: type, payload) else { return }
        Task { try? await mirrored.sendToRemoteWorkoutSession(data: data) }
    }

    // MARK: - Activity mapping
    //
    // MUST match WatchTodayPayload.healthKitActivityType (the watch's standalone map)
    // so a mirrored session produces the SAME HKWorkout type the wrist would alone.
    private static func activityType(for activityKind: String) -> HKWorkoutActivityType {
        switch activityKind {
        case "running":  return .running
        case "strength": return .functionalStrengthTraining
        case "hyrox":    return .functionalStrengthTraining
        case "mixed":    return .mixedCardio
        default:         return .other
        }
    }
}

// NSObject delegate shim — HKWorkoutSessionDelegate is an NSObjectProtocol, so the
// conformer can't be a plain @Observable class. It forwards the callbacks (delivered
// off the main thread) onto the MainActor service. Held strongly by the service
// because HKWorkoutSession.delegate is weak.
private final class MirrorSessionDelegate: NSObject, HKWorkoutSessionDelegate {
    weak var owner: PhoneMirrorService?

    init(owner: PhoneMirrorService) { self.owner = owner }

    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor [weak self] in self?.owner?.handleStateChange(to: toState) }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor [weak self] in self?.owner?.handleSessionFailure() }
    }

    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didReceiveDataFromRemoteWorkoutSession data: [Data]
    ) {
        Task { @MainActor [weak self] in self?.owner?.handleIncoming(data) }
    }
}
