import XCTest
import SwiftUI
@testable import FAHYBRIK

// ESTADO DEL HISTÓRICO bajo la fila de Apple Salud (sin segundo botón de sync).
// En el simulador HealthKit no está; estos renders son la única forma de verlo.

private final class GatedSource: HealthHistoryWindowImporting {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Void, Error>?
    private var didStart = false

    var started: Bool {
        lock.lock(); defer { lock.unlock() }
        return didStart
    }

    func importHistoryWindow(from: Date, to: Date) async throws {
        try await withCheckedThrowingContinuation { c in
            lock.lock()
            continuation = c
            didStart = true
            lock.unlock()
        }
    }

    func release(throwing error: Error? = nil) {
        lock.lock()
        let c = continuation
        continuation = nil
        lock.unlock()
        if let error { c?.resume(throwing: error) } else { c?.resume() }
    }
}

private final class InstantSource: HealthHistoryWindowImporting {
    func importHistoryWindow(from: Date, to: Date) async throws {}
}

@MainActor
final class HealthHistoryImportPanelRenderTests: XCTestCase {

    private static let ancho: CGFloat = 402

    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() {
        super.setUp()
        suiteName = "test.hk.panel.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    /// Sin consentimiento: no se pinta nada (el toggle es el único control).
    func testSinConsentimientoNoPintaOferta() throws {
        let importer = make(InstantSource())
        XCTAssertFalse(importer.state.hasConsent)
        // Alto mínimo: el Group vacío no debe inventar un botón «Importar».
        let img = render(panel(importer), nombre: "historico-0-vacio", alto: 40)
        XCTAssertNotNil(img)
    }

    func testEnMarchaConProgreso() async throws {
        let gate = GatedSource()
        let importer = make(gate)
        importer.consentAndStart()
        // Espera a que el barrido entre en running.
        let deadline = Date().addingTimeInterval(2)
        while !importer.running && Date() < deadline {
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertTrue(importer.running)
        XCTAssertNotNil(render(panel(importer), nombre: "historico-2-marcha", alto: 90))
        gate.release()
    }

    func testReanudableTrasFallo() async throws {
        let gate = GatedSource()
        let importer = make(gate)
        importer.consentAndStart()
        let deadline = Date().addingTimeInterval(2)
        while !gate.started && Date() < deadline {
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        gate.release(throwing: HealthHistoryImportError.offline)
        let wait = Date().addingTimeInterval(2)
        while importer.running && Date() < wait {
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertTrue(importer.state.hasConsent)
        XCTAssertFalse(importer.running)
        XCTAssertNotNil(render(panel(importer), nombre: "historico-3-reanudar", alto: 110))
    }

    func testTerminado() async throws {
        let importer = make(InstantSource())
        importer.consentAndStart()
        let deadline = Date().addingTimeInterval(2)
        while !importer.state.isComplete && Date() < deadline {
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertTrue(importer.state.isComplete)
        XCTAssertNotNil(render(panel(importer), nombre: "historico-4-hecho", alto: 50))
    }

    // MARK: - Helpers

    private func make(_ source: HealthHistoryWindowImporting) -> HealthKitHistoryImporter {
        HealthKitHistoryImporter(
            source: source,
            athleteId: "1",
            defaults: defaults,
            pauseBetweenWindows: .milliseconds(1)
        )
    }

    private func panel(_ importer: HealthKitHistoryImporter) -> some View {
        HealthHistoryImportPanel(athleteId: "1", importerForTesting: importer)
            .frame(width: Self.ancho)
            .background(Theme.Color.surface)
    }

    @discardableResult
    private func render<V: View>(_ view: V, nombre: String, alto: CGFloat) -> UIImage? {
        let host = UIHostingController(rootView: view)
        host.view.bounds = CGRect(x: 0, y: 0, width: Self.ancho, height: alto)
        host.view.backgroundColor = .clear
        let renderer = UIGraphicsImageRenderer(size: host.view.bounds.size)
        let image = renderer.image { _ in
            host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true)
        }
        if let dir = ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"] {
            let url = URL(fileURLWithPath: dir).appendingPathComponent("\(nombre).png")
            try? image.pngData()?.write(to: url)
        }
        return image
    }
}
