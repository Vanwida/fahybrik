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

    /// Which incline interpretation to try FIRST. Grade everywhere — it is the spec
    /// meaning of the field and what the vendor documentation for his machine states.
    /// The level table is the second rung, not the default.
    var inclineDialectLadder: [FTMSInclineDialect] { [.grade, .level] }
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

/// What the FTMS Inclination field (0x2ACD reading AND 0x2AD9 op 0x03 write) MEANS on
/// this machine. Resolved by asking for a value and watching what the belt reports back.
enum FTMSInclineDialect: String, Equatable {
    /// The spec meaning: sint16, 0.1 % grade. `3.0` → raw 30.
    case grade
    /// The i.Concept internal scale: an 0…1000 value mapping to console levels 1…15.
    /// `3` (level three) → raw 200.
    case level

    var label: String {
        switch self {
        case .grade: return "% de pendiente (0,1 % por unidad)"
        case .level: return "nivel de consola (tabla i.Concept)"
        }
    }

    /// The stepper caption. We never invent a percentage for a machine that has no grade.
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

    /// A raw field reading expressed in this dialect's own unit (for the HUD readout).
    func display(fromRaw raw: Double) -> Double {
        self == .level ? FTMSInclineLevels.level(forRaw: raw) : raw / 10
    }
}
