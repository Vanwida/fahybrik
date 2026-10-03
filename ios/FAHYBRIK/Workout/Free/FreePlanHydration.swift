import Foundation

// MARK: - Rehydrate saved self-origin plans into the free builders (FH-54 edit)
//
// SIN PÉRDIDAS (28-sep). Editar un libre guardado es abrir el constructor con el
// plan TAL Y COMO SE GUARDÓ: lo que el atleta montó tiene que volver idéntico, y
// guardarlo sin tocar nada tiene que mandar el mismo plan. La auditoría encontró
// que no era así: una RPE o un paso «Libre» volvían como Z4, una recuperación sin
// modo como trote, un paso abierto desaparecía, la cuesta se perdía, un EMOM 45/15
// o un Tabata perdían la transición, un For Time de una ronda volvía con tres, se
// colaban los números del último uso del formato, y el TIPO de entreno se decidía
// por el primer ejercicio (un WOD que empieza remando se reabría como remo).
//
// Cada hueco se cierra en su sitio, y la prueba de ida y vuelta por formato
// (`FreePlanHydrationRoundTripTests`) lo sujeta: borrador → payload → detalle que
// devolvería el servidor → borrador → payload, y los dos payloads son el mismo.
//
// Correr un libre guardado ya NO pasa por aquí: se corre como la asignación que es
// (`WorkoutPlan.from` + el guardado del coach). Esto es solo para editarlo.

enum FreePlanEditTrack {
    case measured(FreeWorkoutDraft)
    case strength(FreeStrengthDraft)
    case functional(FreeFunctionalDraft)
}

enum FreePlanHydration {

    /// Qué constructor abre un libre guardado. Manda la modalidad con la que se
    /// CREÓ (`workout.modality`, de `meta_json`); sin ella se deduce del plan
    /// ENTERO, nunca del primer ejercicio.
    enum Tipo: Equatable {
        case medido(FreeModality)
        case fuerza
        case funcional
    }

    static func tipo(of detail: AssignmentDetail) -> Tipo? {
        if detail.clockPrescription != nil { return .funcional }
        guard let workout = detail.workout else { return nil }
        if let wire = workout.modality {
            if let m = FreeModality(rawValue: wire) { return .medido(m) }
            if wire == PrescriptionModality.strength.rawValue { return .fuerza }
            if wire == PrescriptionModality.functional.rawValue { return .funcional }
        }
        let items = workout.blocks.flatMap(\.items)
        guard !items.isEmpty else { return nil }
        // Fuerza: cada ejercicio es una tabla de series.
        if items.allSatisfy({ $0.prescription?.scheme == .sets }) { return .fuerza }
        // Medido: UN solo ejercicio de una modalidad medible, sin calentamiento.
        if items.count == 1, workout.blocks.count == 1,
           let rx = items[0].prescription,
           let m = rx.modality.flatMap({ FreeModality(rawValue: $0.rawValue) }) {
            return .medido(m)
        }
        return .funcional
    }

    /// Which builder track + pre-filled draft to open for editing a scheduled libre.
    static func editTrack(from detail: AssignmentDetail) -> FreePlanEditTrack? {
        guard detail.execution == nil else { return nil }
        guard detail.assignment.status == "scheduled" else { return nil }

        if let rx = detail.clockPrescription {
            let draft = FreeFunctionalDraft()
            draft.titleEdited = detail.workout?.name ?? ""
            if hydrateFunctionalClock(draft, prescription: rx, formatWire: detail.clockFormat) {
                return .functional(draft)
            }
            return nil
        }

        guard let workout = detail.workout, !workout.blocks.isEmpty, let tipo = tipo(of: detail) else { return nil }

        switch tipo {
        case .fuerza:
            let draft = FreeStrengthDraft()
            draft.titleEdited = workout.name
            return hydrateStrength(draft, blocks: workout.blocks) ? .strength(draft) : nil
        case .funcional:
            let draft = FreeFunctionalDraft()
            draft.titleEdited = workout.name
            return hydrateFunctional(draft, blocks: workout.blocks) ? .functional(draft) : nil
        case .medido(let modality):
            guard let rx = workout.blocks.flatMap(\.items).first?.prescription else { return nil }
            let draft = FreeWorkoutDraft()
            draft.titleEdited = workout.name
            return hydrateMeasured(draft, modality: modality, prescription: rx) ? .measured(draft) : nil
        }
    }

    // MARK: - Measured (row / ski / bike / run)

    private static func hydrateMeasured(
        _ draft: FreeWorkoutDraft,
        modality: FreeModality,
        prescription: Prescription
    ) -> Bool {
        draft.selectModality(modality)

        if modality == .run {
            if let structure = prescription.structure, hydrateRunPlan(draft, structure: structure) {
                return true
            }
            return hydrateMeasuredFlatRun(draft, prescription: prescription)
        }

        guard let format = format(from: prescription.scheme) else { return false }
        draft.format = format

        if let r = prescription.rounds { draft.rounds = r }
        switch format {
        case .series, .rounds:
            if let r = prescription.restS ?? prescription.sets?.first?.restS { draft.restSeconds = r }
        case .amrap:
            if let w = prescription.totalS { draft.windowSeconds = w }
        case .emom:
            if let c = prescription.workS { draft.cadenceSeconds = c }
        case .continuo, .forTime:
            break
        }

        guard let set = prescription.sets?.first else { return false }
        switch set.measure {
        case let .distance(m, _)?:
            draft.measureKind = .distance
            draft.distanceMeters = Int(m.rounded())
        case let .duration(s, _)?:
            draft.measureKind = .time
            draft.workSeconds = s
        case let .calories(c, _)?:
            draft.measureKind = .calories
            draft.calories = c
        default:
            return false
        }
        applyTarget(draft, target: set.target ?? prescription.target, modality: modality)
        return draft.buildPrescription() != nil
    }

    /// Carrera guardada SIN estructura (planes viejos): un paso por set, con la
    /// medida y el objetivo de ESE set — ni todo a distancia ni todo a Z4.
    private static func hydrateMeasuredFlatRun(_ draft: FreeWorkoutDraft, prescription: Prescription) -> Bool {
        guard let sets = prescription.sets, !sets.isEmpty else { return false }
        let pasos = sets.map { paso(from: $0) }
        draft.runPlan = FreeRunPlan(calentamiento: nil,
                                    grupos: [FreeRunGrupo(repeticiones: 1, pasos: pasos)],
                                    vuelta: nil)
        return draft.runPlan.esEjecutable
    }

    private static func hydrateRunPlan(_ draft: FreeWorkoutDraft, structure: RunStructure) -> Bool {
        var calentamiento: FreeRunPaso?
        var vuelta: FreeRunPaso?
        var grupos: [FreeRunGrupo] = []

        for phase in structure {
            switch phase.role {
            case .warmup:
                calentamiento = paso(from: phase.elements.first)
            case .cooldown:
                vuelta = paso(from: phase.elements.first)
            case .main:
                for el in phase.elements {
                    switch el {
                    case let .segment(seg):
                        grupos.append(FreeRunGrupo(repeticiones: 1, pasos: [paso(from: seg)]))
                    case let .repeatBlock(times, elements):
                        let pasos = elements.compactMap { elem -> FreeRunPaso? in
                            if case let .segment(seg) = elem { return paso(from: seg) }
                            return nil
                        }
                        if !pasos.isEmpty {
                            grupos.append(FreeRunGrupo(repeticiones: times, pasos: pasos))
                        }
                    }
                }
            }
        }

        draft.runPlan = FreeRunPlan(calentamiento: calentamiento, grupos: grupos, vuelta: vuelta)
        return draft.runPlan.esEjecutable
    }

    private static func paso(from element: RunElement?) -> FreeRunPaso? {
        guard case let .segment(seg)? = element else { return nil }
        return paso(from: seg)
    }

    /// Un paso de la gramática, ENTERO: su medida (un paso abierto sigue abierto),
    /// su objetivo (una RPE es una RPE, «Libre» es sin objetivo — nunca Z4), su modo
    /// de recuperación (sin modo sigue sin modo) y su cuesta.
    private static func paso(from seg: RunSegment) -> FreeRunPaso {
        var p = FreeRunPaso(rol: seg.kind == .recovery ? .recuperacion : .trabajo)
        switch seg.measure {
        case let .distance(m): p.medida = .distancia; p.metros = m
        case let .duration(s): p.medida = .tiempo; p.segundos = s
        case .unknown:         p.medida = .abierto
        }
        switch seg.target {
        case let .pace(v, mn, _)?:
            p.objetivo = .ritmo
            if let ritmo = v ?? mn { p.ritmoSegPorKm = ritmo }
        case let .hrZone(z)?:
            p.objetivo = .zona; p.zona = z
        case let .paceZone(z)?:
            p.objetivo = .zona; p.zona = z
        case let .rpe(v, mn, _)?:
            p.objetivo = .rpe
            if let rpe = v ?? mn { p.rpe = rpe }
        case .unknown?, nil:
            p.objetivo = .ninguno
        }
        p.modo = seg.kind == .recovery ? seg.recoveryMode : nil
        p.cuestaPct = seg.inclinePct
        return p
    }

    /// Un set plano de carrera como paso: su medida y su objetivo propios.
    private static func paso(from set: PrescriptionSet) -> FreeRunPaso {
        var p = FreeRunPaso(rol: .trabajo)
        switch set.measure {
        case let .distance(m, _)?: p.medida = .distancia; p.metros = Int(m.rounded())
        case let .duration(s, _)?: p.medida = .tiempo; p.segundos = s
        default:                   p.medida = .abierto
        }
        switch set.target {
        case let .pace(unit, v, mn, _)?:
            p.objetivo = .ritmo
            if let ritmo = v ?? mn { p.ritmoSegPorKm = unit == .per500m ? ritmo * 2 : ritmo }
        case let .hrZone(v, mn, _)?:
            p.objetivo = .zona
            if let z = v ?? mn { p.zona = Int(z.rounded()) }
        case let .rpe(v, mn, _)?:
            p.objetivo = .rpe
            if let rpe = v ?? mn { p.rpe = rpe }
        default:
            p.objetivo = .ninguno
        }
        return p
    }

    /// El objetivo del bout, o NINGUNO: un plan sin objetivo (un benchmark de
    /// primera vez) no se reabre con el ritmo por defecto de la modalidad.
    private static func applyTarget(_ draft: FreeWorkoutDraft, target: Target?, modality: FreeModality) {
        switch target {
        case let .pace(unit, valueS, minS, _)?:
            draft.targetKind = .pace
            guard let sec = valueS ?? minS else { return }
            // El borrador guarda el ritmo en la unidad de SU modalidad.
            switch (unit, modality.resolvedPaceUnit) {
            case (.per500m, .perKm): draft.paceSeconds = sec * 2
            case (.perKm, .per500m): draft.paceSeconds = sec / 2
            default:                 draft.paceSeconds = sec
            }
        case let .hrZone(z, mn, _)?:
            draft.targetKind = .hrZone
            if let v = z ?? mn { draft.hrZone = Int(v.rounded()) }
        default:
            draft.targetKind = nil
        }
    }

    private static func format(from scheme: PrescriptionScheme) -> FreeFormat? {
        switch scheme {
        case .intervals: return .series
        case .steady: return .continuo
        case .emom: return .emom
        case .amrap: return .amrap
        case .forTime: return .forTime
        case .rounds: return .rounds
        default: return nil
        }
    }

    // MARK: - Strength

    private static func hydrateStrength(_ draft: FreeStrengthDraft, blocks: [WorkoutBlock]) -> Bool {
        var main: [FreeStrengthItem] = []
        var warm: [FreeStrengthItem] = []
        for block in blocks {
            let isWarm = BlockPhase.classify(title: block.title, format: block.format) == .warmup
            for item in block.items {
                guard let rx = item.prescription else { continue }
                var row = FreeStrengthItem(exercise: exercise(of: item))
                if let sets = rx.sets, !sets.isEmpty {
                    row.series = sets.count
                    if let first = sets.first {
                        switch first.measure {
                        case let .reps(v, _)?:
                            row.measure = .reps
                            row.reps = v
                        case let .duration(s, _)?:
                            row.measure = .time
                            row.seconds = s
                        case let .distance(m, _)?:
                            row.measure = .distance
                            row.meters = Int(m.rounded())
                        default:
                            break
                        }
                        row.restSeconds = first.restS ?? row.restSeconds
                        if case let .kg(v, _, _, _)? = first.target, let v {
                            row.loadKind = .kg
                            row.kgUnits = max(1, Int((v / FreeStrengthStep.kgIncrement).rounded()))
                        } else {
                            row.loadKind = .bodyweight
                        }
                    }
                }
                if isWarm { warm.append(row) } else { main.append(row) }
            }
        }
        draft.items = main
        draft.warmupItems = warm
        draft.includeWarmup = !warm.isEmpty
        return !main.isEmpty
    }

    // MARK: - Functional

    private static func hydrateFunctional(_ draft: FreeFunctionalDraft, blocks: [WorkoutBlock]) -> Bool {
        let items = blocks.flatMap(\.items)
        guard let firstRx = items.first?.prescription,
              let f = functionalFormat(from: firstRx.scheme) else { return false }
        draft.selectFormat(f)
        applyFunctionalStructure(draft, prescription: firstRx, format: f)

        draft.movements = items.compactMap { item in
            guard let rx = item.prescription else { return nil }
            var m = FreeFunctionalMovement(exercise: exercise(of: item))
            if let set = rx.sets?.first {
                switch set.measure {
                case let .reps(v, _)?:
                    m.dose = .reps
                    m.reps = v
                case let .calories(c, _)?:
                    m.dose = .calories
                    m.calories = c
                case let .distance(meters, _)?:
                    m.dose = .meters
                    m.meters = Int(meters.rounded())
                case let .duration(s, _)?:
                    m.dose = .time
                    m.seconds = s
                default:
                    break
                }
            }
            return m
        }
        return draft.buildPlanPayload() != nil
    }

    private static func hydrateFunctionalClock(
        _ draft: FreeFunctionalDraft,
        prescription: Prescription,
        formatWire: String?
    ) -> Bool {
        let scheme = formatWire.flatMap { PrescriptionScheme(canonicalizing: $0) } ?? prescription.scheme
        guard let f = functionalFormat(from: scheme) else { return false }
        draft.selectFormat(f)
        applyFunctionalStructure(draft, prescription: prescription, format: f)
        return draft.buildPlanPayload() != nil
    }

    private static func functionalFormat(from scheme: PrescriptionScheme) -> FreeFunctionalFormat? {
        switch scheme {
        case .forTime: return .forTime
        case .amrap: return .amrap
        case .emom: return .emom
        case .rounds: return .rounds
        default: return nil
        }
    }

    /// La ESTRUCTURA del bloque, eje a eje y desde la prescripción guardada — nada
    /// del último uso del formato (`selectFormat` restaura esas preferencias, y aquí
    /// se pisan todas las que este formato escribe).
    ///
    /// · For Time: una ronda se guarda sin `rounds` → vuelve 1, no el 3 por defecto.
    /// · EMOM: `work_s` es la VENTANA de trabajo y `rest_s` la transición; el ciclo
    ///   del constructor es su suma (45/15 → ciclo 60, transición 15; Tabata 20/10
    ///   → ciclo 30, transición 10).
    /// · Rondas: el descanso entre rondas y el de entre estaciones, o ninguno.
    private static func applyFunctionalStructure(
        _ draft: FreeFunctionalDraft,
        prescription: Prescription,
        format: FreeFunctionalFormat
    ) {
        switch format {
        case .forTime:
            draft.rounds = prescription.rounds ?? 1
            draft.capSeconds = prescription.totalS ?? 0
        case .amrap:
            draft.windowSeconds = prescription.totalS ?? FreeFunctionalStep.defaultWindow
        case .emom:
            let trabajo = prescription.workS ?? FreeFunctionalStep.defaultCadence
            let transicion = prescription.restS ?? 0
            draft.rounds = prescription.rounds ?? draft.rounds
            draft.transitionSeconds = transicion
            draft.cadenceSeconds = trabajo + transicion
        case .rounds:
            draft.rounds = prescription.rounds ?? draft.rounds
            draft.restSeconds = prescription.restS ?? 0
            draft.seriesRestSeconds = prescription.sets?.compactMap(\.restS).first ?? 0
        }
    }

    // MARK: - Shared

    /// El ejercicio del catálogo detrás de un ejercicio del plan.
    private static func exercise(of item: WorkoutItem) -> FreeExercise {
        FreeExercise(
            id: Int(item.exerciseId) ?? 0,
            name: item.exerciseName,
            slug: item.exerciseSlug,
            category: item.exerciseCategory,
            modality: item.prescription?.modality?.rawValue
        )
    }
}
