import Foundation
import Observation
import HealthKit
import os

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

    /// TRUE from the moment a wrist that WAS recording is told to save, until the
    /// next session begins. It answers one question: "is there going to be an
    /// HKWorkout for this session that the phone did not write?"
    ///
    /// Sticky on purpose — `wristJoined` goes false the instant the wrist confirms
    /// OR the grace timeout fires, but the fact that the wrist owns this session's
    /// HKWorkout outlives both, and the athlete can sit on the summary screen for
    /// minutes. Reading `wristJoined` there would say "no wrist" and the phone would
    /// write a second copy.
    private(set) var wristRecordedWorkout: Bool = false

    /// EL ATLETA TERMINÓ DESDE LA MUÑECA. Acabar en un sitio es acabar: la
    /// pantalla del entreno lo lee y pasa al resumen sola, sin pedir un segundo
    /// final en el móvil.
    ///
    /// Solo lo enciende un final PEDIDO POR UNA PERSONA (`EndReason.athlete`).
    /// La muñeca también cierra su grabación cuando se queda sin señal cinco
    /// minutos, y eso pasa cada vez que el atleta suelta el móvil para descansar
    /// entre bloques: darlo por terminado ahí le costaría el entreno entero. Una
    /// muñeca con binario viejo no manda motivo y cae del lado prudente.
    private(set) var wristFinishedByAthlete: Bool = false

    // Weak so a finished/abandoned WorkoutContainer can deallocate its engine even
    // if a mirrored session lingers until its `ended` reply / grace timeout.
    @ObservationIgnored private weak var session: WorkoutSession?
    @ObservationIgnored private var mirrored: HKWorkoutSession?
    @ObservationIgnored private lazy var delegateShim = MirrorSessionDelegate(owner: self)
    @ObservationIgnored private var frameTimer: Timer?
    @ObservationIgnored private var endTimeout: Timer?
    // Card 72/102 — the end handshake used to be ONE fire-and-forget packet: lost in
    // flight (routine on a run — phone in a pocket, arm swinging) it left the wrist
    // recording forever, wedging every session after it. These re-arm the SAME intent
    // until the wrist's `ended` reply cancels it (see `teardown`) or the retry budget
    // runs out — `endTimeout` below is then a true last resort, not the only attempt.
    @ObservationIgnored private var endRetryTimer: Timer?
    @ObservationIgnored private var endRetryCount = 0
    /// Test seam: when set, intercepts every `send()` instead of the real mirrored
    /// HKWorkoutSession channel — an opaque system type FAHYBRIKTests can't fake — so
    /// the retry cadence can be verified against a REAL Timer without a live wrist
    /// pairing. Nil in production.
    @ObservationIgnored var sendOverride: ((_ type: String) -> Void)?
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

    /// EL LADO DEL TELÉFONO NO LOGUEABA NADA, y es el que lanza la app del reloj,
    /// reintenta y adopta la sesión espejada. La muñeca sí lo hace desde la card 72
    /// («una muñeca atascada era invisible porque nada aquí logueaba nunca»), así que
    /// de un apretón de manos de dos lados sólo se veía uno: «SIN RELOJ» no tenía
    /// diagnóstico por construcción. Mismo subsistema que el otro lado, para leer los
    /// dos en la misma consola.
    @ObservationIgnored private static let log = Logger(
        subsystem: Marca.subsistemaLog("mirror"), category: "phone-lifecycle"
    )

    private static let frameInterval: TimeInterval = 1
    // Heartbeat resend even when nothing structural changed, so a wrist that missed
    // a frame re-bases its clocks within a few seconds.
    private static let heartbeatInterval: TimeInterval = 5
    // How long we hold the mirrored session waiting for the wrist's `ended` reply
    // before clearing it — the recording save happens on the wrist, asynchronously.
    private static let endGraceSeconds: TimeInterval = 10
    // Retry spacing for the end handshake, and the number of RETRIES on top of the
    // first immediate send (5 sends total: t=0,2,4,6,8) — comfortably inside
    // `endGraceSeconds` so the hard teardown at t=10 is reached only after every
    // retry has had a real chance, never as the sole attempt.
    private static let endRetryInterval: TimeInterval = 2
    private static let endRetryMaxAttempts = 4
    // LANZAR NO ES ENTRAR, Y RELANZAR ENCIMA IMPIDE ENTRAR.
    //
    // Esto pedía `startWatchApp` cada 4 s hasta 15 veces mirando sólo `wristJoined`.
    // Pero el apretón de manos del espejo tarda MÁS de 4 s en frío: la app del reloj
    // arranca, pide permiso de HealthKit, hace `beginCollection` y sólo entonces llama
    // a `startMirroringToCompanionDevice`. Así que la segunda petición llegaba con la
    // primera a medio camino — y `MirrorSessionController.start` se auto-cura de
    // cualquier estado que no sea `.idle`, así que TERMINABA la sesión que acababa de
    // crear y volvía a empezar. Con la cadencia corta eso se puede repetir hasta que
    // el último force-release deja el reloj en `.idle`: el teléfono dice SIN RELOJ y la
    // muñeca se queda en la esfera de readiness. Los dos síntomas, una causa.
    //
    // Ahora se pide UNA vez y se ESPERA a que entre, con una ventana que da para un
    // arranque en frío. Sólo si no entra se vuelve a pedir.
    private static let watchLaunchAttempts = 5
    /// Cuánto se espera a que la muñeca ENTRE antes de volver a pedir el arranque. Por
    /// encima del apretón de manos completo en frío, no por debajo.
    private static let watchJoinWindowSeconds: TimeInterval = 12
    /// Cada cuánto se comprueba si ya entró, dentro de esa ventana.
    private static let watchJoinPollSeconds: TimeInterval = 0.5
    // Bumped by begin()/end() so a stale retry loop from a previous session can't
    // launch the watch app after the workout it belonged to is gone.
    @ObservationIgnored private var watchLaunchGeneration = 0
    /// Monotonic cue id — rides on frames + dedicated haptic packets so the wrist
    /// de-dupes when both land.
    @ObservationIgnored private var hapticSeq: Int = 0
    /// Last cue waiting to ride on the next forced frame (cleared after one send).
    @ObservationIgnored private var pendingHapticCue: String?
    @ObservationIgnored private var pendingHapticSeq: Int?
    /// End intent stored when the phone finishes BEFORE the wrist joins (common on
    /// free workouts: short sessions + cold watch launch). The next `adopt` sends
    /// this immediately so the wrist never records forever with no owner.
    @ObservationIgnored private var pendingEndSave: Bool? = nil

    private init() {}

    // MARK: - Lifecycle

    /// Register the mirrored-session start handler ONCE, as early as possible so a
    /// session started on the wrist is never missed. Idempotent.
    func prepare() {
        // Always (re)install the cue relay — hop to main WITHOUT an unstructured
        // Task so a 0.25s timer tick that is already on MainActor still fires the
        // send in the same turn (Task enqueue used to delay / drop under load).
        Haptics.relayWorkoutCue = { [weak self] cue in
            if Thread.isMainThread {
                self?.sendHapticCue(cue)
            } else {
                DispatchQueue.main.async { self?.sendHapticCue(cue) }
            }
        }
        guard !didRegisterHandler, HKHealthStore.isHealthDataAvailable() else { return }
        didRegisterHandler = true
        healthStore.workoutSessionMirroringStartHandler = { [weak self] mirrored in
            Task { @MainActor in self?.adopt(mirrored) }
        }
    }

    /// Push a workout-cue haptic to the wrist immediately. Dual path: dedicated
    /// `haptic` packet AND a forced frame carrying the same cue+seq. No-op when
    /// the mirrored session is not up. Best-effort — never blocks the engine.
    func sendHapticCue(_ cue: String) {
        guard mirrored != nil else { return }
        hapticSeq += 1
        let seq = hapticSeq
        pendingHapticCue = cue
        pendingHapticSeq = seq
        // Path A — dedicated packet (low latency when the channel is healthy).
        send(MirrorWire.MessageType.haptic, MirrorHaptic(cue: cue, seq: seq))
        // Path B — force a frame so a dropped dedicated packet still lands.
        if let session {
            var frame = buildFrame(from: session)
            frame.hapticCue = cue
            frame.hapticSeq = seq
            send(MirrorWire.MessageType.frame, frame)
            lastSentKey = structuralKey(frame)
            lastSentAt = Date()
            // Consume so the next heartbeat doesn't re-play the same cue.
            pendingHapticCue = nil
            pendingHapticSeq = nil
        }
    }

    /// Remote-start the wrist recording for `session`. Non-blocking and silent on
    /// failure: if the watch app never joins, the phone runs the workout alone.
    /// `activityKind` is the watch vocabulary ("running" | "strength" | "hyrox" |
    /// "mixed") — the same string WatchConnectivityiOSService.activityKind emits.
    func begin(session: WorkoutSession, activityKind: String) {
        self.session = session
        endedWorkoutUuid = nil
        wristRecordedWorkout = false   // one flag per session; the previous one is over
        wristFinishedByAthlete = false // idem: el final de la sesión anterior no cuenta aquí
        pendingEndSave = nil           // a new session cancels any orphaned end intent
        guard HKHealthStore.isHealthDataAvailable() else { return }
        prepare()   // safety: never begin without the receive handler live
        let config = HKWorkoutConfiguration()
        config.activityType = Self.activityType(for: activityKind)
        // Calle o cinta SALE DE LA SESIÓN, que ya lo sabe: `WorkoutContainer` estampa
        // `runEnvironment` con la respuesta del atleta ANTES de llamar aquí. Antes esto
        // daba por hecho que toda carrera es en calle, así que una sesión de cinta
        // arrancaba el reloj declarando exterior — GPS encendido para nada y una
        // procedencia que no era la que fue.
        config.locationType = WorkoutLocationType.resolve(
            activityKind: activityKind, environment: session.runEnvironment
        )
        // Sharing the workout type is what startWatchApp needs; best-effort, no
        // reprompt once the athlete has decided. Then launch the watch app.
        watchLaunchGeneration += 1
        let generation = watchLaunchGeneration
        WatchConnectivityiOSService.shared.startLiveWorkout()
        Task { [weak self] in
            guard let self else { return }
            try? await self.healthStore.requestAuthorization(
                toShare: [HKObjectType.workoutType()], read: []
            )
            await self.launchWatchApp(config, generation: generation)
        }
    }

    /// Pide el arranque del reloj y ESPERA a que entre en la misma `livePicture`
    /// (`wristJoined`). Un `begin()`/`end()` nuevo anula el bucle.
    ///
    /// `startWatchApp` puede decir ok y dejar la esfera, así que su ok no es éxito —
    /// pero su ERROR sí es información, y se tiraba (`{ _, _ in }`). Cuando falla, el
    /// atleta entrena sin muñeca y no hay una línea en ninguna parte que diga por qué:
    /// «SIN RELOJ» no tenía diagnóstico posible. Ahora lo tiene.
    ///
    /// Y entre petición y petición se espera de verdad: relanzar encima de un arranque
    /// a medias es lo que lo tumbaba (ver `watchJoinWindowSeconds`).
    private func launchWatchApp(_ config: HKWorkoutConfiguration, generation: Int) async {
        for attempt in 1...Self.watchLaunchAttempts {
            guard generation == watchLaunchGeneration, !wristJoined else { return }

            let error = await withCheckedContinuation { (cont: CheckedContinuation<Error?, Never>) in
                healthStore.startWatchApp(with: config) { _, error in
                    cont.resume(returning: error)
                }
            }
            if let error {
                Self.log.error("startWatchApp falló (intento \(attempt, privacy: .public)): \(error.localizedDescription, privacy: .public)")
            } else {
                Self.log.info("startWatchApp pedido (intento \(attempt, privacy: .public)); esperando a que la muñeca entre")
            }

            // La ventana de espera. Se sondea `wristJoined` en vez de dormir del tirón
            // para no dejar la mano quieta doce segundos cuando entra al primer intento.
            let pasos = Int((Self.watchJoinWindowSeconds / Self.watchJoinPollSeconds).rounded())
            for _ in 0..<pasos {
                try? await Task.sleep(for: .seconds(Self.watchJoinPollSeconds))
                guard generation == watchLaunchGeneration else { return }
                if wristJoined {
                    Self.log.info("la muñeca entró en el intento \(attempt, privacy: .public)")
                    return
                }
            }
        }
        if !wristJoined {
            Self.log.error("la muñeca no entró tras \(Self.watchLaunchAttempts, privacy: .public) intentos — el entreno sigue sin ella")
        }
    }

    /// Force a fresh frame right now (e.g. the live engine just `start()`ed).
    /// Free workouts open the mirror before ActiveWorkoutView calls `session.start()`,
    /// so without this kick the wrist can sit on "Conectando…" until the 1 Hz timer.
    func kickFrame() {
        guard mirrored != nil, session != nil else { return }
        tickFrame()
    }

    /// Close the wrist recording: `save == true` finishes it (→ one HKWorkout),
    /// false discards it. We send the intent and keep the mirrored session until the
    /// wrist confirms with `ended` (carrying the workout UUID) or a grace timeout —
    /// the save is asynchronous on the wrist. Called with save=true when the session
    /// enters the summary, save=false on discard/exit.
    ///
    /// If the wrist has not joined yet, the end intent is STAGED (`pendingEndSave`)
    /// so a late `adopt` (cold watch after a short free session) still stops the
    /// wrist instead of leaving it recording until reboot.
    func end(save: Bool) {
        watchLaunchGeneration += 1   // cancel any in-flight launch retries
        // EL AVISO SALE SIEMPRE, HAYA ESPEJO O NO. El canal del espejo solo existe
        // mientras el reloj refleja al teléfono; si el reloj llevaba el entreno por
        // su cuenta, este `end` no llegaba a ninguna parte y el atleta se
        // encontraba el entreno todavía abierto en la muñeca, con su propio final
        // y su propio guardado que hacer otra vez.
        WatchConnectivityiOSService.shared.endLiveWorkout()
        guard mirrored != nil else {
            pendingEndSave = save
            return
        }
        pendingEndSave = nil
        deliverEnd(save: save)
    }

    // Internal (not private) so the retry cadence is unit-tested from FAHYBRIKTests
    // via `sendOverride` — see its doc comment. Same rationale as `buildFrame`.
    func deliverEnd(save: Bool) {
        // A wrist WAS recording and we just told it to keep the recording: from here
        // on, this session's HKWorkout is the wrist's to write. Latched before the
        // reply so the phone never races it (see `wristRecordedWorkout`).
        if save { wristRecordedWorkout = true }
        stopFrameLoop()
        endRetryCount = 0
        sendEndAttempt(save: save)
        endTimeout?.invalidate()
        let t = Timer(timeInterval: Self.endGraceSeconds, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.teardown() }
        }
        RunLoop.main.add(t, forMode: .common)
        endTimeout = t
    }

    /// One attempt of the end handshake, re-armed until `endRetryMaxAttempts` or the
    /// wrist's `ended` reply cancels it via `teardown()` (which invalidates
    /// `endRetryTimer`). `send()` no-ops once `mirrored` is nil, so a retry firing
    /// after teardown already ran is always harmless — no extra guard needed here.
    private func sendEndAttempt(save: Bool) {
        send(MirrorWire.MessageType.end, MirrorEnd(save: save))
        endRetryTimer?.invalidate()
        guard endRetryCount < Self.endRetryMaxAttempts else { return }
        endRetryCount += 1
        let t = Timer(timeInterval: Self.endRetryInterval, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.sendEndAttempt(save: save) }
        }
        RunLoop.main.add(t, forMode: .common)
        endRetryTimer = t
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
        // Delegate FIRST — logs showed "Received data from remote session but the
        // session delegate is not setup" when packets arrived before this assignment.
        mirrored.delegate = delegateShim
        self.mirrored = mirrored
        wristJoined = true
        Self.log.info("sesión espejada adoptada — la muñeca está DENTRO de la sesión")

        // Late join after the phone already finished (or orphaned session with no
        // live engine): stop the wrist immediately. Free workouts are the usual
        // hit — begin() races the watch launch against a short session.
        if let pending = pendingEndSave {
            pendingEndSave = nil
            deliverEnd(save: pending)
            return
        }
        if session == nil || session?.isFinished == true {
            // No active engine to mirror — discard the wrist recording.
            deliverEnd(save: false)
            return
        }

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
    // Internal (not private) so a test can drive it directly — see `deliverEnd`.
    func teardown() {
        stopFrameLoop()
        endTimeout?.invalidate()
        endTimeout = nil
        endRetryTimer?.invalidate()
        endRetryTimer = nil
        mirrored = nil
        wristJoined = false
    }

    private func tickFrame() {
        guard let session, mirrored != nil else { return }
        // Always send at least the first frame of a session (lastSentKey empty),
        // and re-send when structure changes or the heartbeat elapses. Free
        // strength used to sit black on the wrist until something structural
        // changed because the first tick could race before adopt.
        let frame = buildFrame(from: session)
        let key = structuralKey(frame)
        let now = Date()
        let first = lastSentKey.isEmpty
        if first || key != lastSentKey || now.timeIntervalSince(lastSentAt) >= Self.heartbeatInterval {
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
            case MirrorWire.MessageType.distance:
                // Metros de la muñeca (HK). En calle la autoridad tira el
                // sustituto: cifra y mapa son CoreLocation. En cinta tonta
                // HealthKit es el stream (no hay mapa).
                if let d = env.body(as: MirrorDistanceSample.self) {
                    session?.sampleRunDistance(deltaMeters: d.deltaMeters, source: .healthkit)
                }
            case MirrorWire.MessageType.command:
                if let cmd = env.body(as: MirrorCommand.self) { applyCommand(cmd.kind) }
            case MirrorWire.MessageType.ended:
                let ended = env.body(as: MirrorEnded.self)
                endedWorkoutUuid = ended?.workoutUuid
                // ACABAR EN UN SITIO ES ACABAR. Antes esto solo desmontaba la
                // conexión y el entreno del móvil seguía vivo: había que volver a
                // terminarlo a mano, con su resumen y su guardado, dos veces el
                // mismo trabajo. Ahora un final humano en la muñeca termina aquí
                // también — y SOLO un final humano (ver `wristFinishedByAthlete`).
                if ended?.reason == MirrorWire.EndReason.athlete {
                    wristRecordedWorkout = true   // su HKWorkout es el de esta sesión
                    wristFinishedByAthlete = true
                }
                teardown()
            case MirrorWire.MessageType.sensor:
                if let c = env.body(as: MirrorSensorConclusions.self) {
                    session?.applySensorConclusions(c)
                }
            default:
                break
            }
        }
    }

    /// Apply a wrist control tap to the engine — the SAME primaryAdvance
    /// the phone uses. Un gesto = un tramo. Pause/resume van por togglePause.
    private func applyCommand(_ kind: String) {
        guard let session else { return }
        switch kind {
        case MirrorWire.CommandKind.advance:
            if session.isAwaitingBlockStart { session.beginBlock() }
            // #56 — a wrist advance on the PARTNER's relay station must route to
            // advanceRelay() (the same path the phone's "Relevo ▸" uses): it logs NO
            // lap for the athlete. Falling through to primaryAdvance() → lap() would
            // record the partner's station as the athlete's work and corrupt volume.
            else { session.primaryAdvance(fromAthleteTap: true) }
        case MirrorWire.CommandKind.sync:
            // La muñeca pide re-base (arranque en frío / reconexión). Forzar el
            // envío saltándose la clave estructural — el heartbeat de 5 s no corre
            // con la app en background, pero ESTE camino sí (el dato nos despierta).
            let frame = buildFrame(from: session)
            send(MirrorWire.MessageType.frame, frame)
            lastSentKey = structuralKey(frame)
            lastSentAt = Date()
        case MirrorWire.CommandKind.pause:
            if !session.isPaused { session.togglePause() }
        case MirrorWire.CommandKind.resume:
            if session.isPaused { session.togglePause() }
        case MirrorWire.CommandKind.deathByFail:
            session.deathByFail()
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
        let picture = session.livePicture
        let lineTitle: String?
        let detailLine: String?
        let relay = seg?.doblesSplit?.role == .partner
        let relayWho = seg?.doblesSplit?.partnerName ?? "Tu compañero"
        let relayStation = seg?.doblesSplit?.stationLabel ?? seg?.title ?? "estación"
        let splitLine = seg?.doblesSplit?.liveSplitLine
        if relay {
            lineTitle = "\(relayWho) hace \(relayStation)"
            detailLine = "Recupera — siguiente: tú"
        } else {
            lineTitle = picture.label
            detailLine = splitLine ?? picture.planLine
        }

        // #56 — the current dobles turn (mine/partner/split + rep reparto), so the
        // wrist can render the turn hero AND fire the "entras tú" haptic on the flip
        // back from the partner's relay. Reuses the SAME DoblesTurn the phone hero
        // reads (seg.doblesTurn) — one projection, never a second interpretation.
        let dobles: MirrorDoblesTurn? = seg?.doblesTurn.map { t in
            MirrorDoblesTurn(
                role: t.who.rawValue,
                station: t.station,
                selfReps: t.selfReps,
                partnerReps: t.partnerReps,
                partnerName: t.partnerName,
                selfSharePct: t.selfSharePct
            )
        }

        return MirrorStateFrame(
            phase: phase,
            blockTitle: session.currentBlockRegion?.title,
            lineTitle: lineTitle,
            detailLine: detailLine,
            progressText: session.liveProgressText,
            sessionElapsed: session.elapsedSeconds,
            lapElapsed: session.lapElapsedSeconds,
            countdownRemaining: countdown(session),
            targetZone: seg?.targetZone?.rawValue,
            // El avance ACABA la sesión solo cuando este toque la acaba de verdad: no
            // hay bloque después, no estamos en la puerta de un bloque (ahí el avance
            // solo lo EMPIEZA), no queda tramo por delante dentro del bloque y no
            // queda serie por cerrar. Un entreno de fuerza libre mete todos los
            // ejercicios en UN bloque, así que con la regla vieja («no hay bloque
            // después») la muñeca rotulaba TERMINAR desde la primera serie del primer
            // ejercicio — y ese botón pide confirmación de fin de sesión.
            isFinalStep: !session.isAwaitingBlockStart
                && !session.hasBlockAfterCurrent
                && session.isLastSegment
                && session.pendingSetIndex == nil,
            restRemaining: session.restRemainingSeconds > 0 ? session.restRemainingSeconds : nil,
            dobles: dobles,
            hapticCue: pendingHapticCue,
            hapticSeq: pendingHapticSeq,
            tramo: buildTramo(session),
            // La serie abierta, del MISMO accesor del motor que lee el reloj en
            // solitario: contar no puede depender de por qué vía llegó el entreno.
            sensorWindow: {
                let w = session.sensorWindow
                return MirrorSensorWindow(key: w.key, modality: w.modality,
                                          name: w.name, resting: w.resting)
            }()
        )
    }

    /// EL TRAMO en dato — lo que deja a la muñeca elegir guion y pintar el sujeto
    /// del formato en vez de las tres frases ya redactadas de arriba.
    ///
    /// Todo sale de accesores que el motor YA resuelve; aquí no se decide nada
    /// nuevo, sólo se proyecta. Lo que no se sabe viaja nil: un cero mandado como
    /// si fuera medida es la clase de mentira que el §7 vino a matar.
    private func buildTramo(_ session: WorkoutSession) -> MirrorTramo {
        let tramo = session.currentTramo
        let seg = session.currentSegment
        let descansando = session.isTramoResting

        // El ritmo del TRAMO, no la media del segmento: en una serie la media
        // atraviesa recuperaciones y describe un esfuerzo que no existió.
        let ritmo: Int? = session.liveCoveredPaceSecPerKm
        let objetivo = session.currentRunLeg.flatMap {
            RunLegDisplay.objetivo(for: $0, livePaceSecPerKm: ritmo)
        }
        // FUERA DE UNA PIERNA DE CORRER, `objetivo` (arriba) SIEMPRE ES NIL — no
        // es una carencia, es que esa lógica es de ritmo y sólo tiene sentido
        // corriendo. Un intervalo funcional (el trineo, la plancha) tiene su
        // propio objetivo — RPE, no ritmo — y sin esto la muñeca nunca lo veía:
        // el segundo nivel de `GuionRelojDePared.intervals` (que ES el objetivo
        // cuando el coach escribió uno) se quedaba vacío siempre.
        let objetivoFuncional = PrescriptionRenderer.targetLoad(seg?.prescription?.target)

        // La forma de la parte que se corre, para el aro de la muñeca. Se calcula
        // con la MISMA función que usa el reloj en solitario: dos vías que dibujan
        // el mismo entreno no pueden tener dos reglas de reparto.
        let forma = FormaDelAro.fase(legs: session.currentRunLegs ?? [], indice: session.runLegIndex)

        // En una serie de correr se cuentan SERIES, no piernas: un 3×1000 con sus
        // dos recuperaciones son cinco tramos y tres series, y «tramo 4 de 5» no
        // le dice nada a nadie. La regla vive en RunLegDisplay para que el móvil y
        // las dos vías del reloj cuenten igual.
        let ronda: (n: Int, total: Int)? = {
            if let legs = session.currentRunLegs, !legs.isEmpty {
                return RunLegDisplay.serie(legs: legs, indice: session.runLegIndex)
            }
            guard session.tramoRoundTotal > 0 else { return nil }
            return (n: session.tramoRoundIndex + 1, total: session.tramoRoundTotal)
        }()

        // La serie EN CURSO, no la primera. `previewWorkLine` congela la primera
        // los cinco sets, que es justo lo que la muñeca lleva enseñando.
        let set = session.pendingSetIndex.flatMap { i in
            session.setRecords.indices.contains(i) ? session.setRecords[i] : nil
        }

        // LO CUBIERTO EN ESTA VENTANA — y OBJETIVO Y MEDIDA VIAJAN EMPAREJADOS.
        //
        // Aquí había dos fallos que la muñeca no podía detectar, porque los dos
        // números llegaban bien formados:
        //
        // 1. Se leía el acumulador de la CINTA para todo lo que no fuera ergo. Al
        //    aire libre eso es nil, así que una serie de 1.000 m en la calle
        //    pintaba «te faltan 1000» los cuatro minutos enteros, sin moverse. El
        //    dato bueno estaba dos accesores más abajo, en el mismo fichero del
        //    motor: los metros de la pierna salen del GPS cuando no hay cinta.
        //
        // 2. Objetivo y medida se resolvían por separado con dos `??`, así que un
        //    tramo de «12 cal» de ski cogía el objetivo en calorías y la medida en
        //    METROS — el PM5 reporta distancia haya o no objetivo de distancia. La
        //    muñeca pintaba «te faltan 0 m» desde la primera palada y el aro salía
        //    lleno. El motor ya los empareja bien en `tramoProgress`; era el cable
        //    el que divergía de él, y ahora usa la misma pareja.
        let objetivoMedida: Double?
        let hecho: Double?
        let objetivoEsCalorias: Bool
        if tramo.isErg, let cal = tramo.targetCalories, cal > 0 {
            // La unidad la manda el OBJETIVO: si la pieza se mide en calorías, lo
            // hecho son calorías. Nunca los metros que el monitor reporta igual.
            objetivoMedida = Double(cal)
            hecho = session.tramoErgCalories.map { Double($0) }
            objetivoEsCalorias = true
        } else if tramo.isErg {
            objetivoMedida = tramo.targetDistanceMeters
            hecho = session.tramoErgDistanceMeters
            objetivoEsCalorias = false
        } else if let metros = tramo.targetDistanceMeters {
            objetivoMedida = metros
            hecho = session.livePicture.coveredMeters
            objetivoEsCalorias = false
        } else if let cal = tramo.targetCalories {
            objetivoMedida = Double(cal)
            hecho = session.livePicture.coveredMeters
            objetivoEsCalorias = true
        } else {
            objetivoMedida = nil
            hecho = session.livePicture.coveredMeters
            objetivoEsCalorias = false
        }

        return MirrorTramo(
            formato: seg?.formatScheme?.rawValue,
            modalidad: tramo.modality.rawValue,
            etiqueta: tramo.label,
            dosis: tramo.workLine,
            rondaN: ronda?.n,
            rondaTotal: ronda?.total,
            enDescanso: descansando,
            cierre: cierreDelTramo(tramo, descansando: descansando),
            objetivoMedida: objetivoMedida,
            hechoMedida: hecho,
            objetivoEsCalorias: objetivoEsCalorias,
            // En descanso el reloj que corre es el del descanso; en trabajo, el de
            // la ventana — y `tramoWorkRemaining` ya viene nil cuando no la cierra
            // un reloj, así que la muñeca no inventa cuenta atrás.
            ventanaQueda: descansando ? session.tramoRestRemaining : session.tramoWorkRemaining,
            ventanaTotal: tramo.boxedSeconds.map { Double($0) },
            enTramoS: session.tramoElapsedSeconds,
            ritmoSecPorKm: ritmo,
            objetivoLabel: objetivo?.label ?? objetivoFuncional,
            objetivoEstado: objetivo.map { estadoWire($0.status) },
            zonaViva: session.liveZone?.rawValue,
            siguiente: session.nextTramoLine,
            cargaKg: set.flatMap { $0.loadActualKg ?? $0.loadPrescribedKg },
            // `reps` es fuerza cuando hay serie en curso, y las repeticiones DEL
            // MINUTO en un death by cuando no la hay — los dos formatos son
            // mutuamente excluyentes, así que un solo campo basta para los dos.
            reps: set != nil
                ? set.flatMap { $0.repsActual ?? $0.repsPrescribed }
                : (seg?.formatScheme == .deathBy ? session.deathByTarget : nil),
            // EMOM: la ronda de AHORA, no si el móvil reporta metros — así una
            // ronda de ski sin cinta/PM5 conectado sigue siendo `.ojeada`.
            tareaEsErgo: seg?.emomPlan?.interval(session.tramoRoundIndex)?.isErg ?? false,
            recuperacionEnMovimiento: session.isTramoRecuperandoEnMovimiento,
            forma: forma?.arcos.map { MirrorArco(trabajo: $0.trabajo, peso: $0.peso) },
            formaIndice: forma?.enCurso,
            parte: session.currentRunLeg?.phaseRole.rawValue
        )
    }

    /// QUIÉN CIERRA esta ventana, sea de la modalidad que sea.
    ///
    /// NO sale de `ErgCounterPolicy`: esa tabla resuelve el contador del PM5 y
    /// devuelve `athleteTap` para todo lo que no sea un ergo (`resolve` sale por
    /// arriba si `!tramo.isErg`). Mandar eso por el cable hacía que una serie de
    /// 500 m corriendo — con su hito de distancia, que lo cierra el GPS — viajara
    /// como «la cierras tú», y la muñeca cambiaba el sujeto: en vez de los metros
    /// que faltan pintaba los que llevas, y ofrecía un toque que no hace falta.
    ///
    /// La regla verdadera es la del tramo y es la misma de `LiveTramo`: metros o
    /// calorías → lo sabe la medida; segundos → lo sabe el reloj; nada de eso →
    /// no lo sabe nadie y lo dice el atleta.
    private func cierreDelTramo(_ tramo: LiveTramo, descansando: Bool) -> String {
        // En descanso manda siempre el reloj del descanso: no hay medida que cruzar.
        if descansando { return "sessionClock" }
        if tramo.targetDistanceMeters != nil || tramo.targetCalories != nil { return "machineGoal" }
        if tramo.boxedSeconds != nil || tramo.targetDurationSeconds != nil { return "sessionClock" }
        return "athleteTap"
    }

    private func estadoWire(_ status: TargetStatus) -> String {
        switch status {
        case .inTarget: return "inTarget"
        case .tooFast:  return "tooFast"
        case .tooSlow:  return "tooSlow"
        case .unknown:  return "unknown"
        }
    }

    // The fields that gate a resend: everything EXCEPT the free-running clocks
    // (elapsed / countdown value / rest value), which the wrist ticks locally. A
    // countdown or rest merely APPEARING or CLEARING is structural; its value is not.
    // The TRAMO index rides in `progressText` ("TRAMO 2/3"), so a leg change flips the
    // key and resends a fresh frame the instant the tramo advances. Internal so the
    // frame-builder test can assert the leg boundary changes the key.
    func structuralKey(_ f: MirrorStateFrame) -> String {
        // #56 — the dobles turn (role + station) is structural: a station handoff
        // (partner → mine) flips the key so a fresh frame is resent the instant the turn
        // changes, driving the wrist's "entras tú" haptic on the very next tick.
        let doblesKey = f.dobles.map { "\($0.role):\($0.station)" } ?? ""
        // Every whole second of a countdown / rest forces a frame so the wrist
        // can fire local 3-2-1 ticks even if a dedicated haptic packet is lost,
        // and so the re-based clock never drifts more than ~1 s.
        let countdownSec = f.countdownRemaining.map { String(max(0, Int(ceil($0)))) } ?? ""
        let restSec = f.restRemaining.map { String(max(0, Int(ceil($0)))) } ?? ""
        let hapticKey = f.hapticSeq.map(String.init) ?? ""
        // Del TRAMO sólo entra lo que cambia de FORMA, nunca lo que corre solo: la
        // ronda, si estás en descanso, qué tarea toca, quién cierra la ventana y la
        // dosis. El ritmo, los metros y los relojes se quedan fuera — si entraran,
        // cada segundo forzaría una trama y el canal se inunda. Los metros ya tienen
        // su cubo grueso arriba (la cinta), y el resto la muñeca lo tickea local.
        // El veredicto del ritmo SÍ es estructural: pasar de «en objetivo» a «lento»
        // cambia lo que se pinta, y son cuatro valores, no un número continuo.
        let tramoKey: String = {
            guard let t = f.tramo else { return "" }
            var campos: [String] = []
            campos.append(t.formato ?? "")
            campos.append(t.etiqueta ?? "")
            campos.append(t.dosis ?? "")
            campos.append(t.rondaN.map(String.init) ?? "")
            campos.append(t.rondaTotal.map(String.init) ?? "")
            campos.append(t.enDescanso ? (t.recuperacionEnMovimiento ? "trote" : "rest") : "work")
            campos.append(t.cierre ?? "")
            campos.append(t.objetivoLabel ?? "")
            campos.append(t.objetivoEstado ?? "")
            campos.append(t.zonaViva.map(String.init) ?? "")
            campos.append(t.cargaKg.map { String(Int($0 * 10)) } ?? "")
            campos.append(t.reps.map(String.init) ?? "")
            // Lo medido en la ventana, AL METRO. Iba en cubos de 10 m, y corriendo
            // eso es un refresco cada tres segundos: el numeral de «te faltan» se
            // quedaba clavado y luego pegaba un salto de diez, que es exactamente
            // la sensación de «no está contando» que dio la serie del 8-ago. Al
            // metro no inunda nada, porque el emisor ya está capado a una trama por
            // segundo (`frameInterval`) — el cubo grueso nunca ahorró tramas por
            // debajo de ese techo, sólo las quitaba donde hacían falta.
            campos.append(t.hechoMedida.map { String(Int($0)) } ?? "")
            // El RELOJ de la ventana, al segundo. La muñeca NO lo tickea local — pinta
            // `ventanaQueda` tal cual llega (GuionDelEspejo) — así que dejándolo fuera
            // de la clave solo se refrescaba con el latido de 5 s: la cuenta atrás se
            // congelaba y saltaba de cinco en cinco, y el reloj se veía desincronizado
            // del móvil en CUALQUIER entreno con ventana (el minuto del EMOM, el
            // descanso de intervalos, el del circuito). Al segundo, como ya hacían
            // `countdownSec` y `restSec` arriba: una trama por segundo como mucho, que
            // es exactamente lo que esos dos ya aceptaban.
            campos.append(t.ventanaQueda.map { String(max(0, Int(ceil($0)))) } ?? "")
            // La FORMA del aro y dónde estás dentro de ella: cambia una vez por
            // tramo, y es lo único que mueve el on/off del bisel. Del reparto
            // basta el número de arcos —los pesos no cambian dentro de una parte—
            // y la parte en curso, que decide cómo se llama la pantalla.
            campos.append(t.forma.map { String($0.count) } ?? "")
            campos.append(t.formaIndice.map(String.init) ?? "")
            campos.append(t.parte ?? "")
            return campos.joined(separator: ",")
        }()
        let parts: [String] = [
            f.phase,
            f.blockTitle ?? "",
            f.lineTitle ?? "",
            f.detailLine ?? "",
            f.progressText ?? "",
            f.targetZone.map(String.init) ?? "",
            f.countdownRemaining != nil ? "cd" : "",
            countdownSec,
            f.restRemaining != nil ? "rest" : "",
            restSec,
            doblesKey,
            hapticKey,
            tramoKey,
        ]
        return parts.joined(separator: "|")
    }

    // The active format countdown (count-in, EMOM interval, AMRAP/steady window, or
    // a rotating phase), in seconds — nil when the format runs an open count-up.
    private func countdown(_ session: WorkoutSession) -> Double? {
        if session.countInRemaining > 0 { return session.countInRemaining }
        if session.restRemainingSeconds > 0 { return session.restRemainingSeconds }
        if case .countdown(let s) = session.livePicture.figure { return s }
        return nil
    }

    // MARK: - Sending

    private func send<P: Encodable>(_ type: String, _ payload: P) {
        if let sendOverride { sendOverride(type); return }
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
