import XCTest
@testable import FAHYBRIK

/// El registro técnico (DECISIONS 2026-09-24): lo que importa es que el evento
/// aguanta en disco, que nada se manda dos veces por error ni se da por entregado
/// sin serlo, y que lo que viaja es lo que el servidor acepta.
final class DiagnosticsLogTests: XCTestCase {
    private var dirs: [String] = []

    private func makeLog(_ device: DiagEvent.Device = .phone, name: String? = nil) -> DiagnosticsLog {
        let dir = name ?? "diag-test-\(UUID().uuidString)"
        dirs.append(dir)
        return DiagnosticsLog(device: device, directoryName: dir)
    }

    override func tearDown() {
        for d in dirs {
            if let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
                try? FileManager.default.removeItem(at: base.appendingPathComponent(d))
            }
        }
        dirs = []
        super.tearDown()
    }

    func testSeqSubeYSobreviveAUnReinicio() {
        let dir = "diag-test-\(UUID().uuidString)"
        let a = makeLog(name: dir)
        a.record(.link, .startWatchApp, outcome: .failed, code: 7, domain: "com.apple.healthkit")
        a.record(.link, .mirrorAdopted, outcome: .ok)
        let first = a.pending(limit: 10)
        XCTAssertEqual(first.map(\.seq), [0, 1])
        XCTAssertEqual(first.map(\.name), ["start_watch_app", "mirror_adopted"])
        XCTAssertEqual(first.first?.device, .phone)

        // Otra instancia sobre el mismo disco: misma instalación, el seq sigue.
        let b = DiagnosticsLog(device: .phone, directoryName: dir)
        XCTAssertEqual(b.installId, a.installId)
        b.record(.session, .liveBegin)
        XCTAssertEqual(b.pending(limit: 10).map(\.seq), [0, 1, 2])
    }

    func testLoEntregadoNoSeVuelveAMandar() {
        let log = makeLog()
        log.record(.lifecycle, .appLaunch)
        log.record(.lifecycle, .appForeground)
        let batch = log.pending(limit: 10)
        log.markDelivered(batch)
        XCTAssertTrue(log.pending(limit: 10).isEmpty)
        log.record(.lifecycle, .appBackground)
        XCTAssertEqual(log.pending(limit: 10).map(\.name), ["app_background"])
        // Lo entregado sigue en la pantalla de diagnóstico.
        XCTAssertEqual(log.recent(limit: 10).count, 3)
    }

    func testUnaEntregaFallidaVuelveAEstarPendiente() {
        let watch = makeLog(.watch)
        for _ in 0..<5 { watch.record(.link, .wcReachability) }
        let sent = watch.pending(limit: 3)
        watch.markDelivered(sent)
        XCTAssertEqual(watch.pending(limit: 10).map(\.seq), [3, 4])
        watch.markUndelivered(sent)
        XCTAssertEqual(watch.pending(limit: 10).map(\.seq), [0, 1, 2, 3, 4])
        XCTAssertEqual(watch.pendingCount(), 5)
    }

    func testLosDelRelojViajanConSuInstalacionYSuSeq() {
        let watch = makeLog(.watch)
        watch.record(.link, .mirroringStarted, outcome: .ok)
        watch.record(.session, .primaryBegin, detail: "role=mirror")
        let fromWatch = watch.pending(limit: 10)

        let phone = makeLog(.phone)
        phone.record(.link, .startWatchApp, outcome: .ok)
        phone.ingest(fromWatch)
        let all = phone.pending(limit: 10)
        XCTAssertEqual(all.count, 3)
        XCTAssertEqual(Set(all.map(\.installId)), [phone.installId, watch.installId])
        XCTAssertEqual(all.filter { $0.device == .watch }.map(\.seq), [0, 1])

        // Entregar los del móvil no da por entregados los del reloj.
        phone.markDelivered(all.filter { $0.device == .phone })
        XCTAssertEqual(phone.pending(limit: 10).map(\.name), ["mirroring_started", "primary_begin"])
    }

    func testElDetalleSeRecortaYElFicheroTieneTecho() {
        let log = makeLog()
        log.record(.save, .queueFailed, detail: String(repeating: "x", count: 1000))
        XCTAssertEqual(log.pending(limit: 1).first?.detail?.count, DiagnosticsLog.maxDetail)

        for _ in 0..<(DiagnosticsLog.compactAt + 10) { log.record(.lifecycle, .appForeground) }
        let kept = log.recent(limit: 10_000)
        XCTAssertLessThanOrEqual(kept.count, DiagnosticsLog.compactAt)
        XCTAssertGreaterThanOrEqual(kept.count, DiagnosticsLog.keepLast)
        // Se quedan los últimos.
        XCTAssertEqual(kept.map(\.seq).max(), Int64(DiagnosticsLog.compactAt + 10))
    }

    func testUnaSesionQueMuereSinCerrarSeCuentaAlArrancar() {
        let dir = "diag-test-\(UUID().uuidString)"
        let a = makeLog(.watch, name: dir)
        let workout = UUID()
        a.markRunning(workoutId: workout, role: "mirror")
        _ = a.pending(limit: 1)  // espera a que la cola escriba la marca

        let b = DiagnosticsLog(device: .watch, directoryName: dir)
        b.reportUncleanExit()
        let events = b.pending(limit: 10)
        XCTAssertEqual(events.map(\.name), ["unclean_exit"])
        XCTAssertEqual(events.first?.workoutId, workout)
        XCTAssertEqual(events.first?.outcome, .failed)
        XCTAssertTrue(events.first?.detail?.contains("role=mirror") ?? false)

        // Una sola vez; y una salida limpia no deja marca.
        b.reportUncleanExit()
        b.markRunning(workoutId: nil, role: "solo")
        b.markStopped()
        _ = b.pending(limit: 1)  // la cola de b ha escrito y borrado la marca
        let c = DiagnosticsLog(device: .watch, directoryName: dir)
        c.reportUncleanExit()
        XCTAssertEqual(c.pending(limit: 10).filter { $0.name == "unclean_exit" }.count, 1)
    }

    func testUnErrorDeAppleSeGuardaConSuDominioYCodigo() {
        let log = makeLog()
        log.record(.link, .startWatchApp, error: NSError(domain: "com.apple.healthkit", code: 5))
        log.record(.link, .mirroringStarted, error: nil)
        let e = log.pending(limit: 10)
        XCTAssertEqual(e[0].outcome, .failed)
        XCTAssertEqual(e[0].domain, "com.apple.healthkit")
        XCTAssertEqual(e[0].code, 5)
        XCTAssertEqual(e[1].outcome, .ok)
    }

    /// Lo que el servidor acepta (`web/lib/devices/device-events.ts`).
    func testLosNombresYElCableSonLosDelServidor() throws {
        let pattern = try NSRegularExpression(pattern: "^[a-z][a-z0-9_]{1,63}$")
        for name in DiagName.allCases {
            let raw = name.rawValue
            XCTAssertNotNil(pattern.firstMatch(in: raw, range: NSRange(raw.startIndex..., in: raw)), raw)
        }

        let log = makeLog()
        log.record(.link, .startWatchApp, workoutId: UUID(), outcome: .ok)
        let event = try XCTUnwrap(log.pending(limit: 1).first)
        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase  // el de APIClient
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: enc.encode(event)) as? [String: Any])
        for key in ["install_id", "seq", "device", "kind", "name", "at", "workout_id", "outcome",
                    "app_version", "app_build", "os_version", "device_model"] {
            XCTAssertNotNil(json[key], key)
        }
        // ISO 8601 con milisegundos.
        let at = try XCTUnwrap(json["at"] as? String)
        XCTAssertNotNil(at.range(of: #"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$"#, options: .regularExpression), at)
    }
}
