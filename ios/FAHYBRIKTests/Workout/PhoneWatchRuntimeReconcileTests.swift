import XCTest
@testable import FAHYBRIK

final class PhoneWatchRuntimeReconcileTests: XCTestCase {

    func testPhoneReopensWhenFreshSnapshotAndWristActive() {
        XCTAssertEqual(
            PhoneWatchRuntimeReconcile.phoneAction(
                hasLiveCoverOrTracked: false,
                wristClaimsActive: true,
                hasFreshSnapshot: true
            ),
            .reopenFromSnapshot
        )
    }

    func testPhoneEndsWristWhenNoSnapshot() {
        XCTAssertEqual(
            PhoneWatchRuntimeReconcile.phoneAction(
                hasLiveCoverOrTracked: false,
                wristClaimsActive: true,
                hasFreshSnapshot: false
            ),
            .endWristCleanly
        )
    }

    func testPhoneNoOpWhenLiveUIExists() {
        XCTAssertEqual(
            PhoneWatchRuntimeReconcile.phoneAction(
                hasLiveCoverOrTracked: true,
                wristClaimsActive: true,
                hasFreshSnapshot: true
            ),
            .none
        )
    }

    func testLaunchConflictWhenLiveSession() {
        XCTAssertTrue(LiveWorkoutLaunchConflict.shouldPrompt(
            hasLiveCoverOrTracked: true,
            snapshot: nil
        ))
    }

    func testLaunchNotBlockedByFreshSnapshotAlone() {
        let snap = PersistedWorkoutState(
            plan: WorkoutPlan(id: UUID(), name: "S", format: .forTime,
                              estimatedDurationSeconds: 0, blockContext: "", zoneTargets: [], equipment: [],
                              segments: [], coachNote: nil, demoVideoUrl: nil, warmupChecklist: []),
            startedAt: Date(), currentSegmentIndex: 0, elapsedSeconds: 1, lapElapsedSeconds: 0,
            laps: [], repsByCurrentSegment: 0, isPaused: false, savedAt: Date(),
            assignmentId: "42"
        )
        XCTAssertFalse(LiveWorkoutLaunchConflict.shouldPrompt(
            hasLiveCoverOrTracked: false,
            snapshot: snap
        ))
    }
}
