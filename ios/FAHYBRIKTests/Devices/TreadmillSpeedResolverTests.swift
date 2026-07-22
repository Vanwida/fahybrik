import XCTest
@testable import FAHYBRIK

// The read-mode fix: honest belt speed + a stable pace even when the machine's
// Instantaneous Speed field lies (reads 0 while the belt runs). Pure, clock-injected.
final class TreadmillSpeedResolverTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_000_000)
    private func at(_ s: TimeInterval) -> Date { t0.addingTimeInterval(s) }

    func testNothingIngestedIsNil() {
        let r = TreadmillSpeedResolver()
        XCTAssertNil(r.displaySpeedKmh)
        XCTAssertNil(r.paceSecPerKm)
    }

    func testLiveInstantaneousSpeedIsUsedAndPaced() {
        var r = TreadmillSpeedResolver()
        r.ingest(instantaneousKmh: 10, avgKmh: nil, odometerM: 0, at: at(0))
        r.ingest(instantaneousKmh: 10, avgKmh: nil, odometerM: 1.4, at: at(0.5))
        XCTAssertEqual(r.displaySpeedKmh ?? 0, 10, accuracy: 0.01)
        XCTAssertEqual(r.paceSecPerKm ?? 0, 360, "3600 / 10 km/h")
    }

    /// THE FIELD BUG: instantaneous speed frozen at 0, but the odometer climbs ~1 m/s ⇒
    /// the belt is really doing ~3.6 km/h. The resolver must show that, not 0.0.
    func testDerivesSpeedFromTheAdvancingOdometerWhenInstantaneousIsZero() {
        var r = TreadmillSpeedResolver()
        r.ingest(instantaneousKmh: 0, avgKmh: nil, odometerM: 100, at: at(0))
        r.ingest(instantaneousKmh: 0, avgKmh: nil, odometerM: 101, at: at(1))   // +1 m in 1 s
        XCTAssertEqual(r.displaySpeedKmh ?? 0, 3.6, accuracy: 0.05, "1 m/s = 3.6 km/h")
        XCTAssertEqual(r.paceSecPerKm ?? 0, 1000, "3600 / 3.6 km/h")
    }

    func testGenuinelyStoppedReadsZeroAndNoPace() {
        var r = TreadmillSpeedResolver()
        r.ingest(instantaneousKmh: 0, avgKmh: nil, odometerM: 100, at: at(0))
        r.ingest(instantaneousKmh: 0, avgKmh: nil, odometerM: 100, at: at(1))   // odometer flat
        XCTAssertEqual(r.displaySpeedKmh ?? -1, 0, accuracy: 0.001)
        XCTAssertNil(r.paceSecPerKm, "no pace at a standstill — never a divide-by-zero")
    }

    /// A packet that drops the instantaneous field mid-run must NOT flicker the pace to
    /// "—:—": the odometer keeps the speed alive across the gap.
    func testPaceStaysStableWhenInstantaneousDropsOutMidRun() {
        var r = TreadmillSpeedResolver()
        r.ingest(instantaneousKmh: 10, avgKmh: nil, odometerM: 0, at: at(0))
        r.ingest(instantaneousKmh: nil, avgKmh: nil, odometerM: 2.78, at: at(1))   // ~10 km/h by odometer
        XCTAssertNotNil(r.paceSecPerKm, "a dropped instantaneous packet must not blank the pace")
        XCTAssertEqual(r.displaySpeedKmh ?? 0, 10, accuracy: 0.3)
    }

    /// A belt that sends NO Total Distance and a frozen instantaneous field still has the
    /// Average Speed field — the last-resort real number.
    func testAverageSpeedFallbackWhenNoOdometerAndInstantaneousZero() {
        var r = TreadmillSpeedResolver()
        r.ingest(instantaneousKmh: 0, avgKmh: 7.5, odometerM: nil, at: at(0))
        r.ingest(instantaneousKmh: 0, avgKmh: 7.5, odometerM: nil, at: at(1))
        XCTAssertEqual(r.displaySpeedKmh ?? 0, 7.5, accuracy: 0.01)
    }

    func testOldSamplesFallOutOfTheWindow() {
        var r = TreadmillSpeedResolver()
        r.ingest(instantaneousKmh: 12, avgKmh: nil, odometerM: 0, at: at(0))
        // Far in the future, belt stopped: the stale 12 must not linger.
        r.ingest(instantaneousKmh: 0, avgKmh: nil, odometerM: 50, at: at(30))
        r.ingest(instantaneousKmh: 0, avgKmh: nil, odometerM: 50, at: at(31))
        XCTAssertEqual(r.displaySpeedKmh ?? -1, 0, accuracy: 0.001)
    }
}
