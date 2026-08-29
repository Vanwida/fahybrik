import Foundation
import Observation
import HealthKit
import os

// Glue between the wrist UI, the shared WorkoutSession engine, and the HealthKit
// live-metric stream. It builds the runnable plan from the pushed assignment
// detail, owns the engine (timers, laps, format state) + the HealthKit session
// (HR / distance / kcal + the on-end HKWorkout save), pipes live HR and covered
// distance into the engine, and on finish assembles the execution payload EXACTLY
// as the iPhone does, hands it to the phone over WatchConnectivity, and marks the
// day done locally.
@MainActor
@Observable
final class WatchWorkoutCoordinator {

    /// The one standalone coordinator, shared so the mirror-mode entry point (a
    /// WKApplicationDelegate, outside the SwiftUI environment) can read `phase` to
    /// yield when a phone-less session is already running.
    static let shared = WatchWorkoutCoordinator()

    enum Phase: Equatable { case idle, active, finished }

    /// A crash snapshot older than this is stale: we never offer to resume a workout
    /// from an earlier training session (or the previous day). Comfortably longer
    /// than any single session, short enough to exclude yesterday's leftovers.
    private static let snapshotFreshnessWindow: TimeInterval = 6 * 60 * 60

    private(set) var phase: Phase = .idle
    /// El teléfono ya lleva el motor. Un EMPEZAR aquí sería el segundo dueño.
    private(set) var phoneOwnsLive = false
    /// The live engine — nil until a session starts. @Observable, so views that
    /// read `coordinator.session?.…` in their body update every tick.
    private(set) var session: WorkoutSession?

    /// HealthKit live session (HR / kcal / distance + the workout save). Owned here
    /// and driven purely as a metric source; the engine is the UI clock authority.
    let live = LiveWorkoutSession()

    /// Fase 1–3: push wrist pipeline conclusions into the local engine (standalone).
    private var sensorTick: Timer?
    private var sensorSeq: Int = 0

    /// Guards the finalize path so a natural finish + a Terminar can't double-send.
    private var didFinalize = false

    /// Card 72 — same criterion as MirrorSessionController.start: a `guard … else
    /// { return }` that silently blocks a start left the mirror bug undiagnosable for
    /// weeks. Console-inspectable, never `print` (stripped from release builds).
    private static let log = Logger(subsystem: Marca.subsistemaLog("standalone"), category: "watch-lifecycle")
    /// The assignment the running session logs against (captured at start — the
    /// engine itself is assignment-agnostic).
    private var assignmentId: String?

    // MARK: - #23 dobles share (finish summary toggle)
    //
    // The result is STAGED to the outbox at finish with the DEFAULT decision (from
    // the coach's partner_visibility) and only TRANSFERRED on "Listo". The summary
    // toggle mutates the staged entry. Crash-safety is independent of the toggle: if
    // the app dies before "Listo", the next activation drains whatever is staged.

    /// This session's dobles context, captured at launch (so a later push can't
    /// change it under a finished session).
    private var doublesContext: DoublesFinishContext?
    private struct DoublesFinishContext {
        let isDoubles: Bool
        let partnerFirstName: String?
        let isShareable: Bool
    }

    /// Surfaced to SummaryView. True when the finished session is a dobles pair.
    private(set) var isDoublesResult = false
    /// Partner's first name for the badge + "Compartir con {nombre}" copy.
    private(set) var partnerFirstNameResult: String?
    /// Whether to OFFER the share toggle (shared dobles only; a self_only/individual
    /// session is never shareable and shows no toggle).
    private(set) var isDoublesShareable = false
    /// The share decision. Defaulted at finish (shared→true, else false); only the
    /// summary toggle mutates it, via `setShareWithPartner`.
    var shareWithPartner = false

    /// The built execution awaiting its (possibly toggled) send — held so the toggle
    /// can re-encode the envelope with the final decision. Nil until the async
    /// HK-end + payload build completes.
    private var pendingResult: (assignmentId: String, payload: WorkoutExecutionPayload)?
    /// The current staged outbox bytes for this finish. Swapped by the toggle,
    /// transferred by "Listo".
    private var stagedEnvelopeData: Data?
    /// «Listo» llegó ANTES de que el staging async terminara (un cierre de resumen
    /// rápido mientras el save de HealthKit aún tardaba): el Task de finalize()
    /// transfiere en cuanto el sobre exista. Sin esto, el resultado quedaba
    /// persistido pero sin transferir hasta la PRÓXIMA activación de WCSession —
    /// horas o días si el atleta no relanza la app del reloj.
    private var transferWhenStaged = false
    /// El cupón de la traza guardada para este final. Viaja DENTRO del sobre (y en la
    /// metadata del fichero) para que el teléfono pueda volver a juntarlos, y
    /// sobrevive a un re-staging del toggle de dobles: si cambiara con cada flip, el
    /// sobre acabaría reclamando una traza que no existe.
    private var stagedTraceLocalId: String?

    // MARK: - Plan preview (pre-start)

    /// The runnable plan for a pushed assignment detail, or nil for a rest day /
    /// bodyless assignment. Pure — the brief reads it to preview block count + the
    /// first block's work line without starting anything.
    func previewPlan(for detail: AssignmentDetail?) -> WorkoutPlan? {
        detail.flatMap { WorkoutPlan.from(detail: $0) }
    }

    /// The plan a session day actually RUNS: the full prescription when we have the
    /// detail, else a minimal honest fallback (single open segment named from the
    /// title, count-up clock, HR only) so a summary-only day — detail dropped over
    /// the size cap, or nothing cached — is still runnable. No fabricated targets.
    private func runnablePlan(payload: WatchTodayPayload, detail: AssignmentDetail?) -> WorkoutPlan {
        previewPlan(for: detail) ?? WorkoutPlan.minimal(title: payload.title)
    }

    // MARK: - Lifecycle

    /// EMPEZAR — build the plan, spin up the engine + the HealthKit session, wire
    /// the live-metric pipes, and start. The engine arms the first block's gate, so
    /// the UI lands on the block preview (the athlete taps "Empezar bloque" to run).
    /// Only a SESSION day starts — a rest day never reaches here (its brief has no
    /// button), and the guard makes that structural (the DEBUG autostart seam too).
    /// The engine's HR zones come straight off the pushed payload — the server's
    /// bands, verbatim. Nothing is rebuilt here: the wrist used to wrap a bare bpm
    /// back into a profile and, in doing so, hardcoded `isEstimated: false` on a
    /// number that was very often an estimate. Nil → no zones, which the engine
    /// handles by recording no zone time.
    private static func hrZones(from payload: WatchTodayPayload) -> HRZoneProfile? {
        payload.athleteHrZones
    }

    /// Card 72 — same self-heal criterion as MirrorSessionController.start(config:):
    /// a blocked start must repair itself instead of failing forever. `phase` can't
    /// wedge across a process relaunch on its own (it resets to `.idle` with the
    /// app); the one gap possible WITHIN a running process is an engine that
    /// reached `isFinished` but never got `finalize()` run — e.g. the RootView
    /// `.onChange` that normally drives it didn't fire because its view wasn't
    /// mounted at that instant. This closes exactly that gap without ever touching
    /// a genuinely live `.active` session: `finalize()` itself no-ops unless the
    /// engine already reports `isFinished`.
    private func repairStuckPhaseIfNeeded() {
        if phase == .active, session?.isFinished == true, !didFinalize {
            Self.log.warning("found a finished engine still in .active phase — self-healing via finalize()")
            finalize()
        }
    }

    func start(payload: WatchTodayPayload, detail: AssignmentDetail?) {
        repairStuckPhaseIfNeeded()
        // Ya hay una grabación espejada en marcha: este start sería el SEGUNDO motor.
        // Se declina. El caso simétrico —empieza el espejo mientras aquí hay motor— lo
        // cierra `cerrarMotorPropio()`, que tampoco abre un segundo.
        guard !phoneOwnsLive, phase == .idle, MirrorSessionController.shared.state == .idle,
              payload.dayKind == WatchDayKind.session else {
            Self.log.warning("start() declined — phase=\(String(describing: self.phase), privacy: .public) mirrorState=\(String(describing: MirrorSessionController.shared.state), privacy: .public)")
            return
        }
        let engine = WorkoutSession(
            plan: runnablePlan(payload: payload, detail: detail),
            hrZones: Self.hrZones(from: payload)
        )
        launch(engine: engine, payload: payload)
    }

    /// Resume a crash-recovered session: same launch, but the engine is rebuilt from
    /// the on-disk snapshot (its exact plan + progress) rather than the pushed detail
    /// — so 40+ minutes of laps survive process death. The engine re-arms the current
    /// block on start (as the phone does), so the athlete reconfirms with the clock at
    /// the recovered elapsed.
    func resume(from snapshot: PersistedWorkoutState, payload: WatchTodayPayload) {
        repairStuckPhaseIfNeeded()
        // Same symmetric guard as start: never resume a standalone engine while the
        // phone is driving a mirror recording (the reverse of MirrorSessionController).
        guard !phoneOwnsLive, phase == .idle, MirrorSessionController.shared.state == .idle else {
            Self.log.warning("resume() declined — phase=\(String(describing: self.phase), privacy: .public) mirrorState=\(String(describing: MirrorSessionController.shared.state), privacy: .public)")
            return
        }
        let engine = WorkoutSession(
            plan: snapshot.plan,
            hrZones: Self.hrZones(from: payload),
            startedAt: snapshot.startedAt
        )
        // The SAME restore the phone uses — the session owns it, so the wrist can
        // never resume with a different idea of what the athlete had confirmed.
        engine.restore(from: snapshot)
        launch(engine: engine, payload: payload)
    }

    /// Shared start path for a fresh or resumed engine: capture the assignment, wire
    /// the HealthKit stream into the engine, and start both clocks + the HK session.
    private func launch(engine: WorkoutSession, payload: WatchTodayPayload) {
        session = engine
        assignmentId = payload.assignmentId
        didFinalize = false
        phase = .active
        // #23 — capture the dobles context now; a later day-push must not change how
        // THIS finished session logs / reads.
        doublesContext = DoublesFinishContext(
            isDoubles: payload.isDoubles,
            partnerFirstName: payload.partnerFirstName,
            isShareable: payload.isDoublesShareable
        )

        // Pipe the HealthKit stream straight into the engine: HR feeds zone color +
        // the recorded avg/max; covered distance feeds run pace. The engine is the
        // single owner of capture state.
        live.onHeartRate = { [weak engine] bpm in engine?.injectLiveHR(bpm, source: .healthkit) }
        // Calle: el HK outdoor del reloj ES el stream de la calle. Se firma
        // `.gps` para que sampleRunDistance no lo tire. Cinta / indoor: HealthKit.
        if engine.runEnvironment == nil,
           engine.plan.segments.contains(where: \.involvesRun) {
            engine.runEnvironment = .outdoor
        }
        live.onDistanceDelta = { [weak engine] meters in
            guard let engine else { return }
            let source: TraceSource = (engine.runEnvironment == .indoor
                                       || engine.runEnvironment == .treadmill)
                ? .healthkit : .gps
            engine.sampleRunDistance(deltaMeters: meters, source: source)
        }

        engine.start()
        WatchHaptics.start()

        // Fase 0 — inertial capture rides with the HK workout. Live processing
        // (fases 1–3) always runs; archive transfer is consent-gated later.
        SensorCapture.shared.start(executionLocalId: payload.assignmentId)
        startSensorTick()

        Task {
            await live.requestAuthorization()
            live.start(
                activityType: payload.healthKitActivityType,
                locationType: payload.healthKitLocationType
            )
        }
    }

    private func startSensorTick() {
        stopSensorTick()
        sensorSeq = 0
        let t = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tickSensorIntoEngine() }
        }
        RunLoop.main.add(t, forMode: .common)
        sensorTick = t
    }

    private func stopSensorTick() {
        sensorTick?.invalidate()
        sensorTick = nil
    }

    private func tickSensorIntoEngine() {
        guard phase == .active, let engine = session, SensorCapture.shared.isRunning else { return }
        let pipe = SensorCapture.shared.pipeline
        // EL CONTEXTO primero: qué serie está abierta. Sin ventana el contador no
        // cuenta, y así colocarse o descansar no entra como repeticiones.
        let window = engine.sensorWindow
        SensorCapture.shared.setActiveWindow(
            key: window.key,
            exerciseId: window.exerciseId,
            modality: window.modality,
            name: window.name,
            resting: window.resting
        )
        guard pipe.sampleCount >= 12 else { return }
        sensorSeq += 1
        engine.applySensorConclusions(pipe.conclusions(seq: sensorSeq))
    }

    /// A resumable crash snapshot for today, or nil. Offered only when it is FRESH
    /// (within the window) and for the SAME session as today — matched on the plan
    /// name, since the engine's snapshot carries no assignment id. Prevents both a
    /// stale previous-session snapshot and one from a DIFFERENT assignment leaking in
    /// (which would log the wrong laps). Rest days never resume.
    func restorableSnapshot(payload: WatchTodayPayload, detail: AssignmentDetail?) async -> PersistedWorkoutState? {
        guard payload.dayKind == WatchDayKind.session,
              let saved = await WorkoutStateStore.shared.load(),
              !saved.plan.id.uuidString.isEmpty,
              Date().timeIntervalSince(saved.savedAt) < Self.snapshotFreshnessWindow,
              saved.plan.name == runnablePlan(payload: payload, detail: detail).name else { return nil }
        return saved
    }

    /// Pausar / Reanudar — pause or resume BOTH the engine clock (the UI authority)
    /// AND the HealthKit session, so paused minutes stop accruing elapsed/kcal and no
    /// rest-HR sample reaches the lap. Routed here (not straight to the engine) so the
    /// two can never drift out of sync.
    func togglePause() {
        guard let session else { return }
        session.togglePause()
        if session.isPaused { live.pause() } else { live.resume() }
    }

    /// Called once the engine reports `isFinished` (a natural finish OR a Terminar).
    /// Ends the HealthKit session (saves the HKWorkout the iPhone forwards), builds
    /// the execution payload the way PostWorkoutSummaryView does, sends it to the
    /// phone, and marks the day done. Idempotent.
    func finalize() {
        guard phase == .active, !didFinalize, let engine = session, engine.isFinished else { return }
        didFinalize = true

        // Flip the UI + the day's card immediately (don't make the athlete wait on the
        // HealthKit save), carrying the EARNED completeness so the done screen tells the
        // truth — "completada" for a full run, "parcial" for a Terminar-early save.
        WatchPlanModel.shared.markDoneLocally(completeness: engine.completeness.rawValue)
        WatchHaptics.success()
        phase = .finished
        // Normal finish clears the crash snapshot too — otherwise the ≤5s-old autosave
        // would offer to "resume" this already-finished session on the next open.
        Task { await WorkoutStateStore.shared.clear() }

        // #23 — surface the dobles share state to the summary and PIN the default
        // (shared→share, else solo) synchronously, before the async build. The toggle
        // reads/writes `shareWithPartner` from here, so a fast flip is honoured even
        // before staging completes (the async stages the CURRENT value).
        let ctx = doublesContext
        isDoublesResult = ctx?.isDoubles ?? false
        partnerFirstNameResult = ctx?.partnerFirstName
        isDoublesShareable = ctx?.isShareable ?? false
        shareWithPartner = ctx?.isShareable ?? false
        pendingResult = nil
        stagedEnvelopeData = nil
        stagedTraceLocalId = nil
        transferWhenStaged = false

        // End the HK session, get the saved HKWorkout's id, then assemble the execution
        // TAGGED with it (backend dedupes the HealthKit-synced copy). Then STAGE it to
        // the outbox — persisted, but NOT transferred until "Listo". Captured locally so
        // a quick summary-dismiss can't drop the build.
        let capturedAssignmentId = assignmentId
        Task { [weak self, engine] in
            let workoutRef = await self?.live.end()
            // Fase 0 — stop the inertial stream and hand the archive to the phone
            // (consent is enforced on the phone before upload; transfer itself is cheap).
            SensorCapture.shared.stop()
            if let data = try? SensorCapture.shared.archiveData(appVersion: nil), !data.isEmpty {
                let tmp = FileManager.default.temporaryDirectory
                    .appendingPathComponent("sensor-\(capturedAssignmentId ?? "x").fhsc")
                try? data.write(to: tmp, options: .atomic)
                WatchConnectivityService.shared.transferSensorCapture(
                    fileURL: tmp,
                    metadata: [
                        "execution_local_id": capturedAssignmentId as Any,
                        "sample_hz": SensorFileFormat.targetHz,
                        "capture_mode": SensorCapture.shared.pipeline.captureMode.rawValue,
                        "byte_size": data.count,
                    ]
                )
            }
            guard let self, let assignmentId = capturedAssignmentId, !assignmentId.isEmpty else { return }
            // EL ARCHIVO DE LA MUÑECA. La serie medida se deja en disco AHORA, con su
            // cupón, y no sale hasta «Listo» — igual que el sobre de la ejecución, para
            // que fichero y ejecución no puedan separarse. En la muñeca la serie es
            // pulso y distancia y nada más: aquí no hay CoreLocation, así que no hay
            // velocidad ni altitud que archivar.
            self.stagedTraceLocalId = WatchTraceOutbox.shared.stage(
                traces: engine.trace.traces(startedAt: engine.startedAt)
            )
            let payload = self.buildExecutionPayload(
                assignmentId: assignmentId,
                session: engine,
                sourceWorkoutRef: workoutRef
            )
            self.pendingResult = (assignmentId, payload)
            // Stage with the CURRENT share decision (default, or a toggle flip the
            // athlete already made while the async ran). Not transferred yet.
            if let envelope = self.makeEnvelope(assignmentId: assignmentId, payload: payload) {
                self.stagedEnvelopeData = WatchConnectivityService.shared.stageExecutionResult(envelope)
            }
            // «Listo» ya pasó por aquí sin sobre que mandar: se transfiere ahora,
            // con el fichero de la traza detrás — sobre y traza viajan juntos.
            if self.transferWhenStaged {
                self.transferWhenStaged = false
                if let data = self.stagedEnvelopeData {
                    WatchConnectivityService.shared.transferStagedResult(data)
                }
                if let localId = self.stagedTraceLocalId {
                    WatchTraceOutbox.shared.transfer(localId: localId)
                }
            }
        }
    }

    /// EMPIEZA UNA SESIÓN ESPEJADA, así que el motor de aquí sobra: **un** motor.
    ///
    /// Se llamaba `notePhoneLive` / `yieldToPhone` y decía que «el teléfono ya lleva el
    /// motor» y que «la muñeca pasa a espejo». Eso es falso en lo que importa: la
    /// `HKWorkoutSession` vive EN EL RELOJ en las dos vías, y el teléfono es el
    /// acompañante que se suscribe. Lo que de verdad pasa aquí es más pequeño y más
    /// honesto: la sesión espejada arranca, y el segundo MOTOR —el cursor de tramos de
    /// esta muñeca— se cierra para que no haya dos.
    ///
    /// Y se cierra GUARDANDO. Antes llamaba a `live.abandon()`, que acababa la
    /// grabación sin escribir el entreno: el atleta que empezaba en la muñeca y a los
    /// diez minutos abría el teléfono perdía esos diez minutos de pulso, calorías y
    /// metros. Ahora se sellan en Salud, con la firma de `SaludNuestra` puesta, que es
    /// lo que evita que se cuenten dos veces.
    ///
    /// Es `async` a propósito: watchOS no admite dos sesiones a la vez, así que el
    /// espejo tiene que ESPERAR a que ésta esté cerrada antes de crear la suya. Antes
    /// no se esperaba a nada y las dos se solapaban un instante.
    func cerrarMotorPropio() async {
        phoneOwnsLive = true
        guard phase == .active || session != nil else { return }
        Self.log.warning("cerrando el motor de la muñeca: empieza una sesión espejada")
        didFinalize = true
        stopSensorTick()
        live.onHeartRate = nil
        live.onDistanceDelta = nil
        session?.stop()
        session = nil
        assignmentId = nil
        phase = .idle
        // Guarda lo grabado. La ejecución la manda el teléfono (si la mandaran los dos
        // el entreno llegaría dos veces al servidor), pero el HKWorkout de estos
        // minutos es de la muñeca y se queda.
        await live.end()
        if SensorCapture.shared.isRunning { SensorCapture.shared.stop() }
        await WorkoutStateStore.shared.clear()
        didFinalize = false
    }

    /// EL TELÉFONO YA TERMINÓ ESTE ENTRENO. La muñeca cierra lo suyo y se aparta.
    ///
    /// Guarda su grabación en Salud —el pulso y las calorías de este entreno no se
    /// tiran— y vuelve a reposo SIN pedir un segundo resumen y SIN mandar nada al
    /// servidor: la ejecución la manda el teléfono, que es quien lleva el entreno.
    /// Si la mandaran los dos, el mismo entreno llegaría dos veces.
    ///
    /// Antes de esto no existía ningún camino para enterarse: acabar en el móvil
    /// dejaba el reloj grabando y con su propio final pendiente, así que el atleta
    /// tenía que terminar y guardar otra vez en la muñeca.
    ///
    /// No toca nada si el atleta ya terminó en la muñeca y está en su resumen: ese
    /// final es suyo y se cierra con «Listo».
    func finishFromPhone() {
        phoneOwnsLive = false
        guard phase == .active else { return }
        // Ata el `finalize()` que RootView dispara al ver el motor cerrado: aquí no
        // hay resumen ni envío que hacer.
        didFinalize = true
        phase = .idle
        WatchHaptics.success()
        Task { await WorkoutStateStore.shared.clear() }
        Task { [weak self] in
            _ = await self?.live.end()   // cierra y guarda el HKWorkout
            self?.reset()
        }
    }

    /// Build the wire envelope for the current share decision. `shareWithPartner` is
    /// carried only for a dobles result; nil for solo/individual (the phone then
    /// falls back to its own solo/joint resolution).
    private func makeEnvelope(assignmentId: String, payload: WorkoutExecutionPayload) -> WatchExecutionEnvelope? {
        // Encode with the SHARED plain coder — the same one the phone uses to decode
        // the envelope and re-submit the DTO (WatchWire, WatchWireModels).
        guard let data = try? WatchWire.encoder.encode(payload) else { return nil }
        return WatchExecutionEnvelope(
            assignmentId: assignmentId,
            payloadJson: data,
            shareWithPartner: isDoublesResult ? shareWithPartner : nil,
            traceLocalId: stagedTraceLocalId
        )
    }

    /// Summary toggle → update the decision and SWAP the staged outbox entry so any
    /// later drain (or the "Listo" transfer) sends the athlete's actual choice.
    func setShareWithPartner(_ value: Bool) {
        shareWithPartner = value
        restageIfPossible()
    }

    private func restageIfPossible() {
        guard isDoublesResult, let pending = pendingResult,
              let envelope = makeEnvelope(assignmentId: pending.assignmentId, payload: pending.payload)
        else { return }
        stagedEnvelopeData = WatchConnectivityService.shared.restageExecutionResult(
            previous: stagedEnvelopeData, envelope: envelope
        )
    }

    /// "Listo" — commit the (possibly toggled) staged result and return to the day's
    /// done state. If the async build hasn't staged yet (a very fast dismiss), the
    /// staged entry still drains on the next activation with the current decision, so
    /// the result is never lost.
    func confirmAndReset() {
        restageIfPossible()
        if let data = stagedEnvelopeData {
            WatchConnectivityService.shared.transferStagedResult(data)
            // La traza sale CON el sobre, no antes: así no puede quedarse un archivo
            // colgando de una sesión que el atleta nunca confirmó. Si el teléfono no está
            // a tiro, el fichero se queda en su buzón y sale al reencontrarse.
            if let localId = stagedTraceLocalId {
                WatchTraceOutbox.shared.transfer(localId: localId)
            }
        } else {
            // El staging async de finalize() aún no terminó (save de HK lento +
            // «Listo» rápido). Dejar dicho que transfiera al acabar: sin esto el
            // resultado dormía en el buzón hasta la próxima activación.
            transferWhenStaged = true
        }
        reset()
    }

    /// Leave the finished summary → back to the day's done state. Note: the send is
    /// driven by `confirmAndReset` ("Listo"); a bare `reset` (e.g. an aborted, never
    /// finalized session) simply clears state without transferring.
    ///
    /// #23 — the dobles share state (isDoublesResult / shareWithPartner / pendingResult
    /// / stagedEnvelopeData) is intentionally NOT cleared here: the finalize() async
    /// may still be building+staging when "Listo" is tapped, and it must read the
    /// athlete's real decision — not a reset default. Every finalize() sets these
    /// fresh, and `doublesContext` is re-captured at the next launch, so nothing stale
    /// leaks into a new session.
    func reset() {
        session?.stop()
        stopSensorTick()
        if SensorCapture.shared.isRunning { SensorCapture.shared.stop() }
        live.onHeartRate = nil
        live.onDistanceDelta = nil
        session = nil
        assignmentId = nil
        didFinalize = false
        phase = .idle
    }

    // MARK: - Execution payload
    //
    // Mirrors PostWorkoutSummaryView.executionCore / buildSegments
    // (ios/FAHYBRIK/Workout/PostWorkoutSummaryView.swift) — the on-wrist summary
    // collects no RPE / notes / manual overlays, so those are the only omissions.
    // A later pass can DRY this against the iPhone assembly.

    private func buildExecutionPayload(
        assignmentId: String,
        session: WorkoutSession,
        sourceWorkoutRef: String?
    ) -> WorkoutExecutionPayload {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        let total = Int(session.elapsedSeconds.rounded())

        // Only send the score dimensions relevant to this format (same split the
        // iPhone summary uses: time formats vs rounds formats).
        let isTimeScored: Bool
        let isRoundsScored: Bool
        switch session.plan.format {
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim:
            isTimeScored = true;  isRoundsScored = false
        case .amrap, .tabata, .deathBy:
            isTimeScored = false; isRoundsScored = true
        default:
            isTimeScored = false; isRoundsScored = false
        }
        let scoreTime = isTimeScored ? (session.capturedScoreTimeSeconds ?? total) : nil
        let scoreRounds = isRoundsScored ? session.capturedScoreRounds : nil
        let scoreReps = isRoundsScored ? session.capturedScoreReps : nil

        let segments = buildSegments(iso: iso, laps: session.laps)

        return WorkoutExecutionPayload(
            assignment_id: assignmentId,
            perceived_exertion: nil,        // RPE captured later on the phone
            total_duration_seconds: total,
            notes: nil,
            source: nil,                    // live path → backend defaults 'healthkit'
            score_time_s: scoreTime,
            score_rounds: scoreRounds,
            score_reps: scoreReps,
            completeness: session.completeness.rawValue,
            started_at: iso.string(from: session.startedAt),
            ended_at: iso.string(from: Date()),
            segments: segments.isEmpty ? nil : segments,
            source_workout_ref: sourceWorkoutRef
        )
    }

    // La traducción laps → cable es UNA y vive en SegmentPayloadBuilder (compilado en
    // los dos targets). El reloj no tiene la pantalla donde el atleta declara FC o
    // ritmo a mano, así que pasa el overlay vacío; todo lo demás es idéntico al
    // teléfono — incluida la re-secuenciación de `position`, sin la cual los tramos
    // de una carrera estructurada colapsaban en una sola fila al llegar al servidor.
    private func buildSegments(iso: ISO8601DateFormatter, laps: [LapRecord]) -> [SegmentExecutionDTO] {
        SegmentPayloadBuilder.build(laps: laps, overlay: .none, iso: iso)
    }
}
