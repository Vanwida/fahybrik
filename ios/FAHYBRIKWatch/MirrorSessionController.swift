import Foundation
import Observation
import HealthKit
import os

// MIRROR MODE — the wrist HUD + the channel subscriber. Does NOT own an
// HKWorkoutSession. Apple only has one primary (watchOS) and one mirrored
// (companion iOS): the primary lives in `LiveWorkoutSession` (the coordinator's
// instance). This class paints frames, relays taps, and asks that owner to
// start / mirror / pause / close.
//
// Two doors into the same start: `startWatchApp` → `handle(config)` and
// `WatchWireKeys.liveStart` on the WC cable. Both call `start(config:)`. A
// second knock while recording is declined — not a guard between two owners.
@MainActor
@Observable
final class MirrorSessionController {

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

    // MARK: - Diagnostics

    /// Card 72/102 — a `guard … else { return }` that silently blocks a start, or a
    /// self-heal that fires, used to leave NO trace: a wrist stuck in `.recording`
    /// for weeks was invisible because nothing here ever logged. Console-inspectable
    /// via the bundle subsystem, never `print` (stripped from release builds).
    private static let log = Logger(subsystem: Marca.subsistemaLog("mirror"), category: "watch-lifecycle")

    // MARK: - Tuning

    /// Recording keeps going when the phone goes quiet; past this gap the wrist
    /// surfaces a local exit (the controls page offers a manual save/discard).
    private static let connectionLostAfter: TimeInterval = 15
    /// Card 72/102 self-heal — the BELT, not the fix (the fix is `start(config:)`
    /// repairing any dirty state; this only covers a wrist nobody ever touches
    /// again). It must NEVER be confusable with an ordinary radio gap mid-run: phone
    /// in a pocket, arm swinging, or in a bag between HYROX stations routinely drops
    /// Bluetooth for tens of seconds, and the active `HKWorkoutSession` grants BOTH
    /// sides background execution specifically so their 1 Hz timers keep firing
    /// through that — a real multi-minute silence while both devices stay on and
    /// paired essentially never happens outside "the phone actually tore down its
    /// side". 5 minutes sits an order of magnitude past `connectionLostAfter` (which
    /// already gave the manual-save UI a chance at 15s) and is far beyond any
    /// observed reconnection window, so it can only fire on a genuinely abandoned
    /// wrist — never mid-interval, never mid-transition. Saves rather than discards:
    /// a partial recording is worth infinitely more than a lost one (see
    /// WatchWorkoutCoordinator.finishLocally).
    private static let recordingStuckTimeout: TimeInterval = 300
    /// A partir de cuándo un estado que no es `.idle` se considera VIEJO y se puede
    /// curar. Por encima de lo que tarda un arranque en frío (arrancar la app, permiso
    /// de HealthKit, `beginCollection`, `startMirroringToCompanionDevice`) y muy por
    /// debajo del `recordingStuckTimeout` de cinco minutos, que es el otro extremo: uno
    /// protege el arranque en marcha, el otro la muñeca abandonada.
    private static let startStaleAfter: TimeInterval = 20
    /// Minimum spacing between wrist-HR relays to the phone (the sensor collects
    /// faster than the engine needs).
    private static let hrRelayMinInterval: TimeInterval = 1
    /// Confirmation beat on the "Guardando…" screen before returning to idle.
    private static let savedBeat: Duration = .milliseconds(900)

    // MARK: - Owner (the one HKWorkoutSession)

    private var owner: LiveWorkoutSession { WatchWorkoutCoordinator.shared.live }
    /// Local intent flag so a run of paused frames never double-pauses the session.
    private var hkPaused = false
    /// Set while we drive the teardown, so a second `end` (phone retry, local tap)
    /// does not start a parallel close.
    private var isClosing = false
    /// Quién pidió el cierre — viaja en el `ended` que el dueño manda ANTES de
    /// `session.end()`. Se sella al entrar en `closeRecording`.
    private var pendingEndReason: String = MirrorWire.EndReason.phone
    private var lastHRRelayAt: Date = .distantPast

    /// LOS METROS DE ESTA SESIÓN, los que cuenta Apple. Los publica el dueño
    /// (`LiveWorkoutSession.distanceMeters`); aquí se copian para el HUD.
    private(set) var metrosPropios: Double = 0
    /// Later of "recording started" and "last frame" — the watchdog reference.
    private var lastSignalAt: Date = .distantPast
    private var watchdog: Timer?
    /// Last haptic seq played — de-dupes dedicated packets vs frame-embedded cues.
    private var lastHapticSeq: Int = 0
    /// Fase 1–3: relay sensor conclusions to the phone (not the raw stream).
    private var sensorRelay: Timer?
    private var sensorSeq: Int = 0
    private static let sensorRelayInterval: TimeInterval = 0.5

    private init() {}

    // MARK: - Start

    /// El teléfono nos ha pedido entrar — por `startWatchApp` o por `liveStart`.
    /// Si el HUD ya está grabando, esta petición se declina: hay UN dueño, y
    /// ya está en marcha. Si la muñeca llevaba el motor en solitario, se cede
    /// el cursor y se REUTILIZA la grabación (no se mata para crear otra).
    func start(_ payload: WatchLiveStart) {
        WatchLiveStartStore.persist(payload)
        start(config: payload.configuration)
    }

    func start(config: HKWorkoutConfiguration) {
        if WatchLiveStartStore.load() == nil {
            WatchLiveStartStore.persist(WatchLiveStart(configuration: config))
        }
        // Card 72 — recover from ANY dirty leftover HUD state, not an enumerated
        // list. A start in flight is not dirty: only a genuinely stale state
        // (no signal past `startStaleAfter`) is healed. Healing a 2-second-old
        // recording was what killed the walk of 29-ago.
        let llevaSinSenal = Date().timeIntervalSince(lastSignalAt)
        if state != .idle || isClosing {
            guard llevaSinSenal > Self.startStaleAfter else {
                Self.log.info("start(config:) declinado — hay un arranque en marcha (\(llevaSinSenal, privacy: .public)s). No se toca.")
                return
            }
            Self.log.warning("start(config:) found a dirty state (\(String(describing: self.state), privacy: .public), isClosing=\(self.isClosing, privacy: .public), \(llevaSinSenal, privacy: .public)s sin señal) — self-healing before the new recording")
            forceReleaseStuckSession()
        }
        guard state == .idle else {
            Self.log.warning("start(config:) declined — state=\(String(describing: self.state), privacy: .public)")
            return
        }
        state = .recording
        lastSignalAt = Date()
        actividad = config.activityType
        frame = nil
        frameReceivedAt = nil
        liveHR = owner.heartRate > 0 ? Int(owner.heartRate.rounded()) : nil
        metrosPropios = owner.distanceMeters
        isConnectionLost = false
        hkPaused = owner.isPaused
        isClosing = false
        attachToOwner()

        SensorCapture.shared.start()

        Task {
            await WatchWorkoutCoordinator.shared.cederMotor()
            attachToOwner()
            // `startActivity(with:)` «Starts the workout session activity».
            // `requestAuthorization` «Asynchronously requests permission» —
            // ese sheet ES Health Review. Esperarlo ANTES de startActivity
            // dejaba la muñeca sin sesión: si el proceso muere al conceder,
            // `handle(_:)` no se reentrega y `liveStart` por mensaje ya se
            // consumió → idle → EmptyState. La sesión se crea YA.
            await owner.start(configuration: config)
            if owner.isActive {
                beginMirroring()
            }
            await owner.requestAuthorization()
            if !owner.isActive {
                await owner.start(configuration: config)
            }
            guard state == .recording else { return }
            metrosPropios = owner.distanceMeters
            if owner.heartRate > 0 { liveHR = Int(owner.heartRate.rounded()) }
            hkPaused = owner.isPaused
            if owner.isActive {
                beginMirroring()
            } else {
                Self.log.error("el dueño no arrancó — el HUD se queda; no se vuelve a idle")
            }
        }
    }

    /// Tras Health Review el proceso puede nacer de cero. El aviso está en
    /// disco; `handle(_:)` no vuelve (`startWatchApp` ya lanzó).
    func resumeAfterLaunch() {
        guard state == .idle, !owner.isActive else { return }
        guard let pending = WatchLiveStartStore.load() else { return }
        Self.log.info("arranque pendiente tras Health — se pide startActivity ahora")
        start(config: pending.configuration)
    }

    /// `WKApplicationDelegate.handleActiveWorkoutRecovery` — «the app
    /// relaunches after crashing during an active workout session».
    /// `HKHealthStore.recoverActiveWorkoutSession` — «Recovers an active
    /// workout session». Misma sesión, no un segundo dueño.
    func recoverAfterCrash() async {
        await owner.recoverActiveIfNeeded()
        if owner.isActive {
            guard state == .idle else { return }
            state = .recording
            lastSignalAt = Date()
            actividad = owner.recoveredActivityType
            attachToOwner()
            SensorCapture.shared.start()
            beginMirroring()
            return
        }
        resumeAfterLaunch()
    }

    /// Last-resort unstick: drop the HUD and force-release the owner so a new
    /// start can proceed without rebooting the watch.
    private func forceReleaseStuckSession() {
        stopWatchdog()
        stopSensorRelay()
        if SensorCapture.shared.isRunning { SensorCapture.shared.stop() }
        owner.forceRelease()
        resetToIdle(clearPending: false)
    }

    private func attachToOwner() {
        let live = owner
        live.onHeartRate = { [weak self] bpm in
            guard let self else { return }
            self.liveHR = bpm
            self.relayHR(bpm)
        }
        live.onDistanceDelta = { [weak self] delta in
            guard let self else { return }
            self.metrosPropios += delta
            self.relayDistance(delta)
        }
        live.onRemoteData = { [weak self] data in
            self?.handleRemote(data)
        }
        live.onWillTearDownChannel = { [weak self] uuid, session in
            guard let self else { return }
            guard let data = MirrorEnvelope.encoding(
                type: MirrorWire.MessageType.ended,
                MirrorEnded(workoutUuid: uuid, reason: self.pendingEndReason)
            ) else { return }
            try? await session.sendToRemoteWorkoutSession(data: data)
        }
        live.onEndedExternally = { [weak self] in
            guard let self, self.state == .recording else { return }
            self.resetToIdle()
        }
    }

    private func beginMirroring() {
        guard state == .recording else { return }
        lastSignalAt = Date()
        startWatchdog()
        startSensorRelay()
        requestSyncUntilFirstFrame()
        WatchHaptics.start()
        Task { await owner.subscribeCompanion() }
    }

    private func startSensorRelay() {
        stopSensorRelay()
        sensorSeq = 0
        let t = Timer.scheduledTimer(withTimeInterval: Self.sensorRelayInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.relaySensorConclusions() }
        }
        RunLoop.main.add(t, forMode: .common)
        sensorRelay = t
    }

    private func stopSensorRelay() {
        sensorRelay?.invalidate()
        sensorRelay = nil
    }

    private func relaySensorConclusions() {
        guard state == .recording, SensorCapture.shared.isRunning else { return }
        let pipe = SensorCapture.shared.pipeline
        guard pipe.sampleCount >= 12 else { return }
        sensorSeq += 1
        send(type: MirrorWire.MessageType.sensor, pipe.conclusions(seq: sensorSeq))
    }

    // MARK: - Incoming (phone → watch)

    private func handleRemote(_ data: Data) {
        guard let envelope = MirrorEnvelope.decoding(data) else { return }
        switch envelope.type {
        case MirrorWire.MessageType.frame:
            if let f = envelope.body(as: MirrorStateFrame.self) { applyFrame(f) }
        case MirrorWire.MessageType.end:
            if let e = envelope.body(as: MirrorEnd.self) { finish(save: e.save) }
        case MirrorWire.MessageType.haptic:
            // Engine cue from the phone — play on the wrist immediately.
            if let h = envelope.body(as: MirrorHaptic.self) {
                playEngineCue(h.cue, seq: h.seq)
            }
        default:
            break                       // tolerant: a newer phone may speak more types
        }
    }

    /// Map a wire cue name to the watch-side `Haptics.cue*` vocabulary.
    /// `seq` de-dupes when the same cue also rides on a frame.
    private func playEngineCue(_ cue: String, seq: Int?) {
        if let seq {
            guard seq > lastHapticSeq else { return }
            lastHapticSeq = seq
        }
        switch cue {
        case MirrorWire.HapticCue.tick:   Haptics.cueTick()
        case MirrorWire.HapticCue.go:     Haptics.cueGo()
        case MirrorWire.HapticCue.change: Haptics.cueChange()
        case MirrorWire.HapticCue.stop:   Haptics.cueStop()
        case MirrorWire.HapticCue.finish: Haptics.cueFinish()
        default:
            // Unknown future cue — a firm start is better than silence.
            Haptics.cueGo()
        }
    }

    private func applyFrame(_ f: MirrorStateFrame) {
        // Los envíos del móvil son Tasks sin orden garantizado: un frame del tick
        // de 1 Hz puede llegar DESPUÉS del `end`. Aplicarlo durante el cierre
        // pisaba el estado publicado y llegaba a pausar/reanudar una sesión HK a
        // medio desmontar. Grabando o nada.
        guard state == .recording else { return }
        // Path B: cue embedded on the frame (redundancy for a dropped haptic packet).
        if let cue = f.hapticCue {
            playEngineCue(cue, seq: f.hapticSeq)
        }
        // Path C: edge-detect phase / rest / countdown seconds from consecutive frames.
        fireHaptics(from: frame, to: f)
        frame = f
        frameReceivedAt = Date()
        lastSignalAt = frameReceivedAt ?? Date()
        isConnectionLost = false
        applyPhase(f.phase)
        syncSensorWindow(with: f)
    }

    /// EL CONTEXTO del contador de repeticiones: qué serie está abierta.
    ///
    /// Sin esto el contador corre siempre — también mientras el atleta anda hacia
    /// la barra, se coloca o descansa — y cualquier movimiento rítmico de muñeca
    /// entra como repetición. Con esto cada serie cuenta las suyas desde cero.
    /// El teléfono ya manda el tramo en el frame; aquí solo se traduce a ventana.
    private func syncSensorWindow(with f: MirrorStateFrame) {
        guard SensorCapture.shared.isRunning else { return }
        let working = f.phase == MirrorWire.Phase.active
        let resting = f.restRemaining != nil || (f.tramo?.enDescanso ?? false)
        // Lo normal: el móvil manda la ventana ya resuelta por el motor.
        // Un móvil viejo no la manda, y entonces se deduce del tramo — peor (dos
        // series del mismo movimiento comparten clave) pero mejor que no contar.
        let key: String? = !working ? nil : (f.sensorWindow?.key
            ?? [f.tramo?.etiqueta ?? f.lineTitle ?? "tramo",
                f.tramo?.rondaN.map(String.init) ?? f.progressText ?? ""].joined(separator: "|"))
        SensorCapture.shared.setActiveWindow(
            key: key,
            modality: f.sensorWindow?.modality ?? f.tramo?.modalidad,
            name: f.sensorWindow?.name ?? f.tramo?.etiqueta ?? f.lineTitle,
            resting: resting || (f.sensorWindow?.resting ?? false)
        )
    }

    /// Local edge-detect as a third path: even if dedicated + embedded packets
    /// are lost, a 1 Hz frame stream of countdown/rest seconds still fires cues.
    private func fireHaptics(from old: MirrorStateFrame?, to new: MirrorStateFrame) {
        let oldPhase = old?.phase
        let newPhase = new.phase

        // Countdown second drop (3→2→1 of count-in OR last 3s of EMOM/AMRAP).
        if let newCD = new.countdownRemaining {
            let newCeil = max(0, Int(ceil(newCD)))
            if let oldCD = old?.countdownRemaining {
                let oldCeil = max(0, Int(ceil(oldCD)))
                if newCeil < oldCeil {
                    if newCeil > 0, newCeil <= 3 {
                        Haptics.cueTick()
                    } else if newCeil == 0, oldCeil > 0 {
                        Haptics.cueGo()
                    }
                }
            }
        }

        // GO — count-in ends, or a block gate starts work.
        if oldPhase == MirrorWire.Phase.countIn && newPhase == MirrorWire.Phase.active {
            Haptics.cueGo()
        } else if oldPhase == MirrorWire.Phase.gate && newPhase == MirrorWire.Phase.active {
            Haptics.cueGo()
        }

        // Rest appears → STOP; rest clears → GO.
        let oldRest = old?.restRemaining ?? 0
        let newRest = new.restRemaining ?? 0
        if oldRest <= 0, newRest > 0 {
            Haptics.cueStop()
        } else if oldRest > 0, newRest <= 0 {
            Haptics.cueGo()
        } else if oldRest > 0, newRest > 0 {
            // Rest last 3 seconds.
            let oldCeil = Int(ceil(oldRest))
            let newCeil = Int(ceil(newRest))
            if newCeil < oldCeil, newCeil > 0, newCeil <= 3 {
                Haptics.cueTick()
            }
        }

        if newPhase == MirrorWire.Phase.finished, oldPhase != MirrorWire.Phase.finished {
            Haptics.cueFinish()
        }
    }

    // MARK: - Lo que la muñeca puede hacer con SU sesión

    /// Segundos de esta sesión, según Apple. El dueño lee
    /// `HKLiveWorkoutBuilder.elapsedTime` — no un contador nuestro.
    var segundosPropios: TimeInterval { owner.elapsedSeconds }

    /// ¿Esta sesión es de correr? Lo dice la configuración con la que ARRANCÓ, que es
    /// dato de la sesión y no una frase que tenga que mandar el teléfono.
    ///
    /// Se guarda al pedir el arranque y no se lee de `session?.workoutConfiguration`,
    /// porque `state` pasa a `.recording` —y con él `isActive`, que es lo que hace que
    /// la pantalla exista— ANTES de que la sesión de HealthKit esté creada: el permiso
    /// va por medio. Leyéndola del objeto, una carrera se pintaba un instante como si
    /// no lo fuera.
    var esCorrer: Bool { actividad == .running }
    private var actividad: HKWorkoutActivityType?

    /// PAUSAR ES DE LA MUÑECA. Apple pausa la sesión que ella OWNS, y de paso se le
    /// dice al teléfono para que su motor siga la misma pausa cuando esté ahí.
    ///
    /// Antes esto no existía: la pausa sólo llegaba dentro de una trama
    /// (`applyPhase`), así que sin trama —el caso del arranque en frío, y el que
    /// caminó el debugger— no había forma de pausar la grabación desde la muñeca. Un
    /// control que sólo funciona si el otro aparato contesta no es un control.
    func pausar() {
        guard state == .recording else { return }
        if !hkPaused { owner.pause(); hkPaused = true }
        sendCommand(MirrorWire.CommandKind.pause)
    }

    func reanudar() {
        guard state == .recording else { return }
        if hkPaused { owner.resume(); hkPaused = false }
        sendCommand(MirrorWire.CommandKind.resume)
    }

    /// True cuando la grabación de ESTA muñeca está pausada.
    var enPausa: Bool { hkPaused }

    /// Mirror the engine's pause state onto the HK session so paused/rest minutes
    /// don't accrue kcal and no rest-HR reaches the recording.
    private func applyPhase(_ phase: String) {
        switch phase {
        case MirrorWire.Phase.paused:
            if !hkPaused { owner.pause(); hkPaused = true }
        case MirrorWire.Phase.active, MirrorWire.Phase.gate, MirrorWire.Phase.countIn:
            // The count-in is live recording (the athlete is about to move) — resume
            // the HK session like active/gate, never leave it paused into a tramo.
            if hkPaused { owner.resume(); hkPaused = false }
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

    private func relayHR(_ bpm: Int) {
        let now = Date()
        guard now.timeIntervalSince(lastHRRelayAt) >= Self.hrRelayMinInterval else { return }
        lastHRRelayAt = now
        send(type: MirrorWire.MessageType.hr, MirrorHRSample(bpm: bpm))
    }

    private func relayDistance(_ deltaMeters: Double) {
        guard deltaMeters > 0 else { return }
        send(type: MirrorWire.MessageType.distance, MirrorDistanceSample(deltaMeters: deltaMeters))
    }

    private func send<P: Encodable>(type: String, _ payload: P) {
        guard let data = MirrorEnvelope.encoding(type: type, payload) else { return }
        Task { await owner.sendToCompanion(data) }
    }

    // MARK: - End

    /// Phone-driven end: save (finish the HKWorkout) or discard (the athlete exited
    /// without recording — no workout lands).
    ///
    /// `isClosing` se levanta AQUÍ, en síncrono, no dentro de `closeRecording()`:
    /// un `Task {}` nunca corre inline, así que dos cierres seguidos (el `end` del
    /// móvil reintentado, o el toque local cruzándose con él) pasaban ambos el
    /// guard antes de que el primero llegara a marcarlo — y un `finishWorkout` y
    /// un `discardWorkout` acababan corriendo en paralelo sobre el mismo builder.
    /// Es el mismo patrón que `start()` ya aplica con `state`.
    private func finish(save: Bool) {
        guard state == .recording || state == .ending else { return }
        if state == .ending, isClosing { return }
        state = .ending
        isClosing = true
        Task { await closeRecording(save: save, reason: MirrorWire.EndReason.phone) }
    }

    /// Lost-phone exit from the controls page: keep the workout (it lands in Apple
    /// Health; the phone/backend HealthKit sync ingests it later) or drop it. Relay
    /// MirrorEnded too in case the channel revives before teardown.
    func finishLocally() {
        guard state == .recording || state == .ending else { return }
        if state == .ending, isClosing { return }
        state = .ending
        isClosing = true
        Task { await closeRecording(save: true, reason: MirrorWire.EndReason.athlete) }
    }

    /// `liveEnd` por WatchConnectivity: el dueño ya se cierra en
    /// `finishFromPhone()`. Esto solo baja el HUD — el `end()` del dueño es
    /// idempotente si los dos caminos llegan a la vez.
    func cerrarPorElTelefono() {
        finish(save: true)
    }

    func discardLocally() {
        guard state == .recording || state == .ending else { return }
        if state == .ending, isClosing { return }
        state = .ending
        isClosing = true
        Task { await closeRecording(save: false, reason: MirrorWire.EndReason.discarded) }
    }

    private func closeRecording(save: Bool, reason: String) async {
        isClosing = true
        pendingEndReason = reason
        stopWatchdog()
        stopSensorRelay()
        // Stop sensor first so a hung archive never sits under an open HK session.
        if SensorCapture.shared.isRunning { SensorCapture.shared.stop() }

        // UN cierre, el del dueño: save (con timeout) → ended por el canal vivo
        // → session.end(). Esta clase no ordena la sesión.
        let workoutUuid: String?
        if save {
            workoutUuid = await owner.end()
        } else {
            await owner.discard()
            workoutUuid = nil
        }

        if save {
            transferSensorArchive(workoutUuid: workoutUuid)
        }

        WatchHaptics.success()
        try? await Task.sleep(for: Self.savedBeat)
        guard state == .ending else { return }
        resetToIdle()
    }

    private func transferSensorArchive(workoutUuid: String?) {
        guard let data = try? SensorCapture.shared.archiveData(appVersion: nil), !data.isEmpty else { return }
        let localId = workoutUuid ?? UUID().uuidString
        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("sensor-\(localId).fhsc")
        try? data.write(to: tmp, options: .atomic)
        WatchConnectivityService.shared.transferSensorCapture(
            fileURL: tmp,
            metadata: [
                "execution_local_id": localId,
                "sample_hz": SensorFileFormat.targetHz,
                "capture_mode": SensorCapture.shared.pipeline.captureMode.rawValue,
                "byte_size": data.count,
                "source_workout_ref": workoutUuid as Any,
            ]
        )
    }

    private func resetToIdle(clearPending: Bool = true) {
        stopWatchdog()
        stopSensorRelay()
        if SensorCapture.shared.isRunning { SensorCapture.shared.stop() }
        frame = nil
        frameReceivedAt = nil
        liveHR = nil
        metrosPropios = 0
        actividad = nil
        isConnectionLost = false
        hkPaused = false
        isClosing = false
        state = .idle
        if clearPending { WatchLiveStartStore.clear() }
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
        let idle = Date().timeIntervalSince(lastSignalAt)
        isConnectionLost = idle > Self.connectionLostAfter
        // Card 72/102 self-heal: don't trap a live HKWorkout forever waiting for a
        // phone that already gave up (or an athlete who never looked at the wrist).
        // SIEMPRE guarda — nunca descarta — así lo grabado sobrevive.
        if idle > Self.recordingStuckTimeout {
            Self.log.warning("recording stuck \(idle, privacy: .public)s with no phone signal — self-closing with a save")
            // NO es `finishLocally()`: aquí no ha terminado nadie. Se guarda lo
            // grabado y se avisa como `watchdog`, que el teléfono NO propaga a su
            // entreno — salir a descansar entre bloques no puede darlo por acabado.
            state = .ending
            isClosing = true
            Task { await closeRecording(save: true, reason: MirrorWire.EndReason.watchdog) }
        }
    }

    private func stopWatchdog() {
        watchdog?.invalidate()
        watchdog = nil
    }
}
