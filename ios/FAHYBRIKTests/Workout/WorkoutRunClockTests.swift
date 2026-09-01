import XCTest
@testable import FAHYBRIK

/// ONE clock. Not HKWorkoutBuilder vs HKLiveWorkoutBuilder.
final class WorkoutRunClockTests: XCTestCase {

    func testNoSessionUsesDiskOffset() {
        XCTAssertEqual(
            WorkoutRunClock.elapsed(
                diskOffset: 90,
                sessionStart: nil,
                pauseBeganAt: nil,
                pausedAccumulated: 0,
                now: Date()
            ),
            90,
            accuracy: 0.01
        )
    }

    func testRunningAddsWallMinusPauses() {
        let start = Date(timeIntervalSince1970: 1_000)
        let now = Date(timeIntervalSince1970: 1_100)
        XCTAssertEqual(
            WorkoutRunClock.elapsed(
                diskOffset: 30,
                sessionStart: start,
                pauseBeganAt: nil,
                pausedAccumulated: 10,
                now: now
            ),
            120,
            accuracy: 0.01
        )
    }

    func testPausedFreezesAtPauseBegan() {
        let start = Date(timeIntervalSince1970: 1_000)
        let pause = Date(timeIntervalSince1970: 1_040)
        let now = Date(timeIntervalSince1970: 1_400)
        XCTAssertEqual(
            WorkoutRunClock.elapsed(
                diskOffset: 0,
                sessionStart: start,
                pauseBeganAt: pause,
                pausedAccumulated: 0,
                now: now
            ),
            40,
            accuracy: 0.01
        )
    }

    func testNeverNegative() {
        let start = Date(timeIntervalSince1970: 1_000)
        XCTAssertEqual(
            WorkoutRunClock.elapsed(
                diskOffset: 0,
                sessionStart: start,
                pauseBeganAt: nil,
                pausedAccumulated: 9_999,
                now: Date(timeIntervalSince1970: 1_001)
            ),
            0,
            accuracy: 0.01
        )
    }
}
