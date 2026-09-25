import XCTest
@testable import FAHYBRIK

/// Fase 1: el entreno terminado se queda en la muñeca hasta que el SERVIDOR lo
/// confirma, no hasta que llega al teléfono (`WatchSaveLedger`).
final class WatchSaveLedgerTests: XCTestCase {
    private let t0 = Date(timeIntervalSince1970: 1_790_000_000)

    private func sobre(_ id: String?, asignacion: String = "42") -> Data {
        var envelope = WatchExecutionEnvelope(
            assignmentId: asignacion,
            payloadJson: Data("{}".utf8),
            shareWithPartner: nil
        )
        envelope.envelopeId = id
        return try! WatchWire.encoder.encode(envelope)
    }

    func testLlegarAlTelefonoNoLoBorraElAcuseDelServidorSi() {
        let data = sobre("A")
        var ledger = WatchSaveLedger()
        ledger.insert(data)
        XCTAssertEqual(ledger.entries.first?.envelopeId, "A")
        ledger.markHanded(data, at: t0)
        ledger.deliveredToPhone(data, at: t0)
        XCTAssertEqual(ledger.entries.count, 1, "entregado al teléfono no es guardado")

        ledger.apply(WatchExecutionReceipt(envelopeId: "A", outcome: .saved))
        XCTAssertTrue(ledger.entries.isEmpty)
    }

    func testUnSobreDeUnRelojAnteriorSeBorraAlLlegarComoSiempre() {
        let data = sobre(nil)
        var ledger = WatchSaveLedger()
        ledger.insert(data)
        ledger.markHanded(data, at: t0)
        ledger.deliveredToPhone(data, at: t0)
        XCTAssertTrue(ledger.entries.isEmpty)
    }

    func testSinAcuseEnUnaHoraSeVuelveAEntregar() {
        let data = sobre("A")
        var ledger = WatchSaveLedger()
        ledger.insert(data)
        XCTAssertEqual(ledger.toHand(now: t0, inFlight: []), [data], "lo pendiente sale siempre")
        ledger.markHanded(data, at: t0)
        ledger.deliveredToPhone(data, at: t0.addingTimeInterval(60))

        XCTAssertTrue(ledger.toHand(now: t0.addingTimeInterval(30 * 60), inFlight: []).isEmpty)
        XCTAssertEqual(ledger.toHand(now: t0.addingTimeInterval(2 * 3600), inFlight: []), [data],
                       "el teléfono lo perdió antes de ponerlo a salvo: sale otra vez")
        XCTAssertTrue(ledger.toHand(now: t0.addingTimeInterval(2 * 3600), inFlight: [data]).isEmpty,
                      "lo que WatchConnectivity ya lleva no se duplica")
    }

    func testLoQueElTelefonoGuardaNoSeReenviaYSeBorraAlSubir() {
        let data = sobre("A")
        var ledger = WatchSaveLedger()
        ledger.insert(data)
        ledger.markHanded(data, at: t0)
        ledger.apply(WatchExecutionReceipt(envelopeId: "A", outcome: .held))
        XCTAssertEqual(ledger.count(.held), 1)
        XCTAssertTrue(ledger.toHand(now: t0.addingTimeInterval(48 * 3600), inFlight: []).isEmpty,
                      "sin cobertura dos días: el teléfono lo tiene, no se reenvía")

        ledger.apply(WatchExecutionReceipt(envelopeId: "A", outcome: .saved))
        XCTAssertTrue(ledger.entries.isEmpty)
    }

    func testUnRechazoSeGuardaSinReenviarYUnHeldTardioNoLoDeshace() {
        let data = sobre("A")
        var ledger = WatchSaveLedger()
        ledger.insert(data)
        ledger.markHanded(data, at: t0)
        ledger.apply(WatchExecutionReceipt(envelopeId: "A", outcome: .rejected))
        ledger.apply(WatchExecutionReceipt(envelopeId: "A", outcome: .held))
        XCTAssertEqual(ledger.count(.rejected), 1, "lo rechazado no se pierde")
        XCTAssertTrue(ledger.toHand(now: t0.addingTimeInterval(48 * 3600), inFlight: []).isEmpty)
    }

    func testUnAcuseDeUnSobreQueNoEstaNoTocaNada() {
        var ledger = WatchSaveLedger()
        ledger.insert(sobre("A"))
        XCTAssertFalse(ledger.apply(WatchExecutionReceipt(envelopeId: "B", outcome: .saved)))
        XCTAssertEqual(ledger.entries.count, 1)
    }

    func testElBuzonViejoPasaEnteroComoPendiente() {
        let viejo = [sobre(nil, asignacion: "1"), sobre(nil, asignacion: "2")]
        let ledger = WatchSaveLedger.migrating(legacy: viejo)
        XCTAssertEqual(ledger.count(.pending), 2)
        XCTAssertEqual(ledger.toHand(now: t0, inFlight: [viejo[0]]), [viejo[1]])
    }

    func testReescenificarSustituyeElSobreYSigueEscenificado() {
        let primero = sobre("A", asignacion: "42")
        let segundo = sobre("A", asignacion: "43")
        var ledger = WatchSaveLedger()
        ledger.insert(primero, staged: true)
        ledger.replace(primero, with: segundo)
        XCTAssertEqual(ledger.entries.map(\.data), [segundo])
        XCTAssertEqual(ledger.count(.staged), 1)
    }

    /// Dobles: el conmutador de compartir decide hasta «Listo». Con la app viva, lo
    /// escenificado no sale solo (tampoco al volver a tener el teléfono a tiro); si
    /// la app murió antes de «Listo», sale al arrancar con la decisión que tuviera.
    func testLoEscenificadoSoloSaleConListoOTrasUnaCaida() {
        let data = sobre("A")
        var ledger = WatchSaveLedger()
        ledger.insert(data, staged: true)
        XCTAssertTrue(ledger.toHand(now: t0, inFlight: []).isEmpty)
        XCTAssertEqual(ledger.toHand(now: t0, inFlight: [], afterLaunch: true), [data])

        ledger.markHanded(data, at: t0)   // «Listo»
        XCTAssertEqual(ledger.count(.handed), 1)
    }

    func testSobreviveAGuardarseYLeerse() throws {
        let data = sobre("A")
        var ledger = WatchSaveLedger()
        ledger.insert(data)
        ledger.markHanded(data, at: t0)
        let vuelta = try JSONDecoder().decode(WatchSaveLedger.self, from: JSONEncoder().encode(ledger))
        XCTAssertEqual(vuelta, ledger)
    }
}
