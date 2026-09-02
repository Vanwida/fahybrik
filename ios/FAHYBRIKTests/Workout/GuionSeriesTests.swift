import XCTest
@testable import FAHYBRIK

// EL GUION DE LAS SERIES — la línea de contexto, que es la más leída de la
// pantalla y la que decía la mentira más tonta: llamaba «Serie 1 / 6» a los diez
// minutos de trotar para entrar en calor, porque contaba por ROL (un
// calentamiento también es una pierna de trabajo) en vez de por FASE.
final class GuionSeriesTests: XCTestCase {

    private func estado(_ parte: RunPhaseRole,
                        fase: GuionSeries.Fase = .trabajo,
                        cierre: GuionSeries.Cierre = .reloj,
                        enMovimiento: Bool = false,
                        serie: Int = 2) -> GuionSeries.Estado {
        GuionSeries.Estado(
            fase: fase, enMovimiento: enMovimiento, parte: parte,
            serie: serie, totalSeries: 5, cierre: cierre,
            metrosEnTramo: nil, quedaS: 60, enTramoS: 30,
            ritmoSecPorKm: nil, objetivo: nil, loQueViene: nil, zonaViva: nil, bpm: nil
        )
    }

    private func contexto(_ e: GuionSeries.Estado) -> String? {
        GuionSeries.paginas(e).first?.contexto
    }

    func testCadaParteSeLlamaPorSuNombre() {
        XCTAssertEqual(contexto(estado(.main)), "Serie 2 / 5")
        XCTAssertEqual(contexto(estado(.warmup)), "Calentamiento")
        XCTAssertEqual(contexto(estado(.cooldown)), "Vuelta a la calma")
    }

    func testConHitoElContextoSigueDiciendoQueLoQueSeVeSonLosQueFaltan() {
        var conMetros = estado(.main, cierre: .hito(metros: 800))
        conMetros.metrosEnTramo = 200
        XCTAssertEqual(contexto(conMetros), "Serie 2 / 5 · te faltan")
        var calentamiento = estado(.warmup, cierre: .hito(metros: 2000))
        calentamiento.metrosEnTramo = 400
        XCTAssertEqual(contexto(calentamiento), "Calentamiento · te faltan")
    }

    func testSinAppleElHitoNoSeVendeComoMedida() {
        let e = estado(.main, cierre: .hito(metros: 500))
        let primera = GuionSeries.paginas(e).first
        XCTAssertEqual(primera?.contexto, "Serie 2 / 5")
        XCTAssertNotEqual(primera?.sujeto, "500")
        XCTAssertNotEqual(primera?.unidad, "m")
    }

    func testFueraDeLaParteprincipalLaRecuperacionNoAnunciaSerie() {
        XCTAssertEqual(contexto(estado(.main, fase: .recupera, enMovimiento: true, serie: 3)),
                       "Trota · viene la 3")
        XCTAssertEqual(contexto(estado(.main, fase: .recupera, serie: 3)),
                       "Descanso · viene la 3")
        // En un calentamiento no hay «la 1» que venga: el número se calla.
        XCTAssertEqual(contexto(estado(.warmup, fase: .recupera, enMovimiento: true)), "Trota")
    }

    // MARK: - La cuenta de series (compartida con el cable)

    func testLaSerieCuentaSoloLasPiernasDeLaParteprincipal() {
        func leg(_ kind: RunLeg.Kind, _ fase: RunPhaseRole) -> RunLeg {
            RunLeg(kind: kind, measure: .distance(m: 800), target: nil, resolved: nil,
                   inclinePct: nil, cadenceSpm: nil,
                   recoveryMode: kind == .recovery ? .trote : nil, phaseRole: fase)
        }
        // 10' de calentamiento · 3 × (800 + trote) · vuelta a la calma.
        let legs = [leg(.work, .warmup),
                    leg(.work, .main), leg(.recovery, .main),
                    leg(.work, .main), leg(.recovery, .main),
                    leg(.work, .main),
                    leg(.work, .cooldown)]
        XCTAssertEqual(RunLegDisplay.serie(legs: legs, indice: 0).total, 3)
        XCTAssertEqual(RunLegDisplay.serie(legs: legs, indice: 1).n, 1)
        XCTAssertEqual(RunLegDisplay.serie(legs: legs, indice: 3).n, 2)
        XCTAssertEqual(RunLegDisplay.serie(legs: legs, indice: 5).n, 3)
        // Y la vuelta a la calma no es «la serie 4».
        XCTAssertEqual(RunLegDisplay.serie(legs: legs, indice: 6).n, 3)
    }

    func testTrabajoPrescritoElGestoAvanzaSinAnunciar() {
        var avanzó = false
        let g = GuionSeries.Gestos(cerrarSerie: { avanzó = true })
        let hito = GuionSeries.paginas(estado(.main, cierre: .hito(metros: 800)), g).first
        XCTAssertNotNil(hito?.onToca)
        XCTAssertNil(hito?.accion, "hito/reloj: gesto sí, franja no")
        hito?.onToca?()
        XCTAssertTrue(avanzó)
        let sinGesto = GuionSeries.paginas(estado(.main, cierre: .hito(metros: 800))).first
        XCTAssertNil(sinGesto?.onToca)
    }

    func testSerieAbiertaSigueAnunciandoElToque() {
        let g = GuionSeries.Gestos(cerrarSerie: {})
        let p = GuionSeries.paginas(estado(.main, cierre: .atleta), g).first
        XCTAssertEqual(p?.accion, "Toca · serie hecha")
        XCTAssertNotNil(p?.onToca)
    }

    func testSinParteprincipalSeCuentaLoQueHay() {
        let calentamiento = RunLeg(kind: .work, measure: .duration(s: 600), target: nil,
                                   resolved: nil, inclinePct: nil, cadenceSpm: nil,
                                   recoveryMode: nil, phaseRole: .warmup)
        XCTAssertEqual(RunLegDisplay.serie(legs: [calentamiento, calentamiento], indice: 0).total, 2)
    }
}
