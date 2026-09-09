import XCTest
import HealthKit
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
        let genAfterFirst = mirror.launchGenerationForTests
        let callsAfterFirst = mirror.startWatchAppCallCount

        mirror.begin(session: s, activityKind: "running")

        XCTAssertEqual(mirror.startWatchAppCallCount, callsAfterFirst,
                       "second begin on same session must not call startWatchApp again")
        XCTAssertEqual(mirror.launchGenerationForTests, genAfterFirst,
                       "second begin must not bump watchLaunchGeneration")
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

// MARK: - Watch policy (no watchOS test target — pure HealthKit policy)

final class MirrorPrimaryLaunchPolicyTests: XCTestCase {

    func testRedundantStartIgnoredWhenCompatible() {
        let current = HKWorkoutConfiguration()
        current.activityType = .running
        current.locationType = .outdoor
        let incoming = HKWorkoutConfiguration()
        incoming.activityType = .running
        incoming.locationType = .outdoor

        XCTAssertTrue(MirrorPrimaryLaunchPolicy.shouldIgnoreRedundantStart(
            isRecording: true,
            current: current,
            incoming: incoming,
            mirrorChannelAlive: true
        ))
        XCTAssertFalse(MirrorPrimaryLaunchPolicy.shouldFinishBeforeRestart(
            isRecording: true,
            current: current,
            incoming: incoming,
            mirrorChannelAlive: true
        ))
    }

    func testIncompatibleStartRequiresFinishBeforeRestart() {
        let current = HKWorkoutConfiguration()
        current.activityType = .running
        current.locationType = .outdoor
        let incoming = HKWorkoutConfiguration()
        incoming.activityType = .functionalStrengthTraining
        incoming.locationType = .indoor

        XCTAssertFalse(MirrorPrimaryLaunchPolicy.shouldIgnoreRedundantStart(
            isRecording: true,
            current: current,
            incoming: incoming,
            mirrorChannelAlive: true
        ))
        XCTAssertTrue(MirrorPrimaryLaunchPolicy.shouldFinishBeforeRestart(
            isRecording: true,
            current: current,
            incoming: incoming,
            mirrorChannelAlive: true
        ))
    }

    func testZombieMirrorDoesNotIgnoreCompatibleRestart() {
        let current = HKWorkoutConfiguration()
        current.activityType = .running
        current.locationType = .outdoor
        let incoming = HKWorkoutConfiguration()
        incoming.activityType = .running
        incoming.locationType = .outdoor

        XCTAssertFalse(MirrorPrimaryLaunchPolicy.shouldIgnoreRedundantStart(
            isRecording: true,
            current: current,
            incoming: incoming,
            mirrorChannelAlive: false
        ))
        XCTAssertTrue(MirrorPrimaryLaunchPolicy.shouldFinishBeforeRestart(
            isRecording: true,
            current: current,
            incoming: incoming,
            mirrorChannelAlive: false
        ))
    }
}
