import SwiftUI

// EL GUARDADO DEL RESUMEN — los dos caminos, la cola, el rechazo, la celebración y la reseña.
//
// Se cierra como guardado SOLO con un 2xx (o una cola que entregó el cuerpo). Un 5xx / sin
// cobertura se queda en RequestQueue y REINTENTAR la vacía. Un 4xx no se encola
// (`RequestQueue.isRetriable`): se guarda en el móvil y el resumen se asienta en «Guardado en tu
// móvil». `URLSession.shared` espera el POST entero: ningún timeout se lee como éxito.
extension PostWorkoutSummaryView {

    /// Cuánto se espera al cara a cara de dobles. El POST del guardado NO lleva este tope.
    private static var esperaDelCaraACara: TimeInterval { 6 }

    func handleSave() {
        guard !isSaving else { return }
        isSaving = true
        let bearer = KeychainTokenStore.shared.read()   // AUDIT-B1 — el token vive en el Llavero

        if retryFromQueue {
            Task { @MainActor in
                await RequestQueue.shared.drain(bearer: bearer)
                guard !didFinish else { return }
                // Rechazada al vaciar la cola: la cola ya la guardó (`keepOnReject`). Antes esto
                // se leía como «ya no está en la cola» y cerraba como si se hubiera guardado.
                if let requestId = queuedRequestId {
                    let rejected = await RequestQueue.shared.rejectedRequests()
                    if rejected.contains(where: { $0.id == requestId }) {
                        settleKeptOnPhone()
                        return
                    }
                }
                let left = await RequestQueue.shared.snapshot()
                if left.contains(where: { $0.path == queuedSavePath }) {
                    saveFailed = true
                    isSaving = false
                } else {
                    finishAfterSave(records: [])
                }
            }
            return
        }

        // UN GUARDADO, DOS CAMINOS, UNA DECISIÓN (28-sep). Un libre que se guardó como plan al
        // empezar (`FreePlanFirst`) YA ES una asignación: se espera a que esa petición acabe y, si
        // ató la sesión, se guarda por el camino del coach. Solo un libre sin plan (sin conexión, o
        // un cronómetro sin movimientos) va por `POST /free`, que crea el plan y la ejecución a la vez.
        Task { @MainActor in
            if freeContext != nil { await FreePlanFirst.shared.settle(session) }
            guard !didFinish else { return }
            if guardaComoLibre, let free = freeContext {
                session.freeSavedAtEnd = true
                await saveFree(free, bearer: bearer)
            } else {
                await saveAssigned(bearer: bearer)
            }
        }
    }

    /// ENTRENO LIBRE: el contrato de `/free`. Las mismas métricas, más el plan (título, modalidad,
    /// prescripción o ejercicios) para que el servidor lo cree.
    @MainActor
    private func saveFree(_ free: FreeWorkoutContext, bearer: String?) async {
        let payload = buildFreePayload(free)
        // Todo libre se envía, declarado o no: un cronómetro lleva su formato, su duración y el
        // esfuerzo, que es una sesión de verdad y justo lo que una app de temporizador tira. El
        // contrato acepta un funcional sin ítems si dice la forma que corrió, y `buildFreePayload`
        // siempre pone una de las dos en el cable.
        let ref = await healthRef(modality: free.modalityWire, freePayload: payload)
        var sent = payload
        sent.source_workout_ref = ref
        let enviado = await FreeWorkoutAPI.submit(sent, bearer: bearer)
        let body = FreeWorkoutAPI.cuerpoDeCola(sent)   // el codificador del cable
        let outcome = await Self.sesionCaducadaALaCola(enviado, path: FreeWorkoutAPI.path,
                                                       body: body, bearer: bearer)
        guard !didFinish else { return }
        switch outcome {
        case .saved(let response):
            parkTrace(executionId: response?.executionId.flatMap(Int.init), queued: nil, bearer: bearer)
            postBenchmarkMark(completeness: payload.completeness, segments: payload.segments, bearer: bearer)
            FinishedWorkoutDraft.clear()
            finishAfterSave(records: [])
        case .queued(let requestId):
            FinishedWorkoutDraft.clear()   // la cola lo tiene
            // La traza espera a su ejecución: se aparca colgada de la entrada de la cola y sube
            // cuando la cola entregue.
            parkTrace(executionId: nil, queued: requestId, bearer: bearer)
            queuedRequestId = requestId
            retryFromQueue = true
            saveFailed = true
            isSaving = false
        case .rejected(let status):
            // Lo que se envió (con RPE y notas): el mismo contenido que el servidor rechazó.
            await keepOnPhone(path: FreeWorkoutAPI.path, body: body, bearer: bearer, status: status)
        }
    }

    /// El camino del coach (`/api/sync/workout-execution`, o el conjunto de dobles): una asignación
    /// que existe. Vale igual para un libre ya atado a su plan.
    @MainActor
    private func saveAssigned(bearer: String?) async {
        // Sesión suelta sin asignación: no hay nada que sincronizar, se cierra como siempre.
        guard var payload = buildPayload() else {
            finishAfterSave(records: [])
            return
        }
        // Modo espejo: si la muñeca grabó la sesión, informó el UUID del HKWorkout guardado; se
        // lleva para que el servidor reconozca la copia de Salud del MISMO entreno y nunca cuente
        // dos. Solo si el cuerpo no lleva ya una referencia (lo manual va a nil).
        if payload.source_workout_ref == nil {
            if let free = freeContext {
                // Un libre atado a su plan escribe su copia en Salud como la escribía por `/free`:
                // que ahora no haya reloj no lo deja sin anillos.
                payload.source_workout_ref = await healthRef(modality: free.modalityWire,
                                                             executionPayload: payload)
            } else {
                payload.source_workout_ref = PhoneLiveSession.shared.consumeWorkoutRef()
            }
        }
        let submitted = payload
        let target = logTarget
        let enviado: WorkoutSaveOutcome
        switch target {
        case .solo:
            enviado = await WorkoutExecutionAPI.submitReturning(submitted, bearer: bearer)
        case .doublesJoint:
            // sessionId == la asignación de este atleta == payload.assignment_id.
            enviado = await DoblesExecutionAPI.submitReturning(
                sessionId: submitted.assignment_id, submitted, bearer: bearer
            )
        }
        // La misma ruta y el mismo codificador con que la cola lo guarda (`WorkoutExecutionAPI` /
        // `DoblesExecutionAPI`): lo enviado, con RPE, notas y «cómo ha ido».
        let path = target == .doublesJoint
            ? DoblesExecutionAPI.path(sessionId: submitted.assignment_id)
            : WorkoutExecutionAPI.path
        let body = try? JSONEncoder().encode(submitted)
        let outcome = await Self.sesionCaducadaALaCola(enviado, path: path, body: body, bearer: bearer)
        guard !didFinish else { return }
        switch outcome {
        case .saved(let response):
            FinishedWorkoutDraft.clear()
            parkTrace(executionId: response?.executionId.flatMap(Int.init), queued: nil, bearer: bearer)
            postBenchmarkMark(completeness: submitted.completeness, segments: submitted.segments, bearer: bearer)
            let records = response?.personalRecords ?? []
            // #28 — un cierre conjunto: ESTE lado ya está apuntado, así que se pide el cara a cara.
            if target == .doublesJoint {
                let jointTask = Task { await JointSummaryService.fetch(assignmentId: submitted.assignment_id, bearer: bearer) }
                if let summary = await Self.firstValue(of: jointTask, timeout: Self.esperaDelCaraACara),
                   let jd = JointShareData.from(dto: summary, title: session.plan.name,
                                                date: Date(), partnerFallback: nil) {
                    guard !didFinish else { return }
                    pendingJointRecords = records
                    isSaving = false
                    withAnimation(.easeInOut(duration: 0.2)) { jointData = jd }
                    return
                }
            }
            if records.isEmpty {
                finishAfterSave(records: [])
            } else {
                withAnimation(.easeInOut(duration: 0.2)) { celebrationRecords = records }
                isSaving = false
            }
        case .queued(let requestId):
            FinishedWorkoutDraft.clear()   // la cola lo tiene
            // Igual que el entreno libre: la traza cuelga de la entrada de la cola.
            parkTrace(executionId: nil, queued: requestId, bearer: bearer)
            queuedRequestId = requestId
            retryFromQueue = true
            saveFailed = true
            isSaving = false
        case .rejected(let status):
            await keepOnPhone(path: path, body: body, bearer: bearer, status: status)
        }
    }

    /// Apple Salud, UNA sola copia. Con reloj, la muñeca ya escribió el HKWorkout y nos pasa su
    /// uuid; sin reloj no lo escribía NADIE y la sesión no contaba para los anillos: la escribe el
    /// teléfono. `wristRecorded`: si la muñeca grabó, el teléfono no escribe, haya llegado su uuid
    /// o no (el relevo tarde no duplica).
    @MainActor
    private func healthRef(modality: String, freePayload: FreeWorkoutPayload? = nil,
                           executionPayload: WorkoutExecutionPayload? = nil) async -> String? {
        let wristRef = PhoneLiveSession.shared.consumeWorkoutRef()
        if let wristRef { return wristRef }
        let wristRecorded = PhoneLiveSession.shared.wristRecordedWorkout
        let treadmill = session.runEnvironment == .treadmill
        let draft: HealthKitWorkoutDraft? = {
            if let freePayload { return HealthKitWorkoutDraft(freeWorkout: freePayload, treadmill: treadmill) }
            if let executionPayload {
                return HealthKitWorkoutDraft(modality: modality, startedAt: executionPayload.started_at,
                                             endedAt: executionPayload.ended_at,
                                             segments: executionPayload.segments, treadmill: treadmill)
            }
            return nil
        }()
        guard let draft else { return nil }
        return await HealthKitWorkoutWriter.ensureSaved(draft, wristRecorded: wristRecorded)
    }

    /// La traza de la sesión, aparcada hasta que su ejecución exista (o colgada de la entrada de la
    /// cola si se guardó sin cobertura).
    private func parkTrace(executionId: Int?, queued: UUID?, bearer: String?) {
        Task {
            let parkId = await WorkoutTraceUploader.park(
                await Self.closedTraces(recorder: session.trace, startedAt: session.startedAt)
            )
            await WorkoutTraceUploader.resolve(
                parkId: parkId, executionId: executionId, queuedRequestId: queued, bearer: bearer
            )
        }
    }

    /// Un 401 no es un rechazo del ENTRENO: es la sesión la que ha caducado. Va como sin cobertura
    /// —a la cola, que se queda con los 401 y lo entrega al volver a entrar (`RequestQueue.drain`)—,
    /// no a «Guardado en tu móvil», que es para lo que el servidor no aceptará tal cual.
    private static func sesionCaducadaALaCola(
        _ outcome: WorkoutSaveOutcome, path: String, body: Data?, bearer: String?
    ) async -> WorkoutSaveOutcome {
        guard case .rejected(let status) = outcome, status == 401, let body else { return outcome }
        let id = await RequestQueue.shared.enqueue(path: path, body: body, bearer: bearer, keepOnReject: true)
        return .queued(id)
    }

    /// Un rechazo del servidor (4xx que no es 401): el entreno se queda en el móvil tal y como se
    /// envió, y el resumen se asienta en «Guardado en tu móvil».
    @MainActor
    private func keepOnPhone(path: String, body: Data?, bearer: String?, status: Int?) async {
        await GuardadoEnElMovil.guardar(path: path, body: body, bearer: bearer, status: status)
        settleKeptOnPhone()
    }

    private func settleKeptOnPhone() {
        retryFromQueue = false
        saveFailed = false
        isSaving = false
        withAnimation(Theme.Motion.reveal) { keptOnPhone = true }
    }

    /// CERRAR tras un rechazo: el mismo cierre del flujo (`onSave`), pero SIN contar un entreno
    /// guardado para la reseña (`finishAfterSave` cuenta lo que el servidor tiene, y este no lo
    /// tiene); pedir una valoración justo después de «no se ha podido subir» sería leer mal el momento.
    func closeKeptOnPhone() {
        guard !didFinish else { return }
        didFinish = true
        onSave()
    }

    /// B-02: al aparecer el resumen, lo que se enviaría ahora (sin RPE todavía) queda en disco. Si
    /// la app muere antes de GUARDAR, el siguiente arranque lo entrega (`FinishedWorkoutDraft`).
    /// Mismo cuerpo y misma ruta que GUARDAR; el libre con el codificador del cable (`cuerpoDeCola`).
    func stageFinishedDraft() {
        // Ya guardado en el móvil como rechazado (y el resumen vuelve a aparecer): otro borrador
        // iría a la cola y al mismo rechazo — dos copias del entreno.
        guard !keptOnPhone else { return }
        if guardaComoLibre, let free = freeContext {
            if let body = FreeWorkoutAPI.cuerpoDeCola(buildFreePayload(free)) {
                FinishedWorkoutDraft.stage(path: FreeWorkoutAPI.path, body: body)
            }
            return
        }
        guard let payload = buildPayload(), let body = try? JSONEncoder().encode(payload) else { return }
        FinishedWorkoutDraft.stage(path: queuedSavePath, body: body)
    }

    /// #28 — el «Seguir» de la tarjeta conjunta: cierra, pasando los récords a la reseña.
    func dismissJoint() {
        let records = pendingJointRecords
        pendingJointRecords = []
        jointData = nil
        finishAfterSave(records: records)
    }

    func dismissCelebration() {
        let records = celebrationRecords
        celebrationRecords = []
        finishAfterSave(records: records)
    }

    /// Cierra el resumen UNA vez, solo tras un 2xx (o una cola que entregó). La antigüedad de la
    /// reseña cuenta un entreno guardado, no un toque.
    private func finishAfterSave(records: [PersonalRecord]) {
        guard !didFinish else { return }
        didFinish = true
        ReviewPromptStore.shared.recordWorkoutSaved()
        // Un archivo del movimiento de la muñeca espera y el atleta no ha contestado: la hoja, y el
        // resumen se cierra cuando se va (DECISIONS 2026-09-25). Esa vez no se pide reseña: dos
        // hojas a la vez serían una de más, y la reseña se vuelve a intentar la próxima.
        if SensorConsentPrompt.shouldAskAfterSave() {
            askSensorConsent = true
            return
        }
        maybeRequestReview(afterGenuinePR: records.contains { !$0.isFirstMark })
        onSave()
    }

    private static func closedTraces(
        recorder: WorkoutTraceRecorder,
        startedAt: Date
    ) async -> [WorkoutTraceDTO] {
        let reference = await HealthKitDistanceProbe.cumulativeSeries(
            startedAt: startedAt, endedAt: Date()
        )
        if !reference.isEmpty {
            recorder.adopt(reference, as: .distance, source: .healthkit)
        }
        return recorder.traces(startedAt: startedAt)
    }

    private func maybeRequestReview(afterGenuinePR: Bool) {
        let store = ReviewPromptStore.shared
        guard ReviewGate.shouldRequest(
            now: Date(),
            firstUseAt: store.firstUseAt,
            workoutsSaved: store.workoutsSaved,
            lastRequestedAt: store.lastRequestedAt,
            lastBugReportAt: store.lastBugReportAt,
            afterGenuinePR: afterGenuinePR
        ) else { return }
        store.recordReviewRequested()
        requestReview()
    }

    /// Lo que acabe antes: la petición del cara a cara o el tope. El POST del guardado no pasa por
    /// aquí. Se reanuda exactamente una vez.
    private static func firstValue<T>(
        of task: Task<T?, Never>,
        timeout: TimeInterval
    ) async -> T? {
        await withCheckedContinuation { (continuation: CheckedContinuation<T?, Never>) in
            let once = ResumeOnce()
            Task {
                let value = await task.value
                if once.claim() { continuation.resume(returning: value) }
            }
            Task {
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                if once.claim() { continuation.resume(returning: nil) }
            }
        }
    }

    // MARK: - La imagen para compartir

    /// La imagen del resumen (sin insignia de récord: los récords no se saben antes de guardar).
    @MainActor
    func renderSummaryCard() {
        let data = WorkoutShareData.from(
            session: session, totalSeconds: executionCore().totalDuration, rpe: rpe, records: []
        )
        summaryShareURL = WorkoutShareRenderer.pngURL(for: data)
    }

    /// La de la celebración (con la insignia del récord).
    var celebrationShareData: WorkoutShareData {
        WorkoutShareData.from(
            session: session,
            totalSeconds: executionCore().totalDuration,
            rpe: rpe,
            records: celebrationRecords
        )
    }
}

/// Un guardia de una sola vez para que una continuación que se disputan dos tareas (la respuesta y
/// el tope) se reanude exactamente una vez. Sincronizado por dentro: seguro de compartir.
private final class ResumeOnce: @unchecked Sendable {
    private let lock = NSLock()
    private var claimed = false
    /// True solo para el PRIMERO que llama; todos los demás reciben false.
    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if claimed { return false }
        claimed = true
        return true
    }
}
