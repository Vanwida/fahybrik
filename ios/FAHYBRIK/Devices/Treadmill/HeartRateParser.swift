import Foundation

// Pure parser for the Heart Rate Measurement characteristic (0x2A37), per the
// Bluetooth SIG spec. No CoreBluetooth, no state — fully unit-testable.
//
// LAYOUT:
//   Flags  uint8
//     b0 = HR value format: 0 → uint8 follows, 1 → uint16 (LE) follows
//     b1 = Sensor Contact: contact DETECTED (only meaningful when b2 is set)
//     b2 = Sensor Contact: FEATURE supported
//     b3 = Energy Expended present (uint16 later — irrelevant to us)
//     b4 = RR-Interval(s) present (irrelevant to us)
//   HR value: uint8 or uint16 per b0.
enum HeartRateParser {
    /// Parse one Heart Rate Measurement notification into bpm. Returns nil when
    /// the buffer is too short, the value is zero/absent, or the strap supports
    /// sensor-contact detection and reports NO skin contact.
    static func parse(_ data: Data) -> Int? {
        let bytes = [UInt8](data)
        guard let flags = bytes.first else { return nil }

        // Sensor contact gate: when the strap SUPPORTS contact detection (b2) but
        // reports contact NOT detected (b1 == 0), the value is unreliable — a band
        // dangling off the neck emits stale/garbage beats. Drop it so it never
        // pollutes the personal HR zones. When the feature is unsupported (b2 == 0)
        // b1 carries no meaning, so every reading passes through as before.
        let contactSupported = (flags & 0x04) != 0
        let contactDetected  = (flags & 0x02) != 0
        if contactSupported && !contactDetected { return nil }

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
