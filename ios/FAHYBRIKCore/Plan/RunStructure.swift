import Foundation

// MARK: - RunStructure — iOS Codable mirror of the structured running grammar (#61)
//
// Mirror of `shared/domain/prescription/run-structure.ts`. A structured run is a
// PHASED tree, not "N × X @ ritmo + descanso":
//   phases (warmup? · main · cooldown?)
//     → elements (Segment | Repeat, nesting depth ≤ 2)
//       → segment (work | recovery) carrying its OWN measure (distance m | duration
//         s), its OWN objetivo (pace | pace_zone | hr_zone | rpe | none), and
//         optional inclinación / cadencia guides + a recovery_mode.
//
// WIRE / DECODER CONTRACT
// -----------------------
// `structure` is an OPTIONAL field on `Prescription` (inside prescription_json),
// ADDITIVE to the wire: a block that carries `structure` ALSO carries the flat
// legacy fields, so this decode is a pure BONUS on top of the legacy path that has
// always worked. `APIClient` decodes with `convertFromSnakeCase`, so the wire's
// snake_case KEYS (`incline_pct`, `cadence_spm`, `recovery_mode`, `value_s`,
// `min_s`) arrive camelCased; the discriminator VALUES (`pace_zone`, `hr_zone`,
// `distance`, `recovery`…) are strings, untouched by key conversion, matched
// verbatim. Numeric fields are decoded STRICTLY as numbers (a real bug came from a
// string-vs-number mismatch) with a tolerant number-or-numeric-string fallback.
//
// TOLERANCE: an UNKNOWN discriminator degrades (`.unknown` measure/target) rather
// than throwing, and `Prescription` decodes the whole `structure` with `try?` — so
// a legacy item, a truncated payload, or a future server-side kind never crashes
// the decode; the app simply falls back to the legacy flatten (the floor).
//
// Native EXECUTION of this grammar (the expanded leg list driving the session +
// HUDs) lives in the expansion + bridge below and in `WorkoutSession`.

// ── Grammar types (the wire mirror) ──────────────────────────────────────────

enum RunPhaseRole: String, Codable, Equatable {
    case warmup, main, cooldown
}

/// How a segment's work is MEASURED. `distance` in metres, `duration` in seconds.
enum RunSegmentMeasure: Equatable {
    case distance(m: Int)
    case duration(s: Int)
    /// Unrecognized / malformed kind — kept so a future measure never crashes the
    /// decode; the execution bridge treats it as an `.open` (manual) leg.
    case unknown
}

/// How a recovery is taken. `parado` (standing rest) is timed → carries a duration.
/// `CaseIterable`/`Identifiable` para que el constructor pueda ofrecer los tres
/// sin redeclararlos: la lista de modos vive aquí y en ningún sitio más.
enum RunRecoveryMode: String, Codable, Equatable, CaseIterable, Identifiable {
    case trote, caminar, parado
    var id: String { rawValue }
}

/// WHAT the work targets. `pace` is per km; `paceZone`/`hrZone` are coach zones the
/// server resolves to an absolute band (see `RunSegment.resolved`); `rpe` is a
/// point or a band. `null` on the segment = no explicit objetivo (done by feel).
enum RunSegmentTarget: Equatable {
    case pace(valueS: Int?, minS: Int?, maxS: Int?) // seconds per km
    case paceZone(Int)                              // 1..5
    case hrZone(Int)                                // 1..5
    case rpe(value: Double?, min: Double?, max: Double?)
    /// Unrecognized target kind — never crashes; rendered as no objetivo.
    case unknown
}

/// One indivisible piece of the run: a work bout or a recovery.
struct RunSegment: Equatable {
    enum Kind: String, Codable, Equatable { case work, recovery }
    let kind: Kind
    let measure: RunSegmentMeasure
    let target: RunSegmentTarget?
    /// The ABSOLUTE pace band the BACKEND resolved from the athlete's zone profile
    /// for a `paceZone`/`hrZone` target — the SAME source as the item-level
    /// `resolvedIntensity` the athlete already sees. Nil when the target is not a
    /// zone or the athlete lacks the benchmark (the UI then shows the zone label
    /// alone, never a fabricated pace).
    let resolved: ResolvedIntensity?
    let inclinePct: Double?   // 0..15 — cinta / cuesta
    let cadenceSpm: Int?      // 120..220 — optional cadence guide
    let recoveryMode: RunRecoveryMode?
}

/// An element of a phase: a segment, or a "Repetir ×N" wrapping a sub-sequence.
indirect enum RunElement: Equatable {
    case segment(RunSegment)
    case repeatBlock(times: Int, elements: [RunElement])
}

/// A phase (warmup? · main · cooldown?) and its ordered elements.
struct RunPhase: Equatable {
    let role: RunPhaseRole
    let elements: [RunElement]
}

/// The whole structured run: 1..3 ordered phases.
typealias RunStructure = [RunPhase]

// ── Tolerant numeric decode (strict number, string-or-number fallback) ────────

private extension KeyedDecodingContainer {
    /// Decode a numeric field that must be a NUMBER, tolerating a numeric string
    /// (the string-vs-number footgun). Absent/unparseable → nil.
    func flexDouble(_ key: Key) -> Double? {
        if let d = try? decodeIfPresent(Double.self, forKey: key) { return d }
        if let s = try? decodeIfPresent(String.self, forKey: key), let v = Double(s) { return v }
        return nil
    }
    func flexInt(_ key: Key) -> Int? {
        flexDouble(key).map { Int($0.rounded()) }
    }
}

// ── Codable — hand-rolled for the unions + tolerance ──────────────────────────

extension RunSegmentMeasure: Codable {
    private enum CodingKeys: String, CodingKey { case type, m, s }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch (try? c.decode(String.self, forKey: .type)) ?? "" {
        case "distance": self = .distance(m: c.flexInt(.m) ?? 0)
        case "duration": self = .duration(s: c.flexInt(.s) ?? 0)
        default:         self = .unknown
        }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .distance(m): try c.encode("distance", forKey: .type); try c.encode(m, forKey: .m)
        case let .duration(s): try c.encode("duration", forKey: .type); try c.encode(s, forKey: .s)
        case .unknown:         try c.encode("unknown", forKey: .type)
        }
    }
}

extension RunSegmentTarget: Codable {
    private enum CodingKeys: String, CodingKey { case type, valueS, minS, maxS, zone, value, min, max }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch (try? c.decode(String.self, forKey: .type)) ?? "" {
        case "pace":      self = .pace(valueS: c.flexInt(.valueS), minS: c.flexInt(.minS), maxS: c.flexInt(.maxS))
        case "pace_zone": self = .paceZone(c.flexInt(.zone) ?? 0)
        case "hr_zone":   self = .hrZone(c.flexInt(.zone) ?? 0)
        case "rpe":       self = .rpe(value: c.flexDouble(.value), min: c.flexDouble(.min), max: c.flexDouble(.max))
        default:          self = .unknown
        }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .pace(v, mn, mx):
            try c.encode("pace", forKey: .type)
            try c.encodeIfPresent(v, forKey: .valueS)
            try c.encodeIfPresent(mn, forKey: .minS)
            try c.encodeIfPresent(mx, forKey: .maxS)
        case let .paceZone(z): try c.encode("pace_zone", forKey: .type); try c.encode(z, forKey: .zone)
        case let .hrZone(z):   try c.encode("hr_zone", forKey: .type); try c.encode(z, forKey: .zone)
        case let .rpe(v, mn, mx):
            try c.encode("rpe", forKey: .type)
            try c.encodeIfPresent(v, forKey: .value)
            try c.encodeIfPresent(mn, forKey: .min)
            try c.encodeIfPresent(mx, forKey: .max)
        case .unknown: try c.encode("unknown", forKey: .type)
        }
    }
}

extension RunSegment: Codable {
    private enum CodingKeys: String, CodingKey {
        case kind, measure, target, resolved, inclinePct, cadenceSpm, recoveryMode
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = (try? c.decode(Kind.self, forKey: .kind)) ?? .work
        measure = try c.decode(RunSegmentMeasure.self, forKey: .measure)
        target = try c.decodeIfPresent(RunSegmentTarget.self, forKey: .target)
        resolved = try? c.decodeIfPresent(ResolvedIntensity.self, forKey: .resolved)
        inclinePct = c.flexDouble(.inclinePct)
        cadenceSpm = c.flexInt(.cadenceSpm)
        recoveryMode = try? c.decodeIfPresent(RunRecoveryMode.self, forKey: .recoveryMode)
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(kind.rawValue, forKey: .kind)
        try c.encode(measure, forKey: .measure)
        try c.encodeIfPresent(target, forKey: .target)
        try c.encodeIfPresent(resolved, forKey: .resolved)
        try c.encodeIfPresent(inclinePct, forKey: .inclinePct)
        try c.encodeIfPresent(cadenceSpm, forKey: .cadenceSpm)
        try c.encodeIfPresent(recoveryMode, forKey: .recoveryMode)
    }
}

extension RunElement: Codable {
    // Segment and Repeat are structurally disjoint: a Repeat carries `times`, a
    // Segment does not. Detect the Repeat first, else decode a Segment.
    private enum CodingKeys: String, CodingKey { case times, elements }
    init(from decoder: Decoder) throws {
        if let c = try? decoder.container(keyedBy: CodingKeys.self),
           let times = c.flexInt(.times),
           let els = try? c.decode([RunElement].self, forKey: .elements) {
            self = .repeatBlock(times: times, elements: els)
        } else {
            self = .segment(try RunSegment(from: decoder))
        }
    }
    func encode(to encoder: Encoder) throws {
        switch self {
        case let .segment(seg):
            try seg.encode(to: encoder)
        case let .repeatBlock(times, els):
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(times, forKey: .times)
            try c.encode(els, forKey: .elements)
        }
    }
}

extension RunPhase: Codable {
    private enum CodingKeys: String, CodingKey { case role, elements }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        role = (try? c.decode(RunPhaseRole.self, forKey: .role)) ?? .main
        elements = try c.decode([RunElement].self, forKey: .elements)
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(role.rawValue, forKey: .role)
        try c.encode(elements, forKey: .elements)
    }
}

// MARK: - RunLeg — the expanded, execution-ready leg
//
// The session, the HUDs and the "Tramo N de M" counter all walk a FLAT ordered
// list of legs — one per work/recovery bout, repeats expanded, phases in order.
// This is the iOS mirror of `flattenSegments` in run-structure.ts (the single
// expansion), carrying each bout's OWN measure/target/incline/cadence so a
// heterogeneous pirámide (1200/1000/800) or a distance recovery (trota 200m) — the
// two documented treadmill seams — resolve per bout instead of degrading.

struct RunLeg: Equatable {
    enum Kind: String, Equatable { case work, recovery }
    let kind: Kind
    let measure: RunSegmentMeasure
    let target: RunSegmentTarget?
    let resolved: ResolvedIntensity?
    let inclinePct: Double?
    let cadenceSpm: Int?
    let recoveryMode: RunRecoveryMode?
    let phaseRole: RunPhaseRole

    var isWork: Bool { kind == .work }
    var isRecovery: Bool { kind == .recovery }

    /// El OFF se mide sólo si el coach lo escribió como movimiento
    /// (`trote` / `caminar`). Sin modo — el rest que el motor pega entre
    /// works, el `rest_s` del plano — es DESCANSO: el HUD lo dice y los
    /// metros de work no suman. Inventar un trote cuando nadie lo escribió
    /// era la part de más. `.parado` sigue siendo parado.
    var recuperaEnMovimiento: Bool {
        guard isRecovery, let mode = recoveryMode else { return false }
        return mode == .trote || mode == .caminar
    }
}

// Declared in an EXTENSION so the compiler still synthesizes the memberwise init
// every existing call site (and the tests) builds a leg with.
extension RunLeg {
    /// The execution-ready leg for one grammar segment. SINGLE source of the
    /// segment→leg projection: `expandedLegs()` (the flat list the live engine walks)
    /// and the WorkoutKit encoder (which keeps the Repeat GROUPING, so the wrist's
    /// native Workout app shows "×5" instead of five identical steps) both build
    /// their legs here — so the two views of the same run can never disagree about
    /// what a segment means.
    init(_ segment: RunSegment, phaseRole: RunPhaseRole) {
        self.init(
            kind: segment.kind == .recovery ? .recovery : .work,
            measure: segment.measure,
            target: segment.target,
            resolved: segment.resolved,
            inclinePct: segment.inclinePct,
            cadenceSpm: segment.cadenceSpm,
            recoveryMode: segment.recoveryMode,
            phaseRole: phaseRole
        )
    }
}

extension RunStructure {
    /// The FLAT, ordered leg list — each Repeat's body emitted `times` times,
    /// depth-first, phases in order. The single expansion the execution engine +
    /// HUDs read; mirrors shared `flattenSegments`.
    func expandedLegs() -> [RunLeg] {
        var out: [RunLeg] = []
        func walk(_ elements: [RunElement], _ role: RunPhaseRole) {
            for el in elements {
                switch el {
                case let .repeatBlock(times, els):
                    guard times > 0 else { continue }
                    for _ in 0..<times { walk(els, role) }
                case let .segment(seg):
                    out.append(RunLeg(seg, phaseRole: role))
                }
            }
        }
        for phase in self { walk(phase.elements, phase.role) }
        return out
    }
}

// MARK: - RunLeg → pure helpers (no treadmill / HUD dependency)
//
// These compile everywhere the shared workout engine does (phone AND watch). The
// treadmill/HUD BRIDGE (`goal` → SegmentGoal, `runTarget` → RunTarget/PaceTarget)
// lives in RunStructureExecution.swift, which is app-only because the RunTarget /
// PaceTarget / SegmentGoal types are (the watch has no treadmill HUD).

extension RunSegmentMeasure {
    /// The structured-run grammar carries its OWN measure union; el tramo en vivo y el
    /// formateador de dosis hablan la compartida (`Measure`). UNA conversión, aquí, en
    /// vez de un segundo `switch` en cada quien la necesite — vivía privada dentro de
    /// `WorkoutSession+Tramo` y la previa no podía leerla.
    var asMeasure: Measure? {
        switch self {
        case .distance(let m):  return .distance(meters: Double(m))
        case .duration(let s):  return .duration(seconds: s)
        case .unknown:          return nil
        }
    }
}

extension RunLeg {
    /// The distance goal in metres, when this leg is distance-measured (> 0), else nil.
    var distanceMeters: Int? {
        if case let .distance(m) = measure, m > 0 { return m }
        return nil
    }

    /// The duration goal in seconds, when this leg is duration-measured (> 0), else nil.
    var durationSeconds: Int? {
        if case let .duration(s) = measure, s > 0 { return s }
        return nil
    }

    /// True when the session's own clock closes this leg (a timed bout / rest); a
    /// distance leg instead waits for the belt / GPS / a manual "Serie hecha".
    var isTimed: Bool { durationSeconds != nil }

    /// RPE guidance ("RPE 8", "RPE 8-9") when the leg targets RPE, else nil.
    var rpeLabel: String? {
        guard case let .rpe(value, min, max) = target else { return nil }
        func fmt(_ d: Double) -> String { Formato.esDecimal(d) }
        if let lo = min, let hi = max { return "RPE \(fmt(lo))-\(fmt(hi))" }
        if let v = value ?? min ?? max { return "RPE \(fmt(v))" }
        return nil
    }

    /// Coach zone code ("Z3") for a pace/hr zone target, for a compact chip. Nil
    /// for pace / rpe / none.
    var zoneLabel: String? {
        switch target {
        case let .paceZone(z), let .hrZone(z): return "Z\(z)"
        default: return nil
        }
    }
}

// MARK: - Prescription / WorkoutSegment convenience

extension Prescription {
    /// The expanded run legs for this prescription's `structure`, or nil when the
    /// block carries no structure (legacy path). Empty legs are treated as no
    /// structure by callers.
    var runStructureLegs: [RunLeg]? {
        guard let s = structure, !s.isEmpty else {
            // Sin gramática nativa, la serie de correr se DERIVA de como la haya
            // escrito quien la escribiera: la tabla de `sets` del coach
            // (plantilla 314, «3x1000m») y las rondas de `intervals` del
            // constructor libre («5 × 800 m · r 1:30») dan la misma lista de
            // piernas. Sin esto, esas sesiones no tenían cursor de tramo y la
            // muñeca las pintaba como un rodaje o —peor— con el guion del reloj
            // de pared. Ver `RunPiernasDerivadas.swift`.
            return runLegsDerivadas
        }
        let legs = s.expandedLegs()
        guard !legs.isEmpty else { return nil }
        // `times: N` de solo work no es N esfuerzos pegados: entre ellos hay
        // descanso. Si el árbol ya trae recovery, no se toca. Si el plano
        // trae `restS`, esa es la duración. Si es una serie (intervals /
        // rounds) sin duración, el rest existe igual y se cierra a gesto.
        return Self.serieConRestEntreWorks(legs, restS: restS, scheme: scheme)
    }
}

extension WorkoutSegment {
    /// The expanded run legs this segment natively executes, or nil for a legacy /
    /// non-structured segment (which keeps the scalar rotating path unchanged).
    var runStructureLegs: [RunLeg]? { prescription?.runStructureLegs }

    /// True when this segment drives the native structured-run engine (it carries a
    /// valid, non-empty `structure`). Gates every structure code path so legacy
    /// execution is byte-for-byte unchanged.
    var hasRunStructure: Bool { runStructureLegs != nil }
}
