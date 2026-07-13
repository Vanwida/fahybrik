import XCTest
@testable import FAHYBRIK

// Byte fixtures for the Concept2 PM5 rowing-service characteristics, built to the
// INDIVIDUAL-characteristic layout (what we subscribe to — differs from the
// multiplexed 0x0080 packing). Offsets verified against two independent authoritative
// sources that agree byte-for-byte: the openrowingmonitor PM5 emulator (builds these
// frames per C2 spec rev 1.30) and ErgometerJS's offset enums. Each fixture pins one
// characteristic's field positions so a later field is only correct if every
// preceding field's width is.
final class PM5DataParserTests: XCTestCase {

    private let generalStatusUUID    = "CE060031-43E5-11E4-916C-0800200C9A66"
    private let additionalStatusUUID = "CE060032-43E5-11E4-916C-0800200C9A66"
    private let additionalStatus2UUID = "CE060033-43E5-11E4-916C-0800200C9A66"
    private let strokeDataUUID        = "CE060035-43E5-11E4-916C-0800200C9A66"
    private let additionalStrokeUUID  = "CE060036-43E5-11E4-916C-0800200C9A66"
    private let splitUUID             = "CE060037-43E5-11E4-916C-0800200C9A66"
    private let additionalSplitUUID   = "CE060038-43E5-11E4-916C-0800200C9A66"

    private func d(_ bytes: [UInt8]) -> Data { Data(bytes) }

    // MARK: - 0x31 General Status → drag factor @18

    func testGeneralStatusDragFactorAndDistance() {
        // elapsed 123.45s (12345 @0) · distance 500.0m (5000 @3) · workoutState 1 @8
        // · … · dragFactor 130 @18
        var s = PM5LiveSample()
        PM5DataParser.applyChunk(uuid: generalStatusUUID, data: d([
            0x39, 0x30, 0x00,   // elapsed 12345
            0x88, 0x13, 0x00,   // distance 5000
            0x01, 0x00,         // workoutType, intervalType
            0x01,               // workoutState = workoutRow
            0x01, 0x02,         // rowing, stroke state
            0x00, 0x00, 0x00,   // total work distance
            0x00, 0x00, 0x00,   // workout duration
            0x00,               // duration type
            0x82,               // drag factor = 130
        ]), into: &s)
        XCTAssertEqual(s.elapsedSeconds ?? 0, 123.45, accuracy: 0.001)
        XCTAssertEqual(s.distanceMeters ?? 0, 500.0, accuracy: 0.001)
        XCTAssertEqual(s.workoutState, .workoutRow)
        XCTAssertEqual(s.dragFactor, 130)
    }

    // MARK: - 0x32 Additional Status → current pace @7, AVERAGE pace @9

    func testAdditionalStatusCurrentAndAveragePace() {
        // spm 28 @5 · hr 150 @6 · current pace 120.00 (12000 @7) · avg pace 121.00 (12100 @9)
        var s = PM5LiveSample()
        PM5DataParser.applyChunk(uuid: additionalStatusUUID, data: d([
            0x00, 0x00, 0x00,   // elapsed
            0x00, 0x00,         // speed
            0x1C,               // stroke rate = 28
            0x96,               // hr = 150
            0xE0, 0x2E,         // current pace 12000 → 120.00s
            0x44, 0x2F,         // avg pace 12100 → 121.00s
            0x00, 0x00,         // rest distance
            0x00, 0x00, 0x00,   // rest time
        ]), into: &s)
        XCTAssertEqual(s.strokeRate, 28)
        XCTAssertEqual(s.heartRateBpm, 150)
        XCTAssertEqual(s.paceSecondsPer500m ?? 0, 120.0, accuracy: 0.001)
        XCTAssertEqual(s.avgPaceSecondsPer500m ?? 0, 121.0, accuracy: 0.001)
    }

    // MARK: - 0x33 Additional Status 2 → calories @6 (was the known @3 bug)

    func testAdditionalStatus2CaloriesAtOffset6NotPower() {
        // interval count 2 @3 · avg power 240 @4 (must NOT become live power) ·
        // total calories 85 @6
        var s = PM5LiveSample()
        PM5DataParser.applyChunk(uuid: additionalStatus2UUID, data: d([
            0x00, 0x00, 0x00,   // elapsed
            0x02,               // interval count
            0xF0, 0x00,         // avg power 240
            0x55, 0x00,         // total calories 85
            0x00, 0x00,         // split avg pace
            0x00, 0x00,         // split avg power
            0x00, 0x00,         // split avg calories
            0x00, 0x00, 0x00,   // last split time
            0x00, 0x00, 0x00,   // last split distance
        ]), into: &s)
        XCTAssertEqual(s.caloriesKcal, 85)
        // 0x33's interval-average power must NOT drive the live watts (0x36 does).
        XCTAssertNil(s.powerWatts)
    }

    // MARK: - 0x35 Stroke Data → drive force @12/@14, stroke count @18

    func testStrokeDataDriveForceAndStrokeCount() {
        // distance 500 @3 · drive length 0.50m @6 · peak force 92.0 (920 @12) ·
        // avg force 61.0 (610 @14) · stroke count 100 @18
        var s = PM5LiveSample()
        PM5DataParser.applyChunk(uuid: strokeDataUUID, data: d([
            0x00, 0x00, 0x00,   // elapsed
            0x88, 0x13, 0x00,   // distance 5000 → 500.0m
            0x32,               // drive length 50 → 0.50m
            0x00,               // drive time
            0x00, 0x00,         // recovery
            0x00, 0x00,         // stroke distance
            0x98, 0x03,         // peak drive force 920 → 92.0 lbs
            0x62, 0x02,         // avg drive force 610 → 61.0 lbs
            0x00, 0x00,         // work per stroke
            0x64, 0x00,         // stroke count 100
        ]), into: &s)
        XCTAssertEqual(s.driveLengthMeters ?? 0, 0.50, accuracy: 0.001)
        XCTAssertEqual(s.peakDriveForceLbs ?? 0, 92.0, accuracy: 0.001)
        XCTAssertEqual(s.avgDriveForceLbs ?? 0, 61.0, accuracy: 0.001)
        XCTAssertEqual(s.strokeCount, 100)
    }

    // MARK: - 0x36 Additional Stroke Data → power @3, Cals/Hr @5, NO stroke rate

    func testAdditionalStrokeDataPowerAndCaloriesPerHour() {
        // stroke power 235 @3 · cals/hr 640 @5 · stroke count 100 @7
        var s = PM5LiveSample()
        PM5DataParser.applyChunk(uuid: additionalStrokeUUID, data: d([
            0x00, 0x00, 0x00,   // elapsed
            0xEB, 0x00,         // stroke power 235
            0x80, 0x02,         // stroke calories 640 → cals/hr
            0x64, 0x00,         // stroke count
            0x00, 0x00, 0x00,   // projected work time
            0x00, 0x00, 0x00,   // projected work distance
        ]), into: &s)
        XCTAssertEqual(s.powerWatts, 235)
        XCTAssertEqual(s.caloriesPerHour, 640)
        // 0x36 has NO stroke-rate field; the old parser read stroke-count-lo as SPM.
        XCTAssertNil(s.strokeRate)
    }

    // MARK: - 0x37 + 0x38 splits, joined by interval number

    func testSplitDataParsesTimeDistanceRest() {
        // split time 111.3s (1113 @6, 0.1s) · split distance 500 @9 · rest 60s @12 · idx 1 @17
        var splits: [Int: PM5Split] = [:]
        let handled = PM5DataParser.applySplitChunk(uuid: splitUUID, data: d([
            0x00, 0x00, 0x00,   // elapsed
            0x00, 0x00, 0x00,   // distance
            0x59, 0x04, 0x00,   // split time 1113 → 111.3s
            0xF4, 0x01, 0x00,   // split distance 500
            0x3C, 0x00,         // rest time 60
            0x00, 0x00,         // rest distance
            0x00,               // interval type
            0x01,               // interval number 1
        ]), into: &splits)
        XCTAssertTrue(handled)
        let s = splits[1]
        XCTAssertEqual(s?.timeSeconds ?? 0, 111.3, accuracy: 0.001)
        XCTAssertEqual(s?.distanceMeters ?? 0, 500, accuracy: 0.001)
        XCTAssertEqual(s?.restTimeSeconds ?? 0, 60, accuracy: 0.001)
        XCTAssertEqual(s?.index, 1)
    }

    func testAdditionalSplitDataParsesAverages() {
        // spm 27 @3 · work hr 158 @4 · avg pace 120.0 (1200 @6, 0.1s!) · calories 18 @8
        // · cals/hr 650 @10 · avg power 225 @14 · drag 120 @16 · idx 1 @17
        var splits: [Int: PM5Split] = [:]
        _ = PM5DataParser.applySplitChunk(uuid: additionalSplitUUID, data: d([
            0x00, 0x00, 0x00,   // elapsed
            0x1B,               // stroke rate 27
            0x9E,               // work hr 158
            0x00,               // rest hr
            0xB0, 0x04,         // avg pace 1200 → 120.0s (0.1s resolution)
            0x12, 0x00,         // calories 18
            0x8A, 0x02,         // avg calories 650 (cal/hr)
            0x00, 0x00,         // speed
            0xE1, 0x00,         // avg power 225
            0x78,               // avg drag factor 120
            0x01,               // interval number 1
        ]), into: &splits)
        let s = splits[1]
        XCTAssertEqual(s?.strokeRateSpm, 27)
        XCTAssertEqual(s?.avgHeartRateBpm, 158)
        XCTAssertEqual(s?.avgPaceSecPer500m ?? 0, 120.0, accuracy: 0.001)
        XCTAssertEqual(s?.totalCalories, 18)
        XCTAssertEqual(s?.avgCaloriesPerHour, 650)
        XCTAssertEqual(s?.avgPowerWatts, 225)
        XCTAssertEqual(s?.avgDragFactor, 120)
    }

    func testSplitFramesMergeByIntervalNumberEitherOrder() {
        // 0x37 (time/dist/rest) and 0x38 (averages) both carry index 1 → one merged row.
        let split37 = d([0,0,0, 0,0,0, 0x59,0x04,0x00, 0xF4,0x01,0x00, 0x3C,0x00, 0,0, 0x00, 0x01])
        let split38 = d([0,0,0, 0x1B, 0x9E, 0x00, 0xB0,0x04, 0x12,0x00, 0x8A,0x02, 0,0, 0xE1,0x00, 0x78, 0x01])

        var a: [Int: PM5Split] = [:]
        _ = PM5DataParser.applySplitChunk(uuid: splitUUID, data: split37, into: &a)
        _ = PM5DataParser.applySplitChunk(uuid: additionalSplitUUID, data: split38, into: &a)

        var b: [Int: PM5Split] = [:]   // reverse arrival order → same result
        _ = PM5DataParser.applySplitChunk(uuid: additionalSplitUUID, data: split38, into: &b)
        _ = PM5DataParser.applySplitChunk(uuid: splitUUID, data: split37, into: &b)

        for merged in [a[1], b[1]] {
            XCTAssertEqual(merged?.index, 1)
            XCTAssertEqual(merged?.timeSeconds ?? 0, 111.3, accuracy: 0.001)   // from 0x37
            XCTAssertEqual(merged?.strokeRateSpm, 27)                          // from 0x38
            XCTAssertEqual(merged?.avgPowerWatts, 225)                         // from 0x38
        }
        XCTAssertEqual(a[1], b[1])
    }

    func testApplySplitChunkIgnoresNonSplitUUID() {
        var splits: [Int: PM5Split] = [:]
        XCTAssertFalse(PM5DataParser.applySplitChunk(uuid: generalStatusUUID, data: d([0x01]), into: &splits))
        XCTAssertTrue(splits.isEmpty)
    }

    func testTruncatedFramesDegradeToNilWithoutCrash() {
        var s = PM5LiveSample()
        PM5DataParser.applyChunk(uuid: generalStatusUUID, data: d([0x00, 0x00]), into: &s)
        XCTAssertNil(s.dragFactor)   // frame too short to reach @18
        var splits: [Int: PM5Split] = [:]
        _ = PM5DataParser.applySplitChunk(uuid: splitUUID, data: d([0x00]), into: &splits)
        XCTAssertTrue(splits.isEmpty)   // no interval number → nothing upserted
    }

    // MARK: - Codable shape (persistence / wire round-trip)

    func testPM5SplitCodableRoundTrip() throws {
        let split = PM5Split(
            index: 3, timeSeconds: 111.3, distanceMeters: 500,
            restTimeSeconds: 60, restDistanceMeters: 0,
            avgPaceSecPer500m: 111.5, strokeRateSpm: 27, avgPowerWatts: 225,
            totalCalories: 18, avgCaloriesPerHour: 650, avgDragFactor: 120,
            avgHeartRateBpm: 158
        )
        let data = try JSONEncoder().encode([split])
        let decoded = try JSONDecoder().decode([PM5Split].self, from: data)
        XCTAssertEqual(decoded, [split])
    }

    func testErgSplitDTOEmitsBackendSnakeCaseKeys() throws {
        // The backend folds these into raw_lap_data_json verbatim — the exact key
        // names are the contract, so pin them.
        let dto = ErgSplitDTO(
            index: 1, time_seconds: 111.3, distance_meters: 500,
            avg_pace_s_per_500m: 111.5, stroke_rate_spm: 27, avg_power_w: 225,
            calories: 18, calories_per_hour: 650, drag_factor: 120,
            rest_time_seconds: 60, rest_distance_meters: 0, avg_hr: 158
        )
        let json = String(data: try JSONEncoder().encode(dto), encoding: .utf8) ?? ""
        for key in ["\"index\"", "\"time_seconds\"", "\"distance_meters\"",
                    "\"avg_pace_s_per_500m\"", "\"stroke_rate_spm\"", "\"avg_power_w\"",
                    "\"calories_per_hour\"", "\"drag_factor\"", "\"rest_time_seconds\"",
                    "\"avg_hr\""] {
            XCTAssertTrue(json.contains(key), "erg split wire JSON missing \(key)")
        }
    }
}
