import Foundation

// UN ENTRENO LIBRE ES UNA ASIGNACIÓN — también antes de que el servidor la tenga.
//
// El servidor guarda un libre como una asignación del atleta (plantilla propia +
// sus `template_segments` + la asignación, `create-free-workout.ts`) y lo devuelve
// por el MISMO detalle que una sesión del coach. Aquí se construye ESE detalle en el
// móvil, a partir de lo que el atleta montó, para que el vivo del libre salga de
// `WorkoutPlan.from(detail:)` igual que el del coach — un objeto, un camino
// (docs/DECISIONS.md 2026-09-28).
//
// Por qué no basta con pedirle el detalle al servidor: sin conexión no hay
// servidor, y el libre se corre igual y se guarda al final (`POST /free`). Con
// conexión el plan se guarda ANTES (`POST /free/plan`) y este mismo detalle se
// enlaza con los ids que el servidor devuelve (`FreePlanBinding`).
//
// LA ÚNICA FUENTE del parecido con el servidor es esta: bloque de calentamiento si
// hay ejercicios «warmup» (título «Calentamiento»), bloque principal titulado como
// el entreno, formato del bloque = el esquema del entreno, cada ejercicio con su
// prescripción, la modalidad del ejercicio sobreescribiendo la de la prescripción
// (migración 0053), la categoría de pantalla desde la modalidad y los escalares
// derivados de la prescripción (`WorkoutItemParams(derivedFrom:)`).

/// Un ejercicio del plan libre: el del catálogo, su prescripción y su parte.
struct FreePlanItem: Equatable {
    let exercise: FreeExercise
    let prescription: Prescription
    /// "warmup" | nil (= principal).
    var part: String? = nil

    /// Lo que viaja en `items[]`.
    var payload: FreeWorkoutItemPayload {
        FreeWorkoutItemPayload(exercise_id: exercise.id, prescription: prescription, part: part)
    }
}

enum FreePlanDetail {

    /// El ejercicio canónico de una modalidad medida (el servidor lo resuelve por
    /// slug, `FREE_WORKOUT_MODALITY_SLUGS`). El id lo pone el servidor: aquí no hay.
    static func ejercicioMedido(_ m: FreeModality) -> FreeExercise {
        let slug: String
        switch m {
        case .row:  slug = "row"
        case .ski:  slug = "ski-erg"
        case .bike: slug = "bike-erg"
        case .run:  slug = "run"
        }
        return FreeExercise(id: 0, name: m.labelES, slug: slug, category: "cardio", modality: m.wire)
    }

    /// El detalle de asignación de este plan libre, como lo devolverá el servidor.
    ///
    /// - `items`: en ORDEN DE EJECUCIÓN (calentamiento primero), el mismo orden en
    ///   que viajan en `items[]` y en que el servidor crea los segmentos.
    /// - `clock`: la forma de un cronómetro sin movimientos (cero segmentos; la
    ///   prescripción va en la plantilla).
    /// - `segmentIds`: los ids que devolvió `POST /free/plan`, en su orden. Nil = aún
    ///   no hay (sin conexión, o todavía guardando).
    static func detail(
        title: String,
        modality: String,
        scheme: PrescriptionScheme,
        items: [FreePlanItem],
        clock: Prescription? = nil,
        focus: String,
        mainBlockTitle: String? = nil,
        segmentIds: [Int]? = nil,
        assignmentId: String? = nil
    ) -> AssignmentDetail {
        let conCalentamiento = items.contains { $0.part == "warmup" }
        let principal = mainBlockTitle ?? title
        var bloques: [WorkoutBlock] = []
        var enCurso: [WorkoutItem] = []
        var parteEnCurso: String?? = .none

        func cerrarBloque() {
            guard case let .some(parte) = parteEnCurso, !enCurso.isEmpty else { return }
            let esCalentamiento = parte == "warmup"
            bloques.append(WorkoutBlock(
                uid: "libre-b\(bloques.count)",
                title: esCalentamiento ? "Calentamiento" : principal,
                format: scheme.rawValue,
                blockPosition: conCalentamiento ? (esCalentamiento ? 0 : 1) : 0,
                coachNote: nil,
                configJson: nil,
                items: enCurso
            ))
            enCurso = []
        }

        for (i, item) in items.enumerated() {
            if case let .some(parte) = parteEnCurso, parte != item.part { cerrarBloque() }
            parteEnCurso = .some(item.part)
            enCurso.append(workoutItem(item, index: i,
                                       templateSegmentId: segmentIds.flatMap { $0.indices.contains(i) ? $0[i] : nil }))
        }
        cerrarBloque()

        let workout = WorkoutDetail(
            name: title,
            focus: focus,
            coachNote: nil,
            estimatedDurationMinutes: nil,
            blocks: bloques,
            storeResults: nil,
            modality: modality
        )
        return AssignmentDetail(
            assignment: AssignmentInfo(
                id: assignmentId ?? "", athleteId: "", scheduledFor: RaceDate.todayISO(),
                status: "scheduled", slot: nil, templateId: nil, templateVersion: nil,
                completedAt: nil, perceivedExertion: nil, stationAssignment: nil,
                myRole: nil, storeResults: nil
            ),
            workout: workout,
            execution: nil,
            runCompliance: nil,
            clockPrescription: items.isEmpty ? clock : nil,
            clockFormat: items.isEmpty && clock != nil ? scheme.rawValue : nil
        )
    }

    /// El plan que se CORRE: `WorkoutPlan.from(detail:)`, el del coach, con la
    /// duración estimada del constructor (el detalle solo la sabe en minutos).
    ///
    /// `leading`: un paso que el plan guardado no tiene —el calentamiento de fuerza
    /// incluido pero vacío, que es solo la fase con su reloj— va delante, en su
    /// propio bloque y sin ejercicio del plan (no viaja como `item_index`).
    static func plan(from detail: AssignmentDetail, estimatedSeconds: Int,
                     leading: WorkoutSegment? = nil) -> WorkoutPlan? {
        guard let base = WorkoutPlan.from(detail: detail) else { return nil }
        return WorkoutPlan(
            id: base.id,
            name: base.name,
            format: base.format,
            estimatedDurationSeconds: estimatedSeconds,
            blockContext: base.blockContext,
            zoneTargets: base.zoneTargets,
            equipment: base.equipment,
            segments: (leading.map { [$0] } ?? []) + base.segments,
            coachNote: base.coachNote,
            demoVideoUrl: base.demoVideoUrl,
            warmupChecklist: base.warmupChecklist
        )
    }

    /// Un ejercicio del plan tal y como el detalle lo manda (`buildItem`,
    /// assignment-detail.ts): la modalidad del EJERCICIO manda sobre la de la
    /// prescripción, la categoría de pantalla sale de esa modalidad y los escalares
    /// de la prescripción.
    private static func workoutItem(_ item: FreePlanItem, index: Int, templateSegmentId: Int?) -> WorkoutItem {
        let delEjercicio = item.exercise.modality.flatMap(PrescriptionModality.init(rawValue:))
        let rx = conModalidad(item.prescription, delEjercicio ?? item.prescription.modality)
        let categoria = rx.modality?.categoriaDelDetalle ?? item.exercise.category
        return WorkoutItem(
            uid: templateSegmentId.map { "segment-\($0)" } ?? "libre-\(index)",
            templateSegmentId: templateSegmentId,
            exerciseId: String(item.exercise.id),
            exerciseName: item.exercise.name,
            exerciseSlug: item.exercise.slug,
            exerciseCategory: categoria,
            exerciseVideoUrl: nil,
            cues: nil,
            exerciseDescription: nil,
            paramsJson: WorkoutItemParams(derivedFrom: rx),
            prescription: rx,
            resolvedIntensity: nil,
            resolvedLoad: nil,
            notes: nil
        )
    }

    private static func conModalidad(_ p: Prescription, _ m: PrescriptionModality?) -> Prescription {
        guard p.modality != m else { return p }
        var out = Prescription(scheme: p.scheme, modality: m, sets: p.sets, rounds: p.rounds,
                               workS: p.workS, restS: p.restS, totalS: p.totalS, target: p.target,
                               note: p.note, start: p.start, increment: p.increment)
        out.structure = p.structure
        out.restBetweenRoundsS = p.restBetweenRoundsS
        return out
    }
}

// MARK: - El plan guardado ANTES de correr

/// Lo que devuelve `POST /api/athlete/workouts/free/plan`: la asignación creada y
/// los segmentos del plan EN SU ORDEN (`order by position, id`). Contrato del
/// guardado (docs/pr/un-solo-entreno.md): un tramo se enlaza por su ÍNDICE en ese
/// orden, nunca por el valor de `position` — que el servidor ha pasado a contar
/// desde 0. Tolerante: un servidor que aún no manda los segmentos deja la lista
/// vacía, y entonces los tramos viajan sin id (el servidor cae a su contexto de
/// sesión) — el entreno se guarda igual.
struct FreePlanBinding: Decodable, Equatable {
    let assignmentId: String
    let segmentIds: [Int]

    private enum CodingKeys: String, CodingKey { case assignmentId, segments, segmentIds }
    private struct Segmento: Decodable {
        let id: Int
        private enum CodingKeys: String, CodingKey { case id }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            if let n = try? c.decode(Int.self, forKey: .id) { id = n }
            else if let s = try? c.decode(String.self, forKey: .id), let n = Int(s) { id = n }
            else { throw DecodingError.dataCorruptedError(forKey: .id, in: c, debugDescription: "id") }
        }
    }

    init(assignmentId: String, segmentIds: [Int]) {
        self.assignmentId = assignmentId
        self.segmentIds = segmentIds
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let s = try? c.decode(String.self, forKey: .assignmentId) { assignmentId = s }
        else { assignmentId = String(try c.decode(Int.self, forKey: .assignmentId)) }
        if let segs = try? c.decode([Segmento].self, forKey: .segments) {
            segmentIds = segs.map(\.id)
        } else if let ids = try? c.decode([Int].self, forKey: .segmentIds) {
            segmentIds = ids
        } else {
            segmentIds = []
        }
    }
}
