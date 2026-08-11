import XCTest
@testable import FAHYBRIK

// LAS LECTURAS DEL CICLO — todo lo DERIVADO, fijado.
//
// Son las cuentas que la pantalla escribe en grande: en qué semana del ciclo estás,
// qué nivel declara lo publicado, si el camino tiene un agujero al final, qué
// paradas tiene y cuándo cae cada marca del calendario. Van con un «hoy» fijo: una
// cuenta atrás que cambia según el día en que se corra la prueba no fija nada.
final class CicloDelPlanLecturasTests: XCTestCase {

    private let hoy = EscenariosCiclo.hoy

    // MARK: Dónde estás

    func test_semanaDelCiclo_sumaLasSemanasDeLosTramosDeAntes() {
        let ciclo = EscenariosCiclo.completo
        XCTAssertEqual(ciclo.indiceActual, 1)
        XCTAssertEqual(ciclo.semanaEnTramo, 2)
        // 1 semana de «Tests» + la 2ª de «Acumulación» = la 3ª del ciclo.
        XCTAssertEqual(ciclo.semanaDelCiclo, 3)
        XCTAssertEqual(ciclo.semanasTotales, 11)
    }

    /// Sin cursor no hay posición, y no se extrapola: `nil` no es cero.
    func test_sinEtapaActiva_noHaySemanaDelCiclo() {
        let ciclo = EscenariosCiclo.sinEtapaActiva
        XCTAssertEqual(ciclo.indiceActual, -1)
        XCTAssertNil(ciclo.semanaEnTramo)
        XCTAssertNil(ciclo.semanaDelCiclo)
        XCTAssertNil(ciclo.tramoActual)
    }

    /// Sin cursor tampoco hay pasado: un ciclo sin «hoy» dentro no convierte en
    /// pasado a nadie, aunque sus fechas hayan quedado atrás.
    func test_sinCursor_ningunaParadaEsPasado() {
        XCTAssertTrue(EscenariosCiclo.sinEtapaActiva.nodos.allSatisfy { !$0.pasado })
    }

    func test_conCursor_soloLoDeAntesEsPasado() {
        let tramos = EscenariosCiclo.completo.nodos.filter { $0.clase == .tramo }
        XCTAssertEqual(tramos.map(\.pasado), [true, false, false, false])
        XCTAssertEqual(tramos.map(\.actual), [false, true, false, false])
    }

    /// Cuando el servidor no declara el total, sale de la suma de los tramos: una
    /// sola regla y en un sitio.
    func test_sinTotalDeclarado_lasSemanasSalenDeLaSuma() {
        let ciclo = CicloDelPlan(EscenariosCiclo.respuesta(semanas: nil), hoy: hoy)!
        XCTAssertEqual(ciclo.semanasTotales, 1 + 4 + 1 + 5)
    }

    // MARK: El nivel

    func test_nivel_saleDelTramoDeHoy() {
        XCTAssertEqual(EscenariosCiclo.completo.nivelDeLoPublicado, "Avanzado")
    }

    /// Sin cursor vale el que comparten TODOS; si declaran niveles distintos no
    /// existe «el nivel del ciclo» y no se pinta ninguno.
    func test_sinCursor_soloValeElNivelCompartido() {
        XCTAssertEqual(EscenariosCiclo.sinEtapaActiva.nivelDeLoPublicado, "Avanzado")

        var mezclados = EscenariosCiclo.sinEtapaActiva.tramos
        mezclados[0].level = "Intermedio"
        let ciclo = CicloDelPlan(
            EscenariosCiclo.respuesta(tramos: mezclados, posicionActual: nil),
            hoy: hoy
        )!
        XCTAssertNil(ciclo.nivelDeLoPublicado)
    }

    /// Una parada solo DICE su nivel cuando se sale del que declara el resto: si
    /// no, repetiría lo que ya dice el cromo.
    func test_elNivelDeUnaParadaSoloSaleCuandoSeSaleDelComun() {
        var tramos = EscenariosCiclo.tramos
        tramos[2].level = "Élite"
        let ciclo = CicloDelPlan(EscenariosCiclo.respuesta(tramos: tramos), hoy: hoy)!
        let paradas = ciclo.nodos.filter { $0.clase == .tramo }
        XCTAssertEqual(paradas[2].detalle, "Élite")
        // La de hoy comparte el nivel común: se queda con su detalle de siempre.
        XCTAssertNil(paradas[1].detalle)
        XCTAssertEqual(paradas[0].detalle, "Los cuatro tests de calibración.")
    }

    // MARK: El hueco

    func test_conPoliticaDeclaradaYCursor_noHayHueco() {
        let ciclo = EscenariosCiclo.completo
        XCTAssertFalse(ciclo.hayHueco)
        XCTAssertEqual(ciclo.politica, .repite)
        XCTAssertEqual(ciclo.politica?.frase, "Al acabar, el ciclo vuelve a empezar con más carga.")
        XCTAssertFalse(ciclo.nodos.contains { $0.clase == .hueco })
    }

    /// Dos procedencias, un mismo hecho: sin política declarada, o sin cursor.
    func test_dosCaminosDistintosAlMismoHueco() {
        XCTAssertTrue(EscenariosCiclo.conHueco.hayHueco)
        XCTAssertTrue(EscenariosCiclo.sinEtapaActiva.hayHueco)

        let hueco = EscenariosCiclo.conHueco.nodos.first { $0.clase == .hueco }
        XCTAssertEqual(hueco?.titulo, "Aquí acaba lo publicado")
        XCTAssertEqual(hueco?.detalle, "Después de esta etapa no hay nada montado todavía.")

        let sinCursor = EscenariosCiclo.sinEtapaActiva.nodos.first { $0.clase == .hueco }
        XCTAssertEqual(sinCursor?.detalle, "Lo que tu coach ha montado se termina antes de hoy.")
    }

    /// La frase del hueco y la del vacío de «aún no tienes plan» son LA MISMA: son
    /// el mismo hecho visto desde dos sitios.
    func test_deQuienDependeSeDiceUnaSolaVez() {
        let hueco = EscenariosCiclo.conHueco.nodos.first { $0.clase == .hueco }
        XCTAssertEqual(LoPublicaElCoach.frase, "Lo publica tu coach. Todavía no hay fecha.")
        XCTAssertTrue(hueco?.etiqueta.hasSuffix(LoPublicaElCoach.frase) == true)
    }

    // MARK: El orden de las paradas

    func test_lasParadasVanEnOrden_tramosHuecoYCarreraCerrando() {
        XCTAssertEqual(
            EscenariosCiclo.conHueco.nodos.map(\.clase),
            [.tramo, .tramo, .tramo, .tramo, .hueco, .carrera]
        )
        XCTAssertEqual(
            EscenariosCiclo.completo.nodos.map(\.clase),
            [.tramo, .tramo, .tramo, .tramo, .carrera]
        )
    }

    func test_sinCarrera_elCaminoCierraSinMeta() {
        let ciclo = CicloDelPlan(EscenariosCiclo.respuesta(carrera: nil), hoy: hoy)!
        XCTAssertFalse(ciclo.nodos.contains { $0.clase == .carrera })
    }

    // MARK: La carrera

    func test_carreraConObjetivo_loEscribeUnaVez() {
        let carrera = EscenariosCiclo.completo.nodos.first { $0.clase == .carrera }
        XCTAssertEqual(carrera?.titulo, "HYROX Barcelona")
        XCTAssertEqual(carrera?.detalle, "Tu carrera · objetivo 1:30:00")
        XCTAssertEqual(carrera?.etiqueta, "Tu carrera: HYROX Barcelona, en 73 días, objetivo 1:30:00")
    }

    func test_carreraSinObjetivo_noInventaNinguno() {
        let carrera = EscenariosCiclo.sinObjetivo.nodos.first { $0.clase == .carrera }
        XCTAssertEqual(carrera?.detalle, "Tu carrera")
        XCTAssertEqual(carrera?.etiqueta, "Tu carrera: HYROX Madrid, en 87 días")
    }

    // MARK: Cuándo cae una marca del calendario

    func test_cuandoElHito_diceLoQueSeSabeYNadaMas() {
        func cuando(_ fecha: String) -> String {
            CicloDelPlan.cuandoElHito(
                HitoDelTramo(kind: "test", title: "Test", date: fecha), hoy: hoy
            )
        }
        XCTAssertEqual(cuando("2026-08-19"), "hoy")
        XCTAssertEqual(cuando("2026-08-20"), "mañana")
        XCTAssertEqual(cuando("2026-08-24"), "en 5 días")
        // A los 14 días la cuenta en días deja de situar y se pasa a semanas.
        XCTAssertEqual(cuando("2026-09-01"), "en 13 días")
        XCTAssertEqual(cuando("2026-09-02"), "en 2 semanas")
        XCTAssertEqual(cuando("2026-09-10"), "en 3 semanas")
        XCTAssertEqual(cuando("2026-08-18"), "ya pasó")
        // Una fecha ilegible NO se convierte en una cuenta atrás inventada.
        XCTAssertEqual(cuando("mañana por la tarde"), "sin fecha")
    }

    /// El rótulo de la parada de hoy lo dice todo, porque su dibujo no dice nada:
    /// las marcas de semana van ocultas a VoiceOver y las marcas del calendario se
    /// leen con su cuándo.
    func test_laVozDeLaParadaDeHoy_lleveTodoLoQueElDibujoNoDice() {
        let actual = EscenariosCiclo.completo.nodos.first { $0.actual }
        XCTAssertEqual(
            actual?.etiqueta,
            "Acumulación, 4 semanas (S2-S5), estás en la semana 2, nivel Avanzado. "
            + "2 marcas en el calendario: Test de 5 km, mañana; Simulación media, en 7 días"
        )
    }

    func test_laVozDeUnaParadaPasada_loDiceConPalabras() {
        let primera = EscenariosCiclo.completo.nodos.first
        XCTAssertEqual(primera?.etiqueta, "Tests, 1 semana (S1), ya pasó, nivel Avanzado")
    }

    // MARK: El reparto vertical y las formas

    /// El sobrante entra EN LAS PARADAS (§6.1) y lo pagan las tres que pueden: la
    /// de hoy cuando tiene algo dentro que crezca con ella, el hueco y la carrera.
    func test_quienPagaElSobrante() {
        let tramos = EscenariosCiclo.conHueco.tramosDeLaEspina
        XCTAssertEqual(tramos.map(\.crece), [false, true, false, false, true, true])
    }

    /// Un tramo abierto SIN nada en su calendario no crece: estirarlo sería aire
    /// dentro del camino, y el sobrante rinde más abajo.
    func test_tramoDeHoySinCalendario_noCrece() {
        let ciclo = EscenariosCiclo.unaSolaEtapa
        XCTAssertEqual(ciclo.tramosDeLaEspina.map(\.crece), [false, true])
    }

    func test_cadaClaseTieneSuForma() {
        XCTAssertEqual(
            EscenariosCiclo.conHueco.tramosDeLaEspina.map(\.forma),
            [.tramo, .tramo, .tramo, .tramo, .hueco, .meta]
        )
    }

    /// Con una única etapa publicada las dos cuentas son la misma, y el pie del
    /// sujeto no la repite.
    func test_unaSolaEtapa_laEscalaDelCicloEsLaDeLaEtapa() {
        let ciclo = EscenariosCiclo.unaSolaEtapa
        XCTAssertEqual(ciclo.tramos.count, 1)
        XCTAssertEqual(ciclo.semanaDelCiclo, 1)
        XCTAssertEqual(ciclo.semanasTotales, 4)
        XCTAssertEqual(ciclo.tramoActual?.weekCount, 4)
    }
}
