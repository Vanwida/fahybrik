import SwiftUI

// MARK: - Entreno libre (no prescrito) — domain model
//
// The athlete builds THEIR OWN workout (IDEA 2 in the approved mock): they pick a
// MEASURED modality, a FORMAT from the real catalog, configure the bouts with
// steppers (NO free text — only the editable title), run it through the EXISTING
// live engine, and it saves as a "libre / no prescrito" session that reaches the
// coach.
//
// This file is the build-right core: ONE draft model whose every field maps to a
// real `Prescription` field (zero free-text dosage), and a payload/API that reuse
// the SAME execution fields the prescribed path sends (RPE, durations, scores,
// segments) PLUS title/modality/prescription. The prescribed path is untouched.

// MARK: - Modality (the 4 MEASURED disciplines in scope)
//
// Fuerza / Funcional need a catalog exercise picker (out of scope this pass), so
// they are NOT buildable here — the builder shows them disabled ("Próximamente")
// rather than fabricating a workout from nothing.
enum FreeModality: String, CaseIterable, Identifiable {
    case row, run, ski, bike
    var id: String { rawValue }

    /// The canonical `PrescriptionModality` this maps to (drives the wire value
    /// + the erg /500m vs run /km pace convention).
    var prescription: PrescriptionModality {
        switch self {
        case .row:  return .row
        case .run:  return .run
        case .ski:  return .ski
        case .bike: return .bike
        }
    }

    /// Wire modality string for the free-save contract ("row"|"run"|"ski"|"bike").
    var wire: String { prescription.rawValue }

    /// Live-execution segment kind. The erg trio share the PM5-fed `rowOrSki`
    /// grid; run gets the distance/pace grid. (Ski/bike collapse onto the row lap
    /// modality — a known follow-up; the FREE payload's top-level `modality` still
    /// carries the true discipline so the coach reads it correctly.)
    var segmentKind: SegmentKind {
        self == .run ? .running : .rowOrSki
    }

    var labelES: String {
        switch self {
        case .row:  return "Remo"
        case .run:  return "Correr"
        case .ski:  return "Ski-Erg"
        case .bike: return "BikeErg"
        }
    }

    var icon: String {
        switch self {
        case .row:  return "figure.rower"
        case .run:  return "figure.run"
        case .ski:  return "figure.skiing.crosscountry"
        case .bike: return "figure.indoor.cycle"
        }
    }

    /// Pace unit convention: erg disciplines read /500m, run reads /km.
    var resolvedPaceUnit: PaceUnit { self == .run ? .perKm : .per500m }

    /// Athlete-facing pace unit suffix.
    var paceUnitLabel: String { self == .run ? "/km" : "/500m" }

    /// Sensible starting pace for the stepper (seconds per the modality's unit).
    /// Row 1:52/500m, ski 2:05/500m, bike 1:35/500m, run 5:00/km.
    var defaultPaceSeconds: Int {
        switch self {
        case .row:  return 112
        case .ski:  return 125
        case .bike: return 95
        case .run:  return 300
        }
    }

    /// Calories are an erg-monitor readout — not available for running.
    var supportsCalories: Bool { self != .run }
}

// MARK: - Format (the real catalog → Prescription scheme)
//
// The 6 athlete-buildable formats for measured work, each mapped to the canonical
// `PrescriptionScheme`. Series→intervals, Continuo→steady, EMOM→emom,
// AMRAP→amrap, For Time→for_time, Rondas→rounds.
enum FreeFormat: String, CaseIterable, Identifiable {
    case series, continuo, emom, amrap, forTime, rounds
    var id: String { rawValue }

    var scheme: PrescriptionScheme {
        switch self {
        case .series:   return .intervals
        case .continuo: return .steady
        case .emom:     return .emom
        case .amrap:    return .amrap
        case .forTime:  return .forTime
        case .rounds:   return .rounds
        }
    }

    var labelES: String {
        switch self {
        case .series:   return "Series"
        case .continuo: return "Continuo"
        case .emom:     return "EMOM"
        case .amrap:    return "AMRAP"
        case .forTime:  return "For Time"
        case .rounds:   return "Rondas"
        }
    }

    var subtitleES: String {
        switch self {
        case .series:   return "Repeticiones con descanso"
        case .continuo: return "Un esfuerzo sostenido"
        case .emom:     return "Cada minuto, en el minuto"
        case .amrap:    return "Máximo en un tiempo dado"
        case .forTime:  return "El trabajo, lo antes posible"
        case .rounds:   return "Rondas por tiempo"
        }
    }

    // Which configuration axes this format exposes in the bouts step.
    var usesRounds: Bool {
        switch self { case .series, .emom, .rounds: return true; default: return false }
    }
    var usesRest: Bool {
        switch self { case .series, .rounds: return true; default: return false }
    }
    var usesWindow: Bool { self == .amrap }
    var usesCadence: Bool { self == .emom }

    /// Label for the "rounds" stepper, which reads differently per format.
    var roundsLabel: String {
        switch self {
        case .emom:   return "Minutos"
        case .rounds: return "Rondas"
        default:      return "Series"
        }
    }
}

// MARK: - Measure & Target kind (the bout's "how much" × "how hard")

enum FreeMeasureKind: String, CaseIterable, Identifiable {
    case distance, time, calories
    var id: String { rawValue }
    var labelES: String {
        switch self {
        case .distance: return "Distancia"
        case .time:     return "Tiempo"
        case .calories: return "Calorías"
        }
    }
}

enum FreeTargetKind: String, CaseIterable, Identifiable {
    case pace, hrZone
    var id: String { rawValue }
    var labelES: String {
        switch self {
        case .pace:   return "Ritmo"
        case .hrZone: return "Zona FC"
        }
    }
}

// MARK: - BenchmarkFraming — how a benchmark attempt states its objective
//
// #Marcas — a benchmark is an ALL-OUT effort. There is no coach prescribing "hold
// 4:00/km" here: the athlete goes as hard as they can and the clock decides. So the
// ONLY honest objective is the athlete's OWN record ("a batir"), and when there
// isn't one yet there is NO objective at all — a default number invented by the app
// would be a lie the HUD then coaches against. (Alex's Cooper attempt shipped with
// the ROW default, 1:52, painted as "@ 1:52 /km" — faster than the 1 km world
// record. That is what this type exists to make impossible.)
enum BenchmarkFraming: Equatable {
    /// No comparable record yet. Nothing to beat → no objective is shown anywhere.
    case firstAttempt
    /// The record to beat, ALREADY formatted in the mark's own unit ("3:52", "2800 m").
    case toBeat(String)

    /// Block title in the pre-block gate — the athlete's "what am I here for".
    var blockTitle: String {
        switch self {
        case .firstAttempt:   return "Benchmark"
        case .toBeat(let pr): return "Benchmark · a batir \(pr)"
        }
    }

    /// Pedagogical context line on the plan (brief header).
    var blockContext: String {
        switch self {
        case .firstAttempt:   return "Benchmark · tu primera marca"
        case .toBeat(let pr): return "Benchmark · a batir \(pr)"
        }
    }
}

// MARK: - Steps / increments (named constants — no magic numbers)

enum FreeStep {
    static let distanceMeters = 50      // erg/run interval granularity
    static let workSeconds = 15         // a timed bout
    static let restSeconds = 15
    static let windowSeconds = 60       // AMRAP / steady window
    static let cadenceSeconds = 15      // EMOM interval cadence
    static let calories = 5
    static let paceSeconds = 1          // 1s pace granularity
    static let rounds = 1
}

// MARK: - FreeWorkoutDraft — the single editable form model
//
// Holds the union of bout parameters; the builder shows only the axes the chosen
// format exposes. `buildPrescription()` is the ONE place that turns the form into
// a real `Prescription` (zero free text), and `buildContext()` packages it with
// the runnable `WorkoutPlan` for the engine + the wire payload.
@Observable
final class FreeWorkoutDraft {
    /// #Marcas — a benchmark attempt reuses this exact draft, but it is NOT an
    /// "entreno libre" to the athlete: every label must say Benchmark. Present ⇔
    /// this draft IS a benchmark, and it carries the record to beat, so the two
    /// can never disagree.
    var benchmark: BenchmarkFraming? = nil
    var isBenchmark: Bool { benchmark != nil }

    /// Read-only on purpose: `selectModality` is the ONLY way in because choosing a
    /// discipline is also what seeds its pace. Assigning this directly is what left
    /// the row's 1:52/500m sitting on a running benchmark.
    private(set) var modality: FreeModality? = nil
    var format: FreeFormat? = nil

    var rounds: Int = 5
    var measureKind: FreeMeasureKind = .distance
    var distanceMeters: Int = 500
    var workSeconds: Int = 90           // a timed bout (Series-by-time / Continuo)
    var calories: Int = 15
    var restSeconds: Int = 90
    var windowSeconds: Int = 600        // AMRAP total window
    var cadenceSeconds: Int = 60        // EMOM "on the minute"
    /// The bout's objective, or nil for NO objective. The free builder always sets
    /// one (its form makes you pick) — an athlete-built bout without a "how hard"
    /// isn't a prescription. A BENCHMARK is the one legitimate nil: an all-out
    /// effort with no comparable record has nothing honest to aim at. Both
    /// `Prescription.target` and `PrescriptionSet.target` are already optional, on
    /// the wire too (`target: targetSchema.optional()`), so nil needs no contract change.
    var targetKind: FreeTargetKind? = .pace
    /// Seconds per the MODALITY's pace unit (run /km, erg /500m). 0 = unseeded:
    /// there is no such thing as a discipline-free default pace, and every read is
    /// behind a `modality` guard. `selectModality` seeds the real one.
    var paceSeconds: Int = 0
    var hrZone: Int = 2

    /// The ONLY free-text field in the whole flow. nil → the generated default.
    var titleEdited: String = ""

    static let maxTitle = 80

    // Selecting a modality seeds its natural pace + clears an unsupported measure.
    func selectModality(_ m: FreeModality) {
        modality = m
        paceSeconds = m.defaultPaceSeconds
        if !m.supportsCalories, measureKind == .calories { measureKind = .distance }
    }

    // MARK: Build — Prescription (the single source of truth)

    private func buildMeasure() -> Measure {
        switch measureKind {
        case .distance: return .distance(meters: Double(distanceMeters))
        case .time:     return .duration(seconds: workSeconds)
        case .calories: return .calories(calories)
        }
    }

    private func buildTarget() -> Target? {
        switch targetKind {
        case .pace:
            guard let modality, paceSeconds > 0 else { return nil }
            return .pace(unit: modality.resolvedPaceUnit, valueS: paceSeconds, minS: nil, maxS: nil)
        case .hrZone:
            return .hrZone(value: Double(hrZone), min: nil, max: nil)
        case nil:
            return nil
        }
    }

    /// The runnable, wire-canonical `Prescription`. nil until modality + format
    /// are chosen. Every format carries a complete param set; the objetivo (pace or
    /// HR zone) is present for everything the athlete or the coach PRESCRIBES, and
    /// absent only for a benchmark with no record to beat — see `BenchmarkFraming`.
    func buildPrescription() -> Prescription? {
        guard let modality, let format else { return nil }
        let measure = buildMeasure()
        let target = buildTarget()
        let pmod = modality.prescription

        switch format {
        case .series:
            let set = PrescriptionSet(measure: measure, target: target, modality: nil,
                                      restS: restSeconds, tempo: nil, note: nil)
            return Prescription(scheme: .intervals, modality: pmod, sets: [set],
                                rounds: rounds, workS: nil, restS: restSeconds, totalS: nil,
                                target: target, note: nil, start: nil, increment: nil)
        case .continuo:
            let set = PrescriptionSet(measure: measure, target: target, modality: nil,
                                      restS: nil, tempo: nil, note: nil)
            return Prescription(scheme: .steady, modality: pmod, sets: [set],
                                rounds: nil, workS: nil, restS: nil,
                                totalS: measureKind == .time ? workSeconds : nil,
                                target: target, note: nil, start: nil, increment: nil)
        case .emom:
            let set = PrescriptionSet(measure: measure, target: target, modality: nil,
                                      restS: nil, tempo: nil, note: nil)
            return Prescription(scheme: .emom, modality: pmod, sets: [set],
                                rounds: rounds, workS: cadenceSeconds, restS: nil, totalS: nil,
                                target: target, note: nil, start: nil, increment: nil)
        case .amrap:
            let set = PrescriptionSet(measure: measure, target: target, modality: nil,
                                      restS: nil, tempo: nil, note: nil)
            return Prescription(scheme: .amrap, modality: pmod, sets: [set],
                                rounds: nil, workS: nil, restS: nil, totalS: windowSeconds,
                                target: target, note: nil, start: nil, increment: nil)
        case .forTime:
            let set = PrescriptionSet(measure: measure, target: target, modality: nil,
                                      restS: nil, tempo: nil, note: nil)
            return Prescription(scheme: .forTime, modality: pmod, sets: [set],
                                rounds: nil, workS: nil, restS: nil, totalS: nil,
                                target: target, note: nil, start: nil, increment: nil)
        case .rounds:
            let set = PrescriptionSet(measure: measure, target: target, modality: nil,
                                      restS: restSeconds, tempo: nil, note: nil)
            return Prescription(scheme: .rounds, modality: pmod, sets: [set],
                                rounds: rounds, workS: nil, restS: restSeconds, totalS: nil,
                                target: target, note: nil, start: nil, increment: nil)
        }
    }

    // MARK: Build — runnable WorkoutPlan (mirrors WorkoutPlan.from)
    //
    // A single "Libre" block, ONE segment carrying the built prescription (the
    // engine reads the scheme + per-interval sets from it) plus the scalar mirrors
    // the generic grids / preview gate read — exactly like `mergedConditioningSegment`.

    func buildContext() -> FreeWorkoutContext? {
        guard let modality, let format, let prescription = buildPrescription() else { return nil }

        let measure = buildMeasure()
        var distance: Double? = nil
        var duration: Int? = nil
        if case let .distance(m) = measure { distance = m }
        if case let .duration(s) = measure { duration = s }

        // Scalar pace stored as sec/KM (the segment convention; the erg grid halves
        // it for /500m). Only when the target is a pace.
        let paceSecPerKm: Int? = {
            guard targetKind == .pace, paceSeconds > 0 else { return nil }
            return modality.resolvedPaceUnit == .per500m ? paceSeconds * 2 : paceSeconds
        }()
        let zone: HRZone? = targetKind == .hrZone ? HRZone(rawValue: hrZone) : nil

        let segment = WorkoutSegment(
            order: 1,
            title: modality.labelES,
            kind: modality.segmentKind,
            targetReps: nil,
            targetDistanceMeters: distance,
            targetDurationSeconds: duration,
            targetPaceSecondsPerKm: paceSecPerKm,
            targetPowerWatts: nil,
            targetZone: zone,
            loadKg: nil,
            targetRpe: nil,
            blockTitle: benchmark?.blockTitle ?? "Libre",
            blockPosition: 1,
            videoUrl: nil,
            prescription: prescription
        )

        let plan = WorkoutPlan(
            id: UUID(),
            name: resolvedTitle,
            format: format.scheme,
            estimatedDurationSeconds: estimatedSeconds,
            blockContext: benchmark?.blockContext ?? "Libre · no prescrito",
            zoneTargets: [],
            equipment: [],
            segments: [segment],
            coachNote: nil,
            demoVideoUrl: nil,
            warmupChecklist: []
        )

        return FreeWorkoutContext(
            title: resolvedTitle,
            modalityWire: modality.wire,
            prescription: prescription,
            items: nil,
            plan: plan
        )
    }

    // MARK: Title

    var resolvedTitle: String {
        let t = titleEdited.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { return String(t.prefix(Self.maxTitle)) }
        return defaultTitle
    }

    var defaultTitle: String {
        guard let modality, format != nil else { return "Entreno libre" }
        return "\(modality.labelES) · \(compactSummary)"
    }

    // MARK: Preview ("Tu entreno")

    /// The live one-line preview shown under the bouts form, e.g.
    /// "5 × 500 m · r 1:30 · @ 1:52 /500m". Reuses `PrescriptionRenderer` so the
    /// strings read exactly like the rest of the app.
    var previewLine: String {
        guard let format else { return "" }
        let m = measureString
        let t = targetSuffix
        switch format {
        case .series:
            return "\(rounds) × \(m) · r \(PrescriptionRenderer.formatRest(restSeconds))\(t)"
        case .rounds:
            return "\(rounds) rondas · \(m) · r \(PrescriptionRenderer.formatRest(restSeconds))\(t)"
        case .emom:
            return "EMOM \(rounds) · cada \(PrescriptionRenderer.formatRest(cadenceSeconds)) · \(m)\(t)"
        case .amrap:
            return "AMRAP \(PrescriptionRenderer.formatClock(windowSeconds)) · \(m)\(t)"
        case .continuo:
            return "\(m)\(t)"
        case .forTime:
            return "For Time · \(m)\(t)"
        }
    }

    var measureString: String {
        switch measureKind {
        case .distance: return PrescriptionRenderer.formatDistance(Double(distanceMeters)) ?? "\(distanceMeters) m"
        case .time:     return PrescriptionRenderer.formatClock(workSeconds)
        case .calories: return "\(calories) cal"
        }
    }

    var targetString: String? {
        switch targetKind {
        case .pace:
            guard let modality else { return nil }
            return PrescriptionRenderer.paceString(buildTarget(), isErg: modality.prescription.isErg)
        case .hrZone:
            return HRZone(rawValue: hrZone)?.label
        case nil:
            return nil
        }
    }

    private var targetSuffix: String { targetString.map { " · \($0)" } ?? "" }

    private var compactSummary: String {
        guard let format else { return measureString }
        switch format {
        case .series:   return "\(rounds)×\(compactMeasure)"
        case .rounds:   return "\(rounds) rondas \(compactMeasure)"
        case .emom:     return "EMOM \(rounds)"
        case .amrap:    return "AMRAP \(PrescriptionRenderer.formatClock(windowSeconds))"
        case .continuo: return compactMeasure
        case .forTime:  return "For Time \(compactMeasure)"
        }
    }

    private var compactMeasure: String {
        switch measureKind {
        case .distance:
            if distanceMeters >= 1000 {
                let km = Double(distanceMeters) / 1000
                return km.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(km))k" : String(format: "%.1fk", km)
            }
            return "\(distanceMeters)m"
        case .time:     return PrescriptionRenderer.formatClock(workSeconds)
        case .calories: return "\(calories)cal"
        }
    }

    // Rough duration estimate for the brief/plan card. Best-effort; 0 when the
    // bout can't be timed (a calorie bout without a power model).
    var estimatedSeconds: Int {
        guard let format else { return 0 }
        switch format {
        case .series, .rounds: return rounds * (boutSeconds + restSeconds)
        case .emom:            return rounds * cadenceSeconds
        case .amrap:           return windowSeconds
        case .continuo:        return measureKind == .time ? workSeconds : boutSeconds
        case .forTime:         return boutSeconds
        }
    }

    private var boutSeconds: Int {
        switch measureKind {
        case .time: return workSeconds
        case .distance:
            guard targetKind == .pace, paceSeconds > 0, let modality else { return 0 }
            let unitMeters = modality.resolvedPaceUnit == .perKm ? 1000.0 : 500.0
            return Int(Double(distanceMeters) / unitMeters * Double(paceSeconds))
        case .calories:
            return 0
        }
    }
}

// MARK: - FreeWorkoutContext — what runs + what saves
//
// Packaged once by the builder and threaded through `WorkoutContainer` (free mode)
// into `PostWorkoutSummaryView`, which builds the `FreeWorkoutPayload` from the
// engine's measured metrics + these free-only fields.
//
// The MEASURED path (row/run/ski/bike) carries a single top-level `prescription`
// and no `items`. The FUERZA / FUNCIONAL path carries `items` (one built exercise/
// movement each) and no top-level `prescription` — mirroring the free-save contract
// where exactly one of the two is present.
struct FreeWorkoutContext {
    let title: String
    let modalityWire: String                    // "row"|"run"|"ski"|"bike"|"strength"|"functional"
    let prescription: Prescription?             // measured path only
    let items: [FreeWorkoutItemPayload]?        // fuerza / funcional only
    let plan: WorkoutPlan
    /// #8 — where a free RUN happens (cinta / calle), chosen in the builder. The
    /// container stamps it on the session so the right live HUD auto-opens on start.
    /// Nil for non-run modalities (defaulted so the fuerza/funcional builders are
    /// untouched).
    var runEnvironment: RunEnvironment? = nil
    /// #Marcas — set when this free session IS a benchmark attempt ("Probarme").
    /// The session runs and saves exactly like any free workout (the coach sees it);
    /// on a FULL finish the summary ALSO posts the measured value as a mark. Nil for
    /// every ordinary free workout — the existing builders never touch it.
    var benchmark: BenchmarkTag? = nil

    /// A FUNCIONAL started as a bare CRONÓMETRO — the athlete picked a format, hit
    /// Empezar and declared no movements. Derived, not stored: functional + no items
    /// IS that state, so the two can never disagree. The summary uses it to offer
    /// the one-tap "¿qué hiciste?" step AFTER the work instead of demanding it before.
    var awaitsMovementDeclaration: Bool {
        modalityWire == PrescriptionModality.functional.rawValue && items == nil
    }

    /// The folded prescription the live engine actually ran — the single source for
    /// the scheme + block params a post-hoc declaration must reuse, so movements
    /// named afterwards carry the SAME structure as ones named up front.
    var ranPrescription: Prescription? { plan.segments.first?.prescription }
}

/// #Marcas — what the post-workout save needs to turn a finished benchmark session
/// into a mark. `valueKind` decides what the value IS: the work bout's elapsed time
/// (every time trial) or its covered distance (Cooper — fixed 12 min, meters scored).
struct BenchmarkTag {
    enum ValueKind { case time, distance }
    let slug: String
    let valueKind: ValueKind
    // Calle/cinta is NOT stored here: the brief's pre-start decides it and the
    // session carries it — the save reads session.runEnvironment. One source.
}

// MARK: - FreeWorkoutPayload — the FROZEN free-save contract
//
// POST /api/athlete/workouts/free (bearer = athlete). Adds title/modality/
// prescription (measured) OR title/modality/items (fuerza·funcional) to the SAME
// execution fields the prescribed path sends (RPE, durations, scores, segments).
// Property names are explicit snake_case — the `.convertToSnakeCase` encoder leaves
// them unchanged (including `exercise_id` inside each item), and converts the nested
// `Prescription`'s camelCase keys (workS→work_s, restS→rest_s, valueS→value_s) to
// the canonical wire shape.
//
// Exactly ONE of `prescription` / `items` is present: the measured path sends the
// top-level `prescription` (items nil); fuerza·funcional send `items` (1..12, in
// execution order) with `prescription` omitted. Both are Optional so the encoder
// drops whichever is nil.
struct FreeWorkoutPayload: Codable {
    let title: String
    let modality: String
    let prescription: Prescription?
    let items: [FreeWorkoutItemPayload]?
    let perceived_exertion: Int?
    let total_duration_seconds: Int?
    let notes: String?
    let source: String?                // PM5 not live → "manual"
    let score_time_s: Int?
    let score_rounds: Int?
    let score_reps: Int?
    let completeness: String?          // "full" | "partial"
    let started_at: String?
    let ended_at: String?
    let segments: [SegmentExecutionDTO]?
}

// Offline-first sync for a free workout. Mirrors `WorkoutExecutionAPI`: POST, and
// on any failure enqueue for replay through the shared RequestQueue so closing the
// summary is never blocked by network. The replay body is encoded with the SAME
// snake_case strategy as the live POST (the nested Prescription carries camelCase
// Swift keys, so a default encoder would desync them).
enum FreeWorkoutAPI {
    static let path = "/api/athlete/workouts/free"

    static func submit(_ payload: FreeWorkoutPayload, bearer: String?) async {
        do {
            try await APIClient.shared.postRaw(path: path, body: payload, bearer: bearer)
        } catch {
            // AUDIT — a deterministic 4xx is never queued (it would replay forever).
            let enc = JSONEncoder()
            enc.keyEncodingStrategy = .convertToSnakeCase
            enc.dateEncodingStrategy = .iso8601
            if RequestQueue.isRetriable(error), let body = try? enc.encode(payload) {
                await RequestQueue.shared.enqueue(path: path, body: body, bearer: bearer)
            }
        }
    }
}
