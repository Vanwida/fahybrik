import XCTest
@testable import FAHYBRIK

final class WatchPrimaryLifecycleTests: XCTestCase {

    func testCleanIdleRequiresNoSessionHandle() {
        XCTAssertTrue(WatchPrimaryLifecycle.isCleanIdle(phase: .idle, hasSession: false))
        XCTAssertFalse(WatchPrimaryLifecycle.isCleanIdle(phase: .idle, hasSession: true))
        XCTAssertFalse(WatchPrimaryLifecycle.isCleanIdle(phase: .recording, hasSession: true))
    }

    func testAcceptsStartOnlyWhenCleanIdleAndNoStandaloneConflict() {
        XCTAssertTrue(WatchPrimaryLifecycle.acceptsStart(
            current: .idle, hasSession: false, standaloneActive: false, role: .mirror
        ))
        XCTAssertFalse(WatchPrimaryLifecycle.acceptsStart(
            current: .idle, hasSession: true, standaloneActive: false, role: .mirror
        ))
        XCTAssertTrue(WatchPrimaryLifecycle.acceptsStart(
            current: .idle, hasSession: false, standaloneActive: true, role: .mirror
        ), "phone mirror preempts wrist standalone — never block startWatchApp")
        XCTAssertTrue(WatchPrimaryLifecycle.acceptsStart(
            current: .idle, hasSession: false, standaloneActive: true, role: .solo
        ))
        XCTAssertFalse(WatchPrimaryLifecycle.acceptsStart(
            current: .recording, hasSession: true, standaloneActive: false, role: .mirror
        ))
    }

    func testAcceptsEndOnlyWhileRecording() {
        XCTAssertTrue(WatchPrimaryLifecycle.acceptsEnd(current: .recording))
        XCTAssertFalse(WatchPrimaryLifecycle.acceptsEnd(current: .ending))
        XCTAssertFalse(WatchPrimaryLifecycle.acceptsEnd(current: .idle))
    }

    func testStuckEndingWithoutSessionForcesIdle() {
        XCTAssertTrue(WatchPrimaryLifecycle.shouldForceIdleFromStuckEnding(phase: .ending, hasSession: false))
        XCTAssertFalse(WatchPrimaryLifecycle.shouldForceIdleFromStuckEnding(phase: .ending, hasSession: true))
        XCTAssertFalse(WatchPrimaryLifecycle.shouldForceIdleFromStuckEnding(phase: .recording, hasSession: true))
    }

    func testTeardownDeadlineIsHardAndShort() {
        XCTAssertEqual(WatchPrimaryLifecycle.teardownDeadlineSeconds, 5)
    }

    func testOrphanEndsWhenDayMarkedDone() {
        XCTAssertTrue(WatchPrimaryLifecycle.orphanShouldEnd(
            role: .orphan, todayMarkedDone: true, standalonePhaseIdle: true
        ))
        XCTAssertFalse(WatchPrimaryLifecycle.orphanShouldEnd(
            role: .mirror, todayMarkedDone: true, standalonePhaseIdle: true
        ))
    }
}

final class PhoneLiveHandoffPolicyTests: XCTestCase {

    func testLaunchOncePerBegin() {
        XCTAssertTrue(PhoneLiveHandoffPolicy.shouldLaunchWatch(
            didLaunch: false, wristJoined: false, hasSession: true,
            runEnvironmentResolved: true, activityKindIsRunning: false
        ))
        XCTAssertFalse(PhoneLiveHandoffPolicy.shouldLaunchWatch(
            didLaunch: true, wristJoined: false, hasSession: true,
            runEnvironmentResolved: true, activityKindIsRunning: false
        ))
    }

    func testRunningWaitsForEnvironment() {
        XCTAssertFalse(PhoneLiveHandoffPolicy.shouldLaunchWatch(
            didLaunch: false, wristJoined: false, hasSession: true,
            runEnvironmentResolved: false, activityKindIsRunning: true
        ))
    }

    func testAthleteEndBlocksPhoneEnd() {
        XCTAssertTrue(PhoneLiveHandoffPolicy.phoneEndIsNoOp(wristFinishedByAthlete: true))
        XCTAssertFalse(PhoneLiveHandoffPolicy.phoneEndIsNoOp(wristFinishedByAthlete: false))
    }
}
