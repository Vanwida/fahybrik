import XCTest
@testable import FAHYBRIK

// Finish no miente: solo se cierra como guardado cuando el POST dejó fila.
// Encolar o fallar no es persistir. Las notas viajan en el mismo POST.
final class WorkoutFinishPersistTests: XCTestCase {

    // MARK: - Cerrar solo si el servidor aceptó

    func testTwoXXWithExecutionClosesAsSaved() {
        let response = try! decoder().decode(
            WorkoutExecutionResponse.self,
            from: Data(#"{"saved":true,"execution_id":"64"}"#.utf8)
        )
        let submission = ExecutionSubmission(
            response: response, queuedRequestId: nil, persisted: true
        )
        XCTAssertEqual(
            WorkoutFinishPersist.decide(submission),
            .dismissSaved(executionId: "64")
        )
    }

    func testTwoXXNumericExecutionIdStillClosesAsSaved() throws {
        let response = try decoder().decode(
            WorkoutExecutionResponse.self,
            from: Data(#"{"saved":true,"execution_id":4231,"origin":"self"}"#.utf8)
        )
        XCTAssertEqual(response.executionId, "4231")
        let submission = ExecutionSubmission(
            response: response, queuedRequestId: nil, persisted: true
        )
        XCTAssertEqual(
            WorkoutFinishPersist.decide(submission),
            .dismissSaved(executionId: "4231")
        )
    }

    func testTwoXXWithoutDecodableBodyStillCountsAsPersisted() {
        // 2xx + cuerpo raro: la fila YA está. No reintentar (duplicaría el libre).
        let submission = ExecutionSubmission(
            response: nil, queuedRequestId: nil, persisted: true
        )
        XCTAssertEqual(
            WorkoutFinishPersist.decide(submission),
            .dismissSaved(executionId: nil)
        )
    }

    func testQueuedReplayIsNotSaved() {
        let submission = ExecutionSubmission(
            response: nil, queuedRequestId: UUID(), persisted: false
        )
        XCTAssertEqual(WorkoutFinishPersist.decide(submission), .showRetry)
    }

    func testSilentMissIsNotSaved() {
        XCTAssertEqual(WorkoutFinishPersist.decide(.none), .showRetry)
    }

    func testRetryCopyIsHonest() {
        XCTAssertEqual(WorkoutFinishPersist.retryMessage, "No se ha guardado. Reintenta.")
    }

    // EL MISMO FALLO NO SIGNIFICA LO MISMO EN LOS DOS CAMINOS. Con lo medido ya
    // escrito al terminar el esfuerzo (`MedidoAlTerminar`), un fallo aquí cuesta el
    // RPE y las notas, no el entreno. Decir «no se ha guardado» asustaría al atleta
    // hasta repetir una carrera que está en la base con sus kilómetros y su mapa.
    func testConLoMedidoYaEscritoElMensajeNoAsusta() {
        XCTAssertEqual(
            WorkoutFinishPersist.mensajeDeReintento(loMedidoYaEstaGuardado: true),
            "Tu carrera ya está guardada. Falta cómo fue."
        )
        XCTAssertEqual(
            WorkoutFinishPersist.mensajeDeReintento(loMedidoYaEstaGuardado: false),
            WorkoutFinishPersist.retryMessage
        )
    }

    // MARK: - La hora de fin es la del entreno, no la de la red

    // Card 121: el 20-ago el guardado estuvo roto y Alex se quedó horas en el
    // resumen reintentando. El entreno acabó a las 12:36 y se archivó como si
    // hubiera terminado a las 16:35: casi cinco horas de ventana para 47 minutos de
    // trabajo. Un entreno no dura hasta que la red deja pasar.
    func testEndedAtUsesTheEngineStampNotTheSaveInstant() {
        let acabo = Date(timeIntervalSince1970: 1_787_000_000)
        let guardado = acabo.addingTimeInterval(4 * 3600)   // cuatro horas después
        XCTAssertEqual(WorkoutFinishPersist.endedAt(finishedAt: acabo, now: guardado), acabo)
    }

    // Un registro a mano no tuvo reloj corriendo: ahí el instante de guardarlo ES
    // el único que existe, y sigue siendo el correcto.
    func testEndedAtFallsBackToNowWhenNoClockEverRan() {
        let ahora = Date(timeIntervalSince1970: 1_787_000_000)
        XCTAssertEqual(WorkoutFinishPersist.endedAt(finishedAt: nil, now: ahora), ahora)
    }

    // MARK: - Notes en el mismo POST (workout_executions.notes)

    func testBlankNotesAreOmitted() {
        XCTAssertNil(WorkoutFinishPersist.notesOnWire(""))
        XCTAssertNil(WorkoutFinishPersist.notesOnWire("   \n\t"))
    }

    func testNotesTravelTrimmed() {
        XCTAssertEqual(WorkoutFinishPersist.notesOnWire("  tres EMOM  "), "tres EMOM")
    }

    func testNotesClampToBackendLimit() {
        let tooLong = String(repeating: "x", count: 4001)
        let wire = WorkoutFinishPersist.notesOnWire(tooLong)
        XCTAssertEqual(wire?.count, 4000)
    }

    func testFreePayloadEncodesNotes() throws {
        let payload = FreeWorkoutPayload(
            title: "EMOM 10", modality: "functional",
            prescription: nil,
            items: nil, perceived_exertion: 7, total_duration_seconds: 600,
            notes: WorkoutFinishPersist.notesOnWire(" piernas cargadas "),
            source: "manual", score_time_s: nil, score_rounds: nil, score_reps: nil,
            completeness: "full", started_at: "2026-08-19T08:00:00Z",
            ended_at: "2026-08-19T08:10:00Z", segments: nil
        )
        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        let json = try XCTUnwrap(
            try JSONSerialization.jsonObject(with: enc.encode(payload)) as? [String: Any]
        )
        XCTAssertEqual(json["notes"] as? String, "piernas cargadas")
        XCTAssertEqual(json["title"] as? String, "EMOM 10")
    }

    private func decoder() -> JSONDecoder { APIClient.makeJSONDecoder() }
}
