import Foundation

// Pure parser for the Heart Rate Measurement characteristic (0x2A37), per the
// Bluetooth SIG spec. No CoreBluetooth, no state — fully unit-testable.
//
// LAYOUT:
//   Flags  uint8
//     b0 = HR value format: 0 → uint8 follows, 1 → uint16 (LE) follows
//     b3 = Energy Expended present (uint16 later — irrelevant to us)
//     b4 = RR-Interval(s) present (irrelevant to us)
//   HR value: uint8 or uint16 per b0.
enum HeartRateParser {
    /// Parse one Heart Rate Measurement notification into bpm. Returns nil when
    /// the buffer is too short or the value is zero/absent.
    static func parse(_ data: Data) -> Int? {
        let bytes = [UInt8](data)
        guard let flags = bytes.first else { return nil }
        let is16Bit = (flags & 0x01) != 0
        if is16Bit {
            guard bytes.count >= 3 else { return nil }
            let bpm = Int(bytes[1]) | (Int(bytes[2]) << 8)
            return bpm > 0 ? bpm : nil
        } else {
            guard bytes.count >= 2 else { return nil }
            let bpm = Int(bytes[1])
            return bpm > 0 ? bpm : nil
        }
    }
}
