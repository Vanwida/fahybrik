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
                    coachNote: nil, warmupChecklist: [])
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

    // MARK: - Card 142: "Salir y seguir luego" (leaveToResumeLater)
    //
    // El atleta se va A PROPÓSITO a media sesión con intención clara de volver —
    // muy distinto de terminar (finish) o abandonar (discardAndClose). Estas
    // pruebas fijan las dos garantías que pidió Alex: el reloj se congela de
    // verdad, y la instantánea SOBREVIVE (nunca se toca clear()/close() en esta
    // ruta, al revés que discardAndClose).

    private func runningSession() -> WorkoutSession {
        let s = WorkoutSession(plan: plan())
        s.start(); s.beginBlock(); s.stop()   // corriendo, no en pausa, no en la puerta de bloque
        return s
    }

    func testLeaveToResumeLaterPausesTheClock() {
        let s = runningSession()
        XCTAssertFalse(s.isPaused)
        s.leaveToResumeLater()
        XCTAssertTrue(s.isPaused, "salir a medias tiene que congelar el reloj: lo de fuera no cuenta")
    }

    func testLeaveToResumeLaterIsIdempotentWhenAlreadyPaused() {
        // El sheet de salida ya puede haber pausado el reloj (pauseForVideo) antes
        // de que el atleta elija "Salir y seguir luego" — esto NUNCA puede
        // alternarlo de vuelta a corriendo.
        let s = runningSession()
        s.togglePause()
        XCTAssertTrue(s.isPaused)
        s.leaveToResumeLater()
        XCTAssertTrue(s.isPaused)
    }

    func testLeaveToResumeLaterSnapshotSurvivesAndIsOfferedBack() async throws {
        // Lo mismo que hace `WorkoutContainer.onLeaveAndResume`: guardar la
        // instantánea y NUNCA llamar a clear()/close(). El store tiene que
        // seguir teniéndola, y el gate tiene que seguir dispuesto a ofrecerla —
        // exactamente lo que lee `WorkoutResumeBanner` en Plan.
        let store = WorkoutStateStore(filename: "test-leave-\(UUID().uuidString).json")
        await store.open()
        let s = runningSession()
        s.assignmentId = "77"

        let snap = s.leaveToResumeLater()
        await store.save(snap)

        // `XCTUnwrap` recibe una autoclosure y ahí dentro no cabe un `await`:
        // se saca la espera fuera y se desenvuelve después.
        let cargado = await store.load()
        let loaded = try XCTUnwrap(cargado)
        XCTAssertEqual(loaded.assignmentId, "77")
        XCTAssertTrue(loaded.isPaused)
        XCTAssertTrue(WorkoutRecoveryGate.shouldOffer(saved: loaded, currentAssignmentId: "77"))

        await store.clear()
    }
}
