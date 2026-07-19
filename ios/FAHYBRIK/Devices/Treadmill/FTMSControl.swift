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
    case start                          // start / resume
    case stop
    case pause
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
    case controlPermissionLost
    case other(UInt8)
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
            let s = Int16(clamping: Int((pct * 10).rounded()))
            let u = UInt16(bitPattern: s)
            return Data([Op.setTargetInclination.rawValue, UInt8(u & 0xFF), UInt8(u >> 8)])
        }
    }

    /// The request op code a command writes — so the source can match an incoming
    /// response indication to the command it acknowledges.
    static func requestOpCode(for command: TreadmillControlCommand) -> UInt8 {
        switch command {
        case .requestControl:     return Op.requestControl.rawValue
        case .reset:              return Op.reset.rawValue
        case .setTargetSpeedKmh:  return Op.setTargetSpeed.rawValue
        case .setTargetInclinePct: return Op.setTargetInclination.rawValue
        case .start:              return Op.startResume.rawValue
        case .stop, .pause:       return Op.stopPause.rawValue
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
