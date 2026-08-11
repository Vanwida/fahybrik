import XCTest
@testable import FAHYBRIK

// QUE UNA CARRERA TERMINADA SIN COBERTURA NO PIERDA SU ARCHIVO.
//
// La traza cuelga de un `execution_id` que sólo existe DESPUÉS de que el servidor
// guarde la ejecución. Si el atleta termina en un valle sin línea, ese id no llega
// hasta días después, dentro del replay de la cola. Estas pruebas cubren las piezas
// que hacen que el dato aguante esa espera: el aparcamiento en disco, el sellado del
// id ANTES de enviar, y la lectura del id de la respuesta.
final class WorkoutTraceOfflineTests: XCTestCase {

    private func sampleTraces(_ bpm: Double = 150) -> [WorkoutTraceDTO] {
        [WorkoutTraceDTO(
            signal: "hr", source: "strap",
            started_at: "2026-08-11T18:00:00Z",
            offsets_s: [0, 1, 2], values: [bpm, bpm + 1, bpm + 2]
        )]
    }

    private func freshStore() -> (ParkedTraceStore, String) {
        let name = "test-parked-\(UUID().uuidString).json"
        return (ParkedTraceStore(filename: name), name)
    }

    private func cleanUp(_ filename: String) {
        guard let dir = try? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        ) else { return }
        try? FileManager.default.removeItem(at: dir.appendingPathComponent(filename))
    }

    // MARK: - El aparcamiento

    // Aparcar es lo PRIMERO que pasa, antes de tocar la red. Nace sin id y sin atar a
    // nada: eso es exactamente "la carrera ya está a salvo, ahora veremos de qué
    // ejecución cuelga".
    func testParkingLandsOnDiskWithoutAnId() async {
        let (store, name) = freshStore()
        defer { cleanUp(name) }

        let parkId = await store.park(sampleTraces())
        let all = await store.all()

        XCTAssertEqual(all.count, 1)
        XCTAssertEqual(all[0].id, parkId)
        XCTAssertNil(all[0].executionId)
        XCTAssertNil(all[0].awaitingRequestId)
        XCTAssertEqual(all[0].traces, sampleTraces())
    }

    // EL CASO DEL MODO AVIÓN. La ejecución se encoló, así que la traza se ATA a esa
    // entrada y espera: cuando la cola la entregue, de ahí saldrá el id.
    func testQueuedExecutionLinksTheParkedTrace() async {
        let (store, name) = freshStore()
        defer { cleanUp(name) }

        let parkId = await store.park(sampleTraces())
        let queuedRequest = UUID()
        await store.link(parkId: parkId, to: queuedRequest)

        let found = await store.find(awaiting: queuedRequest)
        XCTAssertEqual(found?.id, parkId)
        XCTAssertNil(found?.executionId, "sigue sin saber de qué ejecución cuelga")
        let strangerLookup = await store.find(awaiting: UUID())
        XCTAssertNil(strangerLookup, "y no responde por una entrada ajena")
    }

    // LA PIEZA QUE CIERRA EL ÚLTIMO HUECO: el id se SELLA EN DISCO antes de intentar
    // enviarlo. Si la app muere entre saberlo y enviarlo, el dato sigue completo y el
    // barrido del siguiente arranque lo termina — por eso `resolvable()` lo devuelve.
    func testStampingTheIdBeforeSendingMakesItRecoverable() async {
        let (store, name) = freshStore()
        defer { cleanUp(name) }

        let parkId = await store.park(sampleTraces())
        let beforeStamping = await store.resolvable()
        XCTAssertTrue(beforeStamping.isEmpty, "sin id no hay nada que reintentar")

        let stamped = await store.stamp(parkId: parkId, executionId: 4231)
        XCTAssertEqual(stamped?.executionId, 4231)

        let pending = await store.resolvable()
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending[0].executionId, 4231)
        XCTAssertEqual(pending[0].traces, sampleTraces())
    }

    // LA PRUEBA DE FUEGO: la app se muere y vuelve. Un store nuevo sobre el mismo
    // fichero encuentra la traza entera, con su id. Nada vive en memoria.
    func testEverythingSurvivesTheAppDying() async {
        let name = "test-parked-\(UUID().uuidString).json"
        defer { cleanUp(name) }

        let parkId = await ParkedTraceStore(filename: name).park(sampleTraces(163))
        _ = await ParkedTraceStore(filename: name).stamp(parkId: parkId, executionId: 909)

        // Otro proceso, otra instancia, el mismo disco.
        let afterRelaunch = await ParkedTraceStore(filename: name).resolvable()
        XCTAssertEqual(afterRelaunch.count, 1)
        XCTAssertEqual(afterRelaunch[0].id, parkId)
        XCTAssertEqual(afterRelaunch[0].executionId, 909)
        XCTAssertEqual(afterRelaunch[0].traces.first?.values, [163, 164, 165])
    }

    // Entregada (o encolada, o rechazada), el resguardo se retira y deja de reintentarse.
    func testRemovingClearsIt() async {
        let (store, name) = freshStore()
        defer { cleanUp(name) }

        let parkId = await store.park(sampleTraces())
        _ = await store.stamp(parkId: parkId, executionId: 12)
        await store.remove(id: parkId)

        let all = await store.all()
        let resolvable = await store.resolvable()
        XCTAssertTrue(all.isEmpty)
        XCTAssertTrue(resolvable.isEmpty)
    }

    // Pasada la ventana de replay (72 h, la misma que la cola) se tira: un mes offline
    // no se recupera, y preferimos decirlo a fingir que sí. Lo fresco no se toca.
    func testExpiredParkingIsDroppedAndFreshIsKept() async {
        let (store, name) = freshStore()
        defer { cleanUp(name) }

        let now = Date()
        let old = await store.park(sampleTraces(), at: now.addingTimeInterval(-73 * 3600))
        let fresh = await store.park(sampleTraces(), at: now.addingTimeInterval(-3600))

        await store.purgeExpired(now: now)

        let left = await store.all().map(\.id)
        XCTAssertEqual(left, [fresh])
        XCTAssertFalse(left.contains(old))
    }

    // Un resguardo que ya no está no revive por sellarlo.
    func testStampingSomethingGoneIsANoOp() async {
        let (store, name) = freshStore()
        defer { cleanUp(name) }
        let stamped = await store.stamp(parkId: UUID(), executionId: 5)
        XCTAssertNil(stamped)
    }

    // MARK: - El id que viene en la respuesta

    // El endpoint de ejecución lo devuelve como TEXTO (`String(executionId)`) y el de
    // trazas lo pide numérico. La conversión se hace una vez, aquí.
    func testExecutionIdIsReadFromTheResponse() throws {
        let asText = Data(#"{"saved":true,"assignment_id":"665","execution_id":"137"}"#.utf8)
        XCTAssertEqual(WorkoutTraceUploader.executionId(inResponse: asText), 137)

        // Y si algún día viajara ya numérico, también se entiende.
        let asNumber = Data(#"{"saved":true,"execution_id":4231}"#.utf8)
        XCTAssertEqual(WorkoutTraceUploader.executionId(inResponse: asNumber), 4231)
    }

    // Sin id legible NO se sube nada: antes eso que colgar la traza de una ejecución
    // inventada, que es el tipo de dato que nadie descubre hasta seis meses después.
    func testAnUnreadableIdYieldsNothing() {
        let cases = [
            #"{"saved":true}"#,                     // no viene
            #"{"execution_id":null}"#,              // viene vacío
            #"{"execution_id":"0"}"#,               // cero no es una ejecución
            #"{"execution_id":"-4"}"#,              // ni un negativo
            #"{"execution_id":"no-soy-un-numero"}"#,
            #"no soy json"#,
            "",
        ]
        for body in cases {
            XCTAssertNil(
                WorkoutTraceUploader.executionId(inResponse: Data(body.utf8)),
                "«\(body)» no puede dar un id"
            )
        }
    }

    // El cuerpo real de una respuesta de ejecución, tal y como la devuelve el
    // endpoint (con `prs` y todo), sigue dando su id.
    func testRealExecutionResponseYieldsItsId() {
        let body = Data(#"""
        {"saved":true,"assignment_id":"665","execution_id":"137","segments_saved":6,
         "prs":[{"kind":"run_1k","new_value_s":214.0,"prev_value_s":221.0}]}
        """#.utf8)
        XCTAssertEqual(WorkoutTraceUploader.executionId(inResponse: body), 137)
    }

    // MARK: - La cola

    // La cola devuelve el id de lo que encoló: es con lo que la traza se ata a la
    // entrada que traerá su `execution_id`.
    func testEnqueueReportsItsEntryId() async {
        let name = "test-queue-\(UUID().uuidString).json"
        defer { cleanUp(name) }

        let queue = RequestQueue(filename: name)
        let id = await queue.enqueue(path: "/api/sync/workout-execution", body: Data("{}".utf8))
        let entries = await queue.snapshot()

        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries[0].id, id)
    }

    // EL FICHERO DE LA COLA CAMBIÓ DE FORMA (ahora lleva acuses). Una app ya instalada
    // con entradas pendientes NO puede perderlas al actualizar — sería perder justo lo
    // que la cola existe para no perder.
    func testTheOldQueueFileStillLoads() async throws {
        let name = "test-queue-legacy-\(UUID().uuidString).json"
        defer { cleanUp(name) }

        let legacy = [QueuedRequest(
            id: UUID(), path: "/api/sync/workout-execution",
            bodyJson: Data(#"{"assignment_id":"665"}"#.utf8),
            bearer: nil, createdAt: Date()
        )]
        let dir = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )
        try JSONEncoder().encode(legacy).write(to: dir.appendingPathComponent(name))

        let entries = await RequestQueue(filename: name).snapshot()
        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries[0].id, legacy[0].id)
        XCTAssertEqual(entries[0].path, "/api/sync/workout-execution")
    }

    // Y el formato nuevo sobrevive al cierre de la app igual que el viejo.
    func testTheQueueSurvivesARelaunch() async {
        let name = "test-queue-\(UUID().uuidString).json"
        defer { cleanUp(name) }

        let id = await RequestQueue(filename: name)
            .enqueue(path: "/api/sync/workout-traces", body: Data(#"{"execution_id":9}"#.utf8))

        let afterRelaunch = await RequestQueue(filename: name).snapshot()
        XCTAssertEqual(afterRelaunch.map(\.id), [id])
        XCTAssertEqual(afterRelaunch[0].path, "/api/sync/workout-traces")
    }
}
