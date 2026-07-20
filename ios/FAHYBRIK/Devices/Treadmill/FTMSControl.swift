import Foundation

// Pure FTMS control-plane codec. Builds Fitness Machine Control Point (0x2AD9)
// command payloads and decodes its indications, plus the Fitness Machine Feature
// (0x2ACC), the Supported Speed / Inclination Ranges (0x2AD4 / 0x2AD5) and the
// Machine Status (0x2ADA) events. No CoreBluetooth and no state — every byte layout
// is unit-testable with fixtures. Little-endian throughout, per the Bluetooth SIG
// Fitness Machine Service spec.
//
// WHY THIS EXISTS: driving the belt (start / stop / speed / incline from the phone)
// AND keeping the app in lock-step with the machine's REAL state. Treadmill Data
// (0x2ACD, parsed elsewhere) already carries actual speed/incline; the Machine Status
// events here catch what the athlete does on the machine's OWN console (or the safety
// key), so the app never shows a value that has drifted from the belt.

/// A command we WRITE to the treadmill's Control Point (0x2AD9).
enum TreadmillControlCommand: Equatable {
    case requestControl                 // MUST precede any set/start (spec)
    case reset
    case setTargetSpeedKmh(Double)
    case setTargetInclinePct(Double)
    /// Inclination expressed in the machine's OWN console LEVELS (1…15), for families
    /// whose Inclination field is internal units rather than 0.1 % grade — the BH /
    /// Exercycle i.Concept 3.0 line (see `FTMSInclineLevels`). Kept as a SEPARATE case
    /// from `.setTargetInclinePct` so a level can never be silently written as a grade.
    case setTargetInclineLevel(Double)
    case start                          // start / resume
    case stop
    case pause

    /// True for the two "set a target" ops. The generic-hammer profile prepends its
    /// Request-Control + Start prelude only to THESE (never to start/stop/reset).
    var isTarget: Bool {
        switch self {
        case .setTargetSpeedKmh, .setTargetInclinePct, .setTargetInclineLevel: return true
        case .requestControl, .reset, .start, .stop, .pause: return false
        }
    }
}

/// The ack of a control command, decoded from a Control Point indication (0x80 …).
enum TreadmillControlResult: Equatable {
    case success
    case notSupported
    case invalidParameter
    case operationFailed
    case controlNotPermitted
    case unknown(UInt8)
}

/// A state change the MACHINE reports — its own console, the safety key, or our
/// command landing. The seam that keeps the app synced with the belt.
enum TreadmillMachineEvent: Equatable {
    case reset
    case stoppedByUser
    case pausedByUser
    case stoppedBySafetyKey
    case startedByUser
    case targetSpeedChangedKmh(Double)
    case targetInclineChangedPct(Double)
    /// The i.Concept translation of `targetInclineChangedPct`: the machine reported a new
    /// inclination in its own internal units, converted to a console LEVEL by the source.
    case targetInclineChangedLevel(Double)
    case controlPermissionLost
    case other(UInt8)
}

// MARK: - Inclination levels (BH / Exercycle i.Concept 3.0)

/// The i.Concept family does NOT put grade×0.1 % in the FTMS Inclination field — it puts
/// an INTERNAL value on a 0…1000 scale that maps to the console's own 1…15 levels. The
/// same units apply BOTH ways: the Treadmill Data (0x2ACD) reading and the Set Target
/// Inclination (0x2AD9 op 0x03) write. Writing "3.0" expecting 3 % on one of these belts
/// asks it for raw 30 — well below level 1 — which is why a plain-FTMS incline command
/// appears to do nothing.
///
/// The anchor pairs below are qdomyos-zwift's console-level table for this family. Levels
/// 7…14 are not tabulated there; the 6→15 segment is linear (≈ 66.7 raw per level), so we
/// interpolate rather than invent per-level constants. The minimum meaningful step is ONE
/// LEVEL — there is no sub-level resolution to offer the athlete.
enum FTMSInclineLevels {
    /// (console level, raw Inclination field value). Ordered by level, ascending.
    static let iConceptAnchors: [(level: Double, raw: Double)] = [
        (1, 60), (2, 130), (3, 200), (4, 260), (5, 330), (6, 400), (15, 1000)
    ]
    static let minLevel: Double = 1
    static let maxLevel: Double = 15
    /// The console moves in whole levels — the stepper must too.
    static let levelStep: Double = 1

    static func clampLevel(_ level: Double) -> Double {
        min(maxLevel, max(minLevel, level))
    }

    /// Console level → the raw value to write in the Inclination field.
    static func raw(forLevel level: Double) -> Int {
        let l = clampLevel(level)
        let a = iConceptAnchors
        for i in 0..<(a.count - 1) where l <= a[i + 1].level {
            let (lo, hi) = (a[i], a[i + 1])
            guard hi.level > lo.level else { return Int(lo.raw.rounded()) }
            let t = (l - lo.level) / (hi.level - lo.level)
            return Int((lo.raw + t * (hi.raw - lo.raw)).rounded())
        }
        return Int(a[a.count - 1].raw.rounded())
    }

    /// Raw Inclination field value → console level (fractional; the machine can report a
    /// value between two console detents). Clamped to the real 1…15 console range.
    static func level(forRaw raw: Double) -> Double {
        let a = iConceptAnchors
        if raw <= a[0].raw { return minLevel }
        for i in 0..<(a.count - 1) where raw <= a[i + 1].raw {
            let (lo, hi) = (a[i], a[i + 1])
            guard hi.raw > lo.raw else { return lo.level }
            let t = (raw - lo.raw) / (hi.raw - lo.raw)
            return clampLevel(lo.level + t * (hi.level - lo.level))
        }
        return maxLevel
    }

    /// The whole level a raw reading sits closest to — what the HUD shows ("Nivel 3").
    static func displayLevel(forRaw raw: Double) -> Int {
        Int(level(forRaw: raw).rounded())
    }
}

enum FTMSControl {
    // Control Point REQUEST op codes (byte 0 of a write).
    private enum Op: UInt8 {
        case requestControl       = 0x00
        case reset                = 0x01
        case setTargetSpeed       = 0x02
        case setTargetInclination = 0x03
        case startResume          = 0x07
        case stopPause            = 0x08
    }
    /// First byte of a Control Point INDICATION carrying a command response.
    static let responseOpCode: UInt8 = 0x80

    // MARK: - Encode (app → machine)

    static func encode(_ command: TreadmillControlCommand) -> Data {
        switch command {
        case .requestControl: return Data([Op.requestControl.rawValue])
        case .reset:          return Data([Op.reset.rawValue])
        case .start:          return Data([Op.startResume.rawValue])
        case .stop:           return Data([Op.stopPause.rawValue, 0x01])   // 0x01 = stop
        case .pause:          return Data([Op.stopPause.rawValue, 0x02])   // 0x02 = pause
        case .setTargetSpeedKmh(let kmh):
            // uint16, resolution 0.01 km/h.
            let u = UInt16(clamping: Int((max(0, kmh) * 100).rounded()))
            return Data([Op.setTargetSpeed.rawValue, UInt8(u & 0xFF), UInt8(u >> 8)])
        case .setTargetInclinePct(let pct):
            // sint16, resolution 0.1 %. Negative on decline-capable belts.
            return inclineData(rawValue: Int((pct * 10).rounded()))
        case .setTargetInclineLevel(let level):
            // Same op code and same sint16 slot — but the machine reads it as its own
            // internal units, so the console level is translated first.
            return inclineData(rawValue: FTMSInclineLevels.raw(forLevel: level))
        }
    }

    private static func inclineData(rawValue: Int) -> Data {
        let u = UInt16(bitPattern: Int16(clamping: rawValue))
        return Data([Op.setTargetInclination.rawValue, UInt8(u & 0xFF), UInt8(u >> 8)])
    }

    /// The request op code a command writes — so the source can match an incoming
    /// response indication to the command it acknowledges.
    static func requestOpCode(for command: TreadmillControlCommand) -> UInt8 {
        switch command {
        case .requestControl:     return Op.requestControl.rawValue
        case .reset:              return Op.reset.rawValue
        case .setTargetSpeedKmh:  return Op.setTargetSpeed.rawValue
        case .setTargetInclinePct, .setTargetInclineLevel:
                                  return Op.setTargetInclination.rawValue
        case .start:              return Op.startResume.rawValue
        case .stop, .pause:       return Op.stopPause.rawValue
        }
    }

    /// Human name for a Control Point request op code — for the shareable diagnostics
    /// trace, where a bare "0x03" tells the athlete (and us) nothing.
    static func opName(_ code: UInt8) -> String {
        switch code {
        case Op.requestControl.rawValue:       return "pedir control"
        case Op.reset.rawValue:                return "reset"
        case Op.setTargetSpeed.rawValue:       return "objetivo velocidad"
        case Op.setTargetInclination.rawValue: return "objetivo inclinación"
        case Op.startResume.rawValue:          return "arrancar"
        case Op.stopPause.rawValue:            return "parar/pausar"
        default:                               return "desconocido"
        }
    }

    /// Human name for a decoded ack result — same reason.
    static func resultName(_ result: TreadmillControlResult) -> String {
        switch result {
        case .success:            return "OK"
        case .notSupported:       return "NO SOPORTADO (0x02)"
        case .invalidParameter:   return "PARÁMETRO INVÁLIDO (0x03)"
        case .operationFailed:    return "FALLÓ (0x04)"
        case .controlNotPermitted: return "CONTROL NO PERMITIDO (0x05)"
        case .unknown(let v):     return String(format: "desconocido (0x%02X)", v)
        }
    }

    // MARK: - Decode Control Point indication (machine → app: command ack)

    static func decodeResponse(_ data: Data) -> (request: UInt8, result: TreadmillControlResult)? {
        let b = [UInt8](data)
        guard b.count >= 3, b[0] == responseOpCode else { return nil }
        let result: TreadmillControlResult
        switch b[2] {
        case 0x01: result = .success
        case 0x02: result = .notSupported
        case 0x03: result = .invalidParameter
        case 0x04: result = .operationFailed
        case 0x05: result = .controlNotPermitted
        default:   result = .unknown(b[2])
        }
        return (request: b[1], result: result)
    }

    // MARK: - Decode Machine Status (0x2ADA)

    static func decodeMachineEvent(_ data: Data) -> TreadmillMachineEvent? {
        let b = [UInt8](data)
        guard let op = b.first else { return nil }
        func u16(_ i: Int) -> Int? { b.count > i + 1 ? Int(b[i]) | Int(b[i + 1]) << 8 : nil }
        func s16(_ i: Int) -> Int? { u16(i).map { $0 >= 0x8000 ? $0 - 0x10000 : $0 } }
        switch op {
        case 0x01: return .reset
        case 0x02: return (b.count > 1 && b[1] == 0x02) ? .pausedByUser : .stoppedByUser
        case 0x03: return .stoppedBySafetyKey
        case 0x04: return .startedByUser
        case 0x05: return u16(1).map { .targetSpeedChangedKmh(Double($0) / 100.0) }
        case 0x06: return s16(1).map { .targetInclineChangedPct(Double($0) / 10.0) }
        case 0xFF: return .controlPermissionLost
        default:   return .other(op)
        }
    }

    // MARK: - Decode Fitness Machine Feature (0x2ACC)

    /// (speedTargetSettable, inclineTargetSettable) from the Target Setting Features
    /// word (the SECOND uint32). nil when the buffer is too short. bit 0 = speed
    /// target settable, bit 1 = inclination target settable.
    static func decodeTargetFeatures(_ data: Data) -> (speed: Bool, incline: Bool)? {
        let b = [UInt8](data)
        guard b.count >= 8 else { return nil }
        let target = UInt32(b[4]) | UInt32(b[5]) << 8 | UInt32(b[6]) << 16 | UInt32(b[7]) << 24
        return (speed: target & (1 << 0) != 0, incline: target & (1 << 1) != 0)
    }

    // MARK: - Decode Supported Ranges

    struct Range: Equatable {
        var min: Double
        var max: Double
        var step: Double
    }

    /// Supported Speed Range (0x2AD4): min, max, min-increment — uint16 × 0.01 km/h.
    static func decodeSpeedRange(_ data: Data) -> Range? {
        let b = [UInt8](data)
        guard b.count >= 6 else { return nil }
        func u16(_ i: Int) -> Double { Double(Int(b[i]) | Int(b[i + 1]) << 8) / 100.0 }
        return Range(min: u16(0), max: u16(2), step: u16(4))
    }

    /// Supported Inclination Range (0x2AD5): min, max, min-increment — sint16 × 0.1 %.
    static func decodeInclineRange(_ data: Data) -> Range? {
        let b = [UInt8](data)
        guard b.count >= 6 else { return nil }
        func s16(_ i: Int) -> Double {
            let raw = Int(b[i]) | Int(b[i + 1]) << 8
            return Double(raw >= 0x8000 ? raw - 0x10000 : raw) / 10.0
        }
        return Range(min: s16(0), max: s16(2), step: s16(4))
    }
}
