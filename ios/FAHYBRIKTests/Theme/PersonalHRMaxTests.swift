import XCTest
@testable import FAHYBRIK

// The single shared HR-max resolver (Theme/ZoneColors.swift): a measured/entered max
// wins whenever sane, else a GENERIC age+sex estimate (flagged, labeled "genérica"),
// else nil — never a fabricated default. Generic = Tanaka (208 − 0.7·age) for
// men/other/unknown, Gulati (206 − 0.88·age) for women. Drives every HR-zone surface
// (engine, treadmill/outdoor HUDs, watch, post-workout desglose).
final class PersonalHRMaxTests: XCTestCase {

    // MARK: - resolve() priority

    func testMeasuredMaxWinsAndIsNotEstimated() {
        let src = PersonalHRMax.resolve(measuredMaxHrBpm: 192, age: 30)
        XCTAssertEqual(src, HRMaxSource(bpm: 192, isEstimated: false))
    }

    func testFallsBackToGenericWhenNoMeasured() {
        let src = PersonalHRMax.resolve(measuredMaxHrBpm: nil, age: 30)
        XCTAssertEqual(src, HRMaxSource(bpm: 187, isEstimated: true)) // Tanaka 208 − 0.7·30
    }

    func testNilWhenNeitherMeasuredNorAge() {
        XCTAssertNil(PersonalHRMax.resolve(measuredMaxHrBpm: nil, age: nil))
    }

    // MARK: - generic estimate uses age AND sex

    func testGenericMaxByAgeAndSex() {
        // Women use Gulati, everyone else Tanaka — so the same age yields a different max.
        XCTAssertEqual(PersonalHRMax.resolve(measuredMaxHrBpm: nil, age: 40, sex: "female")?.bpm, 171) // 206 − 0.88·40
        XCTAssertEqual(PersonalHRMax.resolve(measuredMaxHrBpm: nil, age: 40, sex: "male")?.bpm, 180)   // 208 − 0.7·40
        XCTAssertEqual(PersonalHRMax.resolve(measuredMaxHrBpm: nil, age: 40, sex: nil)?.bpm, 180)      // no sex → Tanaka
        XCTAssertEqual(PersonalHRMax.resolve(measuredMaxHrBpm: nil, age: 40)?.bpm, 180)                // default arg
    }

    // MARK: - measured-max sanity bounds (100…230)

    func testMeasuredMaxAtBoundsAccepted() {
        XCTAssertEqual(PersonalHRMax.resolve(measuredMaxHrBpm: 100, age: nil)?.bpm, 100)
        XCTAssertEqual(PersonalHRMax.resolve(measuredMaxHrBpm: 230, age: nil)?.bpm, 230)
    }

    func testMeasuredMaxOutOfRangeFallsThroughToGeneric() {
        // Absurd measured value is ignored; a known age still yields the generic estimate.
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
        let src = PersonalHRMax.resolve(measuredMaxHrBpm: nil, age: 30) // generic max 187
        XCTAssertEqual(PersonalHRMax.zone(forBpm: 150, source: src), .z4) // 0.802
        XCTAssertEqual(PersonalHRMax.zone(forBpm: 178, source: src), .z5) // 0.952
        XCTAssertEqual(PersonalHRMax.zone(forBpm: 115, source: src), .z2) // 0.615
    }

    func testMeasuredMaxChangesTheZone() {
        // Same BPM lands in a different zone off a personal vs generic max.
        let generic = PersonalHRMax.resolve(measuredMaxHrBpm: nil, age: 20)  // 194
        let measured = PersonalHRMax.resolve(measuredMaxHrBpm: 175, age: 20) // 175
        XCTAssertEqual(PersonalHRMax.zone(forBpm: 158, source: generic), .z4)  // 0.814
        XCTAssertEqual(PersonalHRMax.zone(forBpm: 158, source: measured), .z5) // 0.903
    }
}
