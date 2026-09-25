import XCTest
@testable import FAHYBRIK

/// Fase 1, «nada se pierde»: un entreno terminado que el servidor rechaza al vaciar
/// la cola ya no se tira — sale de la cola (reintentarlo no lo arregla) y queda
/// guardado entre los rechazados, y quien lo esperaba se entera. Lo mismo si lo
/// rechaza el primer envío del resumen (`keepRejected`). Y lo guardado vuelve al
/// atleta como una fila «Sin subir» de su historial (`LocalUnsyncedWorkout`).
final class RequestQueueRejectedTests: XCTestCase {
    private let filename = "test-queue-rejected-\(UUID().uuidString).json"

    override func tearDown() {
        if let dir = try? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        ) {
            try? FileManager.default.removeItem(at: dir.appendingPathComponent(filename))
        }
        super.tearDown()
    }

    private actor Told {
        var ids: [UUID] = []
        func add(_ id: UUID) { ids.append(id) }
    }

    private static let rejecting: RequestQueue.Transport = { _, _, _ in
        throw APIError.http(422, Data())
    }

    func testUnEntrenoRechazadoSeGuardaYSeCuentaUnaVez() async {
        let queue = RequestQueue(filename: filename, transport: Self.rejecting)
        let told = Told()
        await queue.onRejection { id in await told.add(id) }
        let id = await queue.enqueue(path: "/api/sync/workout-execution", body: Data("{}".utf8),
                                     bearer: "t", keepOnReject: true)

        await queue.drain(bearer: "t")
        await queue.drain(bearer: "t")

        let left = await queue.snapshot()
        XCTAssertTrue(left.isEmpty, "reintentar un 4xx no lo arregla: sale de la cola")
        let rejected = await queue.rejectedRequests()
        XCTAssertEqual(rejected.map(\.id), [id])
        XCTAssertEqual(rejected.first?.status, 422)
        let ids = await told.ids
        XCTAssertEqual(ids, [id], "se avisa una vez, no en cada drenado")
    }

    func testLoRechazadoSobreviveAReabrirLaCola() async {
        let queue = RequestQueue(filename: filename, transport: Self.rejecting)
        await queue.enqueue(path: "/api/sync/workout-execution", body: Data("{}".utf8), keepOnReject: true)
        await queue.drain(bearer: "t")

        let reopened = RequestQueue(filename: filename, transport: Self.rejecting)
        let rejected = await reopened.rejectedRequests()
        XCTAssertEqual(rejected.count, 1)
    }

    func testLoQueNoEsDelAtletaSeTiraComoSiempre() async {
        let queue = RequestQueue(filename: filename, transport: Self.rejecting)
        await queue.enqueue(path: "/api/checkin", body: Data("{}".utf8))
        await queue.drain(bearer: "t")

        let left = await queue.snapshot()
        let rejected = await queue.rejectedRequests()
        XCTAssertTrue(left.isEmpty)
        XCTAssertTrue(rejected.isEmpty)
    }

    // MARK: - El rechazo del primer envío (el resumen), sin pasar por la cola

    /// «Guardado en tu móvil» tiene que ser verdad tras matar la app: lo que el resumen
    /// guarda al recibir un 4xx está en disco, en `rejected`, con el cuerpo tal cual.
    func testUnRechazoDelResumenSeGuardaYSobreviveAReabrirLaCola() async {
        let queue = RequestQueue(filename: filename, transport: Self.rejecting)
        let body = Data(#"{"assignment_id":"297"}"#.utf8)
        let id = await queue.keepRejected(path: WorkoutExecutionAPI.path, body: body, bearer: "t")

        let reopened = RequestQueue(filename: filename, transport: Self.rejecting)
        let rejected = await reopened.rejectedRequests()
        XCTAssertEqual(rejected.map(\.id), [id])
        let kept = rejected.first
        XCTAssertEqual(kept?.request.path, WorkoutExecutionAPI.path)
        XCTAssertEqual(kept?.request.bodyJson, body, "lo guardado es lo enviado, sin tocar")
        XCTAssertEqual(kept?.request.keepOnReject, true)
        XCTAssertEqual(kept?.status, 0, "el resumen no sabe el código: 0 = no se sabe")
        let left = await reopened.snapshot()
        XCTAssertTrue(left.isEmpty, "no entra en la cola: reintentar un 4xx no lo arregla")
    }

    /// Nadie espera este rechazo (no tuvo entrada en la cola), así que el observador —que
    /// existe para los sobres del reloj— no se entera al drenar.
    func testUnRechazoDelResumenNoSeCuentaAlObservador() async {
        let queue = RequestQueue(filename: filename, transport: Self.rejecting)
        let told = Told()
        await queue.onRejection { id in await told.add(id) }
        await queue.keepRejected(path: FreeWorkoutAPI.path, body: Data("{}".utf8), bearer: nil)
        await queue.drain(bearer: "t")

        let ids = await told.ids
        XCTAssertTrue(ids.isEmpty)
    }

    // MARK: - De lo rechazado a la fila «Sin subir» del historial

    private func rechazo(_ path: String, _ body: Data) -> RejectedRequest {
        RejectedRequest(
            request: QueuedRequest(id: UUID(), path: path, bodyJson: body, bearer: nil,
                                   createdAt: Date(timeIntervalSince1970: 0), keepOnReject: true),
            status: 422, rejectedAt: Date(timeIntervalSince1970: 0), told: true
        )
    }

    private func ejecucion(asignacion: String = "297") -> WorkoutExecutionPayload {
        WorkoutExecutionPayload(
            assignment_id: asignacion, perceived_exertion: 7, total_duration_seconds: 1688,
            notes: "Pesado", source: nil, score_time_s: nil, score_rounds: nil, score_reps: nil,
            completeness: "full", started_at: "2026-07-15T16:42:00Z",
            ended_at: "2026-07-15T17:10:08Z", segments: nil
        )
    }

    private static let circuito: (String) -> String? = { $0 == "297" ? "Circuito de pierna" : nil }

    func testUnaEjecucionRechazadaEsSuFilaConElTituloDeLaSesion() throws {
        let body = try JSONEncoder().encode(ejecucion())   // el codificador de la cola
        let fila = try XCTUnwrap(LocalUnsyncedWorkout.from(rechazo(WorkoutExecutionAPI.path, body),
                                                           titulo: Self.circuito))
        XCTAssertEqual(fila.title, "Circuito de pierna")
        XCTAssertEqual(fila.assignmentId, "297")
        XCTAssertFalse(fila.isFree)
        XCTAssertEqual(fila.date, "2026-07-15", "16:42 UTC son las 18:42 del box")
        XCTAssertEqual(fila.totalDurationSeconds, 1688)
        XCTAssertEqual(fila.rpe, 7)
        XCTAssertEqual(fila.notes, "Pesado")
        // Se pinta con las piezas de una fila del servidor.
        XCTAssertEqual(fila.session.headlineLabel, "duración")
        XCTAssertEqual(fila.session.rpeLabel, "RPE 7")
        XCTAssertFalse(fila.session.withPartner)
    }

    func testUnaEjecucionSinTituloEnCacheSeLlamaEntreno() throws {
        let body = try JSONEncoder().encode(ejecucion(asignacion: "999"))
        let fila = try XCTUnwrap(LocalUnsyncedWorkout.from(rechazo(WorkoutExecutionAPI.path, body),
                                                           titulo: Self.circuito))
        XCTAssertEqual(fila.title, "Entreno")
    }

    /// El de dobles lleva la asignación en la ruta; y el cuerpo sale igual con el
    /// snake_case del POST en vivo que con el codificador pelado de la cola.
    func testUnaEjecucionDeDoblesConElCodificadorDelCableTambienEsFila() throws {
        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        let body = try enc.encode(ejecucion())
        let path = DoblesExecutionAPI.path(sessionId: "297")
        let fila = try XCTUnwrap(LocalUnsyncedWorkout.from(rechazo(path, body), titulo: Self.circuito))
        XCTAssertEqual(fila.assignmentId, "297")
        XCTAssertEqual(fila.title, "Circuito de pierna")
    }

    /// El libre trae su título; y el día es el del box, no el de UTC.
    func testUnLibreRechazadoEsSuFilaEnElDiaDelBox() throws {
        let libre = FreeWorkoutPayload(
            title: "Remo · 5×500m", modality: "row", prescription: nil, items: nil,
            perceived_exertion: 8, total_duration_seconds: 581, notes: nil, source: "manual",
            score_time_s: 581, score_rounds: nil, score_reps: nil, completeness: "full",
            started_at: "2026-07-15T22:30:00Z", ended_at: "2026-07-15T22:39:41Z", segments: nil
        )
        let body = try XCTUnwrap(FreeWorkoutAPI.cuerpoDeCola(libre))
        let fila = try XCTUnwrap(LocalUnsyncedWorkout.from(rechazo(FreeWorkoutAPI.path, body),
                                                           titulo: { _ in nil }))
        XCTAssertEqual(fila.title, "Remo · 5×500m")
        XCTAssertTrue(fila.isFree)
        XCTAssertNil(fila.assignmentId)
        XCTAssertEqual(fila.date, "2026-07-16", "22:30 UTC de julio son las 00:30 del día siguiente en el box")
        XCTAssertEqual(fila.scoreTimeS, 581)
        XCTAssertEqual(fila.session.headlineLabel, "resultado")
    }

    /// Los tramos dejan distancia y pulso para la ficha local.
    func testLosTramosDejanDistanciaYPulso() throws {
        let body = Data(#"""
        {"assignment_id":"297","started_at":"2026-07-15T16:42:00Z","segments":[
          {"distance_meters":1000,"avg_hr":150,"max_hr":170},
          {"distance_meters":500,"avg_hr":160,"max_hr":180},
          {"duration_seconds":60}
        ]}
        """#.utf8)
        let fila = try XCTUnwrap(LocalUnsyncedWorkout.from(rechazo(WorkoutExecutionAPI.path, body),
                                                           titulo: Self.circuito))
        XCTAssertEqual(fila.distanceMeters, 1500)
        XCTAssertEqual(fila.avgHR, 155)
        XCTAssertEqual(fila.maxHR, 180)
    }

    /// Lo que no es un entreno o no se deja leer no se pinta (y sigue guardado).
    func testLoIlegibleOAjenoNoEsFila() throws {
        let valido = try JSONEncoder().encode(ejecucion())
        XCTAssertNil(LocalUnsyncedWorkout.from(rechazo(WorkoutExecutionAPI.path, Data("no es json".utf8)),
                                               titulo: Self.circuito))
        XCTAssertNil(LocalUnsyncedWorkout.from(rechazo(WorkoutExecutionAPI.path, Data("[1,2]".utf8)),
                                               titulo: Self.circuito))
        XCTAssertNil(LocalUnsyncedWorkout.from(rechazo(WorkoutExecutionAPI.path, Data("{}".utf8)),
                                               titulo: Self.circuito), "sin sesión no se sabe qué es")
        XCTAssertNil(LocalUnsyncedWorkout.from(rechazo("/api/checkin", valido), titulo: Self.circuito))
        XCTAssertNil(LocalUnsyncedWorkout.from(rechazo(DoblesExecutionAPI.path(sessionId: "1"), valido),
                                               titulo: Self.circuito), "la ruta y el cuerpo no casan")
    }

    /// Dos copias del mismo entreno son una fila (la más reciente), con la identidad que
    /// usa el servidor: una por sesión del coach; un libre, por su hora de inicio.
    func testDosCopiasDelMismoEntrenoSonUnaFila() throws {
        let a = try JSONEncoder().encode(ejecucion())
        let viejo = try XCTUnwrap(LocalUnsyncedWorkout.from(rechazo(WorkoutExecutionAPI.path, a),
                                                            titulo: Self.circuito))
        let nuevo = try XCTUnwrap(LocalUnsyncedWorkout.from(rechazo(WorkoutExecutionAPI.path, a),
                                                            titulo: Self.circuito))
        let otro = try XCTUnwrap(LocalUnsyncedWorkout.from(
            rechazo(WorkoutExecutionAPI.path, try JSONEncoder().encode(ejecucion(asignacion: "300"))),
            titulo: Self.circuito))
        let unicos = LocalUnsyncedWorkout.unoPorEntreno([viejo, otro, nuevo])
        XCTAssertEqual(unicos.map(\.id), [otro.id, nuevo.id])
    }
}
