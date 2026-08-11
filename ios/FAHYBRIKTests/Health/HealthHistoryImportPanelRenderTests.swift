import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA TARJETA DEL HISTÓRICO, DIBUJADA DE VERDAD, EN SUS CUATRO ESTADOS.
//
// Hermana de `HuecoDeclaradoRenderTests`, y aquí hace falta por una razón concreta:
// la tarjeta sólo aparece con Apple Salud conectado, y en el simulador
// `isHealthDataAvailable()` es false, así que NO hay forma de verla arrancando la
// app. Sin esto se estaría entregando una pantalla que nadie ha mirado.
//
// Con `FAHYBRIK_CAPTURAS=<carpeta>` deja los PNG en esa carpeta.

/// Fuente que se queda colgada donde le digas, para poder pintar el estado «en
/// marcha» sin carreras de tiempo: se para, se dibuja, y se la suelta.
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

/// Fuente que devuelve al instante: sirve para llegar al estado «terminado».
private final class InstantSource: HealthHistoryWindowImporting {
    func importHistoryWindow(from: Date, to: Date) async throws {}
}

@MainActor
final class HealthHistoryImportPanelRenderTests: XCTestCase {

    private static let ancho: CGFloat = 402   // iPhone 17 Pro dentro del área segura

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

    /// 1 · Sin consentir: la oferta. Es la única pantalla con botón de arranque, y su
    /// texto tiene que decir QUÉ trae, PARA QUÉ y HASTA DÓNDE.
    func testOfertaSinConsentimiento() throws {
        let importer = make(InstantSource())
        XCTAssertFalse(importer.state.hasConsent)
        XCTAssertNotNil(render(panel(importer), nombre: "historico-1-oferta", alto: 190))
    }

    /// 2 · En marcha: el año que va cayendo y la barra.
    func testEnMarchaConProgreso() async throws {
        let gate = GatedSource()
        let importer = make(gate)

        importer.consentAndStart()
        try await waitUntil { gate.started }

        XCTAssertTrue(importer.running)
        XCTAssertNotNil(importer.currentYear, "tiene que decir por qué año va")
        XCTAssertNotNil(render(panel(importer), nombre: "historico-2-en-marcha", alto: 150))

        gate.release()
        importer.stop()
    }

    /// 3 · Se cortó: el motivo en palabras del atleta y el botón de seguir. NUNCA
    /// vuelve a pedir permiso.
    func testCortadoOfreceContinuar() async throws {
        let gate = GatedSource()
        let importer = make(gate)

        importer.consentAndStart()
        try await waitUntil { gate.started }
        gate.release(throwing: HealthHistoryImportError.offline)
        try await waitUntil { !importer.running }

        XCTAssertNotNil(importer.lastError)
        XCTAssertTrue(importer.state.hasConsent)
        XCTAssertFalse(importer.state.isComplete)
        XCTAssertNotNil(render(panel(importer), nombre: "historico-3-cortado", alto: 150))
    }

    /// 4 · Terminado: constancia de hasta dónde se llegó, y ningún botón — no queda
    /// nada que traer.
    func testTerminadoSinBoton() async throws {
        let importer = make(InstantSource())
        importer.consentAndStart()
        try await waitUntil { !importer.running }

        XCTAssertTrue(importer.state.isComplete)
        XCTAssertEqual(importer.progress, 1, accuracy: 0.001)
        XCTAssertNotNil(render(panel(importer), nombre: "historico-4-terminado", alto: 110))
    }

    // MARK: - Utillaje

    private func make(_ source: HealthHistoryWindowImporting) -> HealthKitHistoryImporter {
        HealthKitHistoryImporter(
            source: source,
            athleteId: "1",
            defaults: defaults,
            pauseBetweenWindows: .zero
        )
    }

    private func panel(_ importer: HealthKitHistoryImporter) -> some View {
        HealthHistoryImportPanel(athleteId: "1", importerForTesting: importer)
    }

    private func waitUntil(
        _ condition: @MainActor () -> Bool,
        timeout: TimeInterval = 10
    ) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition(), Date() < deadline {
            try await Task.sleep(for: .milliseconds(5))
        }
        XCTAssertTrue(condition(), "la condición no se cumplió dentro del plazo")
    }

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    private func render(_ vista: some View, nombre: String, alto: CGFloat) -> UIImage? {
        let renderer = ImageRenderer(
            content: ZStack {
                Theme.Color.background
                CardSurface(padding: 0) { vista }
                    .padding(.horizontal, Theme.Spacing.l)
            }
                .frame(width: Self.ancho, height: alto)
                .environment(\.colorScheme, .dark)
        )
        renderer.scale = 3
        guard let imagen = renderer.uiImage else { return nil }
        if let png = imagen.pngData() {
            let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            adjunto.name = nombre
            adjunto.lifetime = .keepAlways
            add(adjunto)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
            }
        }
        return imagen
    }
}
