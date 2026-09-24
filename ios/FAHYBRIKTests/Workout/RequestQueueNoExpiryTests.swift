import XCTest
@testable import FAHYBRIK

/// Lo que el atleta hizo no caduca en la cola (fase 1; auditoría: «los entrenos
/// offline se tiran a las 72 h»). Un entreno guardado sin cobertura hace diez días
/// se entrega igual: el servidor lo coloca en su fecha.
final class RequestQueueNoExpiryTests: XCTestCase {
    private let filename = "test-queue-no-expiry-\(UUID().uuidString).json"

    private var fileURL: URL {
        let dir = try! FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )
        return dir.appendingPathComponent(filename)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: fileURL)
        super.tearDown()
    }

    private actor Received {
        var paths: [String] = []
        func add(_ p: String) { paths.append(p) }
    }

    func testUnEntrenoDeHaceDiezDiasSeEntregaIgual() async throws {
        let old = QueuedRequest(
            id: UUID(),
            path: "/api/sync/workout-execution",
            bodyJson: Data("{}".utf8),
            bearer: "viejo",
            createdAt: Date(timeIntervalSinceNow: -10 * 24 * 3600)
        )
        // El formato de disco que la cola ya sabía leer (lista de entradas).
        try JSONEncoder().encode([old]).write(to: fileURL, options: .atomic)

        let received = Received()
        let queue = RequestQueue(filename: filename) { path, _, bearer in
            XCTAssertEqual(bearer, "vigente")
            await received.add(path)
            return Data("{}".utf8)
        }
        await queue.drain(bearer: "vigente")

        let delivered = await received.paths
        XCTAssertEqual(delivered, ["/api/sync/workout-execution"])
        let left = await queue.snapshot()
        XCTAssertTrue(left.isEmpty)
    }
}
