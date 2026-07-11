import SwiftUI

// MARK: - Entreno libre — FUNCIONAL (WOD / metcon) builder
//
// The athlete builds a conditioning piece: pick a format (For Time | AMRAP | EMOM
// | Rondas), set its structural params, then list catalog movements each with a
// dose. Every movement shares ONE scheme + identical block params (coherence), so
// the piece runs as a SINGLE conditioning timer — mirroring how a prescribed WOD
// block folds into one block-level segment (`mergedConditioningSegment`). On start
// we build that folded segment (its `sets[]` = the movement round, each `note` the
// movement name so the round list reads correctly) so the live engine routes to
// the same HUD by scheme, plus the free-save `items[]` (one per movement, block
// params written identically on every one) in execution order.

enum FreeFunctionalFormat: String, CaseIterable, Identifiable {
    case forTime, amrap, emom, rounds
    var id: String { rawValue }

    var scheme: PrescriptionScheme {
        switch self {
        case .forTime: return .forTime
        case .amrap:   return .amrap
        case .emom:    return .emom
        case .rounds:  return .rounds
        }
    }

    var labelES: String {
        switch self {
        case .forTime: return "For Time"
        case .amrap:   return "AMRAP"
        case .emom:    return "EMOM"
        case .rounds:  return "Rondas"
        }
    }

    var subtitleES: String {
        switch self {
        case .forTime: return "El trabajo, lo antes posible"
        case .amrap:   return "Máximo en un tiempo dado"
        case .emom:    return "Cada minuto, en el minuto"
        case .rounds:  return "Rondas con descanso"
        }
    }

    // Which structural axes this format exposes.
    var usesRounds: Bool { self == .forTime || self == .emom || self == .rounds }
    var usesCap: Bool { self == .forTime }           // optional time cap
    var usesWindow: Bool { self == .amrap }          // total AMRAP window
    var usesCadence: Bool { self == .emom }          // seconds "on the minute"
    var usesRest: Bool { self == .rounds }           // rest between rounds

    var roundsLabel: String {
        switch self {
        case .emom: return "Minutos"
        default:    return "Rondas"
        }
    }

    /// Sensible seed for the rounds/minutes stepper when this format is chosen.
    var defaultRounds: Int {
        switch self {
        case .forTime: return 3
        case .emom:    return 10
        case .rounds:  return 5
        case .amrap:   return 1
        }
    }
}

enum FreeFunctionalDose: String, CaseIterable, Identifiable {
    case reps, calories, meters, time
    var id: String { rawValue }
    var labelES: String {
        switch self {
        case .reps:     return "Reps"
        case .calories: return "Cal"
        case .meters:   return "Metros"
        case .time:     return "Tiempo"
        }
    }
}

enum FreeFunctionalStep {
    static let roundsStep = 1
    static let capStep = 30
    static let windowStep = 60
    static let defaultWindow = 600     // AMRAP 10:00
    static let cadenceStep = 15
    static let defaultCadence = 60     // EMOM "on the minute"
    static let restStep = 15
    static let defaultRest = 60
    static let repsStep = 1
    static let defaultReps = 10
    static let calStep = 1
    static let defaultCal = 12
    static let metersStep = 25
    static let defaultMeters = 200
    static let secondsStep = 15
    static let defaultSeconds = 60
    static let maxItems = 12
}

// One movement in the WOD — a catalog exercise + its dose for the round.
struct FreeFunctionalMovement: Identifiable {
    let id = UUID()
    let exercise: FreeExercise
    var dose: FreeFunctionalDose = .reps
    var reps: Int = FreeFunctionalStep.defaultReps
    var calories: Int = FreeFunctionalStep.defaultCal
    var meters: Int = FreeFunctionalStep.defaultMeters
    var seconds: Int = FreeFunctionalStep.defaultSeconds

    var doseMeasure: Measure {
        switch dose {
        case .reps:     return .reps(reps)
        case .calories: return .calories(calories)
        case .meters:   return .distance(meters: Double(meters))
        case .time:     return .duration(seconds: seconds)
        }
    }

    var doseString: String {
        switch dose {
        case .reps:     return "\(reps) reps"
        case .calories: return "\(calories) cal"
        case .meters:   return PrescriptionRenderer.formatDistance(Double(meters)) ?? "\(meters) m"
        case .time:     return PrescriptionRenderer.formatClock(seconds)
        }
    }
}

// The block's structural params, written identically onto EVERY movement's
// prescription so the piece is coherent (one scheme, one cap/window/cadence/rest).
private struct FunctionalStructural {
    let rounds: Int?
    let workS: Int?
    let restS: Int?
    let totalS: Int?
}

// MARK: - Draft (the funcional form model)

@Observable
final class FreeFunctionalDraft {
    var format: FreeFunctionalFormat? = nil
    var rounds: Int = 3
    var capSeconds: Int = 0                              // For Time cap; 0 = sin límite
    var windowSeconds: Int = FreeFunctionalStep.defaultWindow
    var cadenceSeconds: Int = FreeFunctionalStep.defaultCadence
    var restSeconds: Int = FreeFunctionalStep.defaultRest
    var movements: [FreeFunctionalMovement] = []
    var titleEdited: String = ""

    static let maxTitle = 80

    var canStart: Bool { format != nil && !movements.isEmpty }
    var canAddMore: Bool { movements.count < FreeFunctionalStep.maxItems }

    func selectFormat(_ f: FreeFunctionalFormat) {
        format = f
        rounds = f.defaultRounds
    }

    func add(_ exercise: FreeExercise) {
        guard canAddMore else { return }
        movements.append(FreeFunctionalMovement(exercise: exercise))
    }

    func remove(_ id: UUID) { movements.removeAll { $0.id == id } }

    func move(_ id: UUID, by delta: Int) {
        guard let i = movements.firstIndex(where: { $0.id == id }) else { return }
        let j = i + delta
        guard movements.indices.contains(j) else { return }
        movements.swapAt(i, j)
    }

    private func structural(_ f: FreeFunctionalFormat) -> FunctionalStructural {
        switch f {
        case .forTime:
            return FunctionalStructural(rounds: max(1, rounds), workS: nil, restS: nil,
                                        totalS: capSeconds > 0 ? capSeconds : nil)
        case .amrap:
            return FunctionalStructural(rounds: nil, workS: nil, restS: nil, totalS: windowSeconds)
        case .emom:
            return FunctionalStructural(rounds: max(1, rounds), workS: cadenceSeconds, restS: nil, totalS: nil)
        case .rounds:
            return FunctionalStructural(rounds: max(1, rounds),
                                        workS: nil, restS: restSeconds > 0 ? restSeconds : nil, totalS: nil)
        }
    }

    // One movement's wire prescription: the shared scheme + IDENTICAL block params
    // + a single set carrying the movement's dose.
    private func movementPrescription(_ m: FreeFunctionalMovement, _ f: FreeFunctionalFormat, _ s: FunctionalStructural) -> Prescription {
        let set = PrescriptionSet(measure: m.doseMeasure, target: nil, modality: nil,
                                  restS: nil, tempo: nil, note: nil)
        return Prescription(
            scheme: f.scheme,
            modality: m.exercise.prescriptionModality ?? .functional,
            sets: [set],
            rounds: s.rounds, workS: s.workS, restS: s.restS, totalS: s.totalS,
            target: nil, note: nil, start: nil, increment: nil
        )
    }

    // The folded block-level prescription the live engine runs: the shared scheme +
    // block params + one set PER movement (the round shown at once), each `note`
    // carrying the movement name so the round list reads it.
    private func foldedPrescription(_ f: FreeFunctionalFormat, _ s: FunctionalStructural) -> Prescription {
        let sets = movements.map { m in
            PrescriptionSet(measure: m.doseMeasure, target: nil, modality: nil,
                            restS: nil, tempo: nil, note: m.exercise.name)
        }
        return Prescription(
            scheme: f.scheme,
            modality: .functional,
            sets: sets,
            rounds: s.rounds, workS: s.workS, restS: s.restS, totalS: s.totalS,
            target: nil, note: nil, start: nil, increment: nil
        )
    }

    /// The free-save `items[]` — one per movement (exercise_id + prescription), in
    /// execution order, with block params identical on every one. REQUIRED for
    /// functional (the top-level prescription is omitted).
    func buildItems() -> [FreeWorkoutItemPayload]? {
        guard let f = format, !movements.isEmpty else { return nil }
        let s = structural(f)
        return movements.map { FreeWorkoutItemPayload(exercise_id: $0.exercise.id,
                                                      prescription: movementPrescription($0, f, s)) }
    }

    /// The runnable context: ONE folded conditioning segment (drives the scheme's
    /// live HUD + score capture) + the per-movement `items[]`.
    func buildContext() -> FreeWorkoutContext? {
        guard let f = format, let payloadItems = buildItems() else { return nil }
        let s = structural(f)
        let segment = WorkoutSegment(
            order: 1,
            title: foldedTitle,
            kind: .reps,                                    // neutral: HUD routes by scheme
            templateSegmentId: nil,
            blockTitle: "Funcional",
            blockPosition: 1,
            videoUrl: nil,
            prescription: foldedPrescription(f, s)
        )
        let plan = WorkoutPlan(
            id: UUID(),
            name: resolvedTitle,
            format: f.scheme,
            estimatedDurationSeconds: estimatedSeconds,
            blockContext: "Libre · no prescrito",
            zoneTargets: [],
            equipment: [],
            segments: [segment],
            coachNote: nil,
            demoVideoUrl: nil,
            warmupChecklist: []
        )
        return FreeWorkoutContext(
            title: resolvedTitle,
            modalityWire: PrescriptionModality.functional.rawValue,
            prescription: nil,
            items: payloadItems,
            plan: plan
        )
    }

    // The folded segment's title = the movements in order (the HUD movement label).
    private var foldedTitle: String {
        let names = movements.map(\.exercise.name)
        return names.isEmpty ? "Funcional" : names.joined(separator: " · ")
    }

    var resolvedTitle: String {
        let t = titleEdited.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { return String(t.prefix(Self.maxTitle)) }
        return defaultTitle
    }

    var defaultTitle: String {
        guard let f = format else { return "Funcional" }
        return "\(f.labelES) · \(movements.count) mov\(movements.count == 1 ? "" : "s")"
    }

    /// The format header line, e.g. "AMRAP · 10:00", "EMOM 12 · cada 1:00",
    /// "For Time · 3 rondas · cap 15:00", "Rondas · 5 · descanso 1:00".
    var headerLine: String {
        guard let f = format else { return "" }
        switch f {
        case .amrap:
            return "AMRAP · \(PrescriptionRenderer.formatClock(windowSeconds))"
        case .emom:
            return "EMOM \(rounds) · cada \(PrescriptionRenderer.formatRest(cadenceSeconds))"
        case .forTime:
            var s = "For Time · \(rounds) ronda\(rounds == 1 ? "" : "s")"
            if capSeconds > 0 { s += " · cap \(PrescriptionRenderer.formatClock(capSeconds))" }
            return s
        case .rounds:
            var s = "\(rounds) ronda\(rounds == 1 ? "" : "s")"
            if restSeconds > 0 { s += " · descanso \(PrescriptionRenderer.formatRest(restSeconds))" }
            return s
        }
    }

    // Rough estimate for the plan card. AMRAP/EMOM are their window; For Time /
    // Rondas are ~45s per movement × rounds (+ rest). Best-effort, never measured.
    var estimatedSeconds: Int {
        guard let f = format else { return 0 }
        switch f {
        case .amrap: return windowSeconds
        case .emom:  return rounds * cadenceSeconds
        case .forTime, .rounds:
            let perRound = movements.count * 45 + (f == .rounds ? restSeconds : 0)
            return rounds * perRound
        }
    }
}

