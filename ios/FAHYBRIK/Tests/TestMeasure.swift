import Foundation

// LO QUE UN TEST PIDE MEDIR Y CUÁNDO SE PUEDE GUARDAR — el contrato de resultados de un test, en tipos
// puros (sin vista): la hoja de captura pinta con ellos y `TestBatteryPrefill` los precarga.
//
// Un test puede prometer varios resultados (una batería de 1RM → sentadilla + peso muerto + press
// banca), cada uno con la entrada que su `measure` necesita (tiempo → mm:ss; carga → kg; el resto →
// un número).

// MARK: - Measure → typed input

enum TestMeasure {
    case time      // seconds, entered as mm:ss
    case load      // kg
    case distance  // meters
    case reps
    case calories
    case hrr       // pulse DROP — MEASURED by the app's recovery window, never typed
    case hr        // an absolute pulse (threshold FC) — typed by the athlete
    case height    // jump height, cm — never typed on the happy path
    case other     // unknown future measure → plain number, no unit assumptions

    init(_ raw: String) {
        switch raw {
        case "time":     self = .time
        case "load":     self = .load
        case "distance": self = .distance
        case "reps":     self = .reps
        case "calories": self = .calories
        case "hrr":      self = .hrr
        case "hr":       self = .hr
        case "height":   self = .height
        default:         self = .other
        }
    }

    /// Adjustment step for the ± buttons, in the measure's own unit.
    var step: Double {
        switch self {
        case .time:     return 5     // seconds
        case .load:     return 3     // kg (matches the coach 1RM cadence)
        case .distance: return 50    // meters
        case .reps:     return 1
        case .calories: return 5
        case .hrr:      return 1     // ppm (display only — the row is read-only)
        case .hr:       return 1     // ppm
        case .height:   return 0.5
        case .other:    return 1
        }
    }

    /// Short unit shown next to a numeric field (time uses mm:ss, no unit chip).
    /// Both pulse measures read in **ppm** — the athlete-facing unit for a heart
    /// rate (docs/CONTRATO-UI.md §3: never "bpm", never "HR").
    var unitLabel: String {
        switch self {
        case .load:     return "kg"
        case .distance: return "m"
        case .reps:     return "reps"
        case .calories: return "cal"
        case .hrr, .hr: return Vocab.ppm
        case .height:   return "cm"
        case .time, .other: return ""
        }
    }

    var usesDecimals: Bool { self == .load || self == .height }
}


// MARK: - Save gating (pure)

/// When can the capture be saved? Every REQUIRED entry has its value, and at
/// least one value exists overall (an optional-only capture with nothing
/// measured has nothing to send). Optional entries — contract `optional: true`
/// or an app-measured `hrr` — never block: measured → sent; missing → omitted
/// without error, the test still counts. Pure so the rule is unit-tested.
enum TestResultGating {
    static func canSave(entries: [(value: Double?, isOptional: Bool)]) -> Bool {
        entries.contains { $0.value != nil }
            && entries.filter { !$0.isOptional }.allSatisfy { $0.value != nil }
    }
}

