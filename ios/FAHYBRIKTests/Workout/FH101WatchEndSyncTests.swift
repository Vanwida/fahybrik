import XCTest
@testable import FAHYBRIK

/// FH-101 — bilateral end sync: wrist Terminar reaches phone + reconnect reconcile.
@MainActor
final class FH101WatchEndSyncTests: XCTestCase {

    private var mirror: PhoneLiveSession { PhoneLiveSession.shared }

    override func tearDown() {
        mirror.sendOverride = nil
        mirror.teardown()
        mirror.resetAthleteEndFlagsForTests()
        LiveWorkoutResume.shared.dismiss()
        super.tearDown()
    }

    /// Watch-initiated end via WCSession durable path (simulated delayed delivery).
    func testWristEndedViaConnectivityFinishesPhoneEngine() {
        let engine = WorkoutSession(plan: .minimal(title: "FH-101-wc"))
        mirror.begin(session: engine, activityKind: "mixed")
        XCTAssertFalse(mirror.wristFinishedByAthlete)

        let ended = MirrorEnded(workoutUuid: "wc-uuid", reason: MirrorWire.EndReason.athlete)
        guard let body = WatchLiveEnded.encode(ended) else {
            XCTFail("encode")
            return
        }
        guard let decoded = WatchLiveEnded.decode(from: body) else {
            XCTFail("decode")
            return
        }
        mirror.applyWristEnded(decoded)

        XCTAssertTrue(mirror.wristFinishedByAthlete)
        XCTAssertEqual(mirror.consumeWorkoutRef(), "wc-uuid")
        XCTAssertFalse(mirror.primaryRequestedForTests)
    }

    /// Duplicate WC + HK packets are idempotent — no double flip.
    func testApplyWristEndedIsIdempotent() {
        let engine = WorkoutSession(plan: .minimal(title: "FH-101-dup"))
        mirror.begin(session: engine, activityKind: "mixed")
        let ended = MirrorEnded(workoutUuid: "dup", reason: MirrorWire.EndReason.athlete)

        mirror.applyWristEnded(ended)
        mirror.applyWristEnded(ended)

        XCTAssertTrue(mirror.wristFinishedByAthlete)
        XCTAssertFalse(mirror.wristMirrorLive)
    }

    /// Phone-initiated end still no-ops after athlete ended (FH-31 preserved).
    func testPhoneEndStillNoOpAfterAthleteEnded() {
        let engine = WorkoutSession(plan: .minimal(title: "FH-101-phone-noop"))
        mirror.begin(session: engine, activityKind: "mixed")
        mirror.applyWristEnded(MirrorEnded(workoutUuid: "a", reason: MirrorWire.EndReason.athlete))

        var sends: [String] = []
        mirror.sendOverride = { sends.append($0) }
        mirror.end(save: true)
        XCTAssertEqual(sends, [])
    }

    /// Reconcile reopens snapshot when wrist finished and cover is gone.
    func testReconcileReopensWhenWristFinishedWithoutCover() async {
        let plan = WorkoutPlan.minimal(title: "FH-101-reopen")
        let snap = PersistedWorkoutState(
            plan: plan,
            startedAt: Date(),
            currentSegmentIndex: 0,
            elapsedSeconds: 120,
            lapElapsedSeconds: 0,
            laps: [],
            repsByCurrentSegment: 0,
            isPaused: false,
            savedAt: Date(),
            assignmentId: "99"
        )
        await WorkoutStateStore.shared.save(snap)
        await WorkoutStateStore.shared.open()

        mirror.applyWristEnded(MirrorEnded(workoutUuid: "reopen", reason: MirrorWire.EndReason.athlete))
        LiveWorkoutResume.shared.dismiss()

        await LiveWorkoutResume.shared.handleWristAthleteFinishWhenBackgrounded(hrZones: nil)

        XCTAssertNotNil(LiveWorkoutResume.shared.cover)
        await WorkoutStateStore.shared.clear()
        LiveWorkoutResume.shared.dismiss()
    }

    /// After wrist end + idle, second begin launches watch again (no zombie).
    func testAfterWristEndSecondBeginLaunchesWatchAgain() {
        mirror.startWatchAppOverride = { _ in true }
        let first = WorkoutSession(plan: .minimal(title: "FH-101-zombie-a"))
        first.runEnvironment = .outdoor
        mirror.begin(session: first, activityKind: "running")
        XCTAssertEqual(mirror.startWatchAppCallCount, 1)

        mirror.applyWristEnded(MirrorEnded(workoutUuid: "z", reason: MirrorWire.EndReason.athlete))
        XCTAssertFalse(mirror.primaryRequestedForTests)

        let second = WorkoutSession(plan: .minimal(title: "FH-101-zombie-b"))
        second.runEnvironment = .outdoor
        mirror.begin(session: second, activityKind: "running")
        XCTAssertEqual(mirror.startWatchAppCallCount, 2)
    }
}
