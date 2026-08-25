import Foundation

// Payload returned by GET /api/athlete/assignments/{id}/detail.
//
// Snake_case JSON → camelCase Swift via APIClient's `convertFromSnakeCase`
// strategy, so model property names use camelCase even though TypeScript /
// Postgres mirrors snake_case (e.g. `params_json` → `paramsJson`).
//
// `workout` is optional: rest days return `null` and the UI must render a
// dedicated rest state instead of an empty workout shell.

struct AssignmentDetail: Codable, Equatable {
    let assignment: AssignmentInfo
    let workout: WorkoutDetail?

    // #34 — the calibration test's result contract, resilient to WHERE the backend
    // attaches `store_results`: the landed athlete-detail ships it on `assignment`
    // (an assignment-level property, present even on the executed view), while the
    // agreed contract also allows it on `workout`. Read BOTH and prefer a non-empty
    // source so a backend move between the two never silently breaks capture. Empty
    // ⇒ this is a normal (non-test) session. Consumers use THIS, never the raw
    // per-object fields.
    var storeResults: [StoreResultSpec] {
        if let a = assignment.storeResults, !a.isEmpty { return a }
        if let w = workout?.storeResults, !w.isEmpty { return w }
        return []
    }

    /// Un test de salto no es un entreno: no hay bloques que correr.
    var isJumpVideo: Bool {
        storeResults.contains { $0.measure == "height" }
    }
    // The athlete's REAL executed result — present once the session is done
    // (completed / partial). Powers the read-only post-workout detail the athlete
    // reaches by tapping a finished session (tiempo / score / RPE / per-segment
    // splits). Nil while the session is still pending. Optional → older cached
    // payloads (no `execution` key) decode fine.
    let execution: ExecutionSummary?

    /// EL VEREDICTO DE CARRERA, SERVIDO. Hermano de `execution`, nunca dentro de
    /// él: lo juzga el servidor con el MISMO motor que juzga la sesión en el panel
    /// del coach, para que atleta y entrenador no lean veredictos distintos de la
    /// misma serie. Nil en respuestas anteriores a esta tanda (y en las cacheadas
    /// entonces), que es la única razón por la que es opcional — el servidor lo
    /// manda siempre, aunque venga vacío.
    let runCompliance: RunCompliance?
}

// What the athlete ACTUALLY did, for the read-only executed view. Mirrors the
// backend `AssignmentDetailExecution` (lib/athlete/assignment-detail.ts).
// Snake_case wire keys convert to these via APIClient's `.convertFromSnakeCase`.
struct ExecutionSummary: Codable, Equatable {
    let executionId: String?
    let totalDurationSeconds: Int?
    let perceivedExertion: Int?
    /// Pre-formatted metcon/HYROX headline result ("42:15", "5 rondas + 8 reps").
    /// Nil for non-scored formats or when no score was recorded.
    let scoreLabel: String?
    let notes: String?
    let endedAt: String?
    /// Which DEVICE the headline numbers came from — "concept2" | "healthkit" |
    /// "garmin" | "treadmill" | "gps" | … (biometric_source). It does NOT say
    /// whether the athlete ran the session in the app: that's `recordedVia`.
    let source: String?

    /// HOW the record came to exist: "live" (run in the app, the engine timed
    /// it), "manual" (typed in afterwards) or "imported" (ingested from another
    /// service). Nil on rows written before the split (mig 0144) — the UI then
    /// says nothing rather than guessing.
    ///
    /// This exists because `source` alone was answering two questions at once,
    /// and a live session with a PM5 attached was being filed — and shown — as
    /// "A mano", which is the opposite of what happened.
    let recordedVia: String?

    /// EVERY device that fed numbers into this session ("concept2", "treadmill",
    /// "healthkit"…). Empty = no device took part (a session logged by hand or
    /// timed with nothing attached), which is real information, not a gap.
    let contributingSources: [String]

    /// #58 — the athlete's own read on the session, stored since #58 and until
    /// now never served back: how hard it felt against what was prescribed, and
    /// any niggle they flagged for the coach.
    let perceivedDifficulty: String?
    let painArea: String?
    let painNote: String?
    /// "completed" (ran to the end → ✓) | "partial" (terminated early → ½).
    let completeness: String
    /// Per-exercise actuals, matched to a prescribed item via `itemUid`. Lossy so
    /// one odd segment never collapses the whole detail. Empty when only the
    /// aggregate was logged — the view then shows time/score alone (no fabrication).
    let segments: [SegmentActualDTO]
    /// The outdoor run's GPS trace (#64) as an encoded polyline, or nil when the
    /// session was not outdoors — drives the executed-detail mini-map.
    let routePolyline: String?

    /// Cuándo arrancó la ejecución (ISO). Es el ANCLA de la traza: los `offsets_s`
    /// de la curva se cuentan desde aquí.
    let startedAt: String?

    /// Subida y bajada acumuladas, SEPARADAS y nunca netas — subir 300 y bajar 300
    /// no es un llano, y el neto lo borraría. Nulas cuando no hubo altímetro (una
    /// cinta sin inclinación no tiene desnivel que falte: no lo tiene, y punto).
    let elevationGainM: Double?
    let elevationLossM: Double?

    /// Cuánto bajó el pulso en el minuto siguiente a parar, en ppm.
    let hrRecovery60Bpm: Double?
    /// Cuánto se separaron ritmo y pulso entre las dos mitades, en %. Medida del
    /// servidor: aquí no se recalcula ni se convierte a otra unidad.
    let decouplingPct: Double?

    /// EL ARCHIVO: la curva, los kilómetros y el recorrido. `available: false` es
    /// la respuesta honesta de una sesión anterior al archivo, no un fallo.
    let trace: ExecutionTrace?

    /// LOS TOTALES DE LA SESIÓN ENTERA — calculados por el servidor AL GUARDAR
    /// (card 124, `web/lib/athlete/assignment-detail.ts`), un solo sitio para
    /// toda la app. NUNCA se derivan aquí ni en quien los lee: dos motores para
    /// la misma media es cómo el coach y el atleta acaban leyendo dos números
    /// distintos de la misma sesión.
    ///
    /// NIL ES UN VALOR REAL, con DOS razones distintas según el campo — nunca
    /// "todavía no implementado":
    ///   · `avgHr`/`maxHr` (ppm): nil = no se registró pulso en la sesión.
    ///   · `totalCalories` (kcal): nil = ningún tramo reportó calorías.
    ///   · `totalDistanceM` (metros): nil tanto si no se midió distancia como
    ///     si se midió en DOS O MÁS modalidades a la vez — el servidor no filtra
    ///     por máquina, así que un total aquí mezclaría correr con remo (la
    ///     regla que la card 124 prohíbe). Por eso la Distancia de esta pantalla
    ///     NUNCA lee este campo: sigue saliendo de `distanciaTotalDeSesion`
    ///     sobre los bloques (`LecturaDeSesionModelo.swift`), que sí sabe negarse
    ///     cuando hay más de una cubeta. Quien necesite «solo lo que corrió»
    ///     mira los segmentos uno a uno.
    /// En los tres casos: ausencia honesta, quien la lea simplemente no pinta
    /// el recuadro (§7 CONTRATO-UI), nunca un cero de relleno.
    let avgHr: Double?
    let maxHr: Double?
    let totalDistanceM: Double?
    let totalCalories: Double?

    /// Lo HECHO, proyectado en el servidor (card 144). Nil en cache vieja:
    /// entonces la lectura cae a los segmentos. Vacío = no hay sustancia.
    let recap: RecapDTO?

    var isPartial: Bool { completeness == "partial" }

    enum CodingKeys: String, CodingKey {
        case executionId, totalDurationSeconds, perceivedExertion, scoreLabel
        case notes, endedAt, source, completeness, segments, routePolyline
        case recordedVia, contributingSources
        case perceivedDifficulty, painArea, painNote
        case startedAt, elevationGainM, elevationLossM
        case hrRecovery60Bpm, decouplingPct, trace
        case avgHr, maxHr, totalDistanceM, totalCalories
        case recap
    }

    // Tolerant decode (mirrors AthleteWeekDaySession): EVERY field is optional or
    // defaulted, so a done session's detail ALWAYS loads — even from a leaner /
    // older `execution` payload that omits `completeness` or `segments`. Decoding
    // these two as REQUIRED keys (the synthesized default) would throw
    // `keyNotFound` and collapse the whole AssignmentDetail into the "No pudimos
    // cargar" failure. They're genuinely optional in meaning (a finished session
    // is 'completed' unless explicitly 'partial'; no per-segment log → no
    // segments), so absence must degrade gracefully, never hard-fail.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        executionId = try c.decodeIfPresent(String.self, forKey: .executionId)
        totalDurationSeconds = try c.decodeIfPresent(Int.self, forKey: .totalDurationSeconds)
        perceivedExertion = try c.decodeIfPresent(Int.self, forKey: .perceivedExertion)
        scoreLabel = try c.decodeIfPresent(String.self, forKey: .scoreLabel)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        endedAt = try c.decodeIfPresent(String.self, forKey: .endedAt)
        source = try c.decodeIfPresent(String.self, forKey: .source)
        completeness = try c.decodeIfPresent(String.self, forKey: .completeness) ?? "completed"
        // Element-wise lossy (LossyArray) AND key-optional: a missing key → [],
        // one undecodable segment → dropped, never fatal.
        segments = (try c.decodeIfPresent(LossyArray<SegmentActualDTO>.self, forKey: .segments))?.wrappedValue ?? []
        routePolyline = try c.decodeIfPresent(String.self, forKey: .routePolyline)
        // Provenance split (mig 0144) + the #58 feedback the server now serves
        // back. All key-optional for the same reason as the fields above: an
        // older cached snapshot must still open the session, not hard-fail.
        recordedVia = try c.decodeIfPresent(String.self, forKey: .recordedVia)
        contributingSources = try c.decodeIfPresent([String].self, forKey: .contributingSources) ?? []
        perceivedDifficulty = try c.decodeIfPresent(String.self, forKey: .perceivedDifficulty)
        painArea = try c.decodeIfPresent(String.self, forKey: .painArea)
        painNote = try c.decodeIfPresent(String.self, forKey: .painNote)
        // El archivo y lo que se deriva de él. Todo key-optional por lo mismo: un
        // detalle cacheado antes de esta tanda tiene que seguir abriendo la sesión.
        startedAt = try c.decodeIfPresent(String.self, forKey: .startedAt)
        elevationGainM = try c.decodeIfPresent(Double.self, forKey: .elevationGainM)
        elevationLossM = try c.decodeIfPresent(Double.self, forKey: .elevationLossM)
        hrRecovery60Bpm = try c.decodeIfPresent(Double.self, forKey: .hrRecovery60Bpm)
        decouplingPct = try c.decodeIfPresent(Double.self, forKey: .decouplingPct)
        trace = try c.decodeIfPresent(ExecutionTrace.self, forKey: .trace)
        // Los totales de sesión (card 124) — key-optional: la mayoría de
        // ejecuciones guardadas hoy todavía no los tienen calculados.
        avgHr = try c.decodeIfPresent(Double.self, forKey: .avgHr)
        maxHr = try c.decodeIfPresent(Double.self, forKey: .maxHr)
        totalDistanceM = try c.decodeIfPresent(Double.self, forKey: .totalDistanceM)
        totalCalories = try c.decodeIfPresent(Double.self, forKey: .totalCalories)
        recap = try c.decodeIfPresent(RecapDTO.self, forKey: .recap)
    }
}

/// Recap proyectado en servidor. Solo ejecución — nunca la prescripción.
struct RecapDTO: Codable, Equatable {
    let blocks: [RecapBlockDTO]

    init(blocks: [RecapBlockDTO]) {
        self.blocks = blocks
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        blocks = try c.decodeIfPresent([RecapBlockDTO].self, forKey: .blocks) ?? []
    }

    enum CodingKeys: String, CodingKey { case blocks }
}

struct RecapBlockDTO: Codable, Equatable {
    let position: Int
    let label: String
    let kind: String
    let modality: String?
    let durationS: Int?
    let distanceM: Double?
    let paceSPerKm: Double?
    let paceSPer500m: Double?
    let reps: Int?
    let loadKg: Double?
    let sets: [RecapSetDTO]
    let round: Int?

    init(
        position: Int,
        label: String,
        kind: String,
        modality: String? = nil,
        durationS: Int? = nil,
        distanceM: Double? = nil,
        paceSPerKm: Double? = nil,
        paceSPer500m: Double? = nil,
        reps: Int? = nil,
        loadKg: Double? = nil,
        sets: [RecapSetDTO] = [],
        round: Int? = nil
    ) {
        self.position = position
        self.label = label
        self.kind = kind
        self.modality = modality
        self.durationS = durationS
        self.distanceM = distanceM
        self.paceSPerKm = paceSPerKm
        self.paceSPer500m = paceSPer500m
        self.reps = reps
        self.loadKg = loadKg
        self.sets = sets
        self.round = round
    }

    enum CodingKeys: String, CodingKey {
        case position, label, kind, modality, durationS, distanceM, paceSPerKm
        case paceSPer500m = "paceSPer500M"
        case reps, loadKg, sets, round
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        position = try c.decodeIfPresent(Int.self, forKey: .position) ?? 0
        label = try c.decodeIfPresent(String.self, forKey: .label) ?? ""
        kind = try c.decodeIfPresent(String.self, forKey: .kind) ?? "station"
        modality = try c.decodeIfPresent(String.self, forKey: .modality)
        durationS = try c.decodeIfPresent(Int.self, forKey: .durationS)
        distanceM = try c.decodeIfPresent(Double.self, forKey: .distanceM)
        paceSPerKm = try c.decodeIfPresent(Double.self, forKey: .paceSPerKm)
        paceSPer500m = try c.decodeIfPresent(Double.self, forKey: .paceSPer500m)
        reps = try c.decodeIfPresent(Int.self, forKey: .reps)
        loadKg = try c.decodeIfPresent(Double.self, forKey: .loadKg)
        sets = try c.decodeIfPresent([RecapSetDTO].self, forKey: .sets) ?? []
        round = try c.decodeIfPresent(Int.self, forKey: .round)
    }
}

struct RecapSetDTO: Codable, Equatable {
    let setIndex: Int
    let reps: Int?
    let loadKg: Double?
    let isApproach: Bool

    init(setIndex: Int, reps: Int?, loadKg: Double?, isApproach: Bool) {
        self.setIndex = setIndex
        self.reps = reps
        self.loadKg = loadKg
        self.isApproach = isApproach
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        setIndex = try c.decodeIfPresent(Int.self, forKey: .setIndex) ?? 0
        reps = try c.decodeIfPresent(Int.self, forKey: .reps)
        loadKg = try c.decodeIfPresent(Double.self, forKey: .loadKg)
        isApproach = try c.decodeIfPresent(Bool.self, forKey: .isApproach) ?? false
    }
}

// One logged segment (segment_executions), mapped to its prescribed item. Mirrors
// the backend `SegmentActual` (lib/dashboard/coach/session-actuals.ts). Property
// names match the `.convertFromSnakeCase` output of the wire keys.
struct SegmentActualDTO: Codable, Equatable, Identifiable {
    var id: Int { position }
    let position: Int
    /// uid of the prescribed item this maps to ("segment-{id}"); nil when unmatched.
    let itemUid: String?
    let modality: String
    let durationSeconds: Int?
    let repsCompleted: Int?
    let weightUsedKg: Double?
    let distanceMeters: Double?
    let avgPaceSPer500m: Double?
    let avgPaceSPerKm: Double?
    let avgPowerW: Double?
    let strokeRateSpm: Double?
    let avgHr: Int?
    let maxHr: Int?
    let calories: Double?
    /// AVERAGE running incline (%) / cadence (steps/min) over the segment (#62, mig
    /// 0124). Optional so older cached snapshots still decode; nil when the source
    /// reported none (the detail then shows no incline/cadence chip — never a 0).
    let inclinePct: Double?
    let runCadenceSpm: Int?

    /// TRES PENDIENTES QUE SE PARECEN Y NO SON LO MISMO — elegir mal es fácil y no
    /// da error. `inclinePct` (arriba) es **lo que DECLARÓ la cinta**; esta es **lo
    /// MEDIDO**: el cambio NETO de altitud sobre la distancia del tramo, jamás
    /// desnivel acumulado (que sumaría subidas y bajadas y daría pendiente en un
    /// llano), con la cinta mandando cuando la hay porque es medida directa. La
    /// tercera —**lo que PIDIÓ el coach**— vive en
    /// `RunComplianceTramo.prescribedInclinePct`, que es la que decide antes.
    /// Nula = no se sabe, que **no es cero**: cero es «llano medido».
    let avgGradientPct: Double?

    /// Cuándo empezó ESTE tramo (ISO). Es lo que lo sitúa sobre la curva —
    /// repartirlos por igual del ancho los pondría donde no fueron.
    let startedAt: String?
    /// A qué tramo PRESCRITO corresponde, como índice (base 0) de la lista plana
    /// de piernas del ítem (`Prescription.runStructureLegs`). Es lo que permite
    /// saber cómo se pidió recuperar este tramo concreto sin adivinarlo.
    let legIndex: Int?
    /// "work" | "recovery" — qué papel jugó el tramo dentro de la serie. Nulo en
    /// ejecuciones anteriores a la mig 0146, que no lo grababan.
    let legRole: String?
    /// "warmup" | "main" | "cooldown".
    let legPhase: String?

    /// WHICH device produced THIS leg's numbers ("pm5" | "treadmill" | "gps" |
    /// "healthkit" | "manual" | a vendor). The live engine picks one per lap
    /// (WorkoutSession's pm5 > treadmill > gps > manual > healthkit precedence),
    /// so a session that mixed rowing and running can say so leg by leg instead
    /// of collapsing to one label for the whole workout. Nil on older payloads.
    let source: String?

    /// EMOM rounds actually completed vs prescribed (#break-1). The athlete who
    /// got through 10 of 20 needs to SEE that; without it the log shows a
    /// duration and hides the only number that says how it went.
    let emomRoundsCompleted: Int?
    let emomRoundsPrescribed: Int?
    /// 0/nil = sin ronda. 1+ = esa ronda (mig 0155). Ausente en cache vieja.
    let roundIndex: Int? = nil
    /// Series de `set_executions`. Vacío si el payload no las trae.
    let sets: [SetActualDTO] = []

    /// Seconds spent in each HR zone over this leg, keyed "z1"…"z5" (from the
    /// segment's raw_lap_data_json). Nil when no strap fed the session — the
    /// zone bar then isn't drawn at all rather than showing an empty axis.
    let zoneSeconds: [String: Int]?

    // Erg detail (#33), served back from the segment's raw_lap_data_json. Optional
    // so older payloads (and non-erg segments) decode cleanly; nil → no erg card.
    let dragFactor: Int?
    let avgCaloriesPerHour: Double?
    let peakDriveForceLbs: Double?
    let avgDriveForceLbs: Double?
    let ergSplits: [ErgSplitActual]?

    // `.convertFromSnakeCase` capitalizes the digit→letter boundary, so the wire
    // key `avg_pace_s_per_500m` converts to `avgPaceSPer500M` (capital M) — which
    // did NOT match the `avgPaceSPer500m` property, silently dropping the erg's
    // /500m split (the headline pace for row/ski). Pin the converted key
    // explicitly so it decodes; every other key converts cleanly to its property
    // name. Encode is symmetric (the cache round-trips back to the same key).
    enum CodingKeys: String, CodingKey {
        case position, itemUid, modality, durationSeconds, repsCompleted
        case weightUsedKg, distanceMeters
        case avgPaceSPer500m = "avgPaceSPer500M"
        case avgPaceSPerKm, avgPowerW, strokeRateSpm, avgHr, maxHr, calories
        case inclinePct, runCadenceSpm, avgGradientPct
        case startedAt, legIndex, legRole, legPhase
        case source, emomRoundsCompleted, emomRoundsPrescribed, zoneSeconds
        case dragFactor, avgCaloriesPerHour, peakDriveForceLbs, avgDriveForceLbs, ergSplits
        case roundIndex, sets
    }
}

extension SegmentActualDTO {
    // Cache anterior a la 144 no trae `sets` ni `round_index`. Un decode
    // sintético las exigiría y LossyArray tiraría el tramo entero.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        position = try c.decodeIfPresent(Int.self, forKey: .position) ?? 0
        itemUid = try c.decodeIfPresent(String.self, forKey: .itemUid)
        modality = try c.decodeIfPresent(String.self, forKey: .modality) ?? "other"
        durationSeconds = try c.decodeIfPresent(Int.self, forKey: .durationSeconds)
        repsCompleted = try c.decodeIfPresent(Int.self, forKey: .repsCompleted)
        weightUsedKg = try c.decodeIfPresent(Double.self, forKey: .weightUsedKg)
        distanceMeters = try c.decodeIfPresent(Double.self, forKey: .distanceMeters)
        avgPaceSPer500m = try c.decodeIfPresent(Double.self, forKey: .avgPaceSPer500m)
        avgPaceSPerKm = try c.decodeIfPresent(Double.self, forKey: .avgPaceSPerKm)
        avgPowerW = try c.decodeIfPresent(Double.self, forKey: .avgPowerW)
        strokeRateSpm = try c.decodeIfPresent(Double.self, forKey: .strokeRateSpm)
        avgHr = try c.decodeIfPresent(Int.self, forKey: .avgHr)
        maxHr = try c.decodeIfPresent(Int.self, forKey: .maxHr)
        calories = try c.decodeIfPresent(Double.self, forKey: .calories)
        inclinePct = try c.decodeIfPresent(Double.self, forKey: .inclinePct)
        runCadenceSpm = try c.decodeIfPresent(Int.self, forKey: .runCadenceSpm)
        avgGradientPct = try c.decodeIfPresent(Double.self, forKey: .avgGradientPct)
        startedAt = try c.decodeIfPresent(String.self, forKey: .startedAt)
        legIndex = try c.decodeIfPresent(Int.self, forKey: .legIndex)
        legRole = try c.decodeIfPresent(String.self, forKey: .legRole)
        legPhase = try c.decodeIfPresent(String.self, forKey: .legPhase)
        source = try c.decodeIfPresent(String.self, forKey: .source)
        emomRoundsCompleted = try c.decodeIfPresent(Int.self, forKey: .emomRoundsCompleted)
        emomRoundsPrescribed = try c.decodeIfPresent(Int.self, forKey: .emomRoundsPrescribed)
        zoneSeconds = try c.decodeIfPresent([String: Int].self, forKey: .zoneSeconds)
        dragFactor = try c.decodeIfPresent(Int.self, forKey: .dragFactor)
        avgCaloriesPerHour = try c.decodeIfPresent(Double.self, forKey: .avgCaloriesPerHour)
        peakDriveForceLbs = try c.decodeIfPresent(Double.self, forKey: .peakDriveForceLbs)
        avgDriveForceLbs = try c.decodeIfPresent(Double.self, forKey: .avgDriveForceLbs)
        ergSplits = try c.decodeIfPresent([ErgSplitActual].self, forKey: .ergSplits)
        roundIndex = try c.decodeIfPresent(Int.self, forKey: .roundIndex)
        sets = try c.decodeIfPresent([SetActualDTO].self, forKey: .sets) ?? []
    }
}

struct SetActualDTO: Codable, Equatable {
    let setIndex: Int
    let repsActual: Int?
    let loadActualKg: Double?
    let isApproach: Bool

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        setIndex = try c.decodeIfPresent(Int.self, forKey: .setIndex) ?? 0
        repsActual = try c.decodeIfPresent(Int.self, forKey: .repsActual)
        loadActualKg = try c.decodeIfPresent(Double.self, forKey: .loadActualKg)
        isApproach = try c.decodeIfPresent(Bool.self, forKey: .isApproach) ?? false
    }
}

// One PM5 split/interval as served back (the ErgData interval table row). Mirrors
// `ErgSplitDTO` iOS sent; every field optional (the two source frames may not both
// have landed). Same digit-boundary pin as the parent for `avg_pace_s_per_500m`.
struct ErgSplitActual: Codable, Equatable, Identifiable {
    var id: Int { index }
    let index: Int
    let timeSeconds: Double?
    let distanceMeters: Double?
    let avgPaceSPer500m: Double?
    let strokeRateSpm: Int?
    let avgPowerW: Int?
    let calories: Int?
    let caloriesPerHour: Int?
    let dragFactor: Int?
    let restTimeSeconds: Double?
    let restDistanceMeters: Double?
    let avgHr: Int?

    enum CodingKeys: String, CodingKey {
        case index, timeSeconds, distanceMeters
        case avgPaceSPer500m = "avgPaceSPer500M"
        case strokeRateSpm, avgPowerW, calories, caloriesPerHour, dragFactor
        case restTimeSeconds, restDistanceMeters, avgHr
    }
}

struct AssignmentInfo: Codable, Equatable {
    let id: String
    let athleteId: String
    let scheduledFor: String   // ISO date (YYYY-MM-DD)
    let status: String         // scheduled | completed | missed | skipped
    let slot: String?
    let templateId: String?
    let templateVersion: Int?
    let completedAt: String?
    let perceivedExertion: Int?
    // Dobles HYROX — `station_assignment` is NULL for the overwhelming majority
    // of (individual) assignments. When present it carries the per-station
    // split between the two partners (a / b / alternate).
    //
    // `myRole` ("a" | "b") is required to know which side of the split this
    // device's user is. Backend (W5) has not yet shipped it on this endpoint;
    // when nil, callers fall back to deducing the role from a lexicographic
    // comparison of (userId, partner.userId) — a temporary, deterministic
    // shim that holds until backend exposes the field explicitly.
    let stationAssignment: StationAssignment?
    let myRole: String?
    // #34 — the result(s) THIS session must capture when it's a calibration test,
    // derived server-side from the workout_assignments.calibration_test_id FK. A
    // non-empty array ⇒ on finish the athlete confirms the measured number(s),
    // which the ejecución→benchmark bridge records as ground truth. Empty/absent
    // for a normal (non-test) session; optional so older payloads decode. Lives on
    // `assignment` (not `workout`) because it's an assignment-level property —
    // available even from the read-only executed view. Wire `store_results` →
    // `storeResults` via APIClient's convertFromSnakeCase.
    let storeResults: [StoreResultSpec]?
}

struct StationAssignment: Codable, Equatable {
    let stations: [StationAssignmentEntry]
    /// #23 — partner's first name for the live relay line. Optional/tolerant
    /// (older payload → nil → "Tu compañero").
    let partnerFirstName: String?
}

struct StationAssignmentEntry: Codable, Equatable, Identifiable {
    var id: String { "\(templateSegmentId.map(String.init) ?? "?")-\(name ?? label ?? "?")" }
    /// Display name (may be nil on a tolerant/legacy payload — fall back to label).
    let name: String?
    /// "a" | "b" | "split" | "alternate" (legacy). Who carries the station.
    let assignedTo: String
    // #23 — the derived dobles reparto (backend resolves it from the coach's
    // dobles_simulation; see /api/athlete/assignments/[id]/detail). All optional
    // so an older/individual payload (no reparto) decodes to a plain full list.
    /// The template_segment this station maps to — the stable key the engine
    /// uses to annotate its segment.
    let templateSegmentId: Int?
    let stationIndex: Int?
    let label: String?
    /// The READING athlete's share of the station, 0…1 (partner = 1 − this).
    /// Backend already flips it to the reader's perspective.
    let selfShare: Double?
    /// Explicit reparto note, e.g. "alterna 250m" / "tú 60 / compañero 40".
    let note: String?

    /// Display label for the station, resilient to a nil name.
    var displayName: String { name ?? label ?? "Estación" }
}

struct WorkoutDetail: Codable, Equatable {
    let name: String
    let focus: String?
    let coachNote: String?
    let estimatedDurationMinutes: Int?
    // Lossy: a single block that fails to decode (an unknown shape the model
    // doesn't anticipate) is SKIPPED rather than throwing the whole detail — so
    // one odd block never collapses the entire session into the "sin detalle"
    // empty state. The good blocks still render. See `LossyArray`.
    @LossyArray var blocks: [WorkoutBlock]
    // #34 — a calibration test's result contract MAY arrive here (workout-level)
    // instead of on `assignment`; optional so it's absent for both non-test
    // sessions and the current backend (which ships it on `assignment`). Read via
    // `AssignmentDetail.storeResults`, which coalesces both locations. Wire
    // `store_results` → `storeResults` via convertFromSnakeCase.
    let storeResults: [StoreResultSpec]?
}

// One RESULT a calibration test promises to produce — what number iOS asks for
// and in what unit. Mirrors the athlete-detail `AssignmentDetailStoreResult`
// (web/lib/athlete/assignment-detail.ts), which ships exactly slug/label/measure/
// unit. `measure`/`unit` are plain strings (not enums) so an unrecognised future
// value NEVER hard-fails the whole AssignmentDetail decode — the capture sheet
// maps `measure` to a typed input via `TestMeasure`, defaulting unknowns to a
// plain numeric entry. `derives`/`modality` are the coach-side calibration
// intent; the detail endpoint doesn't ship them, so they're OPTIONAL here
// (present only if a future payload enriches the contract) — never required, or a
// missing key would fail the decode. Snake_case wire keys convert via the shared
// decoder.
struct StoreResultSpec: Codable, Equatable, Identifiable {
    var id: String { slug }
    /// Canonical benchmark slug this result produces (run_5k, row_2k, back_squat_1rm…).
    let slug: String
    /// What the entered value is IN: seconds | meters | reps | calories | kg.
    let unit: String
    /// How the work is measured: time | distance | reps | calories | load.
    let measure: String
    /// Athlete-facing label the coach set for this result ("5K", "Sentadilla").
    let label: String
    /// The calibration this result drives (run_zones | strength_max | none). Not
    /// shipped by the detail endpoint today → optional.
    let derives: String?
    /// Modality for a zone derivation (run/row/ski); nil for strength/baseline.
    let modality: String?
    /// Tests guiados — an OPTIONAL result never blocks the capture: if the app
    /// measured it (the HRR window) it's pre-filled and sent; with no signal
    /// it's omitted without error and the test still counts as completed.
    /// Nullable-decoded (absent on older payloads) → treat nil as required.
    let optional: Bool?

    var isOptional: Bool { optional ?? false }
}

struct WorkoutBlock: Codable, Equatable, Identifiable {
    var id: String { uid }
    let uid: String
    let title: String
    let format: String        // e.g. straight_sets, amrap, for_time, emom, intervals, free
    let blockPosition: Int
    let coachNote: String?
    // Schemaless per format; keys arrive snake_case (rounds, time_cap_seconds,
    // emom_interval_seconds, work_seconds, rest_seconds — see JSONValue note).
    let configJson: JSONValue?
    // Lossy (see `blocks`): one item that fails to decode is dropped, not fatal —
    // the rest of the block (e.g. a WOD's other movements) still renders.
    @LossyArray var items: [WorkoutItem]
}

struct WorkoutItem: Codable, Equatable, Identifiable {
    var id: String { uid }
    let uid: String
    // The prescribed template_segments.id this line maps to. Echoed back on the
    // execution upload so the coach's prescrito-vs-hecho view attributes each
    // measured segment to its prescription. (Wire `template_segment_id`.)
    let templateSegmentId: Int?
    let exerciseId: String
    let exerciseName: String
    let exerciseSlug: String
    let exerciseCategory: String   // strength | running | rowing | ski_erg | bike_erg | functional | mobility | other
    let exerciseVideoUrl: String?
    let cues: String?
    // La descripción larga del ejercicio — el apunte del coach que explica el
    // gesto. Llega ya resuelta por el merge del coach (su voz gana sobre la
    // base), igual que `cues` y el vídeo. El endpoint la sirve desde el 7-ago-2026;
    // antes se editaba y se guardaba pero no viajaba, así que la sección
    // «DESCRIPCIÓN» de `ExerciseDetailView` salía siempre vacía. Sigue siendo
    // opcional: un ejercicio sin descripción no pinta esa sección.
    let exerciseDescription: String?
    // Flat, iOS-ready scalar targets (the legacy path). Kept for back-compat and
    // for the live-execution engine.
    let paramsJson: WorkoutItemParams
    // Structured per-set prescription — the RICH form (pyramids, ranges, per-set
    // rest/RPE/tempo, ergo/run pace+zone). Decoded from `prescription_json`,
    // which `convertFromSnakeCase` rewrites to `prescriptionJson` (the CodingKey
    // below). Null/absent for legacy segments that only carry scalar params, so
    // renderers PREFER this when present and fall back to `paramsJson` otherwise.
    let prescription: Prescription?
    // ABSOLUTE pace band the BACKEND resolved from the athlete's stored zone
    // profile for this line's zone target (read, never recomputed here). Non-nil
    // ONLY when the target is a zone AND the athlete has tested that modality;
    // nil otherwise — then renderers show the zone badge alone with NO fabricated
    // pace. The wire field `resolved_intensity` converts to `resolvedIntensity`.
    let resolvedIntensity: ResolvedIntensity?
    // ABSOLUTE kg the BACKEND resolved from the athlete's current 1RM for this
    // line's %RM target (strength analog of `resolvedIntensity`; read, never
    // recomputed). Non-nil ONLY when the target is a %RM on a tracked lift AND the
    // athlete has a 1RM for it; nil otherwise — then renderers show the % alone
    // with NO fabricated kg. Wire `resolved_load` → `resolvedLoad`.
    let resolvedLoad: ResolvedLoad?
    // Card 130 — frases de un objetivo relativo («a peso de competición»).
    // El número ya viene resuelto en `prescription` / `paramsJson` (el campo
    // de siempre). iOS NO recalcula: solo pinta la frase. Ausente en payloads
    // viejos → nil, y la línea se ve igual que hoy.
    let resolvedReferences: [ResolvedReference]? = nil
    let notes: String?

    // Explicit keys are required because the wire field `prescription_json`
    // converts (via convertFromSnakeCase) to `prescriptionJson`, not
    // `prescription`. Every other key matches its converted camelCase form.
    enum CodingKeys: String, CodingKey {
        case uid
        case templateSegmentId
        case exerciseId
        case exerciseName
        case exerciseSlug
        case exerciseCategory
        case exerciseVideoUrl
        case cues
        case exerciseDescription
        case paramsJson
        case prescription = "prescriptionJson"
        case resolvedIntensity
        case resolvedLoad
        case resolvedReferences
        case notes
    }
}

// El porqué de un objetivo relativo, ya resuelto en el servidor. `phrase` es
// lo que se pinta («a peso de competición»). `target` es el número sellado,
// redundante con `prescription.target` — se lee, no se recalcula.
struct ResolvedReference: Codable, Equatable {
    let phrase: String
    let target: Target?
    let source: String?
    let estimated: Bool
}

// The athlete's zone target resolved to an absolute pace band (mirrors the
// backend `ResolvedIntensity` in lib/athlete/assignment-detail.ts). `rangeLabel`
// is READY to render with its unit ("4:00–4:14/km", "> 2:17/500m"); `zoneLabel`
// is the coach zone code (Z4, or a span like "Z3–Z4"). `needsReview` flags an
// UNCONFIRMED auto-profile (derived from onboarding benchmarks, pending the
// coach's review) — the band still resolves; the UI marks it "sin confirmar".
// Snake_case wire keys (`zone_label`, `range_label`, `fast_s`, `slow_s`,
// `pace_unit`, `needs_review`) convert to these via the shared decoder.
struct ResolvedIntensity: Codable, Equatable {
    let zoneLabel: String
    let rangeLabel: String
    let fastS: Double
    let slowS: Double?
    let paceUnit: String      // "per_km" | "per_500m"
    let needsReview: Bool

    /// The band prefixed for a pace slot, e.g. "@ 4:00–4:14/km".
    var paceChip: String { "@ \(rangeLabel)" }
}

// A %RM target resolved to the athlete's ABSOLUTE load (mirrors the backend
// `ResolvedLoad` in lib/athlete/assignment-detail.ts). `kgLabel` is READY to
// render ("64 kg", "52–64 kg"); `pctLabel` is the source percentage ("80%",
// "65–80%"). `needsReview` flags an UNCONFIRMED 1RM (a strength max pending the
// coach's review) — the kg still resolves; the UI marks it "sin confirmar".
// Snake_case wire keys (`pct_label`, `kg_label`, `min_kg`, `max_kg`, `one_rm_kg`,
// `needs_review`) convert to these via the shared decoder.
struct ResolvedLoad: Codable, Equatable {
    let pctLabel: String
    let kgLabel: String
    let minKg: Double
    let maxKg: Double?
    let oneRmKg: Double
    let needsReview: Bool
}

struct WorkoutItemParams: Codable, Equatable {
    let sets: Int?
    let reps: Int?
    let loadKg: Double?
    let loadPct: Double?           // %1RM
    let rpe: Double?
    let restSeconds: Int?
    let durationSeconds: Int?
    let distanceKm: Double?
    let distanceMeters: Int?
    let paceSecPerKm: Int?
    let cadenceSpm: Int?
    let calories: Int?
    let caloriesPerMin: Int?
    let hrZone: Int?
    /// Erg POWER target in watts (#erg-3). The web normalizer now whitelists `watts`
    /// so the scalar summary carries it; the structured `prescription.target` (.watts)
    /// is the primary source, this the flat mirror. Optional so older payloads decode.
    let watts: Int?
}

// MARK: - LossyArray (resilient element-wise array decode)
//
// Decodes a JSON array element by element, DROPPING (not throwing on) any element
// that fails to decode. This is the session-detail's safety net: the structured
// prescription unions already degrade to `.unknown` per field, but a wholly
// unanticipated block/item shape (a future format the model doesn't model yet, a
// null in a required scalar) would otherwise throw and take the ENTIRE
// `AssignmentDetail` down — collapsing a perfectly good multi-block session into
// the "sin detalle" empty state. Applied to `WorkoutDetail.blocks` and
// `WorkoutBlock.items`, one bad element degrades to a skipped element while every
// other block/movement still renders. Used in two places → defined once (DRY).
//
// The inner `LossyElement` wrapper is the canonical no-infinite-loop pattern: its
// `init(from:)` never throws (it swallows the per-element error with `try?`), so
// the unkeyed container's cursor ALWAYS advances exactly one element per
// iteration regardless of whether that element decoded.
@propertyWrapper
struct LossyArray<Element: Decodable>: Decodable {
    var wrappedValue: [Element]

    init(wrappedValue: [Element]) { self.wrappedValue = wrappedValue }

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var result: [Element] = []
        result.reserveCapacity(container.count ?? 0)
        while !container.isAtEnd {
            let element = try container.decode(LossyElement.self)
            if let value = element.value { result.append(value) }
        }
        wrappedValue = result
    }

    private struct LossyElement: Decodable {
        let value: Element?
        init(from decoder: Decoder) throws { value = try? Element(from: decoder) }
    }
}

extension LossyArray: Encodable where Element: Encodable {
    // Re-encodes as a plain JSON array so the on-device cache round-trips
    // byte-for-byte (AssignmentDetailCache encodes the detail back out).
    func encode(to encoder: Encoder) throws { try wrappedValue.encode(to: encoder) }
}

extension LossyArray: Equatable where Element: Equatable {}

// MARK: - JSONValue (lightweight any-shape decoder for block configJson)
//
// Block `config_json` is intentionally schemaless on the backend: AMRAP has
// `time_cap_seconds`, "for time" has `rounds`, intervals have `work_seconds` /
// `rest_seconds` pairs, etc. We decode into a JSON tree and expose typed
// accessors so callers stay declarative.

indirect enum JSONValue: Codable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let n = try? c.decode(Double.self) { self = .number(n); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let a = try? c.decode([JSONValue].self) { self = .array(a); return }
        if let o = try? c.decode([String: JSONValue].self) { self = .object(o); return }
        throw DecodingError.dataCorruptedError(
            in: c,
            debugDescription: "Unsupported JSON value"
        )
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    // Typed accessors — convenient for reading well-known block config keys.
    // IMPORTANT: `convertFromSnakeCase` does NOT reach these dynamic dictionary
    // keys (it only rewrites keys backed by a CodingKey type). `config_json` is
    // decoded as a raw `[String: JSONValue]`, so its keys arrive verbatim from
    // the wire — i.e. snake_case. Look up snake_case keys here
    // (`time_cap_seconds`, `work_seconds`, …), matching `weekDayPartConfigSchema`.
    func int(_ key: String) -> Int? {
        guard case .object(let dict) = self else { return nil }
        if case .number(let n) = dict[key] { return Int(n) }
        return nil
    }

    func double(_ key: String) -> Double? {
        guard case .object(let dict) = self else { return nil }
        if case .number(let n) = dict[key] { return n }
        return nil
    }

    func string(_ key: String) -> String? {
        guard case .object(let dict) = self else { return nil }
        if case .string(let s) = dict[key] { return s }
        return nil
    }
}
