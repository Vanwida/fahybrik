import XCTest
@testable import FAHYBRIK

// EL RELOJ DE PARED — los cuatro formatos que corta el crono cuando no hay ni
// GPS ni máquina. Tests del guion PURO: mismos casos que
// `web/components/design-twin/screens/watch-reloj-de-pared/guion.ts`.
final class GuionRelojDeParedTests: XCTestCase {

    // MARK: - intervals

    /// El sujeto es la cuenta atrás, y el segundo nivel es el OBJETIVO —no el
    /// movimiento—, porque la dosis no rota: la ronda 3 es la misma que la 1.
    func testIntervalsTrabajandoConObjetivo() {
        let e = GuionRelojDePared.Estado(
            formato: .intervals, movimiento: "Empuje de trineo", rondaActual: 2,
            totalRondas: 3, enDescanso: false, quedaS: 24, objetivo: "RPE 9"
        )
        let p = GuionRelojDePared.paginas(e).first!
        XCTAssertEqual(p.contexto, "Empuje de trineo · 2 / 3")
        XCTAssertEqual(p.sujeto, WatchFormat.countdown(24))
        XCTAssertEqual(p.segundoValor, "RPE 9")
        XCTAssertEqual(p.nota, WatchNota.loDicesTu)
        XCTAssertEqual(p.modo, .ciego, "las dos manos en el trineo: el reloj no pide nada")
    }

    /// En la parada NO se dice qué viene: es LO MISMO que ya sabes desde la
    /// primera ronda, así que decirlo sería ruido.
    func testIntervalsEnParadaNoRepiteElObjetivo() {
        let e = GuionRelojDePared.Estado(
            formato: .intervals, movimiento: "Plancha lateral", rondaActual: 3,
            totalRondas: 4, enDescanso: true, quedaS: 12, objetivo: nil
        )
        let p = GuionRelojDePared.paginas(e).first!
        XCTAssertEqual(p.contexto, "Para · viene la 4")
        XCTAssertNil(p.segundoValor)
        XCTAssertNil(p.nota)
        XCTAssertEqual(p.modo, .ojeada, "de pie, sin nada que decidir: el reloj arranca solo")
    }

    func testIntervalsUltimaParada() {
        let e = GuionRelojDePared.Estado(
            formato: .intervals, movimiento: "Plancha lateral", rondaActual: 4,
            totalRondas: 4, enDescanso: true, quedaS: 3
        )
        XCTAssertEqual(GuionRelojDePared.paginas(e).first!.contexto, "Para · se acabó")
    }

    // MARK: - tabata

    /// El sujeto es LA RONDA, no la cuenta atrás: en ventanas de 20/10 s la
    /// cifra no sirve para nada, y lo que se usa es el estado — trabajas o paras.
    func testTabataElSujetoEsLaRondaNoElCrono() {
        let e = GuionRelojDePared.Estado(
            formato: .tabata, movimiento: "Burpees", rondaActual: 3,
            totalRondas: 8, enDescanso: false, quedaS: 12
        )
        let p = GuionRelojDePared.paginas(e).first!
        XCTAssertEqual(p.contexto, "Trabaja")
        XCTAssertEqual(p.sujeto, "3")
        XCTAssertEqual(p.segundoValor, "de 8 rondas")
        // El latido marca el cambio de ronda: sube con la ronda.
        XCTAssertEqual(p.latido, 3)
        XCTAssertEqual(p.modo, .ciego)
    }

    func testTabataPara() {
        let e = GuionRelojDePared.Estado(
            formato: .tabata, movimiento: "Burpees", rondaActual: 3,
            totalRondas: 8, enDescanso: true, quedaS: 4
        )
        let p = GuionRelojDePared.paginas(e).first!
        XCTAssertEqual(p.contexto, "Para")
        XCTAssertEqual(p.modo, .ojeada)
    }

    /// A propósito NO cuenta repeticiones: un conteo a mitad de burpee es una
    /// cota inferior, no una puntuación — y el segundo nivel nunca las pinta.
    func testTabataNuncaPintaRepeticiones() {
        let e = GuionRelojDePared.Estado(
            formato: .tabata, movimiento: "Burpees", rondaActual: 5,
            totalRondas: 8, enDescanso: false, quedaS: 8
        )
        XCTAssertNil(GuionRelojDePared.paginas(e).first!.nota)
    }

    // MARK: - death by

    /// Las repeticiones DE ESTE MINUTO son el sujeto — no una segunda línea.
    func testDeathByLasRepsDelMinutoSonElSujeto() {
        let e = GuionRelojDePared.Estado(
            formato: .deathBy, movimiento: "Burpees", rondaActual: 7,
            totalRondas: nil, enDescanso: false, quedaS: 22, repsDelMinuto: 7
        )
        let p = GuionRelojDePared.paginas(e).first!
        XCTAssertEqual(p.contexto, "Minuto 7")
        XCTAssertEqual(p.sujeto, "7")
        XCTAssertEqual(p.unidad, "reps")
        XCTAssertEqual(p.latido, 7)
        XCTAssertEqual(p.segundoEtiqueta, "Queda")
        XCTAssertEqual(p.accion, "Al fallar · toca")
        XCTAssertEqual(p.nota, WatchNota.loDicesTu)
        XCTAssertEqual(p.modo, .ciego)
    }

    /// El único gesto de toda la familia: declarar el fallo dispara `rendirse`,
    /// nunca `avanzar` — confundirlos marcaría el minuto como cumplido.
    func testDeathByElToqueLlamaARendirse() {
        var llamado = false
        let e = GuionRelojDePared.Estado(
            formato: .deathBy, rondaActual: 3, enDescanso: false, quedaS: 10, repsDelMinuto: 3
        )
        let p = GuionRelojDePared.paginas(e, .init(rendirse: { llamado = true })).first!
        p.onToca?()
        XCTAssertTrue(llamado)
    }

    /// Fallado: el sujeto pasa a ser la puntuación (rondas superadas), y el modo
    /// sube a `mando` — el bloque ya se acabó, estás de pie.
    func testDeathByFalladoEnseñaLaPuntuacion() {
        let e = GuionRelojDePared.Estado(
            formato: .deathBy, rondaActual: 12, enDescanso: false, quedaS: 40,
            fallado: true, rondasSuperadas: 11
        )
        let p = GuionRelojDePared.paginas(e).first!
        XCTAssertEqual(p.contexto, "Se acabó · minuto 12")
        XCTAssertEqual(p.sujeto, "11")
        XCTAssertEqual(p.segundoValor, "rondas superadas")
        XCTAssertEqual(p.modo, .mando)
        XCTAssertNil(p.accion, "el bloque ya se acabó: no hay nada más que tocar")
    }

    // MARK: - steady funcional

    /// La pantalla más corta: ni segundo nivel, ni acción, ni nota. El
    /// movimiento vive en el contexto, que es donde cuesta cero.
    func testSteadyUnaSolaCosaQueSaber() {
        let e = GuionRelojDePared.Estado(
            formato: .steady, movimiento: "Movilidad de cadera", rondaActual: 1,
            enDescanso: false, quedaS: 152
        )
        let p = GuionRelojDePared.paginas(e).first!
        XCTAssertEqual(p.contexto, "Movilidad de cadera")
        XCTAssertEqual(p.sujeto, WatchFormat.countdown(152))
        XCTAssertNil(p.segundoValor)
        XCTAssertNil(p.accion)
        XCTAssertNil(p.nota)
        XCTAssertEqual(p.modo, .ojeada, "manos libres, mirando al frente")
    }

    func testSteadySeAcabo() {
        let e = GuionRelojDePared.Estado(
            formato: .steady, movimiento: "Movilidad de cadera", rondaActual: 1,
            enDescanso: false, quedaS: 0
        )
        XCTAssertEqual(GuionRelojDePared.paginas(e).first!.contexto, "Se acabó")
    }

    // MARK: - El pulso hereda el modo del momento

    func testElPulsoHeredaElModoDelMomento() {
        let e = GuionRelojDePared.Estado(
            formato: .deathBy, rondaActual: 3, enDescanso: false, quedaS: 10,
            repsDelMinuto: 3, bpm: 150
        )
        let paginas = GuionRelojDePared.paginas(e)
        XCTAssertEqual(paginas.count, 2)
        XCTAssertEqual(paginas[1].modo, .ciego, "en el suelo no puedes mirar, estés en la página que estés")
    }

    func testSinPulsoUnaSolaPagina() {
        let e = GuionRelojDePared.Estado(formato: .steady, rondaActual: 1, enDescanso: false, quedaS: 60)
        XCTAssertEqual(GuionRelojDePared.paginas(e).count, 1)
    }
}
