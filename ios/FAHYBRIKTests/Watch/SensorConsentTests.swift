import XCTest
@testable import FAHYBRIK

// EL PERMISO DEL MOVIMIENTO DEL RELOJ, SIN RED (DECISIONS 2026-09-25).
//
// Lo que se fija aquí es lo que no puede fallar nunca:
//   • la hoja sale una vez, tras un entreno grabado en la muñeca, y «Ahora no» no
//     vuelve a preguntar;
//   • el «ya contestó» sobrevive a cerrar la app y es de cada atleta;
//   • sin el sí confirmado por el servidor, o con una retirada pendiente, no sale
//     ningún archivo;
//   • la retirada se reintenta hasta que el servidor la confirma, y va antes que un
//     sí nuevo; una respuesta vieja del servidor no cierra un sí que ya no es el suyo.
//
// La máquina es un valor puro (`SensorConsentState`) y el almacén recibe su
// `UserDefaults`, así que todo se prueba sin servidor y con un suite de usar y tirar.

@MainActor
final class SensorConsentTests: XCTestCase {

    private let current = SensorCaptureConsent.currentVersion
    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() {
        super.setUp()
        suiteName = "test.sensor.consent.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    private func state(asked: Bool, granted: String? = nil) -> SensorConsentState {
        var s = SensorConsentState()
        s.asked = asked
        s.grantedVersion = granted
        return s
    }

    // MARK: - Cuándo sale la hoja

    func testShouldAskTruthTable() {
        // Sin muñeca no se pregunta nunca: la hoja dice «el reloj ha grabado».
        XCTAssertFalse(SensorConsentPrompt.shouldAsk(wristRecorded: false, state: state(asked: false)))
        XCTAssertFalse(SensorConsentPrompt.shouldAsk(wristRecorded: false, state: state(asked: true)))
        // Primer entreno de muñeca, sin contestar: sale.
        XCTAssertTrue(SensorConsentPrompt.shouldAsk(wristRecorded: true, state: state(asked: false)))
        // «Ahora no» no vuelve a preguntar.
        XCTAssertFalse(SensorConsentPrompt.shouldAsk(wristRecorded: true, state: state(asked: true)))
        // Ya dijo que sí a este texto.
        XCTAssertFalse(SensorConsentPrompt.shouldAsk(wristRecorded: true, state: state(asked: true, granted: current)))
    }

    func testTouchingTheProfileSwitchCountsAsAnswered() {
        // Quien lo encendió en Perfil antes de su primer entreno de muñeca no ve la hoja.
        var s = SensorConsentState()
        s.markAsked()
        s.grant(version: current)
        XCTAssertFalse(SensorConsentPrompt.shouldAsk(wristRecorded: true, state: s))
    }

    func testShouldAskOnOpenNeedsAWaitingWatchFile() {
        // Primer entreno solo del reloj: su archivo espera en el móvil → sale al abrir.
        XCTAssertTrue(SensorConsentPrompt.shouldAskOnOpen(hasPendingWatchCapture: true, state: state(asked: false)))
        // Sin archivo esperando no hay nada de lo que hablar.
        XCTAssertFalse(SensorConsentPrompt.shouldAskOnOpen(hasPendingWatchCapture: false, state: state(asked: false)))
        // Una vez contestada, no vuelve aunque sigan llegando archivos.
        XCTAssertFalse(SensorConsentPrompt.shouldAskOnOpen(hasPendingWatchCapture: true, state: state(asked: true)))
        XCTAssertFalse(SensorConsentPrompt.shouldAskOnOpen(
            hasPendingWatchCapture: true, state: state(asked: true, granted: current)
        ))
    }

    // MARK: - «Ya contestó», persistido y por atleta

    func testAskedSurvivesReloadAndIsPerAthlete() {
        let mine = SensorConsentStore(athleteId: "42", defaults: defaults)
        XCTAssertFalse(mine.load().asked)

        mine.update { $0.markAsked() }

        // Otra instancia (la app se cerró y se abrió): sigue contestada.
        XCTAssertTrue(SensorConsentStore(athleteId: "42", defaults: defaults).load().asked)
        // Otra cuenta en el mismo teléfono no hereda la respuesta.
        XCTAssertFalse(SensorConsentStore(athleteId: "77", defaults: defaults).load().asked)
    }

    func testAhoraNoMarksAskedAndLeavesItOff() {
        let key = SensorCaptureConsent.store.key
        let before = UserDefaults.standard.data(forKey: key)
        defer {
            if let before {
                UserDefaults.standard.set(before, forKey: key)
            } else {
                UserDefaults.standard.removeObject(forKey: key)
            }
        }
        UserDefaults.standard.removeObject(forKey: key)

        SensorConsentPrompt.answer(.ahoraNo, bearer: nil)

        XCTAssertTrue(SensorCaptureConsent.hasBeenAsked)
        XCTAssertFalse(SensorCaptureConsent.isGranted)
        XCTAssertFalse(SensorCaptureConsent.pendingGrant)
        XCTAssertFalse(SensorCaptureConsent.pendingWithdrawal)
        XCTAssertFalse(SensorConsentPrompt.shouldAsk(wristRecorded: true))
        XCTAssertTrue(SensorCaptureConsent.state.hasDeclined, "dijo que no: lo que llegue del reloj no se guarda")
    }

    /// Sin contestar, lo del reloj se guarda (la hoja saldrá al abrir); tras un no, o
    /// con el interruptor apagado, ya no; con el sí, tampoco es «no».
    func testHasDeclinedOnlyAfterAnAnsweredNo() {
        var state = SensorConsentState()
        XCTAssertFalse(state.hasDeclined, "sin contestar no es un no")
        state.markAsked()
        XCTAssertTrue(state.hasDeclined, "«Ahora no»")
        state.grant(version: current)
        XCTAssertFalse(state.hasDeclined)
        state.withdraw()
        XCTAssertTrue(state.hasDeclined, "interruptor apagado")
    }

    func testDecodingToleratesMissingFields() throws {
        // Un estado guardado por una versión con menos campos no se pierde.
        let data = Data(#"{"asked":true}"#.utf8)
        let decoded = try JSONDecoder().decode(SensorConsentState.self, from: data)
        XCTAssertTrue(decoded.asked)
        XCTAssertNil(decoded.grantedVersion)
        XCTAssertFalse(decoded.pendingGrant)
        XCTAssertFalse(decoded.pendingWithdrawal)
        XCTAssertEqual(decoded.revision, 0)
    }

    // MARK: - La máquina: sí, retirada y lo que falta por mandar

    func testGrantWaitsForTheServerBeforeAnythingUploads() {
        var s = SensorConsentState()
        s.grant(version: current)

        XCTAssertTrue(s.isGranted(current: current))
        XCTAssertTrue(s.pendingGrant)
        XCTAssertFalse(s.canUpload(current: current), "el servidor rechaza sin la versión en su fila")
        XCTAssertEqual(s.nextCall(current: current), .grant(version: current))

        s.confirm(.grant(version: current), revision: s.revision)

        XCTAssertFalse(s.pendingGrant)
        XCTAssertTrue(s.canUpload(current: current))
        XCTAssertNil(s.nextCall(current: current))
    }

    func testGrantTwiceIsOneDecision() {
        var s = SensorConsentState()
        s.grant(version: current)
        let revision = s.revision
        s.grant(version: current)
        XCTAssertEqual(s.revision, revision)
    }

    func testWithdrawalIsPendingUntilTheServerConfirmsIt() {
        var s = SensorConsentState()
        s.grant(version: current)
        s.confirm(.grant(version: current), revision: s.revision)

        s.withdraw()

        XCTAssertNil(s.grantedVersion)
        XCTAssertFalse(s.pendingGrant)
        XCTAssertTrue(s.pendingWithdrawal)
        XCTAssertFalse(s.canUpload(current: current))
        XCTAssertEqual(s.nextCall(current: current), .withdraw)

        // Sin cobertura no se confirma nada: la retirada sigue ahí para el reintento.
        XCTAssertEqual(s.nextCall(current: current), .withdraw)

        s.confirm(.withdraw, revision: s.revision)

        XCTAssertFalse(s.pendingWithdrawal)
        XCTAssertNil(s.nextCall(current: current))
        XCTAssertFalse(s.canUpload(current: current))
    }

    func testWithdrawThenGrantOfflineSendsTheDeletionFirst() {
        var s = SensorConsentState()
        s.grant(version: current)
        s.confirm(.grant(version: current), revision: s.revision)
        s.withdraw()
        s.grant(version: current)

        XCTAssertTrue(s.pendingWithdrawal)
        XCTAssertTrue(s.pendingGrant)
        XCTAssertFalse(s.canUpload(current: current))
        // Primero se cumple el borrado que pidió; después, el sí nuevo.
        XCTAssertEqual(s.nextCall(current: current), .withdraw)

        s.confirm(.withdraw, revision: s.revision)
        XCTAssertEqual(s.nextCall(current: current), .grant(version: current))

        s.confirm(.grant(version: current), revision: s.revision)
        XCTAssertNil(s.nextCall(current: current))
        XCTAssertTrue(s.canUpload(current: current))
    }

    func testAStaleGrantAnswerDoesNotCloseANewerGrant() {
        var s = SensorConsentState()
        s.grant(version: current)
        let sentAt = s.revision   // el PUT sale…

        s.withdraw()              // …el atleta apaga…
        s.grant(version: current) // …y vuelve a encender, todo con el PUT en el aire.

        s.confirm(.grant(version: current), revision: sentAt)

        // El 2xx de aquel PUT no vale: detrás va el DELETE del apagado, y después
        // hace falta otro PUT.
        XCTAssertTrue(s.pendingGrant)
        XCTAssertTrue(s.pendingWithdrawal)
        XCTAssertEqual(s.nextCall(current: current), .withdraw)
    }

    func testAGrantToAnOldTextIsNeverSent() {
        var s = SensorConsentState()
        s.grant(version: "2026-08-06.v1")
        XCTAssertNil(s.nextCall(current: current))
        XCTAssertFalse(s.isGranted(current: current))
        XCTAssertFalse(s.canUpload(current: current))
    }
}
