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
    var paceSecondsPer500m: Double?      // CURRENT pace /500m (0x32 @7)
    var avgPaceSecondsPer500m: Double?   // monitor's AVERAGE pace /500m (0x32 @9)
    var powerWatts: Int?                 // CURRENT stroke power (0x36 @3)
    var caloriesKcal: Int?               // cumulative kcal (0x33 @6)
    var caloriesPerHour: Int?            // instantaneous burn rate, ErgData "Cals/Hr" (0x36 @5)
    var dragFactor: Int?                 // resistance/drag factor (0x31 @18)
    var strokeCount: Int?
    var driveLengthMeters: Double?
    var peakDriveForceLbs: Double?       // stroke quality (0x35 @12)
    var avgDriveForceLbs: Double?        // stroke quality (0x35 @14)
    var lastUpdate: Date = Date()
}

// One completed PM5 split / interval — the monitor's own division of the piece
// (e.g. 500m splits of a 2000m row, or the legs of a 4×500m interval). Built by
// JOINING the two split characteristics on interval number: 0x37 "Split Data"
// carries time / distance / rest; 0x38 "Additional Split Data" carries the split
// averages (SPM / pace / power / calories / drag / HR). Both fire together on a
// split boundary, but can arrive in either order — every field is optional and
// merged in as its frame lands. This is the ErgData interval table, verbatim from
// the monitor, not recomputed on-device. `index` is the PM5's 1-based number.
struct PM5Split: Equatable, Identifiable, Codable {
    let index: Int
    var timeSeconds: Double? = nil          // split moving time (0x37 @6, 0.1s)
    var distanceMeters: Double? = nil       // split distance (0x37 @9, 1m)
    var restTimeSeconds: Double? = nil      // interval rest time (0x37 @12, 1s)
    var restDistanceMeters: Double? = nil   // interval rest distance (0x37 @14, 1m)
    var avgPaceSecPer500m: Double? = nil    // split avg pace (0x38 @6, 0.1s — NOT 0.01s)
    var strokeRateSpm: Int? = nil           // split avg SPM (0x38 @3)
    var avgPowerWatts: Int? = nil           // split avg power (0x38 @14)
    var totalCalories: Int? = nil           // split calories (0x38 @8)
    var avgCaloriesPerHour: Int? = nil      // split avg burn rate (0x38 @10)
    var avgDragFactor: Int? = nil           // split avg drag factor (0x38 @16)
    var avgHeartRateBpm: Int? = nil         // split avg work HR (0x38 @4)
    var id: Int { index }
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

    /// Concept2 General Status (0x31, 19B): elapsed time (3B @0, 0.01s),
    /// distance (3B @3, 0.1m), workout type (@6), interval type (@7),
    /// workout state (@8), rowing state (@9), stroke state (@10),
    /// total work distance (3B @11), workout duration (3B @14),
    /// workout duration type (@17), drag factor (@18).
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
        // Drag factor: the erg's resistance setting (unitless C2 units, ~90-220).
        // 0 means "not yet computed" — keep the last real value rather than blank it.
        if let df = u8(b, 18), df > 0 { sample.dragFactor = df }
        sample.lastUpdate = Date()
    }

    /// Concept2 Additional Status 1 (0x32): elapsed (3B @0, 0.01s),
    /// speed (2B @3, 0.001 m/s), stroke rate (@5, SPM), HR (@6, bpm — 255 = none),
    /// current pace (2B @7, 0.01s/500m), average pace (2B @9, 0.01s/500m),
    /// rest distance (2B @11), rest time (3B @13).
    static func applyAdditionalStatus(_ data: Data, into sample: inout PM5LiveSample) {
        let b = bytes(data)
        if let raw = u24le(b, 0) { sample.elapsedSeconds = Double(raw) * 0.01 }
        if let spm = u8(b, 5) { sample.strokeRate = spm }
        if let hr = u8(b, 6) { sample.heartRateBpm = (hr == 0 || hr == 255) ? nil : hr }
        if let pace = u16le(b, 7) {
            sample.paceSecondsPer500m = pace == 0 ? nil : Double(pace) * 0.01
        }
        // Monitor's own AVERAGE pace for the piece — more faithful than a mean of
        // our 1 Hz samples, so we prefer it as the segment average when present.
        if let avg = u16le(b, 9) {
            sample.avgPaceSecondsPer500m = avg == 0 ? nil : Double(avg) * 0.01
        }
        sample.lastUpdate = Date()
    }

    /// Concept2 Additional Status 2 (0x33, 20B, individual char): elapsed (3B @0),
    /// interval count (@3), average power (2B @4, W), total calories (2B @6, kcal),
    /// split avg pace (2B @8), split avg power (2B @10), split avg calories (2B @12,
    /// cal/hr), last split time (3B @14), last split distance (3B @17).
    ///
    /// This carries the cumulative workout calories. We deliberately do NOT set the
    /// live power here (its `average power` is a lagging interval mean); the live
    /// watts come from 0x36's per-stroke power, matching the erg monitor.
    static func applyAdditionalStatus2(_ data: Data, into sample: inout PM5LiveSample) {
        let b = bytes(data)
        if let raw = u24le(b, 0) { sample.elapsedSeconds = Double(raw) * 0.01 }
        if let kcal = u16le(b, 6) { sample.caloriesKcal = kcal }
        sample.lastUpdate = Date()
    }

    /// Concept2 Stroke Data (0x35, 20B, individual char): elapsed (3B @0, 0.01s),
    /// distance (3B @3, 0.1m), drive length (@6, 0.01m), drive time (@7, 0.01s),
    /// stroke recovery (2B @8, 0.01s), stroke distance (2B @10, 0.01m),
    /// peak drive force (2B @12, 0.1lbs), avg drive force (2B @14, 0.1lbs),
    /// work per stroke (2B @16, 0.1J), stroke count (2B @18).
    static func applyStrokeData(_ data: Data, into sample: inout PM5LiveSample) {
        let b = bytes(data)
        if let raw = u24le(b, 0) { sample.elapsedSeconds = Double(raw) * 0.01 }
        if let raw = u24le(b, 3) { sample.distanceMeters = Double(raw) * 0.1 }
        if let raw = u8(b, 6) { sample.driveLengthMeters = Double(raw) * 0.01 }
        // Stroke-quality handle force (0.1 lbs → lbs). 0 = no force this frame.
        if let peak = u16le(b, 12), peak > 0 { sample.peakDriveForceLbs = Double(peak) / 10.0 }
        if let avg = u16le(b, 14), avg > 0 { sample.avgDriveForceLbs = Double(avg) / 10.0 }
        if let count = u16le(b, 18) { sample.strokeCount = count }
        sample.lastUpdate = Date()
    }

    /// Concept2 Additional Stroke Data (0x36, 15B, individual char): elapsed (3B @0),
    /// stroke power (2B @3, W), stroke calories (2B @5, Cals/Hr — the instantaneous
    /// burn RATE ErgData shows), stroke count (2B @7), projected work time (3B @9),
    /// projected work distance (3B @12). There is NO stroke-rate field here (SPM
    /// comes from 0x32 @5).
    static func applyAdditionalStrokeData(_ data: Data, into sample: inout PM5LiveSample) {
        let b = bytes(data)
        if let raw = u24le(b, 0) { sample.elapsedSeconds = Double(raw) * 0.01 }
        if let power = u16le(b, 3) { sample.powerWatts = power }
        if let calPerHour = u16le(b, 5) { sample.caloriesPerHour = calPerHour == 0 ? nil : calPerHour }
        sample.lastUpdate = Date()
    }

    // MARK: - split parsers (event-driven, joined by interval number)

    /// Concept2 Split/Interval Data (0x37, 18B): elapsed (3B @0), distance (3B @3,
    /// 0.1m), split time (3B @6, 0.1s), split distance (3B @9, 1m), rest time
    /// (2B @12, 1s), rest distance (2B @14, 1m), interval type (@16),
    /// interval number (@17, 1-based). Upserts into `splits` keyed by number.
    static func applySplitData(_ data: Data, into splits: inout [Int: PM5Split]) {
        let b = bytes(data)
        guard let idx = u8(b, 17), idx > 0 else { return }
        var s = splits[idx] ?? PM5Split(index: idx)
        if let t = u24le(b, 6), t > 0 { s.timeSeconds = Double(t) * 0.1 }
        if let d = u24le(b, 9), d > 0 { s.distanceMeters = Double(d) }
        if let rt = u16le(b, 12), rt > 0 { s.restTimeSeconds = Double(rt) }
        if let rd = u16le(b, 14), rd > 0 { s.restDistanceMeters = Double(rd) }
        splits[idx] = s
    }

    /// Concept2 Additional Split/Interval Data (0x38, 18B): elapsed (3B @0),
    /// avg stroke rate (@3), work HR (@4), rest HR (@5), avg pace (2B @6, 0.1s/500m —
    /// note the 0.1s resolution, unlike live pace's 0.01s), total calories (2B @8),
    /// avg calories (2B @10, cal/hr), speed (2B @12), avg power (2B @14, W),
    /// avg drag factor (@16), interval number (@17). Upserts by number.
    static func applyAdditionalSplitData(_ data: Data, into splits: inout [Int: PM5Split]) {
        let b = bytes(data)
        guard let idx = u8(b, 17), idx > 0 else { return }
        var s = splits[idx] ?? PM5Split(index: idx)
        if let spm = u8(b, 3), spm > 0 { s.strokeRateSpm = spm }
        if let hr = u8(b, 4), hr > 0, hr != 255 { s.avgHeartRateBpm = hr }
        if let ap = u16le(b, 6), ap > 0 { s.avgPaceSecPer500m = Double(ap) * 0.1 }
        if let cal = u16le(b, 8), cal > 0 { s.totalCalories = cal }
        if let ch = u16le(b, 10), ch > 0 { s.avgCaloriesPerHour = ch }
        if let pw = u16le(b, 14), pw > 0 { s.avgPowerWatts = pw }
        if let df = u8(b, 16), df > 0, df != 255 { s.avgDragFactor = df }
        splits[idx] = s
    }

    /// Routes a split characteristic (0x37 / 0x38) into the interval-keyed store.
    /// Returns true when the chunk was a split chunk (so the caller doesn't also
    /// feed it to the rolling live sample). Unknown UUIDs are ignored → false.
    static func applySplitChunk(uuid: String, data: Data, into splits: inout [Int: PM5Split]) -> Bool {
        switch uuid.uppercased() {
        case "CE060037-43E5-11E4-916C-0800200C9A66": applySplitData(data, into: &splits); return true
        case "CE060038-43E5-11E4-916C-0800200C9A66": applyAdditionalSplitData(data, into: &splits); return true
        default: return false
        }
    }

    static func applyChunk(uuid: String, data: Data, into sample: inout PM5LiveSample) {
        let normalized = uuid.uppercased()
        switch normalized {
        case "CE060031-43E5-11E4-916C-0800200C9A66": applyGeneralStatus(data, into: &sample)
        case "CE060032-43E5-11E4-916C-0800200C9A66": applyAdditionalStatus(data, into: &sample)
        case "CE060033-43E5-11E4-916C-0800200C9A66": applyAdditionalStatus2(data, into: &sample)
        case "CE060035-43E5-11E4-916C-0800200C9A66": applyStrokeData(data, into: &sample)
        case "CE060036-43E5-11E4-916C-0800200C9A66": applyAdditionalStrokeData(data, into: &sample)
        // 0x37 / 0x38 splits go through applySplitChunk; 0x39 EOW summary unused.
        default: break
        }
    }
}
