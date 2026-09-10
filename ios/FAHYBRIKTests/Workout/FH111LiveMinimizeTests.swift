import XCTest
@testable import FAHYBRIK

/// FH-111 — live ✕ minimizes (UI dismisses, session stays ACTIVE, wrist mirror kept).
@MainActor
final class FH111LiveMinimizeTests: XCTestCase {

    private var resume: LiveWorkoutResume { LiveWorkoutResume.shared }
    private var mirror: PhoneLiveSession { PhoneLiveSession.shared }

    override func tearDown() {
        mirror.sendOverride = nil
        mirror.teardown()
        mirror.resetAthleteEndFlagsForTests()
        resume.dismiss()
        super.tearDown()
    }

    func testCheckpointForMinimizeDoesNotPause() {
        let session = WorkoutSession(plan: .minimal(title: "FH-111"))
        session.start()
        XCTAssertFalse(session.isPaused)

        _ = session.checkpointForMinimize()

        XCTAssertFalse(session.isPaused)
    }

    func testMinimizeParksSessionAndKeepsEngineAlive() {
        let session = WorkoutSession(plan: .minimal(title: "FH-111-park"))
        session.start()
        mirror.begin(session: session, activityKind: "mixed")

        let parked = RecoveredLiveCover(
            session: session,
            assignmentId: "42",
            title: "FH-111-park",
            isFree: false,
            freeModalityWire: nil,
            freeItemsJSON: nil,
            mirrorActivityKind: "mixed"
        )
        resume.minimizeUI(parked: parked)

        XCTAssertTrue(resume.isUIMinimized)
        XCTAssertTrue(resume.hasLiveSession)
        XCTAssertNil(resume.cover)
        XCTAssertIdentical(resume.parkedCover?.session, session)
        XCTAssertEqual(mirror.phase, .coaching)
    }

    func testPresentParkedReopensSameSessionAndRebindsMirror() {
        let session = WorkoutSession(plan: .minimal(title: "FH-111-reopen"))
        session.start()
        mirror.begin(session: session, activityKind: "running")

        let parked = RecoveredLiveCover(
            session: session,
            assignmentId: "7",
            title: "FH-111-reopen",
            isFree: false,
            freeModalityWire: nil,
            freeItemsJSON: nil,
            mirrorActivityKind: "running"
        )
        resume.minimizeUI(parked: parked)
        resume.presentParkedCoverIfNeeded()

        XCTAssertFalse(resume.isUIMinimized)
        XCTAssertNotNil(resume.cover)
        XCTAssertIdentical(resume.cover?.session, session)
        XCTAssertEqual(mirror.phase, .coaching)
    }

    func testReconcileDoesNotEndWristWhileMinimized() {
        let session = WorkoutSession(plan: .minimal(title: "FH-111-reconcile"))
        session.start()
        mirror.begin(session: session, activityKind: "mixed")
        resume.minimizeUI(parked: RecoveredLiveCover(
            session: session,
            assignmentId: nil,
            title: session.plan.name,
            isFree: false,
            freeModalityWire: nil,
            freeItemsJSON: nil,
            mirrorActivityKind: "mixed"
        ))

        let action = PhoneWatchRuntimeReconcile.phoneAction(
            hasLiveCoverOrTracked: resume.hasLiveSession,
            wristClaimsActive: true,
            hasFreshSnapshot: true
        )
        XCTAssertEqual(action, .none)
    }
}
