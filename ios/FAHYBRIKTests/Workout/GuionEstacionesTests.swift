import XCTest
@testable import FAHYBRIK

// LA TABLA de FixedLiveView.swift, verificada sin reloj ni sesión viva —
// card 67 (18-ago): "el timer del reloj corre el total, no el tramo" para un
// For Time / HYROX sim recorrido POR ESTACIONES. `GuionEstaciones` es la
// implementación pura de la fila "por estaciones" de esa tabla; estos tests
// cubren sus TRES cierres (caja / objetivo medible / nada mide) y el resto de
// la página (contexto, segundo nivel, gesto).
//
// 19-ago — se añade el cierre por OBJETIVO (metros / calorías): la sesión de
// mañana corre un Run 1.000 m dentro de una ruta mixta (Run · SkiErg · Run ·
// Burpees · Run · Row · Run · Wall Balls) y antes de este cambio esa
// estación caía en "nada mide" — ni metros ni ritmo en la muñeca.
final class GuionEstacionesTests: XCTestCase {

    private func estado(
        etiqueta: String = "Remo",
        dosis: String? = "500 m",
        cierre: GuionEstaciones.Cierre = .atleta,
        esCarrera: Bool = false,
        ritmoSecPorKm: Int? = nil,
        cajaRestanteSegundos: Double? = nil,
        enEstacionSegundos: Double = 0,
        bloqueSegundos: Double = 0,
        posicion: Int = 1,
        total: Int = 1
    ) -> GuionEstaciones.Estado {
        GuionEstaciones.Estado(
            etiqueta: etiqueta, dosis: dosis, cierre: cierre,
            esCarrera: esCarrera, ritmoSecPorKm: ritmoSecPorKm,
            cajaRestanteSegundos: cajaRestanteSegundos,
            enEstacionSegundos: enEstacionSegundos, bloqueSegundos: bloqueSegundos,
            posicion: posicion, total: total
        )
    }

    // MARK: - Caja de reloj ("2 min de bici") → cuenta ATRÁS

    /// EL FALLO DE LA CARD: antes el reloj nunca sabía cuánto quedaba de una
    /// estación medida por tiempo. Ahora el sujeto es la caja, no el total.
    func testEstacionConCajaCuentaAtrasLoQueQuedaDeLaCaja() {
        let e = estado(cierre: .caja(segundos: 120), cajaRestanteSegundos: 45, bloqueSegundos: 600)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.sujeto, ":45", "cuenta atrás de la caja, no el crono del bloque")
    }

    func testCajaBajoElUmbralPintaColorUrgente() {
        let e = estado(cierre: .caja(segundos: 120), cajaRestanteSegundos: 2.5)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.tono, WatchTinte.urgente(2.5))
        XCTAssertEqual(p.tono, WatchTheme.orange)
    }

    func testCajaPorEncimaDelUmbralNoEsUrgente() {
        let e = estado(cierre: .caja(segundos: 120), cajaRestanteSegundos: 45)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.tono, WatchTheme.ink)
    }

    /// Durante el descanso entre estaciones el motor apaga
    /// `tramoWorkRemaining` (nil) a propósito — la caja de la estación
    /// SIGUIENTE aún no ha empezado a correr. El guion no puede pintar un 0
    /// (§7): cae al tamaño íntegro de la caja, la única verdad que tiene.
    func testSinRestanteVivoCaeAlTamanoIntegroDeLaCajaNuncaUnCero() {
        let e = estado(cierre: .caja(segundos: 120), cajaRestanteSegundos: nil)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.sujeto, "02:00")
        XCTAssertNotEqual(p.sujeto, ":00", "ningún cero falso mientras la caja no ha empezado")
    }

    /// `cajaSegundos == 0` no es una caja real (el dominio nunca la declara
    /// así), y el guion no la trata como si lo fuera.
    func testCajaCeroSeTrataComoNadaMide() {
        let e = estado(cierre: .caja(segundos: 0), enEstacionSegundos: 12, bloqueSegundos: 300)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.sujeto, "00:12", "0 no es una caja — cae al parcial propio")
    }

    // MARK: - Objetivo medible (metros / calorías) → cuenta ATRÁS lo que FALTA

    /// EL CASO DE MAÑANA: un Run de 1.000 m dentro de una ruta mixta. Antes
    /// caía en "nada mide" (crono arriba); ahora el sujeto son los metros que
    /// faltan, igual que una serie de calle suelta (`GuionSeries`).
    func testEstacionDeCarreraConObjetivoCuentaAtrasLosMetrosQueFaltan() {
        let e = estado(etiqueta: "Run", cierre: .metros(objetivo: 1_000, cubiertos: 340), esCarrera: true)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.sujeto, "660")
        XCTAssertEqual(p.unidad, "m")
    }

    /// Sin GPS todavía no hay resta que hacer: se enseña el objetivo entero,
    /// nunca un hueco ni un cero — es lo que falta, literalmente.
    func testSinCubiertosTodaviaEnsenaElObjetivoEntero() {
        let e = estado(cierre: .metros(objetivo: 1_000, cubiertos: nil), esCarrera: true)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.sujeto, "1000")
    }

    /// Lo que falta se redondea hacia ARRIBA: no se da por acabada la
    /// estación antes de tiempo (mismo criterio que `GuionSeries`).
    func testLoQueFaltaSeRedondeaHaciaArriba() {
        let e = estado(cierre: .metros(objetivo: 1_000, cubiertos: 999.2), esCarrera: true)
        XCTAssertEqual(GuionEstaciones.pagina(e).sujeto, "1")
    }

    /// Si el GPS reporta de más (overshoot al cruzar la línea) no se pinta un
    /// negativo — se corta en cero, como cualquier cuenta atrás.
    func testCubiertosPorEncimaDelObjetivoNoBajaDeCero() {
        let e = estado(cierre: .metros(objetivo: 1_000, cubiertos: 1_050), esCarrera: true)
        XCTAssertEqual(GuionEstaciones.pagina(e).sujeto, "0")
    }

    /// Ergómetro (remo / ski) con objetivo de metros — mismo criterio que
    /// carrera, distinta fuente de "cuánto llevo ya" (la elige quien llama).
    func testErgometroConObjetivoDeMetrosCuentaAtrasIgualQueCarrera() {
        let e = estado(etiqueta: "SkiErg", cierre: .metros(objetivo: 500, cubiertos: 120), esCarrera: false)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.sujeto, "380")
        XCTAssertEqual(p.unidad, "m")
    }

    func testEstacionConObjetivoDeCaloriasCuentaAtrasLoQueFalta() {
        let e = estado(etiqueta: "Row", cierre: .calorias(objetivo: 15, cubiertas: 6))
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.sujeto, "9")
        XCTAssertEqual(p.unidad, "cal")
    }

    func testCaloriasSinCubiertasTodaviaEnsenaElObjetivoEntero() {
        let e = estado(cierre: .calorias(objetivo: 15, cubiertas: nil))
        XCTAssertEqual(GuionEstaciones.pagina(e).sujeto, "15")
    }

    // MARK: - Nada mide el cierre (reps, o sin objetivo) → cuenta ARRIBA su propio parcial

    /// Sin nada que mida el cierre no hay nada que contar hacia atrás sin
    /// mentir un final que el coach no escribió: el sujeto es el parcial
    /// propio de la estación, «llevas X en esta estación», igual que el doble.
    func testEstacionSinNadaQueMidaCuentaArribaSuPropioParcial() {
        let e = estado(cierre: .atleta, enEstacionSegundos: 125.6, bloqueSegundos: 900)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.sujeto, "02:06")
        XCTAssertNil(p.unidad)
        XCTAssertEqual(p.tono, WatchTheme.ink, "sin caja no hay deadline, nunca es urgente")
    }

    // MARK: - El segundo nivel: ritmo (carrera) vs. total del bloque (todo lo demás)

    /// La CARRERA con objetivo lleva el RITMO de segundo nivel, no el total —
    /// el sujeto ya se llevó el hueco de la puntuación.
    func testCarreraConRitmoMedidoLlevaElRitmoDeSegundoNivel() {
        let e = estado(cierre: .metros(objetivo: 1_000, cubiertos: 340),
                       esCarrera: true, ritmoSecPorKm: 278)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.segundoEtiqueta, "GPS")
        XCTAssertEqual(p.segundoValor, "4:38/km")
    }

    /// Sin ritmo medido todavía (GPS sin fijar) no se pinta una etiqueta
    /// vacía ni se inventa el total del bloque — se calla.
    func testCarreraSinRitmoTodaviaSeCallaElSegundoNivel() {
        let e = estado(cierre: .metros(objetivo: 1_000, cubiertos: nil), esCarrera: true, ritmoSecPorKm: nil)
        let p = GuionEstaciones.pagina(e)
        XCTAssertNil(p.segundoEtiqueta)
        XCTAssertNil(p.segundoValor)
    }

    /// El ERGÓMETRO con objetivo de metros no tiene ritmo/km: se queda con el
    /// total del bloque + posición, igual que las estaciones que no miden nada.
    func testErgometroConObjetivoMantieneElTotalDeSegundoNivel() {
        let e = estado(cierre: .metros(objetivo: 500, cubiertos: 120), esCarrera: false,
                       bloqueSegundos: 254, posicion: 3, total: 8)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.segundoEtiqueta, "Total")
        XCTAssertEqual(p.segundoValor, "04:14 · 3 / 8")
    }

    /// Calorías nunca lleva ritmo, aunque `esCarrera` viniera mal puesto —
    /// sólo `.metros` habilita la rama de ritmo.
    func testCaloriasSiempreMantieneElTotalAunqueEsCarreraSeaTrue() {
        let e = estado(cierre: .calorias(objetivo: 15, cubiertas: 6), esCarrera: true,
                       ritmoSecPorKm: 278, bloqueSegundos: 100, posicion: 1, total: 4)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.segundoEtiqueta, "Total")
    }

    func testElTotalDelBloqueVaAlSegundoNivelConLaPosicion() {
        let e = estado(cierre: .caja(segundos: 120), cajaRestanteSegundos: 45,
                       bloqueSegundos: 254, posicion: 3, total: 8)
        let p = GuionEstaciones.pagina(e)
        XCTAssertEqual(p.segundoEtiqueta, "Total")
        XCTAssertEqual(p.segundoValor, "04:14 · 3 / 8")
    }

    // MARK: - Contexto: movimiento + dosis, o "te faltan" con objetivo

    func testContextoCombinaMovimientoYDosisSinObjetivoMedible() {
        let e = estado(etiqueta: "Remo", dosis: "500 m", cierre: .atleta)
        XCTAssertEqual(GuionEstaciones.pagina(e).contexto, "Remo · 500 m")
    }

    /// Sin dosis (un movimiento sin medida declarada) no se inventa una raya
    /// — sólo el nombre.
    func testContextoEsSoloElMovimientoSinDosis() {
        let e = estado(etiqueta: "Wall Balls", dosis: nil, cierre: .atleta)
        XCTAssertEqual(GuionEstaciones.pagina(e).contexto, "Wall Balls")
    }

    /// Con objetivo medible el sujeto YA es la dosis que falta — repetirla en
    /// el contexto sería el mismo dato dos veces. El contexto sólo dice qué
    /// es y que lo que se ve es lo que falta.
    func testContextoConObjetivoMedibleDiceQueFalta() {
        let e = estado(etiqueta: "Run", dosis: "1.000 m", cierre: .metros(objetivo: 1_000, cubiertos: 340))
        XCTAssertEqual(GuionEstaciones.pagina(e).contexto, "Run · te faltan")
    }

    // MARK: - El gesto: la pantalla ES el botón, y siempre está mando
    //
    // Ni el objetivo de carrera ni el de ergómetro cierran la estación solos
    // — `LiveTramo.crossesMachineGoal` sólo cruza por ERGÓMETRO, nunca por
    // carrera (no hay motor de auto-cierre por GPS en una ruta mixta), así
    // que el toque sigue siendo la única forma de acabar CUALQUIER estación.

    func testModoEsSiempreMandoYElTapDisparaElGestoConCualquierCierre() {
        for cierre: GuionEstaciones.Cierre in [
            .caja(segundos: 120), .metros(objetivo: 1_000, cubiertos: 340),
            .calorias(objetivo: 15, cubiertas: 6), .atleta,
        ] {
            var tocado = false
            let e = estado(cierre: cierre)
            let p = GuionEstaciones.pagina(e, onEstacionHecha: { tocado = true })
            XCTAssertEqual(p.modo, .mando)
            XCTAssertEqual(p.accion, "Toca · estación hecha")
            p.onToca?()
            XCTAssertTrue(tocado)
        }
    }
}

// FH-42 — el sujeto del ergo son actuales/objetivo, no los metros que faltan,
// y la etiqueta es la del tramo (SkiErg no se pinta como «Remo»).
final class GuionErgoFH42Tests: XCTestCase {

    func testConMaquinaElSujetoEsActualesYObjetivo() {
        let e = GuionErgo.Estado(
            fase: .remando, serie: 1, totalSeries: 1, tramoM: 400,
            maquina: true, hechosM: 187, ritmoSec500: nil,
            segundosEnFase: 40, quedaDescansoS: nil,
            zonaViva: nil, bpm: 150,
            etiqueta: "SKIERG", esCalorias: false)
        let p = GuionErgo.paginas(e)[0]
        XCTAssertEqual(p.sujeto, Formato.trabajo(hecho: 187, objetivo: 400))
        XCTAssertEqual(p.unidad, "m")
        XCTAssertEqual(p.contexto, "SKIERG")
    }

    func testCaloriasNoSePintanComoMetros() {
        let e = GuionErgo.Estado(
            fase: .remando, serie: 1, totalSeries: 1, tramoM: 12,
            maquina: true, hechosM: 6, ritmoSec500: nil,
            segundosEnFase: 20, quedaDescansoS: nil,
            zonaViva: nil, bpm: 148,
            etiqueta: "SkiErg", esCalorias: true)
        let p = GuionErgo.paginas(e)[0]
        XCTAssertEqual(p.sujeto, Formato.trabajo(hecho: 6, objetivo: 12))
        XCTAssertEqual(p.unidad, "cal")
    }

    func testSinMaquinaNoPintaCeroSobreElObjetivo() {
        let e = GuionErgo.Estado(
            fase: .remando, serie: 1, totalSeries: 1, tramoM: 400,
            maquina: false, hechosM: nil, ritmoSec500: nil,
            segundosEnFase: 12, quedaDescansoS: nil,
            zonaViva: nil, bpm: 140,
            etiqueta: "SkiErg", esCalorias: false)
        let sujetos = GuionErgo.paginas(e).map(\.sujeto)
        XCTAssertFalse(sujetos.contains(Formato.trabajo(hecho: 0, objetivo: 400)))
        XCTAssertFalse(sujetos.contains("0/400"))
    }

    func testSinObjetivoNoPintaCeroSobreCero() {
        let e = GuionErgo.Estado(
            fase: .remando, serie: 1, totalSeries: 1, tramoM: 0,
            maquina: true, hechosM: 50, ritmoSec500: nil,
            segundosEnFase: 30, quedaDescansoS: nil,
            zonaViva: nil, bpm: 140,
            etiqueta: "SkiErg", esCalorias: false)
        let sujetos = GuionErgo.paginas(e).map(\.sujeto)
        XCTAssertFalse(sujetos.contains(Formato.trabajo(hecho: 0, objetivo: 0)))
        XCTAssertFalse(sujetos.contains(Formato.trabajo(hecho: 50, objetivo: 0)))
    }
}
