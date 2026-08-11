import XCTest
@testable import FAHYBRIK

// EL IMPORT DEL HISTÓRICO DE APPLE SALUD, SIN HEALTHKIT Y SIN RED.
//
// Lo que se fija aquí es lo que no puede fallar nunca:
//   • sin consentimiento explícito NO se lee absolutamente nada;
//   • el cursor es reanudable: si una ventana se corta, se retoma esa MISMA;
//   • reconectar (o volver a la pantalla) NO vuelve a pedir permiso ni rehace lo ya
//     importado;
//   • las ventanas cubren el tramo entero, sin huecos y sin solapes.
//
// El plan es puro y el importador recibe su fuente por inyección, así que todo esto
// se prueba con un espía y un `UserDefaults` de usar y tirar.

/// Fuente de mentira: apunta las ventanas que le piden y puede fallar a la N-ésima.
///
/// Con candado porque el importador la llama desde fuera del actor principal (la
/// lectura de Salud de verdad NO debe ocupar el hilo de la interfaz) mientras el test
/// lee sus apuntes desde el principal.
private final class SpySource: HealthHistoryWindowImporting {
    private let lock = NSLock()
    private var recorded: [(from: Date, to: Date)] = []
    private var failAt: Int?
    private var failure: HealthHistoryImportError = .offline

    var windows: [(from: Date, to: Date)] {
        lock.lock(); defer { lock.unlock() }
        return recorded
    }

    /// Índice (base 0) de la llamada que debe fallar. `nil` = ninguna.
    func failAtCall(_ index: Int?, with error: HealthHistoryImportError = .offline) {
        lock.lock(); defer { lock.unlock() }
        failAt = index
        failure = error
    }

    func importHistoryWindow(from: Date, to: Date) async throws {
        lock.lock()
        let index = recorded.count
        recorded.append((from, to))
        let shouldFail = failAt == index
        let error = failure
        lock.unlock()
        if shouldFail { throw error }
    }
}

@MainActor
final class HealthHistoryImportTests: XCTestCase {

    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() {
        super.setUp()
        suiteName = "test.hk.history.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    // MARK: - El plan (puro)

    func testPlanWalksBackwardsInWholeWindows() {
        let head = Date(timeIntervalSince1970: 1_000_000_000)
        let plan = HealthHistoryImportPlan(
            head: head,
            floor: head.addingTimeInterval(-180 * 86_400),
            windowDays: 90
        )

        let first = plan.nextWindow(after: nil)
        XCTAssertEqual(first?.end, head)
        XCTAssertEqual(first?.start, head.addingTimeInterval(-90 * 86_400))

        // La siguiente arranca EXACTAMENTE donde acabó la anterior: sin hueco (se
        // perdería un trozo de pasado) y sin solape (se subiría dos veces).
        let second = plan.nextWindow(after: first?.start)
        XCTAssertEqual(second?.end, first?.start)
        XCTAssertEqual(second?.start, plan.floor)

        // Llegados al suelo, no queda nada.
        XCTAssertNil(plan.nextWindow(after: plan.floor))
    }

    func testPlanClampsTheLastWindowToTheFloor() throws {
        let head = Date(timeIntervalSince1970: 1_000_000_000)
        // Cien días con ventanas de noventa: la segunda sólo puede ser de diez.
        let plan = HealthHistoryImportPlan(
            head: head,
            floor: head.addingTimeInterval(-100 * 86_400),
            windowDays: 90
        )
        let second = try XCTUnwrap(plan.nextWindow(after: plan.nextWindow(after: nil)?.start))
        XCTAssertEqual(second.start, plan.floor)
        XCTAssertEqual(second.duration, 10 * 86_400, accuracy: 1)
    }

    func testPlanProgressGoesFromZeroToOne() {
        let head = Date(timeIntervalSince1970: 1_000_000_000)
        let plan = HealthHistoryImportPlan(
            head: head,
            floor: head.addingTimeInterval(-100 * 86_400),
            windowDays: 50
        )
        XCTAssertEqual(plan.progress(cursor: nil), 0, accuracy: 0.001)
        XCTAssertEqual(plan.progress(cursor: head.addingTimeInterval(-50 * 86_400)), 0.5, accuracy: 0.001)
        XCTAssertEqual(plan.progress(cursor: plan.floor), 1, accuracy: 0.001)
        // Un cursor por debajo del suelo (el techo se acortó entre versiones) no
        // pasa de uno ni reabre trabajo.
        XCTAssertEqual(plan.progress(cursor: plan.floor.addingTimeInterval(-86_400)), 1, accuracy: 0.001)
        XCTAssertNil(plan.nextWindow(after: plan.floor.addingTimeInterval(-86_400)))
    }

    // MARK: - El estado guardado

    func testStateIsKeyedPerAthlete() {
        var mine = HealthHistoryImportState.empty
        mine.consentedAt = Date()
        HealthHistoryImportStore.save(mine, athleteId: "42", defaults: defaults)

        XCTAssertTrue(HealthHistoryImportStore.load(athleteId: "42", defaults: defaults).hasConsent)
        // Otro atleta en el MISMO teléfono no hereda ni el consentimiento ni el
        // cursor: se le tiene que ofrecer su propio import.
        XCTAssertFalse(HealthHistoryImportStore.load(athleteId: "77", defaults: defaults).hasConsent)
    }

    // MARK: - El consentimiento manda

    func testNothingIsReadWithoutConsent() async throws {
        let spy = SpySource()
        let importer = makeImporter(spy)

        importer.resumeIfConsented()
        try await settle(importer)

        XCTAssertTrue(spy.windows.isEmpty, "sin consentimiento no se lee NADA de Salud")
        XCTAssertFalse(importer.state.hasConsent)
        XCTAssertNil(importer.state.head)
    }

    func testConsentAndStartSweepsTheWholeSpanExactlyOnce() async throws {
        let spy = SpySource()
        let importer = makeImporter(spy)

        importer.consentAndStart()
        try await settle(importer)

        XCTAssertTrue(importer.state.hasConsent)
        XCTAssertTrue(importer.state.isComplete)
        XCTAssertEqual(importer.state.cursor, importer.state.floor)
        XCTAssertEqual(importer.progress, 1, accuracy: 0.001)

        // Techo declarado: dos años, ni uno más.
        let head = try XCTUnwrap(importer.state.head)
        let floor = try XCTUnwrap(importer.state.floor)
        XCTAssertEqual(
            head.timeIntervalSince(floor),
            Double(HealthKitHistoryImporter.floorDays) * 86_400,
            accuracy: 1
        )

        // Cobertura completa y sin solapes: la primera ventana acaba en la cabeza, la
        // última empieza en el suelo, y cada una empalma con la anterior.
        XCTAssertEqual(spy.windows.first?.to, head)
        XCTAssertEqual(spy.windows.last?.from, floor)
        for (previous, next) in zip(spy.windows, spy.windows.dropFirst()) {
            XCTAssertEqual(next.to, previous.from)
        }
    }

    func testAFailedWindowLeavesTheCursorWhereItWasAndResumesThere() async throws {
        let spy = SpySource()
        spy.failAtCall(2)   // la tercera ventana se corta
        let importer = makeImporter(spy)

        importer.consentAndStart()
        try await settle(importer)

        XCTAssertFalse(importer.state.isComplete)
        XCTAssertNotNil(importer.lastError)
        XCTAssertEqual(spy.windows.count, 3)
        // El cursor sólo baja con la ventana ENTERA subida: se quedó en la segunda.
        XCTAssertEqual(importer.state.cursor, spy.windows[1].from)

        let failed = spy.windows[2]
        spy.failAtCall(nil)
        importer.resumeIfConsented()
        try await settle(importer)

        // Retoma EXACTAMENTE la que se cortó (el servidor de-duplica lo que ya subió)
        // y termina el resto.
        XCTAssertEqual(spy.windows[3].from, failed.from)
        XCTAssertEqual(spy.windows[3].to, failed.to)
        XCTAssertTrue(importer.state.isComplete)
        XCTAssertNil(importer.lastError)
    }

    func testStoppingLeavesItResumableAndNeverAsksAgain() async throws {
        let spy = SpySource()
        let importer = makeImporter(spy)

        importer.consentAndStart()
        importer.stop()
        try await settle(importer)

        let consentedAt = try XCTUnwrap(importer.state.consentedAt)
        XCTAssertFalse(importer.state.isComplete)

        importer.resumeIfConsented()
        try await settle(importer)

        XCTAssertTrue(importer.state.isComplete)
        // Continuar NO es volver a consentir: la fecha del sí no se toca.
        XCTAssertEqual(importer.state.consentedAt, consentedAt)
    }

    func testReconnectingDoesNotRedoAFinishedImport() async throws {
        let spy = SpySource()
        let importer = makeImporter(spy)

        importer.consentAndStart()
        try await settle(importer)
        let sweptWindows = spy.windows.count
        let consentedAt = try XCTUnwrap(importer.state.consentedAt)

        // Esto es lo que dispara `HealthKitSyncService.connect()` al reconectar, y lo
        // que corre en cada arranque de la app.
        importer.resumeIfConsented()
        importer.resumeIfConsented()
        try await settle(importer)

        XCTAssertEqual(spy.windows.count, sweptWindows, "un import terminado no se rehace")
        XCTAssertEqual(importer.state.consentedAt, consentedAt)
    }

    // MARK: - Los cortes caen a mediodía

    func testWindowBoundariesLandAtNoonSoNoNightIsSplit() throws {
        let calendar = Calendar.current
        let afternoon = try XCTUnwrap(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 10, hour: 19, minute: 32))
        )
        let noon = HealthKitHistoryImporter.noonBoundary(onOrBefore: afternoon)
        XCTAssertEqual(calendar.component(.hour, from: noon), 12)
        XCTAssertEqual(calendar.component(.day, from: noon), 10)

        // Antes del mediodía, el corte es el del día ANTERIOR: nunca por delante del
        // instante que se le pasa.
        let morning = try XCTUnwrap(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 10, hour: 7, minute: 5))
        )
        let previous = HealthKitHistoryImporter.noonBoundary(onOrBefore: morning)
        XCTAssertEqual(calendar.component(.hour, from: previous), 12)
        XCTAssertEqual(calendar.component(.day, from: previous), 9)
        XCTAssertLessThanOrEqual(previous, morning)
    }

    // MARK: - Utillaje

    private func makeImporter(_ source: SpySource) -> HealthKitHistoryImporter {
        HealthKitHistoryImporter(
            source: source,
            athleteId: "1",
            defaults: defaults,
            pauseBetweenWindows: .zero
        )
    }

    /// Espera a que el barrido en curso termine. Falla si se pasa del plazo, para que
    /// un cuelgue salga como fallo y no como test eterno.
    private func settle(
        _ importer: HealthKitHistoryImporter,
        timeout: TimeInterval = 10
    ) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while importer.running, Date() < deadline {
            try await Task.sleep(for: .milliseconds(5))
        }
        XCTAssertFalse(importer.running, "el barrido no terminó dentro del plazo")
    }
}
