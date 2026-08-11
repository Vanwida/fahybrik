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

// MARK: - Cadence presets (the box-timer shapes, one tap each)
//
// An EMOM cycle is WORK + TRANSITION (the server's `work_s` / `rest_s`; see
// EmomPlan). "Al minuto" is the classic EMOM — no explicit transition, the rest is
// whatever you leave over. The other two make it explicit, which is what a Rogue
// clock does and what lets the engine cue you to STOP. Tabata is not a separate
// format here: 20/10 × 8 IS this structure with different numbers. (It also has to
// be — the free-save contract's FUNCTIONAL_SCHEMES accepts emom, not tabata.)
enum FreeEmomPreset: String, CaseIterable, Identifiable {
    case onTheMinute, fortyFive15, tabata
    var id: String { rawValue }

    var labelES: String {
        switch self {
        case .onTheMinute: return "Al minuto"
        case .fortyFive15: return "45/15"
        case .tabata:      return "Tabata"
        }
    }

    /// Cycle length in seconds.
    var cadenceSeconds: Int {
        switch self {
        case .onTheMinute, .fortyFive15: return 60
        case .tabata:                    return 30
        }
    }

    /// The explicit transition inside the cycle; 0 = plain EMOM.
    var transitionSeconds: Int {
        switch self {
        case .onTheMinute: return 0
        case .fortyFive15: return 15
        case .tabata:      return 10
        }
    }

    /// Rounds the preset implies (a Tabata is canonically 8); nil = keep whatever
    /// the athlete already set.
    var rounds: Int? { self == .tabata ? 8 : nil }

    /// The preset matching an exact (cycle, transition) pair, or nil when the
    /// athlete has tuned their own numbers.
    static func matching(cadence: Int, transition: Int) -> FreeEmomPreset? {
        allCases.first { $0.cadenceSeconds == cadence && $0.transitionSeconds == transition }
    }
}

enum FreeFunctionalStep {
    static let roundsStep = 1
    static let capStep = 30
    static let windowStep = 60
    static let defaultWindow = 600     // AMRAP 10:00
    static let cadenceStep = 15
    static let defaultCadence = 60     // EMOM "on the minute"
    static let transitionStep = 5      // the change window tunes finer than the cycle
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
        case .meters:   return Formato.distancia(Double(meters)) ?? "\(meters) m"
        case .time:     return Formato.clock(seconds, subMinuto: .segundos)
        }
    }
}

// The block's structural params, written identically onto EVERY movement's
// prescription so the piece is coherent (one scheme, one cap/window/cadence/rest).
struct FunctionalStructural {
    let rounds: Int?
    let workS: Int?
    let restS: Int?
    let totalS: Int?

    /// Read the structure back OUT of a built prescription — the folded block the
    /// live engine ran. Lets the post-workout declaration rebuild items with the
    /// EXACT params the session was run with, instead of re-deriving them.
    init(from p: Prescription) {
        rounds = p.rounds
        workS = p.workS
        restS = p.restS
        totalS = p.totalS
    }

    init(rounds: Int?, workS: Int?, restS: Int?, totalS: Int?) {
        self.rounds = rounds
        self.workS = workS
        self.restS = restS
        self.totalS = totalS
    }
}

// MARK: - Movements → wire items (THE single mapping)
//
// One place turns "a movement + the piece's structure" into the free-save `items[]`.
// The builder uses it when the athlete declares movements UP FRONT; the post-workout
// summary uses it when they declare them AFTER a bare-timer session. Two entry
// points, one definition — so a declared-after WOD is byte-identical to a
// declared-before one.
enum FreeFunctionalItems {
    /// One movement's wire prescription: the shared scheme + IDENTICAL block params
    /// + a single set carrying this movement's dose.
    static func prescription(
        for m: FreeFunctionalMovement,
        scheme: PrescriptionScheme,
        structure: FunctionalStructural
    ) -> Prescription {
        // Set-level modality is what LiveTramo / involvesErg / device slots read.
        // Without it a free EMOM of ski+row collapses to "functional" and the app
        // never offers a PM5 or routes meters to the right machine.
        let mod = m.exercise.prescriptionModality ?? .functional
        let set = PrescriptionSet(measure: m.doseMeasure, target: nil, modality: mod,
                                  restS: nil, tempo: nil, note: nil)
        return Prescription(
            scheme: scheme,
            modality: mod,
            sets: [set],
            rounds: structure.rounds, workS: structure.workS,
            restS: structure.restS, totalS: structure.totalS,
            target: nil, note: nil, start: nil, increment: nil
        )
    }

    /// The free-save `items[]` in execution order, or nil when nothing was declared
    /// (a pure cronómetro — the contract wants the key absent, not an empty array).
    static func payloads(
        _ movements: [FreeFunctionalMovement],
        scheme: PrescriptionScheme,
        structure: FunctionalStructural
    ) -> [FreeWorkoutItemPayload]? {
        guard !movements.isEmpty else { return nil }
        return movements.map {
            FreeWorkoutItemPayload(
                exercise_id: $0.exercise.id,
                prescription: prescription(for: $0, scheme: scheme, structure: structure)
            )
        }
    }
}

// MARK: - Draft (the funcional form model)

@Observable
final class FreeFunctionalDraft {
    var format: FreeFunctionalFormat? = nil
    var rounds: Int = 3
    var capSeconds: Int = 0                              // For Time cap; 0 = sin límite
    var windowSeconds: Int = FreeFunctionalStep.defaultWindow
    /// The EMOM CYCLE ("cada"). Stays the primary number the athlete sets — a plain
    /// EMOM never has to think about the split.
    var cadenceSeconds: Int = FreeFunctionalStep.defaultCadence
    /// The explicit CHANGE window inside each cycle. 0 = plain EMOM (implicit rest);
    /// > 0 = a station interval, and the engine then cues the end of the work.
    var transitionSeconds: Int = 0
    var restSeconds: Int = FreeFunctionalStep.defaultRest
    var movements: [FreeFunctionalMovement] = []
    var titleEdited: String = ""

    static let maxTitle = 80

    /// A format is enough to start. MOVEMENTS ARE OPTIONAL: an EMOM of 10 minutes,
    /// an AMRAP of 10:00, a For Time and a Rondas circuit are complete, unambiguous
    /// CLOCKS on their own — that is exactly what a box timer is, and demanding the
    /// content up front is the only thing that made us slower than one. What the
    /// athlete did can be declared afterwards, in the summary.
    var canStart: Bool { format != nil }
    var canAddMore: Bool { movements.count < FreeFunctionalStep.maxItems }

    /// The work window inside each EMOM cycle — the cycle minus its change. Always
    /// at least a second, so a mis-tuned pair can never produce a zero-length phase.
    var workSeconds: Int { max(1, cadenceSeconds - transitionSeconds) }

    /// The preset the current cycle/transition pair spells, or nil when tuned by hand.
    var emomPreset: FreeEmomPreset? {
        FreeEmomPreset.matching(cadence: cadenceSeconds, transition: transitionSeconds)
    }

    /// What the rounds stepper is actually counting. An EMOM's rounds are MINUTES
    /// only while the cycle IS a minute — a 30 s Tabata cycle counts rondas, and
    /// labelling 8 of them "Minutos" would be plainly wrong.
    var roundsLabel: String {
        guard let f = format else { return "Rondas" }
        if f == .emom { return cadenceSeconds == 60 ? "Minutos" : "Rondas" }
        return f.roundsLabel
    }

    func selectFormat(_ f: FreeFunctionalFormat) {
        format = f
        rounds = f.defaultRounds
        transitionSeconds = 0
        // A box repeats the same format all week, so the last numbers are almost
        // always the right ones. Restoring them is what makes the second session
        // a two-tap start.
        FreeFunctionalPrefs.apply(to: self, format: f)
    }

    /// Apply a cadence preset. Tabata also carries its canonical round count — it is
    /// the SAME structure, only pre-filled.
    func apply(_ preset: FreeEmomPreset) {
        cadenceSeconds = preset.cadenceSeconds
        transitionSeconds = preset.transitionSeconds
        if let r = preset.rounds { rounds = r }
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
            // The server's shape: `work_s` is the WORK WINDOW and `rest_s` the
            // explicit change. A plain EMOM sends only the window (= the cycle), so
            // it is byte-identical to what this builder has always emitted.
            return FunctionalStructural(rounds: max(1, rounds),
                                        workS: workSeconds,
                                        restS: transitionSeconds > 0 ? transitionSeconds : nil,
                                        totalS: nil)
        case .rounds:
            return FunctionalStructural(rounds: max(1, rounds),
                                        workS: nil, restS: restSeconds > 0 ? restSeconds : nil, totalS: nil)
        }
    }

    // The folded block-level prescription the live engine runs: the shared scheme +
    // block params + one set PER movement (the round shown at once), each `note`
    // carrying the movement name so the round list reads it. With NO movements the
    // sets are omitted entirely — a bare clock, which every conditioning HUD and the
    // EMOM expansion already handle (they were written for sets-less prescriptions).
    private func foldedPrescription(_ f: FreeFunctionalFormat, _ s: FunctionalStructural) -> Prescription {
        // Each movement keeps its machine modality (row/ski/bike/run/…) so the
        // pre-start device card, LiveTramo routing and ErgCounterPolicy can see
        // which PM5 / cinta owns each round — not a single "functional" blob.
        let sets = movements.map { m in
            PrescriptionSet(
                measure: m.doseMeasure,
                target: nil,
                modality: m.exercise.prescriptionModality ?? .functional,
                restS: nil,
                tempo: nil,
                note: m.exercise.name
            )
        }
        return Prescription(
            scheme: f.scheme,
            modality: .functional,
            sets: sets.isEmpty ? nil : sets,
            rounds: s.rounds, workS: s.workS, restS: s.restS, totalS: s.totalS,
            target: nil, note: nil, start: nil, increment: nil
        )
    }

    /// The free-save `items[]` — one per movement (exercise_id + prescription), in
    /// execution order, with block params identical on every one. Nil when the
    /// athlete started a bare cronómetro and declared nothing.
    func buildItems() -> [FreeWorkoutItemPayload]? {
        guard let f = format else { return nil }
        return FreeFunctionalItems.payloads(movements, scheme: f.scheme, structure: structural(f))
    }

    /// The runnable context: ONE folded conditioning segment (drives the scheme's
    /// live HUD + score capture) + the per-movement `items[]` (nil for a cronómetro).
    ///
    /// A CRONÓMETRO has no items, so its top-level `prescription` carries the
    /// session instead — the same folded block the engine runs (scheme + rounds /
    /// cadence / window, no sets). That is what the server persists as the
    /// session's shape and what colours the day in the plan; without it a bare
    /// clock would reach the coach as a title and nothing else.
    func buildContext() -> FreeWorkoutContext? {
        guard let f = format else { return nil }
        FreeFunctionalPrefs.remember(self, format: f)
        let payloadItems = buildItems()
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
            warmupChecklist: []
        )
        return FreeWorkoutContext(
            title: resolvedTitle,
            modalityWire: PrescriptionModality.functional.rawValue,
            // Exactly one of the two travels: the movements when they were named,
            // the bare shape when they weren't.
            prescription: payloadItems == nil ? foldedPrescription(f, s) : nil,
            items: payloadItems,
            plan: plan
        )
    }

    // The folded segment's title = the movements in order (the HUD movement label).
    // With nothing declared the FORMAT is the honest label — the athlete is running
    // a clock, and "EMOM" is what the top strip should say, not a generic "Funcional".
    private var foldedTitle: String {
        let names = movements.map(\.exercise.name)
        if names.isEmpty { return format?.labelES ?? "Funcional" }
        return names.joined(separator: " · ")
    }

    var resolvedTitle: String {
        let t = titleEdited.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { return String(t.prefix(Self.maxTitle)) }
        return defaultTitle
    }

    /// With movements, the piece is named by how many. Without them there is no
    /// content to count, so the SHAPE is the name — "EMOM 10 · cada 1:00" tells the
    /// athlete (and the coach) exactly what the session was.
    var defaultTitle: String {
        guard let f = format else { return "Funcional" }
        if movements.isEmpty { return headerLine }
        return "\(f.labelES) · \(movements.count) mov\(movements.count == 1 ? "" : "s")"
    }

    /// The format header line, e.g. "AMRAP · 10:00", "EMOM 12 · cada 1:00",
    /// "EMOM 10 · 45/15", "For Time · 3 rondas · cap 15:00", "Rondas · 5 · descanso 1:00".
    var headerLine: String {
        guard let f = format else { return "" }
        switch f {
        case .amrap:
            return "AMRAP · \(Formato.clock(windowSeconds, subMinuto: .segundos))"
        case .emom:
            // A Tabata IS this structure (20/10 × 8) — so it runs and saves as an
            // emom, but it reads by the name the athlete called it.
            if emomPreset == .tabata { return "Tabata · \(rounds) rondas · 20/10" }
            // A station interval leads with its split — that is the number being
            // paced against; the cycle is its consequence.
            if transitionSeconds > 0 {
                return "EMOM \(rounds) · \(workSeconds)/\(transitionSeconds)"
            }
            return "EMOM \(rounds) · cada \(Formato.clock(cadenceSeconds, subMinuto: .segundos))"
        case .forTime:
            var s = "For Time · \(rounds) ronda\(rounds == 1 ? "" : "s")"
            if capSeconds > 0 { s += " · cap \(Formato.clock(capSeconds, subMinuto: .segundos))" }
            return s
        case .rounds:
            var s = "\(rounds) ronda\(rounds == 1 ? "" : "s")"
            if restSeconds > 0 { s += " · descanso \(Formato.clock(restSeconds, subMinuto: .segundos))" }
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
            // ~45 s per declared movement. A bare clock has none, so a round is
            // budgeted as one movement's worth rather than collapsing to zero.
            let perRound = max(1, movements.count) * 45 + (f == .rounds ? restSeconds : 0)
            return rounds * perRound
        }
    }
}

