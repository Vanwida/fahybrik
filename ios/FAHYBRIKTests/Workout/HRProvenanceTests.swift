import XCTest
@testable import FAHYBRIK

// The HR provenance LATCH in WorkoutSession.injectLiveHR: several sources can stream
// at once (a chest strap, the Apple Watch via HealthKit, a PM5-paired strap). Every
// reading is real HR — it updates the live value + the lap samples — but the SOURCE
// label (what the connection strip shows) only changes for an equal-or-higher
// priority source: strap > healthkit > pm5. A lower-priority reading never steals it.
final class HRProvenanceTests: XCTestCase {

    private func session() -> WorkoutSession {
        WorkoutSession(plan: .minimal(title: "Test"))
    }

    func testStrapTakesProvenanceOverHealthKit() {
        let s = session()
        s.injectLiveHR(150, source: .healthkit)
        XCTAssertEqual(s.hrSource, .healthkit)
        s.injectLiveHR(148, source: .strap)      // higher priority steals the label
        XCTAssertEqual(s.hrSource, .strap)
        XCTAssertEqual(s.liveHRBpm, 148)
    }

    func testHealthKitDoesNotStealFromStrapButStillUpdatesValue() {
        let s = session()
        s.injectLiveHR(150, source: .strap)
        XCTAssertEqual(s.hrSource, .strap)
        s.injectLiveHR(162, source: .healthkit)  // lower priority: no steal…
        XCTAssertEqual(s.hrSource, .strap)        // …provenance stays strap
        XCTAssertEqual(s.liveHRBpm, 162)          // …but the live value (and lap append) still runs
    }

    func testPm5StaysUnderAnyHigherSource() {
        // Existing behavior preserved: PM5 never overrides an active watch stream.
        let a = session()
        a.injectLiveHR(140, source: .healthkit)
        a.injectLiveHR(200, source: .pm5)
        XCTAssertEqual(a.hrSource, .healthkit)
        XCTAssertEqual(a.liveHRBpm, 200)

        // And it stays under a strap too.
        let b = session()
        b.injectLiveHR(150, source: .strap)
        b.injectLiveHR(210, source: .pm5)
        XCTAssertEqual(b.hrSource, .strap)
        XCTAssertEqual(b.liveHRBpm, 210)
    }

    func testPm5IsProvenanceWhenAlone() {
        let s = session()
        s.injectLiveHR(190, source: .pm5)
        XCTAssertEqual(s.hrSource, .pm5)
        XCTAssertEqual(s.liveHRBpm, 190)
    }

    func testPauseAndFinishGuardBlockInjection() {
        let s = session()
        s.injectLiveHR(150, source: .strap)
        s.isPaused = true
        s.injectLiveHR(80, source: .strap)        // rest-HR while paused is not training data
        XCTAssertEqual(s.liveHRBpm, 150)
        s.isPaused = false
        s.isFinished = true
        s.injectLiveHR(70, source: .strap)        // after the session ends: ignored
        XCTAssertEqual(s.liveHRBpm, 150)
    }
}
