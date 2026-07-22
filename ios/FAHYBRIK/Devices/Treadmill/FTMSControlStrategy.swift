import Foundation

// The two INDEPENDENT axes of "does this belt obey", split apart after the TM2000
// field failure. Conflating them is what locked the app into a dialect that couldn't work.
//
//   1. STRATEGY (this file, S1…S5) — the PRELUDE a machine needs before it honours a
//      target write. Purely a protocol question.
//   2. INCLINE DIALECT (this file) — what the FTMS Inclination field MEANS on this
//      machine: real grade × 0.1 %, or an internal 0…1000 value that maps to console
//      levels. Purely a UNITS question.
//
// They used to be ONE enum (`FTMSControlProfile.iConcept` implied BOTH "bare targets"
// AND "incline is levels"), so escalating the prelude would have silently changed the
// displayed incline units — which is why the code was pinned to a single dialect with no
// fallback, and why nothing moved. Separated, each axis is resolved EMPIRICALLY against
// the same signal: did the machine actually do the thing we asked?

/// The machine FAMILY, detected from its advertised name. It no longer decides how we
/// talk to the belt — only where on the ladder we START and which incline reading is
/// worth trying second.
enum FTMSControlProfile: String, Equatable {
    /// Anything that isn't a recognised family. Spec-clean assumptions.
    case standard
    /// BH / Exercycle i.Concept 3.0 — the `T01_*` advertisers (his Titanium TM2000
    /// shows as `T01_BD37E`). Notable ONLY because qdomyos-zwift keeps a console-level
    /// inclination table for it, which we now hold as a FALLBACK interpretation rather
    /// than as truth.
    case iConcept

    var label: String {
        switch self {
        case .standard: return "FTMS estándar"
        case .iConcept: return "i.Concept (BH/Exercycle)"
        }
    }

    /// `T01_*` is the i.Concept 3.0 advertising family; qdomyos-zwift routes the same
    /// prefix to its dedicated profile.
    static let iConceptNamePrefix = "t01_"

    /// Peripheral / advertised name → family. Case-insensitive, whitespace-tolerant.
    static func detect(name: String?) -> FTMSControlProfile {
        guard let n = name?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              n.hasPrefix(iConceptNamePrefix) else { return .standard }
        return .iConcept
    }

    /// The order in which prelude strategies are tried for this family. EVERY family
    /// walks the WHOLE ladder — the previous "i.Concept never escalates" rule is exactly
    /// what left a wrong guess with no way out. The order only encodes what is most
    /// likely to work FIRST, so the athlete's first tap usually lands.
    ///
    /// Both families lead with S2 (Request Control → target): it is what the FTMS spec
    /// mandates ("Each procedure … requires control permission", §4.16.2.1) and what the
    /// Titanium T-200 / TM2000T vendor documentation prescribes. i.Concept tries the bare
    /// target (S1) second, since qdomyos-zwift's i.Concept path sends targets bare.
    var strategyLadder: [FTMSControlStrategy] {
        switch self {
        case .standard: return [.s2, .s3, .s4, .s5, .s1]
        case .iConcept: return [.s2, .s1, .s3, .s4, .s5]
        }
    }

    /// Which incline interpretation to try, in order.
    ///
    /// STANDARD: grade first (the spec meaning of the field), the level table as a fallback
    /// if the belt ignores a grade write — resolved empirically, as before.
    ///
    /// i.CONCEPT / T01_: LOCKED to the level table, one rung, no fallback. Field-proven: his
    /// TM2000 accepts 0x03 and physically moves, but reports/accepts the Inclination field in
    /// INTERNAL 0…1000 units, not 0.1 % grade. Leaving grade on the ladder is exactly what
    /// produced the confusing MID-SESSION flip ("reinterpretada como nivel de consola") the
    /// athlete saw — grade would 5 s later escalate to level, changing the units under him.
    /// One encoding, chosen at connect, kept for the whole session.
    var inclineDialectLadder: [FTMSInclineDialect] {
        switch self {
        case .standard: return [.grade, .level]
        case .iConcept: return [.level]
        }
    }
}

/// One rung of the prelude ladder. The belt is the authority: we climb until something
/// actually moves, then stay there for the rest of the session.
enum FTMSControlStrategy: String, CaseIterable, Equatable {
    /// Bare target write, no prelude at all.
    case s1
    /// Request Control (0x00), WAIT for its `80 00 01` indication, then the target.
    /// One request per grant, per spec §4.16.2.1 — permission lasts until the link drops,
    /// a Reset, or a Control Permission Lost status.
    case s2
    /// Request Control + Start/Resume (0x07) before EVERY target, fire-and-forget —
    /// qdomyos-zwift's battle-tested hammer for firmwares that quietly drop permission.
    case s3
    /// The hammer plus a settling delay before the target: some firmwares accept the
    /// Start and then reject anything arriving in the same breath.
    case s4
    /// Last resort: Reset (0x01) → Request Control → Start → target, all waited. Clears a
    /// machine wedged in a state it will not leave.
    case s5

    /// Short rung name — what the trace and the field-diagnosis screen show.
    var rung: String { rawValue.uppercased() }

    /// One line the athlete (and we) can read in the trace.
    var label: String {
        switch self {
        case .s1: return "S1 · objetivo a pelo"
        case .s2: return "S2 · pedir control → objetivo"
        case .s3: return "S3 · pedir control + arrancar → objetivo"
        case .s4: return "S4 · pedir control + arrancar + pausa → objetivo"
        case .s5: return "S5 · reset + pedir control + arrancar → objetivo"
        }
    }

    /// The literal bytes this rung puts on the wire before a 5 km/h target — so the trace
    /// can be compared, byte for byte, against a manual write in nRF Connect.
    var wireHint: String {
        switch self {
        case .s1: return "02 F4 01"
        case .s2: return "00  ·  (espera 80 00 01)  ·  02 F4 01"
        case .s3: return "00  ·  07  ·  02 F4 01"
        case .s4: return "00  ·  07  ·  (300 ms)  ·  02 F4 01"
        case .s5: return "01  ·  00  ·  07  ·  02 F4 01"
        }
    }
}

/// How the FTMS Inclination field (0x2ACD reading AND 0x2AD9 op 0x03 write) is ENCODED on
/// this machine. Both dialects express the same athlete-facing quantity — a PERCENT GRADE —
/// and differ only in the wire units; resolved by asking for a value and watching the belt.
enum FTMSInclineDialect: String, Equatable {
    /// The spec encoding: sint16, 0.1 % grade. `3.0 %` → raw 30.
    case grade
    /// The i.Concept internal encoding: the SAME percent grade, carried as an 0…1000 value.
    /// It is a percent, not an abstract detent — the belt's own Supported Inclination Range
    /// (0x2AD5) reports 1.0–15.0 %, qdomyos-zwift stores it as Inclination 1…15, and its 15
    /// console levels line up one-to-one with 1…15 % (level N ≈ N %). So `3 %` → the level-3
    /// slot → raw 200, via `FTMSInclineLevels`. Whole-percent detents; no sub-% resolution.
    case level

    var label: String {
        switch self {
        case .grade: return "% de pendiente (0,1 % por unidad, estándar FTMS)"
        case .level: return "% de pendiente (unidades internas i.Concept 0–1000)"
        }
    }

    /// The stepper caption + unit, per the RESOLVED dialect. A spec-clean belt drives a
    /// percent grade → "Inclinación" / "%". The i.Concept only answers in console LEVELS
    /// (0–1000 internal), so we show a bare "Nivel" and never fabricate a percent we
    /// haven't verified maps 1:1 to the physical grade — honesty over a made-up number.
    var controlLabel: String { self == .level ? "Nivel" : "Inclinación" }
    var controlUnit: String { self == .level ? "" : "%" }

    /// The command that expresses `value` in THIS dialect — one place decides, so the
    /// stepper, the countdown start and a dialect flip can never disagree.
    func command(for value: Double) -> TreadmillControlCommand {
        self == .level ? .setTargetInclineLevel(value) : .setTargetInclinePct(value)
    }

    /// The raw Inclination-field number this dialect writes for `value` — the figure we
    /// then watch the machine report back to decide whether the dialect was right.
    func rawValue(for value: Double) -> Int {
        self == .level ? FTMSInclineLevels.raw(forLevel: value) : Int((value * 10).rounded())
    }

    /// A raw field reading expressed as a PERCENT grade for the HUD — directly for `.grade`
    /// (raw ÷ 10), and via the i.Concept table for `.level` (where the level number IS the
    /// percent, so `level(forRaw:)` already yields %).
    func display(fromRaw raw: Double) -> Double {
        self == .level ? FTMSInclineLevels.level(forRaw: raw) : raw / 10
    }
}
