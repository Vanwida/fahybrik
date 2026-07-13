import XCTest
@testable import FAHYBRIK

// The single shared HR-max resolver (Theme/ZoneColors.swift): a measured/entered
// max wins whenever sane, else the 220−age estimate (flagged), else nil — never a
// fabricated default. Drives every HR-zone surface (engine, treadmill/outdoor
// HUDs, watch, post-workout desglose), so its priority + bounds are pinned here.
final class PersonalHRMaxTests: XCTestCase {

    // MARK: - resolve() priority

    func testMeasuredMaxWinsAndIsNotEstimated() {
        let src = PersonalHRMax.resolve(measuredMaxHrBpm: 192, age: 30)
        XCTAssertEqual(src, HRMaxSource(bpm: 192, isEstimated: false))
    }

    func testFallsBackToAgeEstimateWhenNoMeasured() {
        let src = PersonalHRMax.resolve(measuredMaxHrBpm: nil, age: 30)
        XCTAssertEqual(src, HRMaxSource(bpm: 190, isEstimated: true)) // 220 − 30
    }

    func testNilWhenNeitherMeasuredNorAge() {
        XCTAssertNil(PersonalHRMax.resolve(measuredMaxHrBpm: nil, age: nil))
    }

    // MARK: - measured-max sanity bounds (100…230)

    func testMeasuredMaxAtBoundsAccepted() {
        XCTAssertEqual(PersonalHRMax.resolve(measuredMaxHrBpm: 100, age: nil)?.bpm, 100)
        XCTAssertEqual(PersonalHRMax.resolve(measuredMaxHrBpm: 230, age: nil)?.bpm, 230)
    }

    func testMeasuredMaxOutOfRangeFallsThroughToEstimate() {
        // Absurd measured value is ignored; a known age still yields the estimate.
        let low = PersonalHRMax.resolve(measuredMaxHrBpm: 60, age: 40)
        XCTAssertEqual(low, HRMaxSource(bpm: 180, isEstimated: true))
        let high = PersonalHRMax.resolve(measuredMaxHrBpm: 300, age: 40)
        XCTAssertEqual(high, HRMaxSource(bpm: 180, isEstimated: true))
    }

    func testMeasuredMaxOutOfRangeWithNoAgeIsNil() {
        XCTAssertNil(PersonalHRMax.resolve(measuredMaxHrBpm: 99, age: nil))
        XCTAssertNil(PersonalHRMax.resolve(measuredMaxHrBpm: 231, age: nil))
    }

    // MARK: - age bounds

    func testAgeOutOfRangeYieldsNoEstimate() {
        XCTAssertNil(PersonalHRMax.resolve(measuredMaxHrBpm: nil, age: 0))
        XCTAssertNil(PersonalHRMax.resolve(measuredMaxHrBpm: nil, age: 120))
    }

    // MARK: - zone(forBpm:source:)

    func testZoneNilSourceGivesNilZone() {
        XCTAssertNil(PersonalHRMax.zone(forBpm: 150, source: nil))
    }

    func testZoneClassifiesAgainstResolvedMax() {
        let src = PersonalHRMax.resolve(measuredMaxHrBpm: nil, age: 30) // max 190
        XCTAssertEqual(PersonalHRMax.zone(forBpm: 170, source: src), .z4) // 0.894
        XCTAssertEqual(PersonalHRMax.zone(forBpm: 180, source: src), .z5) // 0.947
        XCTAssertEqual(PersonalHRMax.zone(forBpm: 114, source: src), .z2) // exactly 0.60 → z2
    }

    func testMeasuredMaxChangesTheZone() {
        // Same BPM lands in a different zone off a personal vs estimated max.
        let estimated = PersonalHRMax.resolve(measuredMaxHrBpm: nil, age: 20)  // 200
        let measured = PersonalHRMax.resolve(measuredMaxHrBpm: 175, age: 20)   // 175
        XCTAssertEqual(PersonalHRMax.zone(forBpm: 158, source: estimated), .z3) // 0.79
        XCTAssertEqual(PersonalHRMax.zone(forBpm: 158, source: measured), .z5)  // 0.90+
    }
}
