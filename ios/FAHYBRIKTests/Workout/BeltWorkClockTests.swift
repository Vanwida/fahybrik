import XCTest
@testable import FAHYBRIK

final class BeltWorkClockTests: XCTestCase {

    func testThresholdTreatsHalfKmhAsStopped() {
        XCTAssertFalse(BeltWorkClock.isMoving(nil))
        XCTAssertFalse(BeltWorkClock.isMoving(0))
        XCTAssertFalse(BeltWorkClock.isMoving(BeltWorkClock.minMovingKmh))
        XCTAssertTrue(BeltWorkClock.isMoving(0.51))
    }

    func testWorkTickDoesNotAccrueUntilBeltSendsSpeed() {
        let dt = BeltWorkClock.workTick(wallDt: 0.25, surface: .ftms,
                                        window: .work, beltMoving: false)
        XCTAssertEqual(dt, 0)
    }

    func testWorkTickAccruesWhileBeltMoves() {
        let dt = BeltWorkClock.workTick(wallDt: 0.25, surface: .ftms,
                                        window: .work, beltMoving: true)
        XCTAssertEqual(dt, 0.25)
    }

    func testNoFtmsFeedLeavesWallClockAlone() {
        let dt = BeltWorkClock.workTick(wallDt: 0.25, surface: .ftms,
                                        window: .work, beltMoving: nil)
        XCTAssertEqual(dt, 0.25)
    }

    func testRecoveryAndFormatKeepWallTimeWhenBeltStops() {
        XCTAssertEqual(
            BeltWorkClock.workTick(wallDt: 1, surface: .ftms, window: .recovery, beltMoving: false),
            1)
        XCTAssertEqual(
            BeltWorkClock.workTick(wallDt: 1, surface: .ftms, window: .format, beltMoving: false),
            1)
        XCTAssertEqual(
            BeltWorkClock.workTick(wallDt: 1, surface: .other, window: .work, beltMoving: false),
            1)
    }
}
