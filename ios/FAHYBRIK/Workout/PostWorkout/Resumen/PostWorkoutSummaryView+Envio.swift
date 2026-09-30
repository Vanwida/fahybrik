import Foundation

// LO QUE VIAJA POR EL CABLE — las métricas de la ejecución, los tramos, la puntuación y la marca.
//
// Los dos caminos de guardado (el del coach y el de `/free`) comparten las MISMAS métricas,
// calculadas una vez en `executionCore()`, para que ninguno vuelva a derivar duraciones,
// puntuaciones o tramos y no puedan divergir. Lo único distinto por camino son los portadores
// (assignment_id frente a título/modalidad/prescripción) y la procedencia.
extension PostWorkoutSummaryView {

    /// La ruta cuyo cuerpo guarda RequestQueue tras un guardado encolado: el reintento vigila esta
    /// ruta, no se inventa un segundo POST.
    var queuedSavePath: String {
        if guardaComoLibre { return FreeWorkoutAPI.path }
        switch logTarget {
        case .solo:
            return WorkoutExecutionAPI.path
        case .doublesJoint:
            if let id = efectivaAssignmentId { return DoblesExecutionAPI.path(sessionId: id) }
            return WorkoutExecutionAPI.path
        }
    }

    /// True cuando este entreno se guarda por `POST /free`: un libre que no llegó a tener su plan en
    /// el servidor antes de terminar.
    var guardaComoLibre: Bool { freeContext != nil && session.assignmentId == nil }

    /// La asignación a la que se atribuye: la del plan que se abrió, o la que el libre recibió al
    /// guardarse como plan al empezar.
    var efectivaAssignmentId: String? {
        if let assignmentId, !assignmentId.isEmpty { return assignmentId }
        return session.assignmentId
    }

    private var puntuaPorTiempo: Bool { LecturaResumen.puntuaPorTiempo(session.plan.format) }
    private var puntuaPorRondas: Bool { LecturaResumen.puntuaPorRondas(session.plan.format) }

    // MARK: - Sembrar lo que ya se sabe

    /// El resultado sale de lo que el reloj en vivo ya contó (el atleta no vuelve a teclear sus
    /// rondas del AMRAP ni su For Time). Solo siembra lo vacío, así que una edición no se pisa. Lo
    /// apuntado a mano («Ya lo hice») no tiene nada capturado y se queda en blanco.
    func seedCapturedScore() {
        guard !manualEntry else { return }
        if puntuaPorTiempo, scoreTimeSeconds == nil {
            scoreTimeSeconds = session.capturedScoreTimeSeconds ?? Int(session.elapsedSeconds.rounded())
        }
        if puntuaPorRondas {
            if scoreRounds == nil { scoreRounds = session.capturedScoreRounds }
            if scoreReps == nil { scoreReps = session.capturedScoreReps }
        }
    }

    /// Los bloques que admiten RX / Escalado (metcon, fuera de calentamiento y vuelta a la calma, con tramos).
    var bloquesRx: [BloqueRx] {
        DeclaracionesRx.bloques(plan: session.plan, laps: session.laps)
    }

    /// Lo que ya dicen las vueltas de cada bloque (el `rx` del motor, o lo marcado en la vista
    /// vieja). Solo siembra lo no tocado: una edición no se pisa.
    func seedRx() {
        for b in bloquesRx where rxDeclarado[b.id] == nil {
            rxDeclarado[b.id] = DeclaracionesRx.semilla(b, laps: session.laps)
        }
    }

    /// Los movimientos declarados, con la MISMA estructura con que corrió la sesión
    /// (`FreeFunctionalItems`): un WOD nombrado después es idéntico a uno nombrado en el montador.
    func applyDeclared(_ movements: [FreeFunctionalMovement]) {
        guard let ran = freeContext?.ranPrescription, !movements.isEmpty else { return }
        declaredItems = FreeFunctionalItems.payloads(
            movements,
            scheme: ran.scheme,
            structure: FunctionalStructural(from: ran)
        )
        declaredSummary = movements
            .map { "\($0.doseString) \($0.exercise.name)" }
            .joined(separator: " · ")
    }

    // MARK: - Las métricas compartidas

    struct ExecutionCore {
        let totalDuration: Int?
        let startedAtISO: String
        let endedAtISO: String
        let scoreTime: Int?
        let scoreRounds: Int?
        let scoreReps: Int?
        let completeness: String
        let segments: [SegmentExecutionDTO]?
        let notes: String?
        /// 'manual' para lo apuntado después; nil en vivo.
        let liveSource: String?
    }

    func executionCore() -> ExecutionCore {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        let endedAt = Date()
        // A mano: el total se teclea (o, en un formato por tiempo, sale de «Tiempo final»). En
        // vivo: lo mide el reloj.
        let totalDuration: Int? = manualEntry
            ? (manualTotalSeconds ?? (puntuaPorTiempo ? scoreTimeSeconds : nil))
            : Int(session.elapsedSeconds.rounded())
        // A mano no hay instante de inicio real: se deduce de la duración para que started_at y
        // ended_at casen. En vivo, el inicio real.
        let startedAt: Date = manualEntry
            ? endedAt.addingTimeInterval(-Double(totalDuration ?? 0))
            : session.startedAt
        let segments = buildSegments(iso: iso)   // vacío a mano (no hay laps)
        return ExecutionCore(
            totalDuration: totalDuration,
            startedAtISO: iso.string(from: startedAt),
            endedAtISO: iso.string(from: endedAt),
            // Solo las dimensiones de puntuación de este formato.
            scoreTime: puntuaPorTiempo ? scoreTimeSeconds : nil,
            scoreRounds: puntuaPorRondas ? scoreRounds : nil,
            scoreReps: puntuaPorRondas ? scoreReps : nil,
            // Final honesto: 'full' (→ completed) solo si el protocolo llegó al final; 'partial'
            // (→ partial) si se terminó antes.
            completeness: session.completeness.rawValue,
            segments: segments.isEmpty ? nil : segments,
            notes: notes.isEmpty ? nil : notes,
            liveSource: manualEntry ? "manual" : nil
        )
    }

    func buildPayload() -> WorkoutExecutionPayload? {
        guard let assignmentId = efectivaAssignmentId, !assignmentId.isEmpty else { return nil }
        let c = executionCore()
        return WorkoutExecutionPayload(
            assignment_id: assignmentId,
            perceived_exertion: rpe,
            total_duration_seconds: c.totalDuration,
            notes: c.notes,
            // 'manual' para lo apuntado después; nil en vivo (el servidor pone 'healthkit', como siempre).
            source: c.liveSource,
            score_time_s: c.scoreTime,
            score_rounds: c.scoreRounds,
            score_reps: c.scoreReps,
            completeness: c.completeness,
            started_at: c.startedAtISO,
            ended_at: c.endedAtISO,
            segments: c.segments,
            // #64 — la traza GPS de la carrera al aire libre, a workout_routes.
            route_polyline: session.capturedRoutePolyline,
            // #58 — el «cómo ha ido», opcional, en el MISMO POST.
            perceived_difficulty: difficulty?.rawValue,
            pain_area: feedbackPainAreaWire,
            pain_note: feedbackPainNoteWire
        )
    }

    // La molestia solo viaja si el atleta abrió «Molestia física» (plegada = no la dijo). La nota se
    // recorta y se limita al tope del servidor; vacía, se omite.
    private var feedbackPainAreaWire: String? {
        painExpanded ? painArea?.rawValue : nil
    }
    private var feedbackPainNoteWire: String? {
        guard painExpanded else { return nil }
        let trimmed = painNote.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : String(trimmed.prefix(PainArea.maxNoteLength))
    }

    /// Entreno libre: las MISMAS métricas + los portadores del libre. El camino medido lleva una
    /// `prescription` arriba; fuerza y funcional llevan `items` (ejercicios / movimientos) sin
    /// prescripción: siempre UNO de los dos, como `FreeWorkoutContext`. Cada tramo lleva su
    /// `item_index` para que el servidor lo enlace con el ejercicio que crea (docs/pr/un-solo-entreno.md).
    func buildFreePayload(_ free: FreeWorkoutContext) -> FreeWorkoutPayload {
        let c = executionCore()
        // Declarados en el montador o después, aquí: un solo campo, el que llegó.
        let items = declaredItems ?? free.items
        return FreeWorkoutPayload(
            title: free.title,
            modality: free.modalityWire,
            // EXACTAMENTE uno de los dos: con movimientos la dosis vive en cada ítem, y la
            // prescripción del bloque sería una segunda descripción del mismo trabajo. Declarar
            // después SUSTITUYE la forma del reloj en vez de sumarse a ella.
            prescription: items == nil ? free.prescription : nil,
            items: items,
            perceived_exertion: rpe,
            total_duration_seconds: c.totalDuration,
            notes: c.notes,
            // La MISMA procedencia que el camino del coach: nil en vivo (el servidor la deduce de
            // los tramos), «manual» solo para lo apuntado a mano.
            source: c.liveSource,
            score_time_s: c.scoreTime,
            score_rounds: c.scoreRounds,
            score_reps: c.scoreReps,
            completeness: c.completeness,
            started_at: c.startedAtISO,
            ended_at: c.endedAtISO,
            segments: c.segments,
            route_polyline: session.capturedRoutePolyline,
            perceived_difficulty: difficulty?.rawValue,
            pain_area: feedbackPainAreaWire,
            pain_note: feedbackPainNoteWire
        )
    }

    // MARK: - La marca

    /// #Marcas — solo tras el 2xx, por el camino que sea. Un final COMPLETO escribe la marca; un
    /// intento abandonado nunca escribe medio número.
    func postBenchmarkMark(completeness: String?, segments: [SegmentExecutionDTO]?, bearer: String?) {
        guard let free = freeContext, let tag = free.benchmark, completeness == "full",
              let value = benchmarkValue(tag: tag, segments: segments) else { return }
        let runContext: String? = free.modalityWire == "run"
            ? (session.runEnvironment == .treadmill ? "treadmill" : "outdoor")
            : nil
        Task { await MarkAttemptAPI.submit(slug: tag.slug, value: value, runContext: runContext, bearer: bearer) }
    }

    /// El valor medido de un intento, sacado de los MISMOS tramos que acaba de enviar el guardado,
    /// para que la marca y lo que ve el coach no puedan discrepar. Un plan de marca es un solo
    /// bloque de trabajo, así que el tramo de trabajo es el más largo; una contrarreloj vale su
    /// duración y un Cooper su distancia.
    private func benchmarkValue(tag: BenchmarkTag, segments: [SegmentExecutionDTO]?) -> Double? {
        guard let segments, let work = segments.max(by: { $0.duration_seconds < $1.duration_seconds })
        else { return nil }
        switch tag.valueKind {
        case .time:
            return work.duration_seconds > 0 ? Double(work.duration_seconds) : nil
        case .distance:
            guard let d = work.distance_meters, d > 0 else { return nil }
            return d
        }
    }

    // MARK: - Los tramos

    /// Cada lap al DTO del cable. La traducción vive UNA sola vez en `SegmentPayloadBuilder`
    /// (compilado también en el reloj): tenerla duplicada dejó al reloj meses sin re-secuenciar
    /// `position`, sin rondas de EMOM, sin pendiente y sin el detalle del ergo. Lo único propio del
    /// teléfono es lo que el atleta declara a mano en esta pantalla.
    private func buildSegments(iso: ISO8601DateFormatter) -> [SegmentExecutionDTO] {
        SegmentPayloadBuilder.build(
            laps: session.laps,
            overlay: ManualSegmentOverlay(
                avgHR: manualAvgHR,
                maxHR: manualMaxHR,
                paceSecondsBySegment: manualSegmentPaceSeconds,
                rxPorSegmento: DeclaracionesRx.porSegmento(bloquesRx, rxDeclarado)
            ),
            iso: iso,
            // Un libre guardado como plan al empezar: cada tramo se enlaza con el segmento de su
            // ejercicio, por el orden que devolvió el servidor.
            planSegmentIds: session.freePlanSegmentIds
        )
    }
}
