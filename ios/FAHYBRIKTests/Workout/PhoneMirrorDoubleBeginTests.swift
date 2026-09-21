import XCTest
@testable import FAHYBRIK

// FH-96 — one workout intent → one PRIMARY. Prep + ▶ EMPEZAR must not double-launch
// the watch; redundant `startPrimary` on a compatible live PRIMARY must not finish.
@MainActor
final class PhoneMirrorDoubleBeginTests: XCTestCase {

    private var mirror: PhoneLiveSession { PhoneLiveSession.shared }

    override func tearDown() {
        mirror.sendOverride = nil
        mirror.teardown()
        mirror.resetAthleteEndFlagsForTests()
        mirror.resetPrimaryBindingForTests()
        super.tearDown()
    }

    func testDoubleBeginSameSessionDoesNotSecondLaunchWatch() {
        let s = WorkoutSession(plan: .minimal(title: "FH-96"))
        s.runEnvironment = .outdoor
        mirror.startWatchAppOverride = { _ in true }

        mirror.begin(session: s, activityKind: "running")
        let callsAfterFirst = mirror.startWatchAppCallCount
        XCTAssertEqual(callsAfterFirst, 1)

        mirror.begin(session: s, activityKind: "running")

        XCTAssertEqual(mirror.startWatchAppCallCount, callsAfterFirst,
                       "second begin on same session must not call startWatchApp again")
        XCTAssertTrue(mirror.primaryRequestedForTests)
    }

    func testPrepThenReleaseOnlyOneLaunch() {
        let s = WorkoutSession(plan: .minimal(title: "FH-96-prep"))
        s.runEnvironment = .outdoor
        mirror.startWatchAppOverride = { _ in true }

        PreWorkoutReleaseLive.prepWatchRecording(
            staging: s,
            answers: .empty,
            activityKind: "running",
            stampSession: nil
        )
        XCTAssertEqual(mirror.startWatchAppCallCount, 0,
                       "prep is UI-only — no startWatchApp")
        XCTAssertNotNil(mirror.watchJoinStartedAt)

        _ = PreWorkoutReleaseLive.release(
            staging: s,
            answers: .empty,
            activityKind: "running",
            stampSession: nil
        )

        XCTAssertEqual(mirror.startWatchAppCallCount, 1,
                       "release is the sole HK owner — exactly one launch")
    }

    func testEmpezarAloneStillLaunchesWatch() {
        let s = WorkoutSession(plan: .minimal(title: "FH-96-solo"))
        s.runEnvironment = .indoor
        mirror.startWatchAppOverride = { _ in true }

        _ = PreWorkoutReleaseLive.release(
            staging: s,
            answers: .empty,
            activityKind: "running",
            stampSession: nil
        )

        XCTAssertEqual(mirror.startWatchAppCallCount, 1)
        XCTAssertTrue(mirror.primaryRequestedForTests)
    }
}
