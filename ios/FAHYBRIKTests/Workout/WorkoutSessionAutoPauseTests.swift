import XCTest
@testable import FAHYBRIK

// #64 — the session-level auto-pause handshake. Auto-pause freezes the clock like a
// manual pause but stays DISTINCT: only it is auto-resumed, and any MANUAL action
// clears it. These lock the invariant (autoPaused ⇒ isPaused) and the "manual wins"
// rule the outdoor GPS HUD relies on.
final class WorkoutSessionAutoPauseTests: XCTestCase {

    // A plain continuous run, started and running (not paused, not awaiting a block).
    private func runningSession() -> WorkoutSession {
        let seg = WorkoutSegment(order: 1, title: "Rodaje", kind: .running,
                                 targetDistanceMeters: 5000, blockTitle: "Carrera", blockPosition: 1)
        let plan = WorkoutPlan(id: UUID(), name: "Test", format: .steady, estimatedDurationSeconds: 900,
                               blockContext: "Test", zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()   // running, not paused, not awaiting
        return s
    }

    func testAutoPauseFreezesAndAutoResumeLifts() {
        let s = runningSession()
        s.autoPause()
        XCTAssertTrue(s.isPaused)
        XCTAssertTrue(s.autoPaused)
        s.autoResume()
        XCTAssertFalse(s.isPaused)
        XCTAssertFalse(s.autoPaused)
    }

    // Resuming BY HAND from an auto-pause clears the auto flag — the athlete took over.
    func testManualResumeClearsAutoPause() {
        let s = runningSession()
        s.autoPause()
        s.togglePause()
        XCTAssertFalse(s.isPaused)
        XCTAssertFalse(s.autoPaused)
    }

    // Auto-resume must NEVER lift a manual pause (the athlete's own hold).
    func testAutoResumeNeverLiftsAManualPause() {
        let s = runningSession()
        s.togglePause()                 // manual pause
        XCTAssertTrue(s.isPaused)
        XCTAssertFalse(s.autoPaused)
        s.autoResume()
        XCTAssertTrue(s.isPaused, "a manual pause is the athlete's hold — untouched")
    }

    // A manual pause is never marked auto, and auto-pause is a no-op while already paused.
    func testManualPauseNeverAutoAndAutoPauseNoOpWhenPaused() {
        let s = runningSession()
        s.togglePause()                 // manual pause
        XCTAssertFalse(s.autoPaused)
        s.autoPause()                   // already paused → no-op, still a manual hold
        XCTAssertFalse(s.autoPaused)
    }
}
