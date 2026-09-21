import XCTest
@testable import FAHYBRIK

final class WatchPrimaryLifecycleTests: XCTestCase {

    func testCleanIdleRequiresNoSessionHandle() {
        XCTAssertTrue(WatchPrimaryLifecycle.isCleanIdle(phase: .idle, hasSession: false))
        XCTAssertFalse(WatchPrimaryLifecycle.isCleanIdle(phase: .idle, hasSession: true))
        XCTAssertFalse(WatchPrimaryLifecycle.isCleanIdle(phase: .recording, hasSession: true))
    }

    func testCleanIdleBegins() {
        XCTAssertEqual(WatchPrimaryLifecycle.startAction(
            phase: .idle, hasSession: false, isFinishing: false,
            currentRole: nil, incomingRole: .mirror, compatible: false
        ), .begin)
        XCTAssertEqual(WatchPrimaryLifecycle.startAction(
            phase: .idle, hasSession: false, isFinishing: false,
            currentRole: nil, incomingRole: .solo, compatible: false
        ), .begin)
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

    func testMirrorHUDOnlyForMirrorRole() {
        XCTAssertTrue(WatchPrimaryLifecycle.showsMirrorHUD(role: .mirror))
        XCTAssertFalse(WatchPrimaryLifecycle.showsMirrorHUD(role: .solo))
        XCTAssertFalse(WatchPrimaryLifecycle.showsMirrorHUD(role: nil))
    }

    func testPhoneUnlinkedIsAppleLinkOnly() {
        XCTAssertTrue(WatchPrimaryLifecycle.phoneUnlinked(role: .mirror, link: .unlinked(nil)))
        XCTAssertTrue(WatchPrimaryLifecycle.phoneUnlinked(role: .mirror, link: .unlinked("error 3")))
        XCTAssertFalse(WatchPrimaryLifecycle.phoneUnlinked(role: .mirror, link: .mirroring))
        XCTAssertFalse(WatchPrimaryLifecycle.phoneUnlinked(role: .solo, link: .unlinked(nil)))
    }
}

final class PhoneLiveHandoffPolicyTests: XCTestCase {

    func testRequestOncePerIntent() {
        XCTAssertTrue(PhoneLiveHandoffPolicy.shouldRequestWatchPrimary(
            alreadyRequested: false, channelBound: false, hasEngine: true,
            runEnvironmentResolved: true, activityKindIsRunning: false
        ))
        XCTAssertFalse(PhoneLiveHandoffPolicy.shouldRequestWatchPrimary(
            alreadyRequested: true, channelBound: false, hasEngine: true,
            runEnvironmentResolved: true, activityKindIsRunning: false
        ), "one startWatchApp per intent — never a second by timer")
        XCTAssertFalse(PhoneLiveHandoffPolicy.shouldRequestWatchPrimary(
            alreadyRequested: false, channelBound: true, hasEngine: true,
            runEnvironmentResolved: true, activityKindIsRunning: false
        ), "a bound channel means the wrist is already there")
        XCTAssertFalse(PhoneLiveHandoffPolicy.shouldRequestWatchPrimary(
            alreadyRequested: false, channelBound: false, hasEngine: false,
            runEnvironmentResolved: true, activityKindIsRunning: false
        ))
    }

    func testRunningWaitsForEnvironment() {
        XCTAssertFalse(PhoneLiveHandoffPolicy.shouldRequestWatchPrimary(
            alreadyRequested: false, channelBound: false, hasEngine: true,
            runEnvironmentResolved: false, activityKindIsRunning: true
        ))
    }

    func testAdoptLinksAndNeverDiscards() {
        XCTAssertEqual(PhoneLiveHandoffPolicy.adoptAction(
            hasEngine: true, engineFinished: false, hasFreshSnapshot: false
        ), .coach)
        XCTAssertEqual(PhoneLiveHandoffPolicy.adoptAction(
            hasEngine: false, engineFinished: false, hasFreshSnapshot: true
        ), .reopenFromDisk, "process died, plan on disk → same cover, same recording")
        XCTAssertEqual(PhoneLiveHandoffPolicy.adoptAction(
            hasEngine: false, engineFinished: false, hasFreshSnapshot: false
        ), .endSaving, "no plan → end SAVING; the recording is the athlete's")
        XCTAssertEqual(PhoneLiveHandoffPolicy.adoptAction(
            hasEngine: true, engineFinished: true, hasFreshSnapshot: true
        ), .endSaving)
    }

    func testAthleteEndBlocksPhoneEnd() {
        XCTAssertTrue(PhoneLiveHandoffPolicy.phoneEndIsNoOp(wristFinishedByAthlete: true))
        XCTAssertFalse(PhoneLiveHandoffPolicy.phoneEndIsNoOp(wristFinishedByAthlete: false))
    }
}
