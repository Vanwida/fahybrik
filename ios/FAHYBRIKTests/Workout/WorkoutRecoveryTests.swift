import XCTest
@testable import FAHYBRIK

// AUDIT lote A (recovery honesto) — the crash-recovery gate + the store latch. The
// gate decides "offer this snapshot?" purely (same assignment · fresh · real); the
// latch guarantees a late autosave can never resurrect a finished/discarded snapshot.
final class WorkoutRecoveryTests: XCTestCase {

    private func plan(id: UUID = UUID()) -> WorkoutPlan {
        WorkoutPlan(id: id, name: "S", format: .forTime, estimatedDurationSeconds: 0,
                    blockContext: "", zoneTargets: [], equipment: [],
                    segments: [WorkoutSegment(order: 1, title: "x", kind: .reps)],
                    coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
    }
    private func snapshot(assignment: String?, savedAt: Date = Date(), planId: UUID = UUID()) -> PersistedWorkoutState {
        PersistedWorkoutState(plan: plan(id: planId), startedAt: Date(), currentSegmentIndex: 0,
                              elapsedSeconds: 10, lapElapsedSeconds: 5, laps: [],
                              repsByCurrentSegment: 0, isPaused: false, savedAt: savedAt,
                              assignmentId: assignment)
    }

    // MARK: - Recovery gate (AUDIT-1/2)

    func testOffersSameAssignmentFresh() {
        XCTAssertTrue(WorkoutRecoveryGate.shouldOffer(saved: snapshot(assignment: "42"), currentAssignmentId: "42"))
    }

    func testRejectsNilAssignment() {
        // An older snapshot (or ad-hoc) with no assignment is never offered — no guessing.
        XCTAssertFalse(WorkoutRecoveryGate.shouldOffer(saved: snapshot(assignment: nil), currentAssignmentId: "42"))
        XCTAssertFalse(WorkoutRecoveryGate.shouldOffer(saved: snapshot(assignment: nil), currentAssignmentId: nil))
    }

    func testRejectsDifferentAssignment() {
        // The cross-attribution bug: recovering A's snapshot into B's container.
        XCTAssertFalse(WorkoutRecoveryGate.shouldOffer(saved: snapshot(assignment: "42"), currentAssignmentId: "43"))
    }

    func testRejectsStaleBeyondSixHours() {
        let old = Date().addingTimeInterval(-(6 * 3600 + 60))   // 6h1m ago
        XCTAssertFalse(WorkoutRecoveryGate.shouldOffer(saved: snapshot(assignment: "42", savedAt: old), currentAssignmentId: "42"))
        let fresh = Date().addingTimeInterval(-(5 * 3600))
        XCTAssertTrue(WorkoutRecoveryGate.shouldOffer(saved: snapshot(assignment: "42", savedAt: fresh), currentAssignmentId: "42"))
    }

    // MARK: - Backward-compatible decode (AUDIT-1)

    func testOldSnapshotDecodesWithNilAssignment() throws {
        // A snapshot from a build BEFORE assignmentId existed (key absent) still decodes,
        // with assignmentId nil → the gate then discards it.
        let data = try JSONEncoder().encode(snapshot(assignment: "42"))
        var obj = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        obj.removeValue(forKey: "assignmentId")
        let stripped = try JSONSerialization.data(withJSONObject: obj)
        let decoded = try JSONDecoder().decode(PersistedWorkoutState.self, from: stripped)
        XCTAssertNil(decoded.assignmentId)
        XCTAssertEqual(decoded.currentSegmentIndex, 0)   // the rest still decodes
    }

    func testRunEnvironmentRoundTripsOnSnapshot() throws {
        for env in RunEnvironment.allCases {
            var snap = snapshot(assignment: "42")
            snap.runEnvironment = env
            let data = try JSONEncoder().encode(snap)
            let decoded = try JSONDecoder().decode(PersistedWorkoutState.self, from: data)
            XCTAssertEqual(decoded.runEnvironment, env)
        }
        let data = try JSONEncoder().encode(snapshot(assignment: "42"))
        var obj = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        obj.removeValue(forKey: "runEnvironment")
        let stripped = try JSONSerialization.data(withJSONObject: obj)
        let decoded = try JSONDecoder().decode(PersistedWorkoutState.self, from: stripped)
        XCTAssertNil(decoded.runEnvironment)
    }

    // MARK: - Store latch (AUDIT-2/3)

    func testCloseLatchStopsResurrection() async throws {
        let store = WorkoutStateStore(filename: "test-latch-\(UUID().uuidString).json")
        let snap = snapshot(assignment: "42")

        await store.save(snap)
        var loaded = await store.load()
        XCTAssertNotNil(loaded)

        await store.close()                          // finish / discard
        loaded = await store.load()
        XCTAssertNil(loaded)                         // cleared

        await store.save(snap)                       // a LATE autosave Task
        loaded = await store.load()
        XCTAssertNil(loaded)                         // latched → dropped, no resurrection

        await store.open()                           // a new workout starts
        await store.save(snap)
        loaded = await store.load()
        XCTAssertNotNil(loaded)                      // persistence works again

        await store.clear()
    }

    // MARK: - Process death (rewritten FH-48)

    func testFreshAllowsFreeWithoutAssignment() {
        XCTAssertTrue(WorkoutRecoveryGate.isFresh(snapshot(assignment: nil)))
        XCTAssertFalse(WorkoutRecoveryGate.shouldOffer(saved: snapshot(assignment: nil), currentAssignmentId: nil))
    }

    func testFreshRejectsStaleFree() {
        let old = Date().addingTimeInterval(-(6 * 3600 + 60))
        XCTAssertFalse(WorkoutRecoveryGate.isFresh(snapshot(assignment: nil, savedAt: old)))
    }

    func testRestoreAppliesPauseAndDoesNotRearm() {
        var snap = snapshot(assignment: "42")
        snap = PersistedWorkoutState(
            plan: snap.plan, startedAt: snap.startedAt, currentSegmentIndex: 2,
            elapsedSeconds: 90, lapElapsedSeconds: 20, laps: [],
            repsByCurrentSegment: 4, isPaused: true, savedAt: Date(),
            assignmentId: "42", hasArmedInitial: true, isAwaitingBlockStart: false
        )
        let session = WorkoutSession(plan: snap.plan, startedAt: snap.startedAt)
        session.restore(from: snap)
        XCTAssertTrue(session.isPaused)
        XCTAssertEqual(session.elapsedSeconds, 90, accuracy: 0.01)
        XCTAssertEqual(session.currentSegmentIndex, 2)
        XCTAssertFalse(session.isAwaitingBlockStart)
        session.start()
        XCTAssertFalse(session.isAwaitingBlockStart)
        XCTAssertTrue(session.isPaused)
        session.stop()
    }

    func testResumeGateReopensWhenEitherUUIDMissing() {
        XCTAssertTrue(LiveWorkoutResumeGate.shouldReopenCoachPlan(boundRunUUID: nil, snapshotUUID: UUID()))
        XCTAssertTrue(LiveWorkoutResumeGate.shouldReopenCoachPlan(boundRunUUID: UUID(), snapshotUUID: nil))
        XCTAssertTrue(LiveWorkoutResumeGate.shouldReopenCoachPlan(boundRunUUID: nil, snapshotUUID: nil))
    }

    func testResumeGateRejectsMismatchedHangOff() {
        let a = UUID()
        let b = UUID()
        XCTAssertFalse(LiveWorkoutResumeGate.shouldReopenCoachPlan(boundRunUUID: a, snapshotUUID: b))
        XCTAssertTrue(LiveWorkoutResumeGate.shouldReopenCoachPlan(boundRunUUID: a, snapshotUUID: a))
    }

    func testRestoreReopensFreeCursor() {
        var snap = snapshot(assignment: nil)
        snap = PersistedWorkoutState(
            plan: snap.plan, startedAt: snap.startedAt, currentSegmentIndex: 1,
            elapsedSeconds: 45, lapElapsedSeconds: 10, laps: [],
            repsByCurrentSegment: 0, isPaused: false, savedAt: Date(),
            assignmentId: nil, isFree: true, hasArmedInitial: true,
            isAwaitingBlockStart: false
        )
        XCTAssertTrue(WorkoutRecoveryGate.isFresh(snap))
        let session = WorkoutSession(plan: snap.plan, startedAt: snap.startedAt)
        session.restore(from: snap)
        XCTAssertTrue(session.isFreeRun)
        XCTAssertEqual(session.elapsedSeconds, 45, accuracy: 0.01)
        session.start()
        XCTAssertFalse(session.isAwaitingBlockStart)
        session.stop()
    }
}
