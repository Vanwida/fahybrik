import XCTest
@testable import FAHYBRIK

// EL ACUSE DE ENTREGA: cómo una petición encolada le devuelve su respuesta a quien la
// encoló, días después.
//
// Existe por un caso concreto: la traza de una carrera cuelga del `execution_id` que
// sólo viene en la RESPUESTA del envío de la ejecución. Si esa ejecución se encoló por
// falta de cobertura, la respuesta llega dentro del replay — y hasta ahora el replay
// la tiraba a la basura (`postJSONData` la ignoraba). Estas pruebas fijan el mecanismo
// entero, incluida la parte que no se puede ver a ojo: que el acuse se escribe en la
// MISMA escritura atómica que borra la entrada, que es lo que hace imposible perder el
// id en una caída.
final class RequestQueueDeliveryTests: XCTestCase {

    private var filenames: [String] = []

    override func tearDown() {
        for name in filenames { removeFile(name) }
        filenames = []
        super.tearDown()
    }

    private func newFilename() -> String {
        let name = "test-queue-delivery-\(UUID().uuidString).json"
        filenames.append(name)
        return name
    }

    private func supportURL(_ filename: String) -> URL? {
        guard let dir = try? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        ) else { return nil }
        return dir.appendingPathComponent(filename)
    }

    private func removeFile(_ filename: String) {
        guard let url = supportURL(filename) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    /// El fichero de la cola tal y como está EN DISCO ahora mismo.
    private func onDisk(_ filename: String) -> (entries: Int, receipts: Int) {
        guard let url = supportURL(filename),
              let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return (0, 0) }
        return ((json["entries"] as? [Any])?.count ?? 0, (json["receipts"] as? [Any])?.count ?? 0)
    }

    /// Un servidor de mentira: contesta lo que se le diga, por ruta.
    private final class FakeServer: @unchecked Sendable {
        var responses: [String: Result<Data, Error>] = [:]
        private(set) var received: [(path: String, body: Data)] = []

        func transport() -> RequestQueue.Transport {
            { [self] path, body, _ in
                received.append((path, body))
                switch responses[path] {
                case .success(let data): return data
                case .failure(let error): throw error
                case nil: return Data("{}".utf8)
                }
            }
        }
    }

    private let executionPath = "/api/sync/workout-execution"
    private let tracePath = "/api/sync/workout-traces"

    // MARK: - La entrega cuenta lo que contestó el servidor

    // UNA EJECUCIÓN QUE SUBE DESDE LA COLA DEVUELVE SU ID. Antes esta respuesta se
    // tiraba y con ella la única forma de saber de qué ejecución cuelga la traza.
    func testDeliveryHandsBackTheResponseBody() async {
        let name = newFilename()
        let server = FakeServer()
        server.responses[executionPath] = .success(Data(#"{"saved":true,"execution_id":"137"}"#.utf8))
        let queue = RequestQueue(filename: name, transport: server.transport())

        let told = Told()
        await queue.onDelivery { id, response in await told.record(id, response) }
        let entryId = await queue.enqueue(path: executionPath, body: Data(#"{"assignment_id":"665"}"#.utf8))

        await queue.drain(bearer: "token")

        let calls = await told.calls
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(calls[0].id, entryId, "el acuse identifica la entrada que se entregó")
        XCTAssertEqual(WorkoutTraceUploader.executionId(inResponse: calls[0].response), 137)
        let entries = await queue.snapshot()
        XCTAssertTrue(entries.isEmpty, "y la entrada ya está entregada")
    }

    // LA PROPIEDAD QUE HACE IMPOSIBLE PERDER EL ID: cuando se avisa al observador, en
    // disco la entrada YA no está y el acuse YA está — una sola escritura hizo las dos
    // cosas. Por eso una caída aquí deja siempre una de las dos, nunca ninguna.
    func testTheReceiptIsOnDiskBeforeAnyoneIsTold() async {
        let name = newFilename()
        let server = FakeServer()
        server.responses[executionPath] = .success(Data(#"{"execution_id":"9"}"#.utf8))
        let queue = RequestQueue(filename: name, transport: server.transport())

        let snapshotDuringCallback = Box()
        await queue.onDelivery { [self] _, _ in
            await snapshotDuringCallback.set(onDisk(name))
        }
        _ = await queue.enqueue(path: executionPath, body: Data("{}".utf8))
        await queue.drain(bearer: nil)

        let seen = await snapshotDuringCallback.value
        XCTAssertEqual(seen?.entries, 0, "la entrada ya estaba borrada…")
        XCTAssertEqual(seen?.receipts, 1, "…y el acuse ya estaba guardado, en la misma escritura")
        XCTAssertEqual(onDisk(name).receipts, 0, "y se retira sólo cuando el aviso ha vuelto")
    }

    // EL VIAJE ENTERO, DE PUNTA A PUNTA. La ejecución sube desde la cola, su respuesta
    // trae el id, quien esperaba encola la traza con ese id — y la traza se entrega EN
    // LA MISMA PASADA, no al día siguiente. Es para eso que el drenado da dos rondas.
    func testTheTraceRidesTheSameDrainAsTheExecutionThatUnlockedIt() async {
        let name = newFilename()
        let server = FakeServer()
        server.responses[executionPath] = .success(Data(#"{"execution_id":"4231"}"#.utf8))
        server.responses[tracePath] = .success(Data(#"{"saved":true,"traces_saved":2}"#.utf8))
        let queue = RequestQueue(filename: name, transport: server.transport())

        // El observador hace lo que hace el de verdad: leer el id y encolar la traza.
        await queue.onDelivery { _, response in
            guard let id = WorkoutTraceUploader.executionId(inResponse: response) else { return }
            let body = Data(#"{"execution_id":\#(id),"traces":[]}"#.utf8)
            await queue.enqueue(path: self.tracePath, body: body)
        }
        _ = await queue.enqueue(path: executionPath, body: Data(#"{"assignment_id":"665"}"#.utf8))

        await queue.drain(bearer: "token")

        XCTAssertEqual(server.received.map(\.path), [executionPath, tracePath])
        let traceBody = String(decoding: server.received[1].body, as: UTF8.self)
        XCTAssertTrue(traceBody.contains(#""execution_id":4231"#), "la traza subió con el id que trajo la ejecución")
        let left = await queue.snapshot()
        XCTAssertTrue(left.isEmpty, "no queda nada pendiente")
        XCTAssertEqual(onDisk(name).receipts, 0)
    }

    // MARK: - Lo que NO produce un acuse

    // Sin cobertura no se entrega nada, así que no hay nada que contar y la entrada se
    // queda esperando en su sitio. Es el caso del valle sin línea.
    func testAnOfflineDrainTellsNobodyAndKeepsTheEntry() async {
        let name = newFilename()
        let server = FakeServer()
        server.responses[executionPath] = .failure(APIError.offline)
        let queue = RequestQueue(filename: name, transport: server.transport())

        let told = Told()
        await queue.onDelivery { id, response in await told.record(id, response) }
        let entryId = await queue.enqueue(path: executionPath, body: Data("{}".utf8))

        await queue.drain(bearer: "token")

        let calls = await told.calls
        XCTAssertTrue(calls.isEmpty, "nadie ha entregado nada")
        let entries = await queue.snapshot()
        XCTAssertEqual(entries.map(\.id), [entryId], "y la petición sigue esperando su momento")
    }

    // Un 4xx determinista tira la entrada (reintentarlo da el mismo error para
    // siempre) y NO cuenta ninguna entrega: no hay respuesta buena de la que colgar nada.
    func testADeterministicRejectionDropsTheEntryWithoutTellingAnyone() async {
        let name = newFilename()
        let server = FakeServer()
        server.responses[executionPath] = .failure(APIError.http(400, Data()))
        let queue = RequestQueue(filename: name, transport: server.transport())

        let told = Told()
        await queue.onDelivery { id, response in await told.record(id, response) }
        _ = await queue.enqueue(path: executionPath, body: Data("{}".utf8))

        await queue.drain(bearer: "token")

        let calls = await told.calls
        XCTAssertTrue(calls.isEmpty)
        let entries = await queue.snapshot()
        XCTAssertTrue(entries.isEmpty, "la entrada envenenada se va")
    }

    // Un 401 no es culpa de la entrada, es la sesión muerta: se para y se guarda TODO
    // para el siguiente drenado tras volver a entrar.
    func testADeadSessionStopsAndKeepsEverything() async {
        let name = newFilename()
        let server = FakeServer()
        server.responses[executionPath] = .failure(APIError.http(401, Data()))
        let queue = RequestQueue(filename: name, transport: server.transport())

        let told = Told()
        await queue.onDelivery { id, response in await told.record(id, response) }
        _ = await queue.enqueue(path: executionPath, body: Data("{}".utf8))

        await queue.drain(bearer: "caducado")

        let calls = await told.calls
        XCTAssertTrue(calls.isEmpty)
        let entries = await queue.snapshot()
        XCTAssertEqual(entries.count, 1)
    }

    // Sin nadie escuchando no se guarda ni un acuse: el fichero no crece por una
    // función que nadie usa.
    func testNoObserverMeansNoReceipts() async {
        let name = newFilename()
        let server = FakeServer()
        server.responses[executionPath] = .success(Data(#"{"execution_id":"1"}"#.utf8))
        let queue = RequestQueue(filename: name, transport: server.transport())

        _ = await queue.enqueue(path: executionPath, body: Data("{}".utf8))
        await queue.drain(bearer: nil)

        XCTAssertEqual(onDisk(name).receipts, 0)
        XCTAssertEqual(onDisk(name).entries, 0)
    }

    // MARK: - Cajas de apoyo (el actor evita la carrera al anotar desde el observador)

    private actor Told {
        private(set) var calls: [(id: UUID, response: Data)] = []
        func record(_ id: UUID, _ response: Data) { calls.append((id, response)) }
    }

    private actor Box {
        private(set) var value: (entries: Int, receipts: Int)?
        func set(_ v: (entries: Int, receipts: Int)) { value = v }
    }
}
