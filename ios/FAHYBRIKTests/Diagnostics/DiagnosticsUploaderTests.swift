import XCTest
@testable import FAHYBRIK

/// Subir el registro: solo un 2xx lo da por entregado; un lote que el servidor no
/// puede leer se suelta (reintentarlo tal cual sería un bucle); sin red se queda.
final class DiagnosticsUploaderTests: XCTestCase {
    private var dir = ""

    private func makeLog() -> DiagnosticsLog {
        dir = "diag-upload-test-\(UUID().uuidString)"
        return DiagnosticsLog(device: .phone, directoryName: dir)
    }

    override func tearDown() {
        if let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            try? FileManager.default.removeItem(at: base.appendingPathComponent(dir))
        }
        super.tearDown()
    }

    private actor Calls {
        var batches: [[DiagEvent]] = []
        func add(_ b: [DiagEvent]) { batches.append(b) }
    }

    func testUn2xxLoDaPorEntregado() async {
        let log = makeLog()
        log.record(.link, .startWatchApp, outcome: .ok)
        log.record(.link, .mirrorAdopted, outcome: .ok)
        let calls = Calls()
        let uploader = DiagnosticsUploader(log: log) { batch, bearer in
            XCTAssertEqual(bearer, "tok")
            await calls.add(batch.events)
        }
        await uploader.flush(bearer: "tok")
        let sent = await calls.batches
        XCTAssertEqual(sent.map { $0.map(\.name) }, [["start_watch_app", "mirror_adopted"]])
        XCTAssertEqual(log.pendingCount(), 0)

        // Nada pendiente: no llama.
        await uploader.flush(bearer: "tok")
        let again = await calls.batches
        XCTAssertEqual(again.count, 1)
    }

    func testSinRedSeQuedaYSinSesionNiLoIntenta() async {
        let log = makeLog()
        log.record(.save, .queueFailed, outcome: .failed)
        let calls = Calls()
        let offline = DiagnosticsUploader(log: log) { batch, _ in
            await calls.add(batch.events)
            throw APIError.offline
        }
        await offline.flush(bearer: nil)
        let none = await calls.batches
        XCTAssertTrue(none.isEmpty)

        await offline.flush(bearer: "tok")
        XCTAssertEqual(log.pendingCount(), 1)
        let result = await offline.lastResult
        XCTAssertNotNil(result)
    }

    func testUnLoteIlegibleSeSueltaEnVezDeReintentarseParaSiempre() async {
        let log = makeLog()
        log.record(.lifecycle, .appLaunch)
        let rejecting = DiagnosticsUploader(log: log) { _, _ in
            throw APIError.http(400, Data())
        }
        await rejecting.flush(bearer: "tok")
        XCTAssertEqual(log.pendingCount(), 0)
        // Sigue en el aparato, en la pantalla de diagnóstico.
        XCTAssertEqual(log.recent(limit: 10).count, 1)
    }

    func testUn401NoSuelta() async {
        let log = makeLog()
        log.record(.lifecycle, .appLaunch)
        let unauthorized = DiagnosticsUploader(log: log) { _, _ in
            throw APIError.http(401, Data())
        }
        await unauthorized.flush(bearer: "caducado")
        XCTAssertEqual(log.pendingCount(), 1)
    }
}
