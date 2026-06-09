import Foundation

// Live decoded values surfaced to the UI. Optional because not every chunk
// carries every field — `general_status` carries distance/state, `stroke_data`
// carries power/SPM, `additional_status` carries cals/HR. We merge into
// a single rolling snapshot in the connection store.
struct PM5LiveSample: Equatable {
    var distanceMeters: Double?
    var elapsedSeconds: Double?
    var workoutState: PM5WorkoutState?
    var strokeRate: Int?         // SPM
    var heartRateBpm: Int?
    var paceSecondsPer500m: Double?
    var powerWatts: Int?
    var caloriesKcal: Int?
    var strokeCount: Int?
    var driveLengthMeters: Double?
    var lastUpdate: Date = Date()
}

enum PM5WorkoutState: Int {
    case waitingToBegin = 0
    case workoutRow = 1
    case countdownPause = 2
    case intervalRest = 3
    case intervalWorkTime = 4
    case intervalWorkDistance = 5
    case intervalRestEndToWorkTime = 6
    case intervalRestEndToWorkDistance = 7
    case intervalWorkTimeRestEnd = 8
    case intervalWorkDistanceRestEnd = 9
    case workoutEnd = 10
    case terminate = 11
    case workoutLogged = 12
    case rearm = 13
}

// Concept2 packs little-endian multi-byte integers. All chunks below come
// straight from the PM5 BLE Communications Interface Definition (rev 2.x).
enum PM5DataParser {
    // MARK: - byte helpers

    private static func u8(_ bytes: [UInt8], _ i: Int) -> Int? {
        guard i < bytes.count else { return nil }
        return Int(bytes[i])
    }

    private static func u16le(_ bytes: [UInt8], _ i: Int) -> Int? {
        guard i + 1 < bytes.count else { return nil }
        return Int(bytes[i]) | (Int(bytes[i + 1]) << 8)
    }

    private static func u24le(_ bytes: [UInt8], _ i: Int) -> Int? {
        guard i + 2 < bytes.count else { return nil }
        return Int(bytes[i]) | (Int(bytes[i + 1]) << 8) | (Int(bytes[i + 2]) << 16)
    }

    private static func bytes(_ data: Data) -> [UInt8] { Array(data) }

    // MARK: - chunk parsers
    // The patch (additive) merges incoming fields onto the existing sample so
    // partial chunks don't wipe values from another chunk type.

    /// Concept2 General Status (0x31): elapsed time (3B, 0.01s),
    /// distance (3B, 0.1m), workout type (1B), interval type (1B),
    /// workout state (1B), rowing state (1B), stroke state (1B), …
    static func applyGeneralStatus(_ data: Data, into sample: inout PM5LiveSample) {
        let b = bytes(data)
        if let raw = u24le(b, 0) {
            sample.elapsedSeconds = Double(raw) * 0.01
        }
        if let raw = u24le(b, 3) {
            sample.distanceMeters = Double(raw) * 0.1
        }
        if let raw = u8(b, 8), let s = PM5WorkoutState(rawValue: raw) {
            sample.workoutState = s
        }
        sample.lastUpdate = Date()
    }

    /// Concept2 Additional Status 1 (0x32): elapsed (3B, 0.01s),
    /// speed (2B, 0.001 m/s), stroke rate (1B, SPM), HR (1B, bpm — 255 = none),
    /// current pace (2B, 0.01s/500m), avg pace (2B), …
    static func applyAdditionalStatus(_ data: Data, into sample: inout PM5LiveSample) {
        let b = bytes(data)
        if let raw = u24le(b, 0) { sample.elapsedSeconds = Double(raw) * 0.01 }
        if let spm = u8(b, 5) { sample.strokeRate = spm }
        if let hr = u8(b, 6) { sample.heartRateBpm = (hr == 0 || hr == 255) ? nil : hr }
        if let pace = u16le(b, 7) {
            sample.paceSecondsPer500m = pace == 0 ? nil : Double(pace) * 0.01
        }
        sample.lastUpdate = Date()
    }

    /// Concept2 Additional Status 2 (0x33): interval count (1B),
    /// avg power (2B, W), total calories (2B, kcal), split avg pace (2B, 0.01s),
    /// split avg power (2B, W), … We treat the second u16 as "calories so far"
    /// since it's the cumulative kcal field on PM5 firmware ≥ 23x (matches the
    /// Concept2 BLE spec table).
    static func applyAdditionalStatus2(_ data: Data, into sample: inout PM5LiveSample) {
        let b = bytes(data)
        if let avgPower = u16le(b, 1) { sample.powerWatts = avgPower }
        if let kcal = u16le(b, 3) { sample.caloriesKcal = kcal }
        sample.lastUpdate = Date()
    }

    /// Concept2 Stroke Data (0x35): elapsed (3B, 0.01s), distance (3B, 0.1m),
    /// drive length (1B, 0.01m), drive time (1B, 0.01s), stroke recovery (2B,
    /// 0.01s), stroke distance (2B, 0.01m), peak drive force (2B, 0.1lbs),
    /// avg drive force (2B, 0.1lbs), work per stroke (2B, 0.1J),
    /// stroke count (2B), …
    static func applyStrokeData(_ data: Data, into sample: inout PM5LiveSample) {
        let b = bytes(data)
        if let raw = u24le(b, 0) { sample.elapsedSeconds = Double(raw) * 0.01 }
        if let raw = u24le(b, 3) { sample.distanceMeters = Double(raw) * 0.1 }
        if let raw = u8(b, 6) { sample.driveLengthMeters = Double(raw) * 0.01 }
        if let count = u16le(b, 15) { sample.strokeCount = count }
        sample.lastUpdate = Date()
    }

    /// Concept2 Additional Stroke Data (0x36): elapsed (3B, 0.01s),
    /// stroke power (2B, W), stroke calories (2B, cal/hr), SPM (1B), …
    static func applyAdditionalStrokeData(_ data: Data, into sample: inout PM5LiveSample) {
        let b = bytes(data)
        if let raw = u24le(b, 0) { sample.elapsedSeconds = Double(raw) * 0.01 }
        if let power = u16le(b, 3) { sample.powerWatts = power }
        if let spm = u8(b, 7) { sample.strokeRate = spm }
        sample.lastUpdate = Date()
    }

    static func applyChunk(uuid: String, data: Data, into sample: inout PM5LiveSample) {
        let normalized = uuid.uppercased()
        switch normalized {
        case "CE060031-43E5-11E4-916C-0800200C9A66": applyGeneralStatus(data, into: &sample)
        case "CE060032-43E5-11E4-916C-0800200C9A66": applyAdditionalStatus(data, into: &sample)
        case "CE060033-43E5-11E4-916C-0800200C9A66": applyAdditionalStatus2(data, into: &sample)
        case "CE060035-43E5-11E4-916C-0800200C9A66": applyStrokeData(data, into: &sample)
        case "CE060036-43E5-11E4-916C-0800200C9A66": applyAdditionalStrokeData(data, into: &sample)
        // 0x37 split / 0x39 EOW summary parsing not needed for live grid yet.
        default: break
        }
    }
}
