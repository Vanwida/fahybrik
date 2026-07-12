import XCTest
@testable import FAHYBRIK

// The simulator mock must be DETERMINISTIC so the HUD looks the same on every run
// and these values are the contract the timer-driven sources replay.
final class MockDeviceProfileTests: XCTestCase {

    func testTreadmillRamp() {
        XCTAssertEqual(MockTreadmillProfile.speedKmh(tick: 0), 8.0)
        XCTAssertEqual(MockTreadmillProfile.speedKmh(tick: 5), 10.5)
        XCTAssertEqual(MockTreadmillProfile.speedKmh(tick: 10), 13.0)
        XCTAssertEqual(MockTreadmillProfile.speedKmh(tick: 30), 13.0) // holds after the ramp
    }

    func testTreadmillInclineStep() {
        XCTAssertEqual(MockTreadmillProfile.inclinePct(tick: 5), 1.0)
        XCTAssertEqual(MockTreadmillProfile.inclinePct(tick: 10), 2.0)
    }

    func testTreadmillDistanceMonotonic() {
        let d0 = MockTreadmillProfile.totalDistanceM(tick: 0)
        let d1 = MockTreadmillProfile.totalDistanceM(tick: 1)
        let d10 = MockTreadmillProfile.totalDistanceM(tick: 10)
        XCTAssertGreaterThan(d1, d0)
        XCTAssertGreaterThan(d10, d1)
    }

    func testTreadmillSampleIsDeterministic() {
        // Every field is fixed by the tick EXCEPT lastUpdate, which is real time.
        let a = MockTreadmillProfile.sample(tick: 7)
        let b = MockTreadmillProfile.sample(tick: 7)
        XCTAssertEqual(a.speedKmh, b.speedKmh)
        XCTAssertEqual(a.inclinePct, b.inclinePct)
        XCTAssertEqual(a.totalDistanceM, b.totalDistanceM)
        XCTAssertEqual(a.elapsedS, b.elapsedS)
        XCTAssertEqual(MockTreadmillProfile.sample(tick: 0).elapsedS, 0)
    }

    func testHeartRateRampAndCap() {
        XCTAssertEqual(MockHRProfile.bpm(tick: 0), 96)
        XCTAssertEqual(MockHRProfile.bpm(tick: 5), 111)
        XCTAssertEqual(MockHRProfile.bpm(tick: 24), 168)
        XCTAssertEqual(MockHRProfile.bpm(tick: 100), 168) // capped
    }
}
