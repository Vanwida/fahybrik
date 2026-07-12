import XCTest
@testable import FAHYBRIK

// #68 micro-fix — the wrist countdown must round to the nearest whole second the way
// the iPhone does (WorkoutSession.formatElapsed), not CEIL: the mirror clock read 1s
// ahead of the phone (Alex's bug photo). WatchFormat.countdown delegates here.
final class CountdownFormatTests: XCTestCase {

    func testRoundsToNearestLikeThePhone() {
        XCTAssertEqual(CountdownFormat.label(53.4), ":53")   // rounds down (CEIL gave :54)
        XCTAssertEqual(CountdownFormat.label(53.5), ":54")   // boundary rounds up — matches formatElapsed
        XCTAssertEqual(CountdownFormat.label(0.4), ":00")
    }

    func testNeverNegative() {
        XCTAssertEqual(CountdownFormat.label(-5), ":00")
    }

    func testMinuteAndOverUsesTheSharedElapsedFormatter() {
        XCTAssertEqual(CountdownFormat.label(60), "01:00")
        XCTAssertEqual(CountdownFormat.label(89.6), "01:30")   // 90 → 1:30
    }
}
