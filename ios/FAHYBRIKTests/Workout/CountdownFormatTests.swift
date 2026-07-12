import XCTest
@testable import FAHYBRIK

// #68 micro-fix — two count-down contexts round differently:
//   • standalone (CEIL): the watch is the sole display → shows the whole second, in
//     sync with the engine's audio ticks, and NEVER ":00" before the boundary (a
//     3-2-1 count-in must not flash 0 while the audio still says "1").
//   • mirrored (ROUND): the watch duplicates the iPhone's clock → rounds like
//     formatElapsed, so it never reads 1s ahead of the phone (Alex's bug photo).
final class CountdownFormatTests: XCTestCase {

    // Count-in / standalone: CEIL. 2.5 → ":03" (shows the 3rd second); crucially it
    // never drops to ":00" until the boundary is actually reached.
    func testStandaloneCeilsAndNeverZeroEarly() {
        XCTAssertEqual(CountdownFormat.standalone(2.5), ":03")   // shows "3" (CEIL)
        XCTAssertEqual(CountdownFormat.standalone(2.1), ":03")   // CEIL — a round() would give :02
        XCTAssertEqual(CountdownFormat.standalone(0.3), ":01")   // still counting the last second, not :00
        XCTAssertEqual(CountdownFormat.standalone(-5), ":00")    // never negative
    }

    // Mirror: ROUND, matching the phone's formatElapsed.
    func testMirroredRoundsLikeThePhone() {
        XCTAssertEqual(CountdownFormat.mirrored(53.4), ":53")    // rounds down (CEIL gave :54 → the bug)
        XCTAssertEqual(CountdownFormat.mirrored(53.5), ":54")    // boundary rounds up — matches formatElapsed
        XCTAssertEqual(CountdownFormat.mirrored(-5), ":00")      // never negative
    }

    // The two disagree by design at a sub-second boundary — the exact seam of the fix.
    func testStandaloneAndMirroredDivergeAtTheBoundary() {
        XCTAssertEqual(CountdownFormat.standalone(0.3), ":01")   // CEIL — the whole second
        XCTAssertEqual(CountdownFormat.mirrored(0.3), ":00")     // ROUND — matches the phone
    }

    func testMinuteAndOverUsesTheSharedElapsedFormatter() {
        XCTAssertEqual(CountdownFormat.standalone(60), "01:00")
        XCTAssertEqual(CountdownFormat.mirrored(89.6), "01:30")  // 90 → 1:30
    }
}
