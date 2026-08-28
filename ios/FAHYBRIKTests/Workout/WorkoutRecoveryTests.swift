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
        XCTAssertEqual(loaded.leftToResumeLater, true)
        XCTAssertTrue(WorkoutRecoveryGate.shouldOffer(saved: loaded, currentAssignmentId: "77"))
        // 142 is a banner, not a kidnapping of Hoy (174).
        XCTAssertEqual(LiveWorkoutResume.coldStart(loaded), .todayNormal)

        await store.clear()
    }
}

// MARK: - Card 174 — el live sobrevive un kill

final class LiveWorkoutResumeTests: XCTestCase {

    private func plan(id: UUID = UUID()) -> WorkoutPlan {
        WorkoutPlan(id: id, name: "S", format: .forTime, estimatedDurationSeconds: 0,
                    blockContext: "", zoneTargets: [], equipment: [],
                    segments: [WorkoutSegment(order: 1, title: "x", kind: .running)],
                    coachNote: nil, warmupChecklist: [])
    }

    private func snapshot(
        assignment: String?,
        sessionId: UUID = UUID(),
        segment: Int = 0,
        savedAt: Date = Date(),
        planId: UUID = UUID(),
        left: Bool? = nil,
        owner: LiveWorkoutOwner? = .phone
    ) -> PersistedWorkoutState {
        PersistedWorkoutState(
            plan: plan(id: planId), startedAt: Date(), currentSegmentIndex: segment,
            elapsedSeconds: 10, lapElapsedSeconds: 5, laps: [],
            repsByCurrentSegment: 0, isPaused: false, savedAt: savedAt,
            assignmentId: assignment,
            sessionId: sessionId,
            owner: owner,
            runEnvironment: .outdoor,
            leftToResumeLater: left
        )
    }

    func testPersistSurvivesANewStoreInstance() async throws {
        let name = "test-174-disk-\(UUID().uuidString).json"
        let sessionId = UUID()
        let writer = WorkoutStateStore(filename: name)
        await writer.open()
        await writer.save(snapshot(assignment: "99", sessionId: sessionId, segment: 2))

        let reader = WorkoutStateStore(filename: name)
        let loaded = try XCTUnwrap(await reader.load())
        XCTAssertEqual(loaded.sessionId, sessionId)
        XCTAssertEqual(loaded.owner, .phone)
        XCTAssertEqual(loaded.currentSegmentIndex, 2)
        XCTAssertEqual(loaded.runEnvironment, .outdoor)
        await reader.clear()
    }

    func testColdStartRestoresSameSessionIdAndSegment() {
        let sessionId = UUID()
        let saved = snapshot(assignment: "42", sessionId: sessionId, segment: 2)
        XCTAssertEqual(
            LiveWorkoutResume.coldStart(saved),
            .reopen(sessionId: sessionId, assignmentId: "42", segmentIndex: 2, owner: .phone)
        )

        let s = WorkoutSession(plan: saved.plan, startedAt: saved.startedAt, liveSessionId: sessionId)
        s.restore(from: saved)
        XCTAssertEqual(s.liveSessionId, sessionId)
        XCTAssertEqual(s.currentSegmentIndex, 2)
        XCTAssertEqual(s.runEnvironment, .outdoor)
        XCTAssertTrue(s.hasArmedInitial)
        XCTAssertFalse(s.isFinished)
    }

    func testAbsentSnapshotIsHoyNormal() {
        XCTAssertEqual(LiveWorkoutResume.coldStart(nil), .todayNormal)
    }

    func testFinishClearsTheSnapshot() async throws {
        let store = WorkoutStateStore(filename: "test-174-finish-\(UUID().uuidString).json")
        await store.open()
        await store.save(snapshot(assignment: "42"))
        XCTAssertNotNil(await store.load())
        await store.close()
        XCTAssertNil(await store.load(), "finish cierra y borra; un kill no")
        await store.save(snapshot(assignment: "42"))
        XCTAssertNil(await store.load(), "cerrojo: un autosave tardío no resucita")
        await store.clear()
    }

    func testKillDoesNotMarkFinished() {
        let s = WorkoutSession(plan: plan())
        s.assignmentId = "42"
        s.runEnvironment = .outdoor
        s.hasArmedInitial = true
        s.currentSegmentIndex = 1
        let snap = s.persistedSnapshot()
        XCTAssertFalse(s.isFinished, "un kill persiste; no llama a finish")
        XCTAssertNotEqual(snap.leftToResumeLater, true)
        XCTAssertEqual(snap.sessionId, s.liveSessionId)
        XCTAssertEqual(snap.currentSegmentIndex, 1)
        XCTAssertEqual(
            LiveWorkoutResume.coldStart(snap),
            .reopen(
                sessionId: s.liveSessionId,
                assignmentId: "42",
                segmentIndex: 1,
                owner: .phone
            )
        )
    }

    func testOldSnapshotDecodesAndColdStartUsesPlanId() throws {
        var saved = snapshot(assignment: "42", sessionId: UUID(), segment: 1)
        saved.sessionId = nil
        saved.owner = nil
        saved.runEnvironment = nil
        let data = try JSONEncoder().encode(saved)
        var obj = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        obj.removeValue(forKey: "sessionId")
        obj.removeValue(forKey: "owner")
        obj.removeValue(forKey: "runEnvironment")
        obj.removeValue(forKey: "leftToResumeLater")
        let decoded = try JSONDecoder().decode(
            PersistedWorkoutState.self,
            from: try JSONSerialization.data(withJSONObject: obj)
        )
        XCTAssertNil(decoded.sessionId)
        guard case let .reopen(sessionId, assignmentId, segment, owner) = LiveWorkoutResume.coldStart(decoded) else {
            return XCTFail("un live viejo sin sessionId sigue siendo live")
        }
        XCTAssertEqual(sessionId, decoded.plan.id)
        XCTAssertEqual(assignmentId, "42")
        XCTAssertEqual(segment, 1)
        XCTAssertEqual(owner, .phone)
    }

    func testAdoptWithoutEngineDoesNotEndTheWrist() {
        XCTAssertFalse(PhoneMirrorService.shouldEndUnownedWrist(phoneFinished: false, hasPendingEnd: false))
        XCTAssertTrue(PhoneMirrorService.shouldEndUnownedWrist(phoneFinished: true, hasPendingEnd: false))
        XCTAssertTrue(PhoneMirrorService.shouldEndUnownedWrist(phoneFinished: false, hasPendingEnd: true))
    }

    func testBeginDoesNotLaunchASecondWatchWhenHolding() {
        XCTAssertTrue(PhoneMirrorService.shouldReattachExistingMirror(alreadyHolding: true))
        XCTAssertFalse(PhoneMirrorService.shouldReattachExistingMirror(alreadyHolding: false))
    }

    func testContainerRestoresLibreBySessionId() {
        let sessionId = UUID()
        let saved = snapshot(assignment: nil, sessionId: sessionId, segment: 0)
        XCTAssertTrue(LiveWorkoutResume.shouldRestoreInContainer(saved, presentingAssignmentId: nil))
        XCTAssertTrue(LiveWorkoutResume.shouldRestoreInContainer(saved, presentingAssignmentId: sessionId.uuidString))
        XCTAssertFalse(LiveWorkoutResume.shouldRestoreInContainer(saved, presentingAssignmentId: "otro"))
    }
}
