import XCTest
@testable import FAHYBRIK

// AUDIT lote A (recovery honesto) + FH-48. The gate decides "offer this snapshot?"
// purely (same assignment · fresh · free/ad-hoc). The latch guarantees a late
// autosave can never resurrect a finished snapshot. FH-48 tests the done criteria
// (≥30 s clock jump, lock, process death, Watch one-primary, free) — a 5 s
// happy path is not enough.
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

    func testRejectsNilAssignmentIntoAssignedContainer() {
        // Free / ad-hoc snapshot must not be recovered into a prescribed assignment.
        XCTAssertFalse(WorkoutRecoveryGate.shouldOffer(saved: snapshot(assignment: nil), currentAssignmentId: "42"))
    }

    func testOffersFreeAdHocWithoutAssignment() {
        // FH-48 — free / ad-hoc also resumes. The gate used to drop nil assignmentId.
        XCTAssertTrue(WorkoutRecoveryGate.shouldOffer(saved: snapshot(assignment: nil), currentAssignmentId: nil))
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
        // with assignmentId nil. Offered only on an unassigned (free) container.
        let data = try JSONEncoder().encode(snapshot(assignment: "42"))
        var obj = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        obj.removeValue(forKey: "assignmentId")
        let stripped = try JSONSerialization.data(withJSONObject: obj)
        let decoded = try JSONDecoder().decode(PersistedWorkoutState.self, from: stripped)
        XCTAssertNil(decoded.assignmentId)
        XCTAssertEqual(decoded.currentSegmentIndex, 0)   // the rest still decodes
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

    // MARK: - FH-48 · Apple owns the run (not a 5 s happy path)

    private func snapshot(
        assignment: String?,
        elapsed: Double,
        lap: Double,
        isPaused: Bool,
        hk: UUID? = nil,
        isFree: Bool = false,
        segmentIndex: Int = 0,
        primed: Bool = true
    ) -> PersistedWorkoutState {
        PersistedWorkoutState(
            plan: plan(),
            startedAt: Date().addingTimeInterval(-elapsed),
            currentSegmentIndex: segmentIndex,
            elapsedSeconds: elapsed,
            lapElapsedSeconds: lap,
            laps: [],
            repsByCurrentSegment: 8,
            isPaused: isPaused,
            savedAt: Date(),
            assignmentId: assignment,
            hkSessionUUID: hk,
            isFree: isFree,
            currentSegmentPrimed: primed
        )
    }

    /// ≥30 s background/lock catch-up: Apple's elapsedTime jumps; cursor and
    /// progress must not reset to zero. A 5 s tick is not this test.
    func testThirtySecondClockJumpKeepsCursorAndProgress() {
        let s = WorkoutSession(plan: plan())
        s.restore(from: snapshot(assignment: "42", elapsed: 12, lap: 7, isPaused: false))
        XCTAssertEqual(s.currentSegmentIndex, 0)
        XCTAssertEqual(s.elapsedSeconds, 12, accuracy: 0.01)
        XCTAssertFalse(s.isAwaitingBlockStart)

        s.testElapsedTime = 12
        s.applyLiveClock()
        s.testElapsedTime = 12 + 30
        s.applyLiveClock()

        XCTAssertEqual(s.elapsedSeconds, 42, accuracy: 0.01)
        XCTAssertEqual(s.currentSegmentIndex, 0)
        XCTAssertEqual(s.lapElapsedSeconds, 37, accuracy: 0.01)
        XCTAssertGreaterThan(s.elapsedSeconds, 0)
        XCTAssertFalse(s.isAwaitingBlockStart)
        s.stop()
    }

    /// Lock: restore applies isPaused; a ≥30 s Apple clock jump must not advance
    /// the coach cursor or zero progress.
    func testLockPauseAppliedAndThirtySecondJumpDoesNotAdvance() {
        let s = WorkoutSession(plan: plan())
        s.restore(from: snapshot(assignment: "42", elapsed: 40, lap: 15, isPaused: true))
        XCTAssertTrue(s.isPaused)
        XCTAssertEqual(s.elapsedSeconds, 40, accuracy: 0.01)
        XCTAssertEqual(s.currentSegmentIndex, 0)

        s.testElapsedTime = 40 + 30
        s.applyLiveClock()

        XCTAssertTrue(s.isPaused)
        XCTAssertEqual(s.elapsedSeconds, 40, accuracy: 0.01)
        XCTAssertEqual(s.currentSegmentIndex, 0)
        XCTAssertEqual(s.lapElapsedSeconds, 15, accuracy: 0.01)
        s.stop()
    }

    /// Process death: restore + start() must NOT armBlock() (that wipes EMOM).
    func testProcessDeathRestoreDoesNotArmBlockOrWipeEMOM() {
        let s = WorkoutSession(plan: plan())
        s.restore(from: snapshot(assignment: "42", elapsed: 95, lap: 20, isPaused: false))
        s.emomIntervalIndex = 4
        XCTAssertFalse(s.isAwaitingBlockStart)

        s.start()

        XCTAssertFalse(s.isAwaitingBlockStart, "armBlock() parks on the preview")
        XCTAssertEqual(s.emomIntervalIndex, 4, "armBlock() → clearEMOMState() zeros this")
        XCTAssertEqual(s.elapsedSeconds, 95, accuracy: 0.01)
        XCTAssertEqual(s.currentSegmentIndex, 0)
        s.stop()
    }

    func testCoachPlanHangsOffSessionUUID() throws {
        let uuid = UUID()
        let snap = snapshot(assignment: "42", elapsed: 30, lap: 10, isPaused: false, hk: uuid)
        XCTAssertEqual(snap.hkSessionUUID, uuid)
        let data = try JSONEncoder().encode(snap)
        let decoded = try JSONDecoder().decode(PersistedWorkoutState.self, from: data)
        XCTAssertEqual(decoded.hkSessionUUID, uuid)
        XCTAssertEqual(decoded.elapsedSeconds, 30, accuracy: 0.01)
    }

    func testFreeSnapshotCarriesIsFreeAndResumes() throws {
        let snap = snapshot(assignment: nil, elapsed: 33, lap: 11, isPaused: false, isFree: true)
        XCTAssertTrue(snap.isFree)
        XCTAssertTrue(WorkoutRecoveryGate.shouldOffer(saved: snap, currentAssignmentId: nil))
        let s = WorkoutSession(plan: plan())
        s.restore(from: snap)
        XCTAssertTrue(s.isFreeRun)
        XCTAssertEqual(s.elapsedSeconds, 33, accuracy: 0.01)
        s.start()
        XCTAssertFalse(s.isAwaitingBlockStart)
        s.stop()
    }

    /// One HK primary. Adopting a Watch-created session while the phone already
    /// owns the run is the Watch-desync (0:00 / other cursor).
    func testWatchAdoptRefusedWhenPhoneHasPrimary() {
        XCTAssertTrue(WorkoutPrimaryRule.shouldAdoptCompanion(hasPrimary: false))
        XCTAssertFalse(WorkoutPrimaryRule.shouldAdoptCompanion(hasPrimary: true))
    }

    func testFreshStartStillArmsBlock() {
        let s = WorkoutSession(plan: plan())
        s.start()
        XCTAssertTrue(s.isAwaitingBlockStart)
        s.stop()
    }
}
