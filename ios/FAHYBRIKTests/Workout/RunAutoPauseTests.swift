import XCTest
@testable import FAHYBRIK

// #64 — auto-pause hysteresis. These pin the four rules that make it trustworthy:
// engage only on a sustained confident stop, release on sustained movement (with a
// gap so it can't flap), never fight a manual pause, and never freeze a leg that
// no longer supports auto-pause.
final class RunAutoPauseTests: XCTestCase {

    // A sustained stop engages after the dwell — not on the first slow reading.
    func testEngagesAfterSustainedStop() {
        var ap = RunAutoPause()
        XCTAssertEqual(ap.step(speedMps: 0.2, eligible: true, isManualPause: false, now: 0), .none)
        XCTAssertEqual(ap.step(speedMps: 0.2, eligible: true, isManualPause: false, now: 2), .none)
        XCTAssertEqual(ap.step(speedMps: 0.2, eligible: true, isManualPause: false, now: 3), .engage)
        XCTAssertTrue(ap.isEngaged)
    }

    // A brief slowdown (below threshold, then moving again before the dwell) never
    // engages.
    func testBriefSlowdownDoesNotEngage() {
        var ap = RunAutoPause()
        XCTAssertEqual(ap.step(speedMps: 0.3, eligible: true, isManualPause: false, now: 0), .none)
        XCTAssertEqual(ap.step(speedMps: 0.3, eligible: true, isManualPause: false, now: 1), .none)
        XCTAssertEqual(ap.step(speedMps: 3.0, eligible: true, isManualPause: false, now: 2), .none)
        XCTAssertEqual(ap.step(speedMps: 3.0, eligible: true, isManualPause: false, now: 6), .none)
        XCTAssertFalse(ap.isEngaged)
    }

    // Once engaged, sustained movement above the RELEASE threshold resumes.
    func testReleasesAfterSustainedMovement() {
        var ap = engaged()
        XCTAssertEqual(ap.step(speedMps: 2.0, eligible: true, isManualPause: false, now: 10), .none)
        XCTAssertEqual(ap.step(speedMps: 2.0, eligible: true, isManualPause: false, now: 11.5), .release)
        XCTAssertFalse(ap.isEngaged)
    }

    // Hysteresis: a speed above engage-threshold but below release-threshold does NOT
    // resume — it stays paused, so it can't flap around the boundary.
    func testHysteresisHoldsBetweenThresholds() {
        var ap = engaged()
        // 0.9 m/s: above engageSpeed (0.6) but below releaseSpeed (1.2).
        XCTAssertEqual(ap.step(speedMps: 0.9, eligible: true, isManualPause: false, now: 10), .none)
        XCTAssertEqual(ap.step(speedMps: 0.9, eligible: true, isManualPause: false, now: 20), .none)
        XCTAssertTrue(ap.isEngaged)
    }

    // Lost signal while paused keeps it paused (can't confirm movement); lost signal
    // while running never engages.
    func testSignalLossIsSafe() {
        var paused = engaged()
        XCTAssertEqual(paused.step(speedMps: nil, eligible: true, isManualPause: false, now: 10), .none)
        XCTAssertTrue(paused.isEngaged)

        var running = RunAutoPause()
        XCTAssertEqual(running.step(speedMps: nil, eligible: true, isManualPause: false, now: 0), .none)
        XCTAssertEqual(running.step(speedMps: nil, eligible: true, isManualPause: false, now: 5), .none)
        XCTAssertFalse(running.isEngaged)
    }

    // A manual pause makes auto-pause stand down and forget its timers, so a manual
    // resume doesn't instantly re-engage from a stale stop-timer.
    func testManualPauseStandsDown() {
        var ap = RunAutoPause()
        _ = ap.step(speedMps: 0.2, eligible: true, isManualPause: false, now: 0)   // start the stop timer
        XCTAssertEqual(ap.step(speedMps: 0.2, eligible: true, isManualPause: true, now: 1), .none)
        // Resume manually; the stop timer was cleared, so no instant engage.
        XCTAssertEqual(ap.step(speedMps: 0.2, eligible: true, isManualPause: false, now: 2), .none)
        XCTAssertFalse(ap.isEngaged)
    }

    // While auto-paused, a leg that no longer supports auto-pause releases at once so
    // a time leg's clock is never left frozen.
    func testIneligibleLegReleasesImmediately() {
        var ap = engaged()
        XCTAssertEqual(ap.step(speedMps: 0.0, eligible: false, isManualPause: false, now: 10), .release)
        XCTAssertFalse(ap.isEngaged)
    }

    // Helper: drive the machine into the engaged state.
    private func engaged() -> RunAutoPause {
        var ap = RunAutoPause()
        _ = ap.step(speedMps: 0.1, eligible: true, isManualPause: false, now: 0)
        _ = ap.step(speedMps: 0.1, eligible: true, isManualPause: false, now: 2)
        let a = ap.step(speedMps: 0.1, eligible: true, isManualPause: false, now: 3)
        precondition(a == .engage)
        return ap
    }
}
