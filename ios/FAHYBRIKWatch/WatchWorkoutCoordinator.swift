import Foundation
import Observation
import HealthKit
import os

// Glue between the wrist UI and the shared WorkoutSession coach engine.
// PRIMARY create/adopt/recover/end lives on MirrorSessionController. This
// coordinator asks that owner for the session and pipes builder HR / distance
// into the engine.
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
    static let snapshotFreshnessWindow: TimeInterval = 6 * 60 * 60

    private(set) var phase: Phase = .idle
    /// The live engine — nil until a session starts. @Observable, so views that
    /// read `coordinator.session?.…` in their body update every tick.
    private(set) var session: WorkoutSession?

    /// #68 — the structured-run DISTANCE-leg driver, owned here with WORKOUT lifetime
    /// (created at launch, stopped at reset). Living on the coordinator — not the
    /// structured view — is what makes a DISTANCE tramo auto-close even while the
    /// athlete has paged to another watch screen, and keeps its per-leg baseline
    /// across the view being recreated by watchOS paging. Nil until a session starts.
    private(set) var runLegDriver: WatchRunLegDriver?

    /// Facade over the one PRIMARY owner (auth + start/pause/end forwards).
    let live = LiveWorkoutSession()
    /// Permission + accuracy only. Never integrates fixes into meters.
    private let locationGate = WatchRunLocationGate()
    /// Day kind from the payload (`running` / `mixed` / `hyrox`…). The HK
    /// activity of a RUN PIECE is resolved against this, not instead of it.
    private var dayActivityKind: String?

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
    var pendingResult: (assignmentId: String, payload: WorkoutExecutionPayload)?
    /// The current staged outbox bytes for this finish. Swapped by the toggle,
    /// transferred by "Listo".
    var stagedEnvelopeData: Data?
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
    var stagedTraceLocalId: String?

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
        // Symmetric guard with MirrorSessionController.start (which yields to a live
        // standalone session): a mirror recording driven by the phone must equally
        // block a second, standalone engine here — the only path to a duplicate run.
        guard phase == .idle, payload.dayKind == WatchDayKind.session else {
            Self.log.warning("start() declined — phase=\(String(describing: self.phase), privacy: .public)")
            return
        }
        if MirrorSessionController.shared.mode == .mirror {
            Self.log.warning("start() declined — phone is coach")
            return
        }
        let engine = WorkoutSession(
            plan: runnablePlan(payload: payload, detail: detail),
            hrZones: Self.hrZones(from: payload)
        )
        launch(engine: engine, payload: payload, reusePrimary: false)
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
        guard phase == .idle else {
            Self.log.warning("resume() declined — phase=\(String(describing: self.phase), privacy: .public)")
            return
        }
        if MirrorSessionController.shared.mode == .mirror {
            Self.log.warning("resume() declined — phone is coach")
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
        launch(engine: engine, payload: payload, reusePrimary: true)
    }

    /// Shared start path for a fresh or resumed engine. PRIMARY comes from the
    /// one Watch owner — resume reuses a recovered session (no `startActivity`).
    private func launch(engine: WorkoutSession, payload: WatchTodayPayload, reusePrimary: Bool) {
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
        // La fuente va explícita: estos metros los pone `distanceWalkingRunning` de
        // HealthKit (fusión de Apple). CoreLocation en la muñeca pide permiso y
        // mira `horizontalAccuracy`; no cuenta metros. Sellarlos como «gps»
        // etiquetaría el archivo con un aparato que no los midió.
        live.onDistanceDelta = { [weak engine] meters in
            engine?.sampleRunDistance(deltaMeters: meters, source: .healthkit)
        }
        dayActivityKind = payload.activityKind

        engine.start()
        // #68 — the per-leg distance driver runs for the WHOLE session: it reads the
        // covered distance the HK stream feeds into the engine and closes a DISTANCE
        // tramo via the same primaryAdvance() the treadmill uses. Owning it here (not
        // in the view) makes the auto-close independent of which page is on screen.
        let driver = WatchRunLegDriver(session: engine)
        runLegDriver = driver
        driver.start()
        WatchHaptics.start()

        // Fase 0 — inertial capture rides with the HK workout. Live processing
        // (fases 1–3) always runs; archive transfer is consent-gated later.
        SensorCapture.shared.start(executionLocalId: payload.assignmentId)
        startSensorTick()

        Task {
            await live.requestAuthorization()
            live.start(
                activityType: payload.healthKitActivityType,
                locationType: payload.healthKitLocationType,
                reuseIfPresent: reusePrimary
            )
            self.syncAppleRunPipe()
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

    private func syncAppleRunPipe() {
        guard phase == .active, let engine = session else { return }
        let plan = WatchHKActivityPlan.make(
            pieceIsRun: engine.tramoIsRun,
            dayActivityKind: dayActivityKind,
            environment: engine.runEnvironment
        )
        live.syncActivity(plan)
        locationGate.apply(wantsGPS: plan.wantsGPS)
    }

    private func tickSensorIntoEngine() {
        syncAppleRunPipe()
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
            // pulso y distancia de Salud: CoreLocation no archiva fixes.
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
        guard phase == .active else { return }
        // Ata el `finalize()` que RootView dispara al ver el motor cerrado: aquí no
        // hay resumen ni envío que hacer.
        didFinalize = true
        phase = .idle
        WatchHaptics.success()
        Task { await WorkoutStateStore.shared.clear() }
        Task { [weak self] in
            // PRIMARY teardown is MirrorSessionController.finishFromPhone (applyLiveEnd).
            self?.reset()
        }
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
        runLegDriver?.stop()
        runLegDriver = nil
        stopSensorTick()
        if SensorCapture.shared.isRunning { SensorCapture.shared.stop() }
        live.onHeartRate = nil
        live.onDistanceDelta = nil
        MirrorSessionController.shared.onHeartRate = nil
        MirrorSessionController.shared.onDistanceDelta = nil
        locationGate.stop()
        dayActivityKind = nil
        session = nil
        assignmentId = nil
        didFinalize = false
        phase = .idle
    }

}

