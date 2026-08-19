import XCTest
@testable import FAHYBRIK

// LA TABLA de FixedLiveView.swift, verificada sin reloj ni sesión viva —
// card 67: "el timer del reloj corre el total, no el tramo" para un For Time /
// HYROX sim recorrido POR ESTACIONES. `GuionEstaciones` es la implementación
// pura de la fila "por estaciones" de esa tabla; estos tests cubren sus DOS
// ramas (caja de reloj vs. sin caja) y el resto de la página (contexto,
// segundo nivel, gesto).
final class GuionEstacionesTests: XCTestCase {

    private func estado(
        etiqueta: String = "Remo",
        dosis: String? = "500 m",
        cajaSegundos: Int? = nil,
        cajaRestanteSegundos: Double? = nil,
        enEstacionSegundos: Double = 0,
        bloqueSegundos: Double = 0,
        posicion: Int = 1,
        total: Int = 1
    ) -> GuionEstaciones.Estado {
        GuionEstaciones.Estado(
            etiqueta: etiqueta, dosis: dosis, cajaSegundos: cajaSegundos,
            cajaRestanteSegundos: cajaRestanteSegundos,
            enEstacionSegundos: enEstacionSegundos, bloqueSegundos: bloqueSegundos,
            posicion: posicion, total: total
        )
    }

    // MARK: - Caja de reloj ("2 min de bici") → cuenta ATRÁS

    /// EL FALLO DE LA CARD: antes el reloj nunca sabía cuánto quedaba de una
    /// estación medida por tiempo. Ahora el sujeto es la caja, no el total.
    func testEstacionConCajaCuentaAtrasLoQueQuedaDeLaCaja() {
        let e = estado(cajaSegundos: 120, cajaRestanteSegundos: 45, bloqueSegundos: 600)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.sujeto, ":45", "cuenta atrás de la caja, no el crono del bloque")
    }

    func testCajaBajoElUmbralPintaColorUrgente() {
        let e = estado(cajaSegundos: 120, cajaRestanteSegundos: 2.5)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.tono, WatchTinte.urgente(2.5))
        XCTAssertEqual(p.tono, WatchTheme.orange)
    }

    func testCajaPorEncimaDelUmbralNoEsUrgente() {
        let e = estado(cajaSegundos: 120, cajaRestanteSegundos: 45)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.tono, WatchTheme.ink)
    }

    /// Durante el descanso entre estaciones el motor apaga
    /// `tramoWorkRemaining` (nil) a propósito — la caja de la estación
    /// SIGUIENTE aún no ha empezado a correr. El guion no puede pintar un 0
    /// (§7): cae al tamaño íntegro de la caja, la única verdad que tiene.
    func testSinRestanteVivoCaeAlTamanoIntegroDeLaCajaNuncaUnCero() {
        let e = estado(cajaSegundos: 120, cajaRestanteSegundos: nil)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.sujeto, "02:00")
        XCTAssertNotEqual(p.sujeto, ":00", "ningún cero falso mientras la caja no ha empezado")
    }

    /// `cajaSegundos == 0` no es una caja real (el dominio nunca la declara
    /// así), y el guion no la trata como si lo fuera.
    func testCajaCeroSeTrataComoSinCaja() {
        let e = estado(cajaSegundos: 0, enEstacionSegundos: 12, bloqueSegundos: 300)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.sujeto, "00:12", "0 no es una caja — cae a la rama sin caja")
    }

    // MARK: - Sin caja (metros / calorías / reps) → cuenta ARRIBA su propio parcial

    /// Sin caja no hay nada que contar hacia atrás sin mentir un final que el
    /// coach no escribió: el sujeto es el parcial propio de la estación,
    /// «llevas X en esta estación», igual que el doble.
    func testEstacionSinCajaCuentaArribaSuPropioParcial() {
        let e = estado(cajaSegundos: nil, enEstacionSegundos: 125.6, bloqueSegundos: 900)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.sujeto, "02:06")
        XCTAssertEqual(p.tono, WatchTheme.ink, "sin caja no hay deadline, nunca es urgente")
    }

    // MARK: - El total NUNCA se va de pantalla — baja al segundo nivel

    func testElTotalDelBloqueVaAlSegundoNivelConLaPosicion() {
        let e = estado(cajaSegundos: 120, cajaRestanteSegundos: 45,
                       bloqueSegundos: 254, posicion: 3, total: 8)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.segundoEtiqueta, "Total")
        XCTAssertEqual(p.segundoValor, "04:14 · 3 / 8")
    }

    // MARK: - Contexto: movimiento + dosis, o solo el movimiento

    func testContextoCombinaMovimientoYDosisCuandoHayDosis() {
        let e = estado(etiqueta: "Remo", dosis: "500 m")
        XCTAssertEqual(GuionEstaciones.pagina(e).contexto, "Remo · 500 m")
    }

    /// Sin dosis (un movimiento sin medida declarada, p. ej. "Wall Balls" sin
    /// reps escritas) no se inventa una raya — sólo el nombre.
    func testContextoEsSoloElMovimientoSinDosis() {
        let e = estado(etiqueta: "Wall Balls", dosis: nil)
        XCTAssertEqual(GuionEstaciones.pagina(e).contexto, "Wall Balls")
    }

    // MARK: - El gesto: la pantalla ES el botón, y siempre está mando

    func testModoEsSiempreMandoYElTapDisparaElGesto() {
        var tocado = false
        let e = estado()
        let p = GuionEstaciones.pagina(e, onEstacionHecha: { tocado = true })
        XCTAssertEqual(p.modo, .mando)
        XCTAssertEqual(p.accion, "Toca · estación hecha")
        p.onToca?()
        XCTAssertTrue(tocado)
    }
}
