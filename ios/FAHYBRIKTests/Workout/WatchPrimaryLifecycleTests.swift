import XCTest
@testable import FAHYBRIK

final class WatchPrimaryLifecycleTests: XCTestCase {

    func testAcceptsStartOnlyWhenIdleAndNoStandaloneConflict() {
        XCTAssertTrue(WatchPrimaryLifecycle.acceptsStart(current: .idle, standaloneActive: false, role: .mirror))
        XCTAssertFalse(WatchPrimaryLifecycle.acceptsStart(current: .idle, standaloneActive: true, role: .mirror))
        XCTAssertTrue(WatchPrimaryLifecycle.acceptsStart(current: .idle, standaloneActive: true, role: .solo))
        XCTAssertFalse(WatchPrimaryLifecycle.acceptsStart(current: .recording, standaloneActive: false, role: .mirror))
    }

    func testAcceptsEndOnlyWhileRecordingAndNotAlreadyTeardown() {
        XCTAssertTrue(WatchPrimaryLifecycle.acceptsEnd(current: .recording, isTeardownRunning: false))
        XCTAssertFalse(WatchPrimaryLifecycle.acceptsEnd(current: .recording, isTeardownRunning: true))
        XCTAssertFalse(WatchPrimaryLifecycle.acceptsEnd(current: .ending, isTeardownRunning: false))
        XCTAssertFalse(WatchPrimaryLifecycle.acceptsEnd(current: .idle, isTeardownRunning: false))
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
