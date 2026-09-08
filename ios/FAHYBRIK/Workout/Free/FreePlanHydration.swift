import Foundation

// MARK: - Rehydrate saved self-origin plans into the free builders (FH-54 edit)

enum FreePlanEditTrack {
    case measured(FreeWorkoutDraft)
    case strength(FreeStrengthDraft)
    case functional(FreeFunctionalDraft)
}

enum FreePlanHydration {
    /// Runnable free context for a scheduled self-origin assignment (plan row → live).
    static func runContext(from detail: AssignmentDetail) -> FreeWorkoutContext? {
        guard detail.execution == nil else { return nil }
        guard detail.assignment.status == "scheduled" else { return nil }
        switch editTrack(from: detail) {
        case let .measured(draft): return draft.buildContext()
        case let .strength(draft): return draft.buildContext()
        case let .functional(draft): return draft.buildContext()
        case .none: return nil
        }
    }

    /// Which builder track + pre-filled draft to open for editing a scheduled libre.
    static func editTrack(from detail: AssignmentDetail) -> FreePlanEditTrack? {
        guard detail.execution == nil else { return nil }
        guard detail.assignment.status == "scheduled" else { return nil }

        if let rx = detail.clockPrescription {
            var draft = FreeFunctionalDraft()
            draft.titleEdited = detail.workout?.name ?? ""
            if hydrateFunctionalClock(&draft, prescription: rx, formatWire: detail.clockFormat) {
                return .functional(draft)
            }
            return nil
        }

        guard let workout = detail.workout, !workout.blocks.isEmpty else { return nil }

        let items = workout.blocks.flatMap(\.items)
        guard let firstRx = items.first?.prescription else { return nil }
        let modality = firstRx.modality?.rawValue ?? items.first?.exerciseCategory ?? ""

        if modality == PrescriptionModality.strength.rawValue || items.allSatisfy({ $0.exerciseCategory == "strength" }) {
            var draft = FreeStrengthDraft()
            draft.titleEdited = workout.name
            if hydrateStrength(&draft, blocks: workout.blocks) {
                return .strength(draft)
            }
            return nil
        }

        if modality == PrescriptionModality.functional.rawValue {
            var draft = FreeFunctionalDraft()
            draft.titleEdited = workout.name
            if hydrateFunctional(&draft, blocks: workout.blocks) {
                return .functional(draft)
            }
            return nil
        }

        var measured = FreeWorkoutDraft()
        measured.titleEdited = workout.name
        if hydrateMeasured(&measured, prescription: firstRx, title: workout.name) {
            return .measured(measured)
        }
        return nil
    }

    // MARK: - Measured (row / ski / bike / run)

    private static func hydrateMeasured(
        _ draft: inout FreeWorkoutDraft,
        prescription: Prescription,
        title: String
    ) -> Bool {
        guard let wire = prescription.modality?.rawValue,
              let modality = FreeModality(rawValue: wire == "ski" ? "ski" : wire) else {
            if prescription.modality == .run {
                draft.selectModality(.run)
                draft.titleEdited = title
                if let structure = prescription.structure, hydrateRunPlan(&draft, structure: structure) {
                    return true
                }
                return hydrateMeasuredFlatRun(&draft, prescription: prescription)
            }
            return false
        }

        draft.selectModality(modality)
        draft.titleEdited = title

        if modality == .run {
            if let structure = prescription.structure, hydrateRunPlan(&draft, structure: structure) {
                return true
            }
            return hydrateMeasuredFlatRun(&draft, prescription: prescription)
        }

        guard let format = format(from: prescription.scheme) else { return false }
        draft.format = format

        draft.rounds = prescription.rounds ?? draft.rounds
        draft.restSeconds = prescription.restS ?? draft.restSeconds
        draft.windowSeconds = prescription.totalS ?? draft.windowSeconds
        draft.cadenceSeconds = prescription.workS ?? draft.cadenceSeconds

        if let set = prescription.sets?.first {
            switch set.measure {
            case let .distance(m, _):
                draft.measureKind = .distance
                draft.distanceMeters = Int(m)
            case let .duration(s, _):
                draft.measureKind = .time
                draft.workSeconds = s
            case let .calories(c, _):
                draft.measureKind = .calories
                draft.calories = c
            default:
                break
            }
            if let target = set.target ?? prescription.target {
                applyTarget(&draft, target: target, modality: modality)
            }
        }
        return draft.buildPrescription() != nil
    }

    private static func hydrateMeasuredFlatRun(_ draft: inout FreeWorkoutDraft, prescription: Prescription) -> Bool {
        guard let sets = prescription.sets, !sets.isEmpty else { return false }
        var grupos: [FreeRunGrupo] = []
        var pasos: [FreeRunPaso] = []
        for set in sets {
            let rol: FreeRunPaso.Rol = .trabajo
            pasos.append(paso(from: set, rol: rol))
        }
        if !pasos.isEmpty {
            grupos.append(FreeRunGrupo(repeticiones: prescription.rounds ?? 1, pasos: pasos))
        }
        draft.runPlan = FreeRunPlan(calentamiento: nil, grupos: grupos, vuelta: nil)
        return draft.runPlan.esEjecutable
    }

    private static func hydrateRunPlan(_ draft: inout FreeWorkoutDraft, structure: RunStructure) -> Bool {
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
                        if let p = paso(from: seg) {
                            grupos.append(FreeRunGrupo(repeticiones: 1, pasos: [p]))
                        }
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

    private static func paso(from seg: RunSegment) -> FreeRunPaso? {
        let rol: FreeRunPaso.Rol = seg.kind == .recovery ? .recuperacion : .trabajo
        let medida: FreeRunPaso.Medida
        switch seg.measure {
        case let .distance(m): medida = .distancia
        case let .duration(s): medida = .tiempo
        case .unknown: return nil
        }
        var metros = FreeRunPlan.metrosPorDefecto
        var segundos = FreeRunPlan.segundosPorDefecto
        switch seg.measure {
        case let .distance(m): metros = m
        case let .duration(s): segundos = s
        case .unknown: break
        }
        let (objetivo, zona, ritmo): (FreeRunPaso.Objetivo, Int, Int) = {
            switch seg.target {
            case let .pace(v, _, _): return (.ritmo, 4, v ?? FreeRunPlan.ritmoPorDefecto)
            case let .hrZone(z): return (.zona, z, FreeRunPlan.ritmoPorDefecto)
            case let .paceZone(z): return (.zona, z, FreeRunPlan.ritmoPorDefecto)
            default: return (.zona, 4, FreeRunPlan.ritmoPorDefecto)
            }
        }()
        return FreeRunPaso(
            rol: rol,
            medida: medida,
            metros: metros,
            segundos: segundos,
            objetivo: objetivo,
            zona: zona,
            ritmoSegPorKm: ritmo,
            modo: seg.recoveryMode ?? .trote
        )
    }

    private static func paso(from set: PrescriptionSet, rol: FreeRunPaso.Rol) -> FreeRunPaso {
        var metros = FreeRunPlan.metrosPorDefecto
        var segundos = FreeRunPlan.segundosPorDefecto
        switch set.measure {
        case let .distance(m, _): metros = Int(m)
        case let .duration(s, _): segundos = s
        default: break
        }
        return FreeRunPaso(rol: rol, medida: .distancia, metros: metros, segundos: segundos,
                           objetivo: .zona, zona: 4)
    }

    private static func applyTarget(_ draft: inout FreeWorkoutDraft, target: Target, modality: FreeModality) {
        switch target {
        case let .pace(unit, valueS, _, _):
            draft.targetKind = .pace
            let sec = valueS ?? 0
            draft.paceSeconds = unit == .per500m ? sec : (modality.resolvedPaceUnit == .per500m ? sec : sec)
        case let .hrZone(z, _, _):
            draft.targetKind = .hrZone
            if let z { draft.hrZone = Int(z) }
        default:
            break
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

    private static func hydrateStrength(_ draft: inout FreeStrengthDraft, blocks: [WorkoutBlock]) -> Bool {
        var main: [FreeStrengthItem] = []
        var warm: [FreeStrengthItem] = []
        for block in blocks {
            let isWarm = block.title.localizedCaseInsensitiveContains("calentamiento")
            for item in block.items {
                guard let rx = item.prescription else { continue }
                let ex = FreeExercise(
                    id: Int(item.exerciseId) ?? 0,
                    name: item.exerciseName,
                    slug: item.exerciseSlug,
                    category: item.exerciseCategory,
                    modality: rx.modality?.rawValue
                )
                var row = FreeStrengthItem(exercise: ex)
                if let sets = rx.sets, !sets.isEmpty {
                    row.series = sets.count
                    if let first = sets.first {
                        switch first.measure {
                        case let .reps(v, _):
                            row.measure = .reps
                            row.reps = v
                        case let .duration(s, _):
                            row.measure = .time
                            row.seconds = s
                        case let .distance(m, _):
                            row.measure = .distance
                            row.meters = Int(m)
                        default:
                            break
                        }
                        row.restSeconds = first.restS ?? row.restSeconds
                        if case let .kg(v, _, _, _) = first.target, let v {
                            row.loadKind = .kg
                            row.kgUnits = max(1, Int((v / FreeStrengthStep.kgIncrement).rounded()))
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

    private static func hydrateFunctional(_ draft: inout FreeFunctionalDraft, blocks: [WorkoutBlock]) -> Bool {
        guard let block = blocks.first, let firstRx = block.items.first?.prescription else { return false }
        guard let f = functionalFormat(from: firstRx.scheme) else { return false }
        draft.selectFormat(f)
        applyFunctionalStructure(&draft, prescription: firstRx, format: f)

        draft.movements = block.items.compactMap { item in
            guard let rx = item.prescription else { return nil }
            var m = FreeFunctionalMovement(
                exercise: FreeExercise(
                    id: Int(item.exerciseId) ?? 0,
                    name: item.exerciseName,
                    slug: item.exerciseSlug,
                    category: item.exerciseCategory,
                    modality: rx.modality?.rawValue
                )
            )
            if let set = rx.sets?.first {
                switch set.measure {
                case let .reps(v, _):
                    m.dose = .reps
                    m.reps = v
                case let .calories(c, _):
                    m.dose = .calories
                    m.calories = c
                case let .distance(meters, _):
                    m.dose = .meters
                    m.meters = Int(meters)
                case let .duration(s, _):
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
        _ draft: inout FreeFunctionalDraft,
        prescription: Prescription,
        formatWire: String?
    ) -> Bool {
        let scheme = formatWire.flatMap { PrescriptionScheme(rawValue: $0) } ?? prescription.scheme
        guard let f = functionalFormat(from: scheme) else { return false }
        draft.selectFormat(f)
        applyFunctionalStructure(&draft, prescription: prescription, format: f)
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

    private static func applyFunctionalStructure(
        _ draft: inout FreeFunctionalDraft,
        prescription: Prescription,
        format: FreeFunctionalFormat
    ) {
        draft.rounds = prescription.rounds ?? draft.rounds
        draft.windowSeconds = prescription.totalS ?? draft.windowSeconds
        draft.cadenceSeconds = prescription.workS ?? draft.cadenceSeconds
        draft.restSeconds = prescription.restS ?? draft.restSeconds
        if format == .forTime, let cap = prescription.totalS, cap > 0 {
            draft.capSeconds = cap
        }
    }
}
