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

    /// El reloj se lanza siempre al empezar: solo lo frenan un motor ausente, un canal
    /// ya atado o un lanzamiento ya hecho en este intent. El entorno (calle/cinta) NO
    /// entra: esperar por él fue la causa raíz del «no conecta» (29-sep).
    func testLaunchTruthTable() {
        XCTAssertEqual(PhoneLiveHandoffPolicy.watchLaunchDecision(
            alreadyRequested: false, channelBound: false, hasEngine: true), .launch)
        XCTAssertEqual(PhoneLiveHandoffPolicy.watchLaunchDecision(
            alreadyRequested: true, channelBound: false, hasEngine: true),
            .skip(.alreadyRequested), "one startWatchApp per intent (FH-96)")
        XCTAssertEqual(PhoneLiveHandoffPolicy.watchLaunchDecision(
            alreadyRequested: false, channelBound: true, hasEngine: true),
            .skip(.channelBound), "a bound channel means the wrist is already there")
        XCTAssertEqual(PhoneLiveHandoffPolicy.watchLaunchDecision(
            alreadyRequested: false, channelBound: false, hasEngine: false), .skip(.noEngine))
    }

    /// Relanzar: solo tras un error de Apple, sin canal atado y con cupo.
    func testRelaunchTruthTable() {
        typealias P = PhoneLiveHandoffPolicy
        XCTAssertEqual(P.watchRelaunchDecision(
            coaching: true, channelBound: false, lastLaunchFailed: true, relaunchesDone: 0), .launch)
        XCTAssertEqual(P.watchRelaunchDecision(
            coaching: true, channelBound: false, lastLaunchFailed: true,
            relaunchesDone: P.maxWatchRelaunchesPerIntent - 1), .launch)
        XCTAssertEqual(P.watchRelaunchDecision(
            coaching: true, channelBound: true, lastLaunchFailed: true, relaunchesDone: 0),
            .skip(.channelBound), "con canal atado un segundo lanzamiento fue el bug de la build 78")
        XCTAssertEqual(P.watchRelaunchDecision(
            coaching: true, channelBound: false, lastLaunchFailed: false, relaunchesDone: 0),
            .skip(.launchNotFailed), "si Apple dijo ok no se relanza")
        XCTAssertEqual(P.watchRelaunchDecision(
            coaching: true, channelBound: false, lastLaunchFailed: true,
            relaunchesDone: P.maxWatchRelaunchesPerIntent), .skip(.retryCapReached))
        XCTAssertEqual(P.watchRelaunchDecision(
            coaching: false, channelBound: false, lastLaunchFailed: true, relaunchesDone: 0), .skip(.noEngine))
    }

    /// El motivo viaja al registro técnico: snake_case estable.
    func testSkipReasonsAreStableLogNames() {
        typealias S = PhoneLiveHandoffPolicy.WatchLaunchSkip
        XCTAssertEqual(S.noEngine.rawValue, "no_engine")
        XCTAssertEqual(S.alreadyRequested.rawValue, "already_requested")
        XCTAssertEqual(S.channelBound.rawValue, "channel_bound")
        XCTAssertEqual(S.healthUnavailable.rawValue, "health_unavailable")
        XCTAssertEqual(S.launchNotFailed.rawValue, "launch_not_failed")
        XCTAssertEqual(S.retryCapReached.rawValue, "retry_cap_reached")
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
