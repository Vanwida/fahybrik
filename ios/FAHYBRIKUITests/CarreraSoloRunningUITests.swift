import XCTest

// LA PRUEBA QUE NINGÚN RENDER PUEDE DAR: la app DE VERDAD, navegada como la
// navega el atleta, con el contenedor y sus pastillas vivos.
//
// POR QUÉ EXISTE. El 13-ago Alex cazó, con la app en la mano, el sueño pintado
// bajo la pastilla Carrera. El volcado por ImageRenderer no podía verlo: rendea
// pantallas AISLADAS, y el fallo vivía en el contenedor. Se intentó renderizar el
// contenedor sembrado y salió en blanco — necesita ciclo de vida. Esto es esa
// verificación, hecha por el único camino que la puede dar.
//
// QUÉ AFIRMA (la regla firmada ese día): las pastillas mandan. Todo lo que se
// pinta bajo el rail se lee como contenido de la pestaña elegida, así que:
//   · bajo CARRERA no aparece NI UNA lectura del cuerpo (sueño, variabilidad,
//     estrés, batería corporal);
//   · bajo RECUP. el cuerpo SÍ está — la misma consulta que prueba la ausencia
//     prueba que no es porque el dato no exista.
//
// ENTRA POR EL ATLETA DEMO, que es el asiento pensado exactamente para esto
// (gated por DEMO_ACCESS en el servidor). Necesita red; si el asiento no
// responde, el test FALLA con su motivo — no finge en verde.
//
// ⚠ APARCADO (13-ago): el asiento demo está APAGADO en producción — comprobado,
// `POST /api/demo/athlete-bearer` devuelve 404 — así que este test hoy NO puede
// pasar. Por eso el target está FUERA del test action del esquema: se corre solo
// a mano con `-only-testing:FAHYBRIKUITests`. Para activarlo hace falta una de
// dos: encender DEMO_ACCESS en prod, o darle a `APIClient` un override de base
// por variable de entorno de lanzamiento (solo DEBUG) y apuntarlo a un servidor
// local con el demo encendido. La segunda es la buena: no toca producción.
//
// Y DEJA FOTOS: cada paso adjunta una captura al xcresult, extraíble con
// `xcrun xcresulttool`. La próxima vez que alguien pregunte «¿cómo se ve la
// pestaña?», la respuesta está en el último run, no en la fe de nadie.
final class CarreraSoloRunningUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testBajoCarreraNoHayCuerpoYBajoRecupSi() throws {
        let app = XCUIApplication()
        // SIEMBRA POR ENTORNO — el bearer de un atleta real (67) llega por
        // `UITEST_BEARER`, así que la app abre autenticada sin depender del
        // asiento demo (apagado en prod). El arnés lo pasa quien lo lanza:
        //   UITEST_BEARER=… xcodebuild test -only-testing:FAHYBRIKUITests
        // Sin bearer, el test se salta con su motivo — no finge en verde.
        guard let bearer = ProcessInfo.processInfo.environment["UITEST_BEARER"],
              !bearer.isEmpty else {
            throw XCTSkip("Sin UITEST_BEARER: se corre a mano con un bearer sembrado")
        }
        app.launchEnvironment["UITEST_BEARER"] = bearer
        app.launchEnvironment["UITEST_ATHLETE"] =
            ProcessInfo.processInfo.environment["UITEST_ATHLETE"] ?? "67"
        app.launch()

        // Descartar el permiso de notificaciones si aparece (onboarding day-1).
        addUIInterruptionMonitor(withDescription: "permiso") { alerta in
            let no = alerta.buttons["Don't Allow"]
            if no.exists { no.tap(); return true }
            return false
        }
        app.tap()

        // Saltar el onboarding day-1 si sale su botón.
        let empezar = app.buttons["EMPEZAR"].firstMatch
        if empezar.waitForExistence(timeout: 4) { empezar.tap() }

        // La barra de pestañas es la señal de que hay sesión y la app cargó.
        let tabAnaliticas = app.tabBars.buttons["Analíticas"]
        XCTAssertTrue(tabAnaliticas.waitForExistence(timeout: 20),
                      "No llegó la barra de pestañas: el asiento demo no respondió")
        tabAnaliticas.tap()

        foto(app, "analiticas-al-entrar")
        // ── CARRERA: ni una lectura del cuerpo ──────────────────────────────
        // El rail puede ser botones o segmentos; probamos ambos.
        let pastillaCarrera = app.buttons["Carrera"].firstMatch.waitForExistence(timeout: 10)
            ? app.buttons["Carrera"].firstMatch
            : app.staticTexts["Carrera"].firstMatch
        XCTAssertTrue(pastillaCarrera.waitForExistence(timeout: 10), "No está el rail de secciones")
        pastillaCarrera.tap()
        // Dar tiempo a que la sección cargue lo suyo antes de afirmar ausencias.
        _ = app.staticTexts["CÓMO LLEGAS HOY"].waitForExistence(timeout: 4)

        foto(app, "pestana-carrera")

        for delCuerpo in ["Sueño", "Variabilidad", "Estrés", "Batería corporal", "CÓMO LLEGAS HOY"] {
            XCTAssertFalse(app.staticTexts[delCuerpo].firstMatch.exists,
                           "«\(delCuerpo)» aparece bajo la pastilla Carrera — la regla de las pastillas está rota")
        }

        // ── LA PUERTA A LOS DÍAS: la cifra abre sus sesiones ────────────────
        // «Ver los entrenos» baja del agregado a la lista real. Sin esto la
        // pestaña era un mirador y ver un día era volver a Garmin.
        let puerta = app.buttons["Ver los entrenos"].firstMatch
        if puerta.exists {
            puerta.tap()
            // La hoja de sesiones: basta con que aparezca contenido nuevo.
            _ = app.otherElements.firstMatch.waitForExistence(timeout: 6)
            sleep(2)
            foto(app, "drill-sesiones")
            app.swipeDown(velocity: .fast)   // cerrar la hoja
            sleep(1)
        }

        // ── RECUP.: el cuerpo SÍ está ───────────────────────────────────────
        // La misma consulta que arriba dio ausencia aquí tiene que dar presencia:
        // sin esta mitad, lo de arriba podría pasar simplemente porque el atleta
        // demo no tuviera dato del cuerpo.
        let pastillaRecup = app.buttons["Recup."].firstMatch
        XCTAssertTrue(pastillaRecup.exists, "No está la pastilla Recup.")
        pastillaRecup.tap()

        let cuerpoVisible = app.staticTexts["CÓMO LLEGAS HOY"].waitForExistence(timeout: 10)
            || app.staticTexts["Variabilidad"].firstMatch.waitForExistence(timeout: 4)
        foto(app, "pestana-recup")
        XCTAssertTrue(cuerpoVisible,
                      "Bajo Recup. no aparece el cuerpo: o el gate se pasó de frenada o el demo no trae biometría")
    }

    /// Una captura con nombre: al xcresult Y a un fichero en /tmp del host, que
    /// es de donde se extrae sin pelear con el formato del bundle.
    private func foto(_ app: XCUIApplication, _ nombre: String) {
        let img = app.screenshot()
        let adjunto = XCTAttachment(screenshot: img)
        adjunto.name = nombre
        adjunto.lifetime = .keepAlways
        add(adjunto)
        // El proceso de UI test corre en el HOST del simulador, así que puede
        // escribir en el /tmp compartido — no está en el sandbox de la app.
        let dir = "/tmp/fahybrid-uishots"
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        try? img.pngRepresentation.write(to: URL(fileURLWithPath: "\(dir)/\(nombre).png"))
    }
}
