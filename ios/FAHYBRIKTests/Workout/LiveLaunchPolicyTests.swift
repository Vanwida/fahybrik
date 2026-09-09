import XCTest
@testable import FAHYBRIK

final class LiveLaunchPolicyTests: XCTestCase {

    func testCreateNeverBlockedByLive() {
        XCTAssertFalse(LiveLaunchPolicy.blocksCreatingPlan(hasLiveCoverOrTracked: true))
        XCTAssertFalse(LiveLaunchPolicy.blocksCreatingPlan(hasLiveCoverOrTracked: false))
    }

    func testStartBlockedOnlyWhenLiveUIUp() {
        XCTAssertTrue(LiveLaunchPolicy.blocksStartingLive(hasLiveCoverOrTracked: true))
        XCTAssertFalse(LiveLaunchPolicy.blocksStartingLive(hasLiveCoverOrTracked: false))
    }

    func testFreshSnapshotAloneDoesNotBlockStart() {
        let snap = PersistedWorkoutState(
            plan: WorkoutPlan(id: UUID(), name: "S", format: .forTime,
                              estimatedDurationSeconds: 0, blockContext: "", zoneTargets: [],
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
