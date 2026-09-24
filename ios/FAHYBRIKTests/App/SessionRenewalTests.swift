import XCTest
@testable import FAHYBRIK

/// «Los atletas siguen dentro» (fase 1; auditoría E2/E3): un 401 de un token que ya
/// no es el vigente no cierra la sesión de hoy (era el bucle de salidas), y renovar
/// el token no vacía la caché del almacén como si entrara otra persona.
@MainActor
final class SessionRenewalTests: XCTestCase {

    func testUn401DeUnTokenViejoNoCierraLaSesionVigente() {
        let auth = AuthState()
        auth.stage = .authenticated
        auth.bearer = "token-nuevo"

        auth.handleUnauthorized(usedToken: "token-viejo")
        XCTAssertEqual(auth.stage, .authenticated)
        XCTAssertEqual(auth.bearer, "token-nuevo")
    }

    func testUn401DelTokenVigenteSiCierra() {
        let auth = AuthState()
        auth.stage = .authenticated
        auth.bearer = "token-vigente"

        auth.handleUnauthorized(usedToken: "token-vigente")
        XCTAssertEqual(auth.stage, .unauthenticated)
        XCTAssertNil(auth.bearer)
    }

    func testSinTokenConocidoSigueCerrandoComoAntes() {
        let auth = AuthState()
        auth.stage = .authenticated
        auth.bearer = "token"
        auth.handleUnauthorized()
        XCTAssertEqual(auth.stage, .unauthenticated)
    }

    func testRenovarNoVaciaLaCacheDelAlmacen() {
        let store = AppDataStore()
        store.activate(bearer: "token-a")
        store.rotate(to: "token-b")
        XCTAssertEqual(store.bearer, "token-b")
        // La foto en disco cuelga ya del token nuevo: el `activate` que dispara el
        // cambio de token la reconoce como suya y no la borra.
        XCTAssertEqual(AppDataPersistence.load()?.fingerprint, AppDataPersistence.fingerprint(of: "token-b"))
        store.activate(bearer: "token-b")
        XCTAssertEqual(AppDataPersistence.load()?.fingerprint, AppDataPersistence.fingerprint(of: "token-b"))
        AppDataPersistence.clear()
    }

    func testRotarSinSesionNoInventaUna() {
        let store = AppDataStore()
        store.rotate(to: "token")
        XCTAssertNil(store.bearer)
    }
}
