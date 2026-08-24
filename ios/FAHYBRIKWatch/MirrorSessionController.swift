import Foundation
import Observation
import HealthKit
import os

// MIRROR MODE — the wrist side of the 90% session. The iPhone drives the workout
// (the only engine); the watch RECORDS it (HKWorkoutSession + HKLiveWorkoutBuilder
// → HR / kcal / one saved HKWorkout) and renders frames the phone pushes. It never
// runs the engine here — the standalone WatchWorkoutCoordinator owns phone-less
// sessions and always wins a conflict.
//
// Transport is the HealthKit mirrored-session app-data channel: the phone launches
// this app with a HKWorkoutConfiguration (→ MirrorAppDelegate.handle), we build the
// session, beginCollection, then startMirroringToCompanionDevice(). Frames + end
// arrive on `didReceiveDataFromRemoteWorkoutSession`; HR + commands + the closing
// workout id go back via `sendToRemoteWorkoutSession`. Wire = MirrorWireModels.
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
    /// Minimum spacing between wrist-HR relays to the phone (the sensor collects
    /// faster than the engine needs).
    private static let hrRelayMinInterval: TimeInterval = 1
    /// Confirmation beat on the "Guardando…" screen before returning to idle.
    private static let savedBeat: Duration = .milliseconds(900)
    /// Hard ceiling for `finishWorkout` / `endCollection`. A hung HealthKit save
    /// used to pin the wrist forever (state `.ending`, HKWorkoutSession still
    /// live) until the athlete rebooted the watch — free workouts hit this more
    /// often because the phone can finish while the wrist is still booting.
    private static let saveTimeout: Duration = .seconds(8)

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
    /// Cumulative Apple distance last relayed, so we emit only the increment.
    private var lastReportedDistance: Double = 0
    private var lastDistanceRelayAt: Date = .distantPast
    /// Later of "recording started" and "last frame" — the watchdog reference.
    private var lastSignalAt: Date = .distantPast
    private var watchdog: Timer?
    /// Last haptic seq played — de-dupes dedicated packets vs frame-embedded cues.
    private var lastHapticSeq: Int = 0
    /// Fase 1–3: relay sensor conclusions to the phone (not the raw stream).
    private var sensorRelay: Timer?
    private var sensorSeq: Int = 0
    private static let sensorRelayInterval: TimeInterval = 0.5

    private override init() { super.init() }

    // MARK: - Start

    /// Phone launched us with a workout config. Stand up the recording UNLESS a
    /// standalone (phone-less) session is already running — that one wins.
    func start(config: HKWorkoutConfiguration) {
        // Card 72 — recover from ANY dirty leftover state, not an enumerated list.
        // The original self-heal only covered `.ending` (a stuck close); the far
        // more common wedge is `.recording` — the phone's end handshake never made
        // it (see PhoneMirrorService.deliverEnd's retries, which mitigate but can't
        // eliminate this) and nothing ever moved the wrist off `.recording`. Every
        // future state added to `State` is covered for free because this checks
        // "not idle", never a case list.
        if state != .idle || isClosing {
            Self.log.warning("start(config:) found a dirty state (\(String(describing: self.state), privacy: .public), isClosing=\(self.isClosing, privacy: .public)) — self-healing before the new recording")
            forceReleaseStuckSession()
        }
        guard state == .idle, WatchWorkoutCoordinator.shared.phase == .idle else {
            Self.log.warning("start(config:) declined — state=\(String(describing: self.state), privacy: .public) standaloneCoordinatorPhase=\(String(describing: WatchWorkoutCoordinator.shared.phase), privacy: .public)")
            return
        }
        state = .recording
        frame = nil
        frameReceivedAt = nil
        liveHR = nil
        isConnectionLost = false
        hkPaused = false
        isClosing = false

        // Fase 0 — same capture component as standalone (one path, not two).
        SensorCapture.shared.start()

        Task {
            await LiveWorkoutSession.requestWorkoutAuthorization(store: store)
            beginRecording(config: config)
        }
    }

    /// Last-resort unstick: end any residual HK session and drop local state so a
    /// new mirror (or standalone) start can proceed without rebooting the watch.
    private func forceReleaseStuckSession() {
        stopWatchdog()
        stopSensorRelay()
        if SensorCapture.shared.isRunning { SensorCapture.shared.stop() }
        session?.end()
        builder = nil
        session = nil
        isClosing = false
        state = .idle
        frame = nil
        frameReceivedAt = nil
        liveHR = nil
        isConnectionLost = false
        hkPaused = false
    }

    private func beginRecording(config: HKWorkoutConfiguration) {
        guard state == .recording, session == nil else { return }
        do {
            let session = try HKWorkoutSession(healthStore: store, configuration: config)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            session.delegate = self
            builder.delegate = self
            self.session = session
            self.builder = builder

            let start = Date()
            session.startActivity(with: start)
            builder.beginCollection(withStart: start) { [weak self] success, _ in
                Task { @MainActor in
                    guard let self, self.builder === builder else { return }
                    if success {
                        self.beginMirroring()
                    } else {
                        // Sin colección no hay grabación: arrancar el espejo igual
                        // (como se hacía, descartando el error con `_, _`) dejaba
                        // watchdog + relay + un canal vivo sobre una sesión que
                        // jamás iba a guardar nada. Se libera y a idle.
                        self.resetToIdle()
                    }
                }
            }
        } catch {
            resetToIdle()
        }
    }

    private func beginMirroring() {
        guard let session, state == .recording else { return }
        lastSignalAt = Date()
        startWatchdog()
        startSensorRelay()
        requestSyncUntilFirstFrame()
        WatchHaptics.start()
        Task { try? await session.startMirroringToCompanionDevice() }
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
        guard let session, let data = MirrorEnvelope.encoding(type: type, payload) else { return }
        Task { try? await session.sendToRemoteWorkoutSession(data: data) }
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

    func discardLocally() {
        guard state == .recording || state == .ending else { return }
        if state == .ending, isClosing { return }
        state = .ending
        isClosing = true
        Task { await closeRecording(save: false, reason: MirrorWire.EndReason.discarded) }
    }

    private func closeRecording(save: Bool, reason: String) async {
        isClosing = true
        stopWatchdog()
        stopSensorRelay()
        // Stop sensor first so a hung archive never sits under an open HK session.
        if SensorCapture.shared.isRunning { SensorCapture.shared.stop() }

        // EL CIERRE OPERA SOBRE LAS INSTANCIAS CAPTURADAS. Un save lento puede
        // solaparse con el siguiente arranque (`start()` → `forceReleaseStuckSession`
        // sustituye `self.session`): sin la captura, este Task huérfano mandaba el
        // `ended` — con el UUID del entreno ANTERIOR — por el canal del entreno
        // nuevo, y su `session?.end()` + `resetToIdle()` finales tumbaban la
        // grabación recién empezada. Con ella, el huérfano muere con lo suyo.
        let closingSession = session
        let closingBuilder = builder

        var workoutUuid: String?
        if save {
            // Bound the HK save: finishWorkout has been observed to hang, which left
            // the wrist on "Guardando…" with the system HKWorkoutSession still live
            // — the only escape was powering off the watch.
            workoutUuid = await endAndSaveWithTimeout(session: closingSession, builder: closingBuilder)
        } else {
            closingBuilder?.discardWorkout()
        }

        // Fase 0 — transfer archive only when saving (best-effort; never blocks idle).
        if save {
            transferSensorArchive(workoutUuid: workoutUuid)
        }

        // Relay the finished id BEFORE ending the session (channel dies with it).
        if let closingSession, let data = MirrorEnvelope.encoding(
            type: MirrorWire.MessageType.ended,
            MirrorEnded(workoutUuid: workoutUuid, reason: reason)
        ) {
            try? await closingSession.sendToRemoteWorkoutSession(data: data)
        }

        // ALWAYS end the session — this is what releases HealthKit system-wide so
        // the next free/prescribed workout can start without a reboot.
        closingSession?.end()

        // A partir de aquí se toca el estado COMPARTIDO: solo si esta época sigue
        // siendo la dueña (nadie la sustituyó durante los awaits de arriba).
        guard session === closingSession else { return }
        session = nil
        builder = nil

        WatchHaptics.success()
        try? await Task.sleep(for: Self.savedBeat)
        // El beat de confirmación también es un await: si en esos 900 ms entró un
        // arranque nuevo (start() desatasca el `.ending` y crea otra sesión), el
        // reset ya no es nuestro y se omite.
        guard state == .ending, session == nil else { return }
        resetToIdle()
    }

    /// End collection + finishWorkout, but never wait longer than `saveTimeout`.
    /// On timeout we end the HK session so HealthKit unblocks even if the save
    /// await is stuck (cancellation alone does not abort a hung HealthKit call).
    /// Session/builder llegan capturados por el cierre dueño — nunca `self.`, que
    /// puede apuntar ya al entreno siguiente (ver closeRecording).
    private func endAndSaveWithTimeout(session: HKWorkoutSession?,
                                       builder: HKLiveWorkoutBuilder?) async -> String? {
        await withCheckedContinuation { (cont: CheckedContinuation<String?, Never>) in
            var resumed = false
            func resumeOnce(_ value: String?) {
                guard !resumed else { return }
                resumed = true
                cont.resume(returning: value)
            }
            Task { @MainActor in
                let id = await Self.endAndSave(builder: builder)
                resumeOnce(id)
            }
            Task { @MainActor in
                try? await Task.sleep(for: Self.saveTimeout)
                // Unstick: ending the session typically causes a hung finishWorkout
                // to fail/return so the other task can complete; we still resume
                // here so closeRecording always continues.
                session?.end()
                resumeOnce(nil)
            }
        }
    }

    /// End collection and save the HKWorkout, returning its UUID string (nil on a
    /// save failure). The workout is the source of truth the phone tags its
    /// execution with.
    private static func endAndSave(builder: HKLiveWorkoutBuilder?) async -> String? {
        guard let builder else { return nil }
        do {
            try await builder.endCollection(at: Date())
            let workout = try await builder.finishWorkout()
            return workout?.uuid.uuidString
        } catch {
            return nil
        }
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

    private func resetToIdle() {
        stopWatchdog()
        stopSensorRelay()
        if SensorCapture.shared.isRunning { SensorCapture.shared.stop() }
        // Ensure HK is released even if closeRecording was interrupted mid-await.
        if session != nil {
            session?.end()
        }
        session = nil
        builder = nil
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

// MARK: - HKWorkoutSessionDelegate

// TODOS los callbacks comprueban `=== self.session` (o `=== self.builder`): el
// delegado sobrevive en la sesión VIEJA cuando un cierre lento se solapa con el
// arranque siguiente (forceReleaseStuckSession la termina y su `.ended` llega
// tarde, con `self.session` ya apuntando al entreno nuevo). Sin la identidad,
// ese eco reseteaba — y mataba — la grabación recién empezada.
extension MirrorSessionController: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didReceiveDataFromRemoteWorkoutSession data: [Data]
    ) {
        Task { @MainActor [weak self] in
            guard let self, workoutSession === self.session else { return }
            for packet in data { self.handleRemote(packet) }
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor [weak self] in
            guard let self, workoutSession === self.session,
                  toState == .ended, !self.isClosing, self.state == .recording else { return }
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
            guard let self, workoutSession === self.session, !self.isClosing else { return }
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
        let hrType = HKQuantityType(.heartRate)
        let distanceType = HKQuantityType(.distanceWalkingRunning)
        let hrStats = collectedTypes.contains(hrType) ? workoutBuilder.statistics(for: hrType) : nil
        let distanceStats = collectedTypes.contains(distanceType) ? workoutBuilder.statistics(for: distanceType) : nil
        Task { @MainActor [weak self] in
            guard let self, workoutBuilder === self.builder else { return }
            if let hrStats { self.applyHR(hrStats) }
            if let distanceStats { self.applyDistance(distanceStats) }
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

    @MainActor
    private func applyDistance(_ stats: HKStatistics?) {
        guard let q = stats?.sumQuantity() else { return }
        let total = q.doubleValue(for: .meter())
        let delta = total - lastReportedDistance
        guard delta > 0 else { return }
        lastReportedDistance = total
        relayDistance(delta)
    }
}
