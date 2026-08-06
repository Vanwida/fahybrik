import XCTest
@testable import FAHYBRIK

// The HR OWNERSHIP latch in WorkoutSession.injectLiveHR: several sources can stream
// at once (a chest strap, the Apple Watch via HealthKit, a PM5-paired strap — both
// combinations are normal, not edge cases). At any instant only the OWNING source —
// the highest-priority one that reported within `hrSourceStaleSeconds` — may feed
// ANYTHING: the connection-strip label, the on-screen live number, the lap's HR
// samples, the tramo's peak, and the HRR effort tail.
//
// THE BUG these tests lock shut: the priority latch used to gate only the LABEL.
// A lower-priority reading — real HR, but from a device that doesn't own this
// instant — still updated `liveHRBpm` and still entered the lap's aggregation. With
// two sources streaming at once that meant `avg_hr` averaged the UNION of both
// streams (not either device's real pulse), the athlete could see a number the
// connection strip didn't credit, and a weak source's artifact (a PM5 signal spike)
// could become the tramo's recorded `max_hr` even though the strap never got there.
// Now ownership gates the number and every aggregate too, not just the label.
// Priority: strap(3) > healthkit(2) > pm5(1).
final class HRProvenanceTests: XCTestCase {

    private func session() -> WorkoutSession {
        WorkoutSession(plan: .minimal(title: "Test"))
    }

    /// Same session, ARMED (start/beginBlock/stop) so `primaryAdvance()` can close
    /// its one segment's lap — needed to inspect what actually reached
    /// `avgHRBpm` / `maxHRBpm` / `hrSource`, not just the live label. Mirrors
    /// `WorkoutExecutionSpineTests.armedSession`.
    private func armedSession() -> WorkoutSession {
        let s = session()
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    // MARK: - The label latch (unchanged behavior: equal-or-higher takes over at once)

    func testStrapTakesProvenanceOverHealthKit() {
        let s = session()
        s.injectLiveHR(150, source: .healthkit)
        XCTAssertEqual(s.hrSource, .healthkit)
        s.injectLiveHR(148, source: .strap)      // higher priority takes over at once
        XCTAssertEqual(s.hrSource, .strap)
        XCTAssertEqual(s.liveHRBpm, 148)
    }

    func testPm5IsProvenanceWhenAlone() {
        let s = session()
        s.injectLiveHR(190, source: .pm5)
        XCTAssertEqual(s.hrSource, .pm5)
        XCTAssertEqual(s.liveHRBpm, 190)
    }

    func testDeadStrapLosesOwnershipToLiveHealthKitStream() {
        // A strap that dies mid-workout must not keep the "Banda" label — nor the
        // number, nor the aggregation — while the watch is the one actually
        // recording: past the quiet window, the live lower-priority stream takes
        // OWNERSHIP over, exactly like it already took the label before this fix.
        let s = session()
        s.injectLiveHR(150, source: .strap)
        XCTAssertEqual(s.hrSource, .strap)
        s.hrSourceLastSeenAt = Date().addingTimeInterval(-(WorkoutSession.hrSourceStaleSeconds + 1))
        s.injectLiveHR(155, source: .healthkit)   // strap silent past the window → takeover
        XCTAssertEqual(s.hrSource, .healthkit)
        XCTAssertEqual(s.liveHRBpm, 155, "the handoff must feed the number too, not only the label")
        s.injectLiveHR(152, source: .strap)       // the strap coming back reclaims it at once
        XCTAssertEqual(s.hrSource, .strap)
        XCTAssertEqual(s.liveHRBpm, 152)
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

    // MARK: - THE FIX: a lower-priority reading while the owner is alive feeds NOTHING

    func testHealthKitNeverStealsFromStrapAndNeverTouchesTheLiveValue() {
        let s = session()
        s.injectLiveHR(150, source: .strap)
        XCTAssertEqual(s.hrSource, .strap)
        s.injectLiveHR(162, source: .healthkit)   // lower priority while the strap is alive
        XCTAssertEqual(s.hrSource, .strap)
        XCTAssertEqual(s.liveHRBpm, 150, "a lower-priority reading must not touch the number either")
    }

    func testPm5NeverOverridesAnActiveHigherSourceNumberOrLabel() {
        let a = session()
        a.injectLiveHR(140, source: .healthkit)
        a.injectLiveHR(200, source: .pm5)
        XCTAssertEqual(a.hrSource, .healthkit)
        XCTAssertEqual(a.liveHRBpm, 140, "a PM5 spike must not leak onto the screen either")

        let b = session()
        b.injectLiveHR(150, source: .strap)
        b.injectLiveHR(210, source: .pm5)
        XCTAssertEqual(b.hrSource, .strap)
        XCTAssertEqual(b.liveHRBpm, 150)
    }

    // MARK: - Required 1 — a PM5 reading under a live strap enters NOTHING

    func testPM5ReadingUnderLiveStrapNeverEntersLapSamples() throws {
        let s = armedSession()
        s.injectLiveHR(150, source: .strap)
        s.injectLiveHR(999, source: .pm5)   // the strap owns this window
        XCTAssertEqual(s.liveHRBpm, 150)
        s.primaryAdvance()   // closes the one segment's lap
        let lap = try XCTUnwrap(s.laps.first)
        XCTAssertEqual(lap.avgHRBpm, 150, "the PM5 reading never reached the lap aggregation")
        XCTAssertEqual(lap.maxHRBpm, 150)
        XCTAssertEqual(lap.hrSource, "strap")
    }

    // MARK: - Required 2 — a weaker source's artifact never becomes the tramo max

    func testLowerPriorityArtifactNeverBecomesTheTramoMax() throws {
        let s = armedSession()
        s.injectLiveHR(140, source: .strap)
        s.injectLiveHR(175, source: .strap)
        s.injectLiveHR(210, source: .pm5)   // a bad-signal spike from the weaker source
        s.injectLiveHR(150, source: .strap)
        s.primaryAdvance()
        let lap = try XCTUnwrap(s.laps.first)
        XCTAssertEqual(lap.maxHRBpm, 175, "the strap never crossed 175 — 210 is a PM5 artifact")
        XCTAssertEqual(lap.avgHRBpm, (140 + 175 + 150) / 3)
        XCTAssertEqual(lap.hrSource, "strap")
    }

    // MARK: - Required 3 — handoff after the stale window feeds the new owner

    func testHandoffAfterStaleWindowFeedsTheNewOwnersReadings() throws {
        let s = armedSession()
        s.injectLiveHR(150, source: .strap)
        s.hrSourceLastSeenAt = Date().addingTimeInterval(-(WorkoutSession.hrSourceStaleSeconds + 1))
        s.injectLiveHR(160, source: .healthkit)   // strap silent past the window → takeover
        XCTAssertEqual(s.hrSource, .healthkit)
        s.primaryAdvance()
        let lap = try XCTUnwrap(s.laps.first)
        // Both readings count: the strap's own sample before it went quiet, and the
        // watch's after the handoff — a dead strap must not erase what it already
        // measured, and the app must never go pulseless just because one device did.
        XCTAssertEqual(lap.avgHRBpm, 155)
        XCTAssertEqual(lap.maxHRBpm, 160)
        XCTAssertEqual(lap.hrSource, "healthkit", "provenance is the owner AT CLOSE")
    }

    // MARK: - Required 4 — a single source behaves exactly as before (no regression)

    func testSingleSourceBehavesExactlyAsBefore() throws {
        let s = armedSession()
        s.injectLiveHR(140, source: .healthkit)
        s.injectLiveHR(150, source: .healthkit)
        s.injectLiveHR(160, source: .healthkit)
        XCTAssertEqual(s.liveHRBpm, 160)
        s.primaryAdvance()
        let lap = try XCTUnwrap(s.laps.first)
        XCTAssertEqual(lap.avgHRBpm, 150)
        XCTAssertEqual(lap.maxHRBpm, 160)
        XCTAssertEqual(lap.hrSource, "healthkit")
    }

    // MARK: - Required 5 — paused readings still never enter the lap

    func testPausedReadingsNeverEnterTheLap() throws {
        let s = armedSession()
        s.injectLiveHR(150, source: .strap)
        s.isPaused = true
        s.injectLiveHR(190, source: .strap)   // rest-HR while paused is not training data
        s.isPaused = false
        s.primaryAdvance()
        let lap = try XCTUnwrap(s.laps.first)
        XCTAssertEqual(lap.avgHRBpm, 150, "the paused reading must not enter the aggregation")
        XCTAssertEqual(lap.maxHRBpm, 150)
    }
}
