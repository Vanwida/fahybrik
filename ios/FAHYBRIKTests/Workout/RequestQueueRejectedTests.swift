import XCTest
@testable import FAHYBRIK

/// Fase 1, «nada se pierde»: un entreno terminado que el servidor rechaza al vaciar
/// la cola ya no se tira — sale de la cola (reintentarlo no lo arregla) y queda
/// guardado entre los rechazados, y quien lo esperaba se entera.
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
}
