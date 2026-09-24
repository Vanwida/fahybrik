import XCTest
@testable import FAHYBRIK

// FH-96 — one workout intent → one PRIMARY. Prep + ▶ EMPEZAR must not double-launch
// the watch; redundant `startPrimary` on a compatible live PRIMARY must not finish.
@MainActor
final class PhoneMirrorDoubleBeginTests: XCTestCase {

    private var mirror: PhoneLiveSession { PhoneLiveSession.shared }

    // The suite runs in random order (project.yml `randomExecutionOrder`) and
    // `PhoneLiveSession.shared` outlives every test: other classes `begin` on it
    // and leave `startWatchAppCallCount` / engine / latches behind. Each test
    // starts — and leaves — a cold mirror.
    override func setUp() {
        super.setUp()
        resetMirror()
    }

    override func tearDown() {
        resetMirror()
        super.tearDown()
    }

    private func resetMirror() {
        mirror.sendOverride = nil
        mirror.teardown()
        mirror.resetAthleteEndFlagsForTests()
        mirror.resetPrimaryBindingForTests()
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
        // calle/cinta is the gate's answer: prep and release stamp
        // `answers.runEnvironment` on the staging session (a run without it
        // asks the wrist for nothing — PhoneLiveHandoffPolicy).
        var answers = SessionStartAnswers.empty
        answers.runEnvironment = .outdoor
        mirror.startWatchAppOverride = { _ in true }

        PreWorkoutReleaseLive.prepWatchRecording(
            staging: s,
            answers: answers,
            activityKind: "running",
            stampSession: nil
        )
        XCTAssertEqual(mirror.startWatchAppCallCount, 0,
                       "prep is UI-only — no startWatchApp")
        XCTAssertNotNil(mirror.watchJoinStartedAt)

        _ = PreWorkoutReleaseLive.release(
            staging: s,
            answers: answers,
            activityKind: "running",
            stampSession: nil
        )

        XCTAssertEqual(mirror.startWatchAppCallCount, 1,
                       "release is the sole HK owner — exactly one launch")
    }

    func testEmpezarAloneStillLaunchesWatch() {
        let s = WorkoutSession(plan: .minimal(title: "FH-96-solo"))
        var answers = SessionStartAnswers.empty
        answers.runEnvironment = .indoor
        mirror.startWatchAppOverride = { _ in true }

        _ = PreWorkoutReleaseLive.release(
            staging: s,
            answers: answers,
            activityKind: "running",
            stampSession: nil
        )

        XCTAssertEqual(mirror.startWatchAppCallCount, 1)
        XCTAssertTrue(mirror.primaryRequestedForTests)
    }
}
