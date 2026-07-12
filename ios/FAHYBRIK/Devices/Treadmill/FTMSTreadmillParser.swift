import Foundation

// Pure parser for the FTMS Treadmill Data characteristic (0x2ACD), per the
// Bluetooth SIG GATT spec. No CoreBluetooth, no state — bytes in, a
// `TreadmillSample` out — so it's fully unit-testable with byte fixtures.
//
// LAYOUT (little-endian). A 16-bit Flags field leads; each set flag adds its
// field(s), in the fixed order below. We MUST walk every present field (even the
// ones we don't surface) so the cursor lands on the right offset for the fields
// we do want (speed, total distance, inclination, elapsed time, heart rate):
//
//   Flags        uint16
//   b0 More Data → Instantaneous Speed uint16 (0.01 km/h) PRESENT when b0 == 0
//   b1  Average Speed          uint16 (0.01 km/h)
//   b2  Total Distance         uint24 (m)
//   b3  Inclination+Ramp       sint16 (0.1 %) + sint16 (0.1 deg)
//   b4  Elevation Gain         uint16 + uint16 (0.1 m each)
//   b5  Instantaneous Pace     uint8
//   b6  Average Pace           uint8
//   b7  Expended Energy        uint16 + uint16 + uint8
//   b8  Heart Rate             uint8 (bpm)
//   b9  Metabolic Equivalent   uint8
//   b10 Elapsed Time           uint16 (s)
//   b11 Remaining Time         uint16 (s)
//   b12 Force on Belt + Power  sint16 + sint16
enum FTMSTreadmillParser {

    private struct Cursor {
        let bytes: [UInt8]
        var i: Int = 0
        init(_ data: Data) { bytes = [UInt8](data) }

        var remaining: Int { bytes.count - i }

        mutating func u8() -> Int? {
            guard remaining >= 1 else { return nil }
            defer { i += 1 }
            return Int(bytes[i])
        }
        mutating func u16() -> Int? {
            guard remaining >= 2 else { return nil }
            defer { i += 2 }
            return Int(bytes[i]) | (Int(bytes[i + 1]) << 8)
        }
        mutating func s16() -> Int? {
            guard let raw = u16() else { return nil }
            return raw >= 0x8000 ? raw - 0x10000 : raw
        }
        mutating func u24() -> Int? {
            guard remaining >= 3 else { return nil }
            defer { i += 3 }
            return Int(bytes[i]) | (Int(bytes[i + 1]) << 8) | (Int(bytes[i + 2]) << 16)
        }
        /// Advance over `n` bytes we parse only to keep the offset correct.
        mutating func skip(_ n: Int) { i = min(bytes.count, i + n) }
    }

    /// Parse one Treadmill Data notification. Returns nil only when the buffer is
    /// too short to even hold the Flags field. Fields whose bytes are truncated
    /// are simply left nil (a short packet degrades, never crashes).
    static func parse(_ data: Data) -> TreadmillSample? {
        var c = Cursor(data)
        guard let flags = c.u16() else { return nil }
        var s = TreadmillSample(lastUpdate: Date())

        // b0 == 0 → Instantaneous Speed present (inverted "More Data" bit).
        if flags & (1 << 0) == 0, let raw = c.u16() {
            s.speedKmh = Double(raw) / 100.0
        }
        // b1 Average Speed — advance only.
        if flags & (1 << 1) != 0 { _ = c.u16() }
        // b2 Total Distance (uint24, meters).
        if flags & (1 << 2) != 0, let d = c.u24() {
            s.totalDistanceM = Double(d)
        }
        // b3 Inclination (0.1 %) + Ramp Angle (advance).
        if flags & (1 << 3) != 0 {
            if let inc = c.s16() { s.inclinePct = Double(inc) / 10.0 }
            _ = c.s16() // ramp angle, unused
        }
        // b4 Elevation Gain: positive + negative (advance 4).
        if flags & (1 << 4) != 0 { c.skip(4) }
        // b5 Instantaneous Pace (advance 1).
        if flags & (1 << 5) != 0 { _ = c.u8() }
        // b6 Average Pace (advance 1).
        if flags & (1 << 6) != 0 { _ = c.u8() }
        // b7 Expended Energy: total(2) + per hour(2) + per min(1) → advance 5.
        if flags & (1 << 7) != 0 { c.skip(5) }
        // b8 Heart Rate (uint8, bpm).
        if flags & (1 << 8) != 0, let hr = c.u8(), hr > 0 {
            s.hrBpm = hr
        }
        // b9 Metabolic Equivalent (advance 1).
        if flags & (1 << 9) != 0 { _ = c.u8() }
        // b10 Elapsed Time (uint16, seconds).
        if flags & (1 << 10) != 0, let t = c.u16() {
            s.elapsedS = t
        }
        // b11 Remaining Time (advance 2) and b12 Force+Power (advance 4) — not
        // surfaced, and nothing follows we need, so no cursor work required.

        return s
    }
}
