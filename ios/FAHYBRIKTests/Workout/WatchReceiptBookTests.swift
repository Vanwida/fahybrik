import XCTest
@testable import FAHYBRIK

/// Fase 1: el teléfono le cuenta al reloj qué ha sido de cada sobre, también
/// cuando la cola sin cobertura contesta días después (`WatchReceiptBook`).
final class WatchReceiptBookTests: XCTestCase {

    func testSubidoAlMomentoEsSaved() {
        var book = WatchReceiptBook()
        book.record(.saved, envelopeId: "A")
        XCTAssertEqual(book.takePending(), [WatchExecutionReceipt(envelopeId: "A", outcome: .saved)])
        XCTAssertTrue(book.takePending().isEmpty, "lo que sale no vuelve a salir")
    }

    func testEnLaColaEsHeldYAlEntregarseSaved() {
        var book = WatchReceiptBook()
        let entrada = UUID()
        book.awaitQueue(requestId: entrada, envelopeId: "A")
        XCTAssertEqual(book.takePending(), [WatchExecutionReceipt(envelopeId: "A", outcome: .held)])

        XCTAssertTrue(book.queueSettled(requestId: entrada, outcome: .saved))
        XCTAssertEqual(book.takePending(), [WatchExecutionReceipt(envelopeId: "A", outcome: .saved)])
        XCTAssertFalse(book.queueSettled(requestId: entrada, outcome: .saved), "se acusa una vez")
    }

    func testUnRechazoAlVaciarLaColaLlegaAlReloj() {
        var book = WatchReceiptBook()
        let entrada = UUID()
        book.awaitQueue(requestId: entrada, envelopeId: "A")
        _ = book.takePending()
        book.queueSettled(requestId: entrada, outcome: .rejected)
        XCTAssertEqual(book.takePending(), [WatchExecutionReceipt(envelopeId: "A", outcome: .rejected)])
    }

    func testUnaEntradaQueNoEsDelRelojNoAcusaNada() {
        var book = WatchReceiptBook()
        XCTAssertFalse(book.queueSettled(requestId: UUID(), outcome: .saved))
        XCTAssertTrue(book.takePending().isEmpty)
    }

    func testElVinculoColaSobreSobreviveAUnReinicio() throws {
        var book = WatchReceiptBook()
        let entrada = UUID()
        book.awaitQueue(requestId: entrada, envelopeId: "A")
        _ = book.takePending()
        var vuelta = try JSONDecoder().decode(WatchReceiptBook.self, from: JSONEncoder().encode(book))
        XCTAssertTrue(vuelta.queueSettled(requestId: entrada, outcome: .saved))
    }

    func testElTopeTiraLosMasViejos() {
        var book = WatchReceiptBook()
        for i in 0..<(WatchReceiptBook.maxPending + 5) {
            book.record(.saved, envelopeId: "\(i)")
        }
        let pendientes = book.takePending()
        XCTAssertEqual(pendientes.count, WatchReceiptBook.maxPending)
        XCTAssertEqual(pendientes.first?.envelopeId, "5")
    }
}
