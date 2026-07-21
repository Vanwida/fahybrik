import Foundation

// MARK: - Prescription — the STRUCTURED, typed per-set dosage model
//
// iOS Codable mirror of `shared/domain/prescription/types.ts` (the single source
// of truth for the wire shape). The backend ships this verbatim as
// `prescription_json` on every assignment-detail item; until now iOS never
// decoded it and flattened everything to the scalar `WorkoutItemParams`, losing
// per-set pyramids (10/10/8/8/6 @ 60→75%RM), ranges (70-80%), per-set
// rest/RPE/tempo, and ergo/run targets (pace /500m, /km, zone).
//
// WIRE / DECODER CONTRACT
// -----------------------
// APIClient decodes with `JSONDecoder.KeyDecodingStrategy.convertFromSnakeCase`,
// so the wire's snake_case keys (`work_s`, `value_s`, `min_s`, `hr_zone`) are
// rewritten to camelCase (`workS`, `valueS`, `minS`, `hrZone`) BEFORE matching
// CodingKeys. Therefore the Swift property names below are camelCase and need NO
// explicit CodingKeys for the plain fields. The two discriminated unions
// (`Measure`, `Target`) hand-roll `init(from:)` keyed off the `kind` literal.
//
// TOLERANCE: every field is optional where the TS type is optional, and the
// unions degrade to `.unknown` on an unrecognized `kind` rather than throwing —
// so a legacy item or a future server-side kind never crashes the decode.

struct Prescription: Codable, Equatable {
    let scheme: PrescriptionScheme
    let modality: PrescriptionModality?
    let sets: [PrescriptionSet]?
    let rounds: Int?
    let workS: Int?
    let restS: Int?
    let totalS: Int?
    let target: Target?
    let note: String?
    /// Death By progression: the starting work count (`start`) and the per-round
    /// increment (`increment`) — e.g. "minute 1: 1 rep, +1 each minute". Plain
    /// single-word keys on the wire, so `convertFromSnakeCase` leaves them
    /// unchanged (no explicit CodingKeys). Optional so older cached snapshots,
    /// and every non-`death_by` scheme, still decode.
    let start: Int?
    let increment: Int?
    /// The STRUCTURED running grammar (#61) — a phased tree of work/recovery
    /// segments with per-bout measure/target/incline/cadence (see RunStructure.swift).
    /// ADDITIVE to the wire: a block that carries `structure` ALSO carries the flat
    /// legacy fields above, so the scalar path is always the floor. `var` with a
    /// default so every existing `Prescription(...)` call-site (folds + tests) keeps
    /// compiling and cached snapshots without it still decode. Decoded TOLERANTLY
    /// (see the extension) — a malformed structure degrades to nil, never failing
    /// the whole item.
    var structure: RunStructure? = nil
}

// Custom decode kept in an EXTENSION so the compiler still synthesizes the
// memberwise init (all the folds + tests build the Prescription directly) and the
// Encodable conformance. The ONLY reason to hand-roll the decode is TOLERANCE for
// `structure`: it is parsed with `try?` so a truncated / future-shaped structure
// degrades to nil and the legacy flatten stays the floor, instead of failing the
// whole assignment item. Every other field decodes exactly as the synthesized
// version would (optionals via decodeIfPresent, `scheme` via its tolerant init).
extension Prescription {
    enum CodingKeys: String, CodingKey {
        case scheme, modality, sets, rounds, workS, restS, totalS, target, note, start, increment, structure
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        scheme = try c.decode(PrescriptionScheme.self, forKey: .scheme)
        modality = try c.decodeIfPresent(PrescriptionModality.self, forKey: .modality)
        sets = try c.decodeIfPresent([PrescriptionSet].self, forKey: .sets)
        rounds = try c.decodeIfPresent(Int.self, forKey: .rounds)
        workS = try c.decodeIfPresent(Int.self, forKey: .workS)
        restS = try c.decodeIfPresent(Int.self, forKey: .restS)
        totalS = try c.decodeIfPresent(Int.self, forKey: .totalS)
        target = try c.decodeIfPresent(Target.self, forKey: .target)
        note = try c.decodeIfPresent(String.self, forKey: .note)
        start = try c.decodeIfPresent(Int.self, forKey: .start)
        increment = try c.decodeIfPresent(Int.self, forKey: .increment)
        structure = try? c.decodeIfPresent(RunStructure.self, forKey: .structure)
    }
}

// MARK: - Scheme — the SINGLE unified workout-format enum
//
// One enum, decoded from `prescription_json.scheme` AND built from the DB block
// `template_format` string (via `WorkoutPlan.workoutFormat`). Mirrors the
// canonical catalog in `shared/domain/.../format` — the single source of truth
// for the wire vocabulary. Raw values match the wire strings verbatim.

enum PrescriptionScheme: String, Codable, CaseIterable, Equatable {
    case forTime = "for_time"
    case amrap
    case emom
    case tabata
    case deathBy = "death_by"
    case intervals
    case steady
    case chipper
    case ladder
    case rounds
    case hyroxSim = "hyrox_sim"
    case sets
    case warmup
    case cooldown

    /// Canonicalize a raw wire string into a scheme, accepting BOTH the canonical
    /// rawValues and the legacy values still possibly on the wire — never losing a
    /// format silently. Returns nil only for a genuinely-unknown string, so callers
    /// that need an explicit (non-silent) decision can branch on it.
    ///
    /// Legacy map: strength_block / strength → .sets, tempo → .steady,
    /// circuit → .rounds, test → .forTime, interval (old singular) → .intervals.
    init?(canonicalizing raw: String) {
        if let direct = PrescriptionScheme(rawValue: raw) {
            self = direct
            return
        }
        switch raw {
        case "strength_block", "strength": self = .sets
        case "tempo":                      self = .steady
        case "circuit":                    self = .rounds
        case "test":                       self = .forTime
        case "interval":                   self = .intervals
        default:                           return nil
        }
    }

    // Tolerant decode: canonicalize legacy values, and degrade an unrecognized
    // scheme to `.sets` rather than failing the whole item (the renderer then
    // treats it as a plain per-set list).
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PrescriptionScheme(canonicalizing: raw) ?? .sets
    }

    /// True for the conditioning schemes rendered as a "WOD" block (format +
    /// cap/rounds + component list) rather than a per-set table. Kept EXACTLY as
    /// before the catalog expansion — only amrap/emom/forTime — so existing
    /// formats are byte-for-byte unchanged; new schemes fall to the per-set path.
    var isWOD: Bool {
        switch self {
        case .amrap, .emom, .forTime: return true
        default: return false
        }
    }

    /// True for the metcon / conditioning family — the schemes that earn an
    /// Rx / Scaled toggle on the execution record (a WOD is done "as prescribed"
    /// or "scaled"). Mirrors the family listed in the honest-logging contract.
    /// Per-set strength (`.sets`), steady/intervals endurance and warmup/cooldown
    /// are NOT metcons (their honesty lives in the per-set / per-segment values).
    var isMetconFamily: Bool {
        switch self {
        case .forTime, .amrap, .emom, .tabata, .deathBy,
             .chipper, .ladder, .rounds, .hyroxSim:
            return true
        case .intervals, .steady, .sets, .warmup, .cooldown:
            return false
        }
    }

    /// True when reps ARE the score (the athlete counts UP from 0 across the
    /// piece, a real 0 is legal) rather than a fixed prescribed chunk to hit
    /// once. AMRAP is the canonical case: per-movement reps accumulate into the
    /// round score, so they must never be pre-filled to the prescription.
    var repsAreOpenScore: Bool { self == .amrap }

    /// How the live timer/HUD presents this format — the iOS mirror of the
    /// canonical `presentation` axis in `shared/domain/prescription/format.ts`
    /// (single source of truth). Drives BOTH the block fold (which conditioning
    /// blocks collapse into one block-level segment) AND the live-HUD routing.
    var presentation: FormatPresentation {
        switch self {
        case .emom, .tabata, .deathBy, .intervals:        return .rotating
        case .forTime, .amrap, .chipper, .ladder, .rounds, .hyroxSim: return .fixed
        case .steady:                                     return .continuous
        case .sets:                                       return .setTable
        case .warmup, .cooldown:                          return .list
        }
    }

    /// True for the formats that run a block-level conditioning TIMER (rotating /
    /// fixed / continuous) — every metcon + endurance scheme. These collapse a
    /// multi-movement block into ONE block-level segment (the round/list shown at
    /// once) and route to a dedicated live timer, never the per-set / structural
    /// path. EMOM is conditioning too but keeps its own dedicated engine, so it is
    /// excluded here (callers check `isEMOM`/`emom` separately).
    var runsConditioningTimer: Bool {
        switch presentation {
        case .rotating, .fixed, .continuous: return true
        case .setTable, .list:               return false
        }
    }

    /// Athlete-facing label, mirroring the canonical catalog. `.sets` reads as
    /// "Strength" (its real-world role); warmup/cooldown as "Warm-up"/"Cool-down".
    var displayName: String {
        switch self {
        case .forTime:  return "For Time"
        case .amrap:    return "AMRAP"
        case .emom:     return "EMOM"
        case .tabata:   return "Tabata"
        case .deathBy:  return "Death By"
        case .intervals: return "Intervals"
        case .steady:   return "Steady"
        case .chipper:  return "Chipper"
        case .ladder:   return "Ladder"
        case .rounds:   return "Rounds"
        case .hyroxSim: return "HYROX Sim"
        case .sets:     return "Strength"
        case .warmup:   return "Warm-up"
        case .cooldown: return "Cool-down"
        }
    }
}

/// The presentation family of a format — the iOS mirror of `FormatPresentation`
/// in `shared/domain/prescription/format.ts`. ROTATING = the clock drives the
/// screen forward (EMOM, Tabata, Intervals, Death By); FIXED = the whole round is
/// shown and repeated, the screen never advances (AMRAP, For Time, Chipper,
/// Ladder, Rounds, HYROX sim); CONTINUOUS = one unbroken bout (Steady); SET_TABLE
/// = the per-set strength table; LIST = a plain checklist (warm-up / cool-down).
enum FormatPresentation: Equatable {
    case rotating
    case fixed
    case continuous
    case setTable
    case list
}

// MARK: - Modality

enum PrescriptionModality: String, Codable, Equatable {
    case run
    case row
    case ski
    case bike
    case strength
    case functional
    case core
    case mobility
    case other

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PrescriptionModality(rawValue: raw) ?? .other
    }

    /// row/ski/bike — the erg disciplines whose pace conventionally reads /500m.
    var isErg: Bool {
        switch self {
        case .row, .ski, .bike: return true
        default: return false
        }
    }
}

// MARK: - Measure (the WORK done in a set — "how much")

enum Measure: Equatable {
    case reps(Int)
    case distance(meters: Double)
    case duration(seconds: Int)
    case calories(Int)
    /// Unrecognized / malformed kind — kept so an unknown future measure never
    /// crashes the decode; the renderer simply skips it.
    case unknown

    private enum CodingKeys: String, CodingKey {
        case kind, value, meters, seconds
    }
}

extension Measure: Codable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = (try? c.decode(String.self, forKey: .kind)) ?? ""
        switch kind {
        case "reps":
            self = .reps(Int((try? c.decode(Double.self, forKey: .value)) ?? 0))
        case "distance":
            self = .distance(meters: (try? c.decode(Double.self, forKey: .meters)) ?? 0)
        case "duration":
            self = .duration(seconds: Int((try? c.decode(Double.self, forKey: .seconds)) ?? 0))
        case "calories":
            self = .calories(Int((try? c.decode(Double.self, forKey: .value)) ?? 0))
        default:
            self = .unknown
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .reps(let v):
            try c.encode("reps", forKey: .kind); try c.encode(v, forKey: .value)
        case .distance(let m):
            try c.encode("distance", forKey: .kind); try c.encode(m, forKey: .meters)
        case .duration(let s):
            try c.encode("duration", forKey: .kind); try c.encode(s, forKey: .seconds)
        case .calories(let v):
            try c.encode("calories", forKey: .kind); try c.encode(v, forKey: .value)
        case .unknown:
            break
        }
    }
}

// MARK: - PaceUnit

enum PaceUnit: String, Codable, Equatable {
    case perKm = "per_km"
    case per500m = "per_500m"
    case perMile = "per_mile"
}

// MARK: - Target (the INTENSITY objective — "how hard / against what")
//
// A range-capable discriminated union. A target is either a single point
// (`value` / `valueS`) OR a range (`min`/`max` / `minS`/`maxS`).

enum Target: Equatable {
    case percentRM(value: Double?, min: Double?, max: Double?)
    case kg(value: Double?, min: Double?, max: Double?)
    case rpe(value: Double?, min: Double?, max: Double?)
    case rir(value: Double?, min: Double?, max: Double?)
    case bodyweight
    case pace(unit: PaceUnit, valueS: Int?, minS: Int?, maxS: Int?)
    case hrZone(value: Double?, min: Double?, max: Double?)
    case hrBpm(value: Double?, min: Double?, max: Double?)
    case calories(value: Double?, min: Double?, max: Double?)
    /// Erg POWER objective in watts (#erg-3). Mirrors the web `{ kind: 'watts' }`
    /// target; without this case the wire value decoded to `.unknown` and the power
    /// HUD branch stayed dead. `value` (point) or `min`/`max` (band).
    case watts(value: Double?, min: Double?, max: Double?)
    /// Unrecognized / malformed kind — never crashes the decode.
    case unknown

    private enum CodingKeys: String, CodingKey {
        case kind, value, min, max, unit
        // `value_s` / `min_s` / `max_s` arrive camelCased by convertFromSnakeCase.
        case valueS, minS, maxS
    }
}

extension Target: Codable {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = (try? c.decode(String.self, forKey: .kind)) ?? ""
        let value = try? c.decode(Double.self, forKey: .value)
        let min = try? c.decode(Double.self, forKey: .min)
        let max = try? c.decode(Double.self, forKey: .max)
        switch kind {
        case "percent_rm": self = .percentRM(value: value, min: min, max: max)
        case "kg":         self = .kg(value: value, min: min, max: max)
        case "rpe":        self = .rpe(value: value, min: min, max: max)
        case "rir":        self = .rir(value: value, min: min, max: max)
        case "bodyweight": self = .bodyweight
        case "hr_zone":    self = .hrZone(value: value, min: min, max: max)
        case "hr_bpm":     self = .hrBpm(value: value, min: min, max: max)
        case "calories":   self = .calories(value: value, min: min, max: max)
        case "watts":      self = .watts(value: value, min: min, max: max)
        case "pace":
            let unit = (try? c.decode(PaceUnit.self, forKey: .unit)) ?? .perKm
            let valueS = (try? c.decode(Double.self, forKey: .valueS)).map { Int($0) }
            let minS = (try? c.decode(Double.self, forKey: .minS)).map { Int($0) }
            let maxS = (try? c.decode(Double.self, forKey: .maxS)).map { Int($0) }
            self = .pace(unit: unit, valueS: valueS, minS: minS, maxS: maxS)
        default:
            self = .unknown
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        func scalar(_ kind: String, _ value: Double?, _ min: Double?, _ max: Double?) throws {
            try c.encode(kind, forKey: .kind)
            try c.encodeIfPresent(value, forKey: .value)
            try c.encodeIfPresent(min, forKey: .min)
            try c.encodeIfPresent(max, forKey: .max)
        }
        switch self {
        case let .percentRM(v, mn, mx): try scalar("percent_rm", v, mn, mx)
        case let .kg(v, mn, mx):        try scalar("kg", v, mn, mx)
        case let .rpe(v, mn, mx):       try scalar("rpe", v, mn, mx)
        case let .rir(v, mn, mx):       try scalar("rir", v, mn, mx)
        case .bodyweight:               try c.encode("bodyweight", forKey: .kind)
        case let .hrZone(v, mn, mx):    try scalar("hr_zone", v, mn, mx)
        case let .hrBpm(v, mn, mx):     try scalar("hr_bpm", v, mn, mx)
        case let .calories(v, mn, mx):  try scalar("calories", v, mn, mx)
        case let .watts(v, mn, mx):     try scalar("watts", v, mn, mx)
        case let .pace(unit, vS, mnS, mxS):
            try c.encode("pace", forKey: .kind)
            try c.encode(unit, forKey: .unit)
            try c.encodeIfPresent(vS, forKey: .valueS)
            try c.encodeIfPresent(mnS, forKey: .minS)
            try c.encodeIfPresent(mxS, forKey: .maxS)
        case .unknown:
            break
        }
    }
}

// MARK: - PrescriptionSet (one explicit set / round)

struct PrescriptionSet: Codable, Equatable {
    let measure: Measure?
    let target: Target?
    let modality: PrescriptionModality?
    let restS: Int?
    let tempo: String?
    let note: String?
}

// MARK: - PrescriptionSet → prescribed scalars (per-set strength logging)
//
// The honest per-set logger pre-fills each set from its prescription. These pull
// the concrete numbers it needs (reps, a real kg load, an RPE/RIR objective)
// from the typed `measure` / `target` without re-deriving the renderer's strings.
extension PrescriptionSet {
    /// Prescribed reps for this set (the `.reps` measure), nil for distance /
    /// duration / calorie work.
    var prescribedReps: Int? {
        if case let .reps(v) = measure, v > 0 { return v }
        return nil
    }

    /// Prescribed ABSOLUTE load in kg — only when the target is an explicit `kg`
    /// objective (a single value, else the low end of a range). A `%RM` / RPE /
    /// bodyweight target carries no absolute kg, so it stays nil (the athlete
    /// logs the real load they used).
    var prescribedLoadKg: Double? {
        if case let .kg(value, min, _) = target { return value ?? min }
        return nil
    }

    /// Prescribed RPE objective, when the target is `.rpe` (value, else low end).
    var prescribedRpe: Double? {
        if case let .rpe(value, min, _) = target { return value ?? min }
        return nil
    }

    /// Prescribed RIR objective, when the target is `.rir` (value, else low end).
    var prescribedRir: Double? {
        if case let .rir(value, min, _) = target { return value ?? min }
        return nil
    }
}

extension Prescription {
    /// #erg-3: the prescribed erg POWER in WATTS — from the block-level target, else
    /// the first set carrying a `.watts` objective. The primary source for a segment's
    /// `targetPowerWatts` (the scalar `params_json.watts` is a lossy mirror). nil when
    /// no watts target is prescribed (then the HUD shows no power target, not a fake 0).
    var wattsTarget: Int? {
        func watts(_ t: Target?) -> Int? {
            guard case let .watts(value, min, _) = t, let v = value ?? min else { return nil }
            return Int(v.rounded())
        }
        if let block = watts(target) { return block }
        for s in sets ?? [] { if let x = watts(s.target) { return x } }
        return nil
    }
}
