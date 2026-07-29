import XCTest
@testable import FAHYBRIK

// The zone bar reads against the SESSION, not against the strap's uptime.
//
// The fixtures are the real `raw_lap_data_json.zone_seconds` rows in production
// (all nine of them, athlete 64 except 170) paired with their execution's
// `total_duration_seconds`. They are the whole population, so a regression here
// is a regression on every zone bar that exists.
final class ZoneCoverageTests: XCTestCase {

    private func pcts(_ coverage: ZoneCoverage?) -> [String: Int] {
        Dictionary(uniqueKeysWithValues: (coverage?.bands ?? []).map { ($0.label, $0.pct) })
    }

    // MARK: - The bug that started this

    // Execution 162: 236 s Z1 + 246 s Z2 over a 572 s session. Over the SUM it
    // painted 49/51 and claimed the whole workout; 90 s of it had no pulse.
    func testExecution162SplitsOverTheSessionAndDeclaresTheHole() {
        let coverage = ZoneCoverage.read(zoneSeconds: [1: 236, 2: 246], windowSeconds: 572)
        let byLabel = pcts(coverage)
        XCTAssertEqual(byLabel["Z1"], 41)
        XCTAssertEqual(byLabel["Z2"], 43)
        XCTAssertEqual(byLabel[ZoneCoverage.unknownLabel], 16)
        XCTAssertEqual(coverage?.hasUnknown, true)
    }

    // The legend must add to exactly 100 — over the real base this time.
    func testEveryProductionRowAddsUpToOneHundred() {
        let rows: [(String, [Int: Double], Double)] = [
            ("90", [1: 9], 16),
            ("97", [1: 81], 85),
            ("162", [1: 236, 2: 246], 572),
            ("164", [1: 327, 2: 69], 396),
            ("170", [1: 19], 19),
            ("173", [1: 121], 121),
            ("175", [1: 42, 2: 85, 3: 195, 4: 38], 361),
            ("177", [2: 49, 3: 246, 4: 284], 652),
            ("179", [1: 18, 2: 111, 3: 95, 4: 117, 5: 51], 392),
        ]
        for (id, zones, window) in rows {
            guard let coverage = ZoneCoverage.read(zoneSeconds: zones, windowSeconds: window) else {
                return XCTFail("execution \(id) must yield a reading")
            }
            XCTAssertEqual(coverage.bands.reduce(0) { $0 + $1.pct }, 100, "execution \(id)")
        }
    }

    // The four rows whose strap covered everything must show no hole at all —
    // declaring one there would be its own fabrication.
    func testFullyCoveredRowsDeclareNoHole() {
        for (zones, window) in [([1: 327.0, 2: 69.0], 396.0), ([1: 19.0], 19.0), ([1: 121.0], 121.0)] {
            let coverage = ZoneCoverage.read(zoneSeconds: zones, windowSeconds: window)
            XCTAssertEqual(coverage?.hasUnknown, false)
        }
    }

    // Execution 90: 9 s of 16. Over the sum this painted "Z1 100%".
    func testMostlyUnmeasuredSessionSaysSo() {
        let byLabel = pcts(ZoneCoverage.read(zoneSeconds: [1: 9], windowSeconds: 16))
        XCTAssertEqual(byLabel["Z1"], 56)
        XCTAssertEqual(byLabel[ZoneCoverage.unknownLabel], 44)
    }

    // MARK: - Nothing measured → no bar

    // No anchor means no zones at all (`WorkoutSession.liveZone` stays nil), and
    // a bar with nothing in it insinuates a reading we do not have (§7).
    func testNoZonesYieldsNoReading() {
        XCTAssertNil(ZoneCoverage.read(zoneSeconds: [:], windowSeconds: 600))
        XCTAssertNil(ZoneCoverage.read(zoneSeconds: [1: 0, 2: 0], windowSeconds: 600))
        XCTAssertNil(ZoneCoverage.read(zoneSecondsByKey: [:], windowSeconds: 600))
        XCTAssertNil(ZoneCoverage.read(laps: []))
    }

    // A missing clock is NOT a missing reading. If 100 s were classified, at
    // least 100 s were trained, so the accumulation becomes the window and the
    // bar says "Z1, all of it" — true, and narrower than the truth at worst.
    // Inventing a hole here would be the mirror of the bug being fixed.
    func testAbsentClockFallsBackToWhatWasMeasured() {
        let coverage = ZoneCoverage.read(zoneSeconds: [1: 100], windowSeconds: 0)
        XCTAssertEqual(pcts(coverage)["Z1"], 100)
        XCTAssertEqual(coverage?.hasUnknown, false)
    }

    // MARK: - Zeros stay out of the legend

    // A zone the athlete never entered is not a "0 %" chip: it is nothing. The
    // old bar walked all five HRZone cases and printed Z3/Z4/Z5 at 0 %.
    func testUnvisitedZonesAreAbsentNotZero() {
        let coverage = ZoneCoverage.read(zoneSeconds: [1: 236, 2: 246], windowSeconds: 572)
        XCTAssertEqual(coverage?.bands.compactMap(\.zone), [.z1, .z2])
    }

    // MARK: - Shapes

    // The wire shape ("z1"…"z5") reads identically, and junk keys are ignored
    // rather than counted into the base.
    func testWireKeysReadLikeRawZones() {
        let byLabel = pcts(ZoneCoverage.read(zoneSecondsByKey: ["z1": 236, "z2": 246, "drag": 118], windowSeconds: 572))
        XCTAssertEqual(byLabel["Z1"], 41)
        XCTAssertEqual(byLabel["Z2"], 43)
        XCTAssertEqual(byLabel[ZoneCoverage.unknownLabel], 16)
    }

    // A clock shorter than the accumulation is rounding, not a negative hole.
    func testWindowShorterThanMeasuredNeverOverflows() {
        guard let coverage = ZoneCoverage.read(zoneSeconds: [1: 121], windowSeconds: 120) else {
            return XCTFail("must still read")
        }
        XCTAssertEqual(coverage.bands.reduce(0) { $0 + $1.pct }, 100)
        XCTAssertFalse(coverage.hasUnknown)
    }

    // The band order is the reading order: zones ascending, the hole last.
    func testHoleIsTheLastBand() {
        let coverage = ZoneCoverage.read(zoneSeconds: [1: 236, 2: 246], windowSeconds: 572)
        XCTAssertEqual(coverage?.bands.last?.zone, nil)
        XCTAssertEqual(coverage?.bands.last?.label, ZoneCoverage.unknownLabel)
    }

    // Laps carry their own clock, so the window is derived once and not per view.
    func testLapsDeriveTheirOwnWindow() {
        let laps = [
            ZoneCoverageTests.lap(duration: 300, zones: [1: 236]),
            ZoneCoverageTests.lap(duration: 272, zones: [2: 246]),
        ]
        let byLabel = pcts(ZoneCoverage.read(laps: laps))
        XCTAssertEqual(byLabel["Z1"], 41)
        XCTAssertEqual(byLabel["Z2"], 43)
        XCTAssertEqual(byLabel[ZoneCoverage.unknownLabel], 16)
    }

    private static func lap(duration: Double, zones: [Int: Double]) -> LapRecord {
        LapRecord(
            id: UUID(), segmentId: UUID(), templateSegmentId: nil, position: 1, modality: "run",
            startedAt: Date(), endedAt: Date(), durationSeconds: duration,
            avgHRBpm: nil, maxHRBpm: nil, zoneSecondsByZone: zones,
            repsCompleted: nil, distanceCoveredMeters: nil, avgPaceSecPer500m: nil,
            avgPaceSecPerKm: nil, avgPowerWatts: nil, strokeRateSpm: nil, calories: nil,
            weightUsedKg: nil, source: "healthkit"
        )
    }
}
