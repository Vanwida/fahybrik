import XCTest
@testable import FAHYBRIK

// LA MUÑECA NO ESPERA AL TELÉFONO PARA TENER PANTALLA.
//
// Clase 1 del debugger del 29-ago: el reloj arrancó, su `HKWorkoutSession` estaba
// grabando, y la pantalla decía «CONECTANDO…» y «El entreno se controla desde el
// iPhone» con un spinner. Ni páginas del vivo, ni pausa, ni fin — porque todo eso
// colgaba de que llegara una trama.
//
// Estos tests clavan que sin trama HAY pantalla, y que es la MISMA de 105 (no una
// segunda cara), rellena con lo que mide la muñeca.
final class GuionDeLaMunecaTests: XCTestCase {

    private func corriendo(segundos: Double = 112, metros: Double? = 307) -> GuionDeLaMuneca.Estado {
        GuionDeLaMuneca.Estado(esCorrer: true, segundos: segundos, metros: metros, bpm: 141, zona: .z2)
    }

    // MARK: - Hay pantalla, y es la de 105

    func testCorrerSolaSonLasMismasTresPaginas() {
        let p = GuionDeLaMuneca.paginas(corriendo(), .init())
        XCTAssertEqual(p.map(\.id),
                       [GuionCorrer.idDatos, GuionCorrer.idVivo, GuionCorrer.idControles],
                       "sin trama se pinta la interfaz de 105, no una segunda cara")
    }

    /// PAUSAR Y TERMINAR EXISTEN DESDE EL PRIMER SEGUNDO. Son los dos que actúan sobre
    /// la sesión que la muñeca OWNS.
    func testPausarYTerminarExistenSinTelefono() throws {
        let controles = try XCTUnwrap(GuionDeLaMuneca.controles(corriendo(), .init()).botones)
        XCTAssertEqual(controles.map(\.id), ["pausa", "terminar"])
        XCTAssertEqual(controles[0].titulo, "Pausar")
        XCTAssertEqual(controles[1].peso, .destructiva)
        XCTAssertNotNil(controles[1].confirma, "terminar pregunta, aquí también")
    }

    func testEnPausaElPrincipalDiceReanudar() throws {
        var e = corriendo()
        e.enPausa = true
        let controles = try XCTUnwrap(GuionDeLaMuneca.controles(e, .init()).botones)
        XCTAssertEqual(controles[0].titulo, "Reanudar")
    }

    /// «NUEVO TRAMO» NO SE OFRECE, y no es un olvido: el parcial lo sella el motor del
    /// teléfono, así que sin él el botón se iría al vacío.
    func testNoSeOfreceCortarTramoSinMotorDetras() throws {
        let p = GuionDeLaMuneca.paginas(corriendo(), .init())
        let controles = try XCTUnwrap(p.last?.botones)
        XCTAssertFalse(controles.contains { $0.id == "nuevoTramo" })
        XCTAssertFalse(GuionDeLaMuneca.comoCorrer(corriendo()).puedeCortarTramo)
    }

    // MARK: - Lo que pinta es lo que MIDIÓ, y nada más

    /// La pieza va ABIERTA porque es la verdad: nadie le ha dicho a la muñeca qué
    /// tramo es éste. Así que el sujeto es el reloj y la banda dice «llevas» — no se
    /// inventa un objetivo ni «lo que falta» de algo que no se conoce.
    func testSinTramaLaPiezaEstaAbiertaYElSujetoEsElReloj() {
        let e = GuionDeLaMuneca.comoCorrer(corriendo(segundos: 112))
        XCTAssertEqual(e.pieza, .abierta)
        let vivo = GuionCorrer.vivo(e, .init())
        XCTAssertEqual(vivo.sujeto, "01:52")
        XCTAssertTrue(vivo.contexto.hasSuffix("llevas"), vivo.contexto)
        XCTAssertNil(vivo.unidad)
    }

    /// Los metros y el ritmo salen del builder de Apple, y el ritmo por la MISMA
    /// derivación del motor. 307 m en 1:52 son 6:05 /km.
    func testLosMetrosYElRitmoSalenDeLoQueMidioApple() throws {
        let filas = try XCTUnwrap(GuionCorrer.datos(GuionDeLaMuneca.comoCorrer(corriendo())).filas)
        XCTAssertEqual(filas.map(\.id), ["tiempo", "distancia", "ritmo", "pulso"])
        XCTAssertEqual(filas[0].valor, "01:52")
        XCTAssertEqual(filas[1].valor, "307")
        XCTAssertEqual(filas[1].unidad, "m")
        XCTAssertEqual(filas[2].valor, WatchFormat.pace(365), "112 s / 0,307 km")
    }

    /// SIN UN METRO CONTADO no hay fila de distancia ni de ritmo: un cero se lee como
    /// una medida y no lo es.
    func testSinMetrosContadosNoSeInventanNiDistanciaNiRitmo() throws {
        let e = GuionDeLaMuneca.comoCorrer(corriendo(metros: 0))
        XCTAssertNil(e.sesionMetros)
        XCTAssertNil(e.sesionRitmoSecPorKm)
        let filas = try XCTUnwrap(GuionCorrer.datos(e).filas)
        XCTAssertEqual(filas.map(\.id), ["tiempo", "pulso"])
    }

    // MARK: - Lo que no es correr

    /// Fuerza / ergo: el reloj mide pulso y tiempo y nada más. Se enseña eso con sus
    /// controles, no un spinner.
    func testSinCorrerSeEnseñaTiempoYPulsoConSusControles() {
        var e = corriendo()
        e.esCorrer = false
        let p = GuionDeLaMuneca.paginas(e, .init())
        XCTAssertEqual(p.map(\.id), ["tiempo", "pulso", GuionCorrer.idControles])
        XCTAssertNotNil(p.last?.botones)
    }

    /// Y sin pulso todavía, la página de tiempo se queda sola con sus controles: la
    /// del pulso no se pinta hasta que hay una pulsación.
    func testSinPulsoLaPaginaDelPulsoNoSePinta() {
        var e = corriendo()
        e.esCorrer = false
        e.bpm = nil
        let p = GuionDeLaMuneca.paginas(e, .init())
        XCTAssertEqual(p.map(\.id), ["tiempo", GuionCorrer.idControles])
    }
}
