import XCTest
@testable import FAHYBRIK

/// B-02: el entreno terminado queda en disco al aparecer el resumen; si la app muere
/// antes de GUARDAR, el siguiente arranque lo entrega por la cola — una vez, y nunca
/// el borrador de un resumen que sigue en pantalla en este mismo proceso.
final class FinishedWorkoutDraftTests: XCTestCase {
    private var url: URL!

    override func setUp() {
        super.setUp()
        url = FileManager.default.temporaryDirectory
            .appendingPathComponent("draft-test-\(UUID().uuidString).json")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: url)
        super.tearDown()
    }

    private actor Queue {
        var entries: [(path: String, body: Data, bearer: String?)] = []
        func add(_ p: String, _ b: Data, _ t: String?) { entries.append((p, b, t)) }
    }

    func testElBorradorDeEsteMismoArranqueNoSeEncola() async {
        let launch = UUID()
        FinishedWorkoutDraft.stage(path: "/api/sync/workout-execution", body: Data("{}".utf8), at: url, launch: launch)
        let queue = Queue()
        let recovered = await FinishedWorkoutDraft.recoverIntoQueue(
            bearer: "t", at: url, launch: launch, enqueue: { await queue.add($0, $1, $2) }
        )
        XCTAssertFalse(recovered)
        let entries = await queue.entries
        XCTAssertTrue(entries.isEmpty)
        XCTAssertNotNil(FinishedWorkoutDraft.load(at: url), "el resumen sigue en pantalla: el borrador se queda")
    }

    func testElDeUnArranqueAnteriorSeEncolaUnaVezYSeBorra() async {
        let body = Data(#"{"assignment_id":"42"}"#.utf8)
        FinishedWorkoutDraft.stage(path: "/api/sync/workout-execution", body: body, at: url, launch: UUID())
        let queue = Queue()
        let now = UUID()
        let first = await FinishedWorkoutDraft.recoverIntoQueue(
            bearer: "vigente", at: url, launch: now, enqueue: { await queue.add($0, $1, $2) }
        )
        let second = await FinishedWorkoutDraft.recoverIntoQueue(
            bearer: "vigente", at: url, launch: now, enqueue: { await queue.add($0, $1, $2) }
        )
        XCTAssertTrue(first)
        XCTAssertFalse(second)
        let entries = await queue.entries
        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries.first?.path, "/api/sync/workout-execution")
        XCTAssertEqual(entries.first?.body, body)
        XCTAssertEqual(entries.first?.bearer, "vigente")
        XCTAssertNil(FinishedWorkoutDraft.load(at: url))
    }

    func testGuardarBorraElBorrador() async {
        FinishedWorkoutDraft.stage(path: "/api/athlete/workouts/free", body: Data("{}".utf8), at: url, launch: UUID())
        FinishedWorkoutDraft.clear(at: url)
        let queue = Queue()
        let recovered = await FinishedWorkoutDraft.recoverIntoQueue(
            bearer: "t", at: url, launch: UUID(), enqueue: { await queue.add($0, $1, $2) }
        )
        XCTAssertFalse(recovered)
    }
}
