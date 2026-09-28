import XCTest
@testable import FAHYBRIK

// EL ADAPTADOR, FAMILIA FUERZA — los planes del contrato (`iphone-vivo-fuerza`)
// escritos como el JSON del coach entran en el modelo como en el doble
// (`web/tests/design-twin/iphone-vivo-fuerza.test.ts`), y el paso vivo sigue al
// motor sin atascarse en la última serie.
final class VivoAdaptadorFuerzaTests: XCTestCase {

    private typealias P = VivoPlanesDePrueba

    @MainActor
    private func estado(_ s: WorkoutSession) -> Vivo.EstadoVivo {
        Vivo.estadoDe(s, plan: Vivo.planDe(s.plan, zonas: s.hrZones, entorno: s.runEnvironment))
    }

    // MARK: - La RM resuelta y el cue viajan hasta la serie

    @MainActor
    func testLaSuperserieLlevaSuRmSuCueYSuLetra() throws {
        let s = P.arranca(try P.sesion529()); P.irA(s, segmento: 1)
        let e = estado(s)
        let a1 = e.paso
        XCTAssertEqual(Vivo.posicionDe(a1), ["A1 · Back Squat", "Serie 1/4"])
        XCTAssertEqual(a1.fuerza?.carga, .rm(pctMin: 65, pctMax: 70, rmKg: 186.5))
        XCTAssertEqual(a1.cue, "concéntrica explosiva")
        let h = Vivo.heroeDeFamilia(a1, e.lecturas, e.zonas)
        XCTAssertEqual(h.texto, "8 × 125"); XCTAssertEqual(h.unidad, "kg"); XCTAssertEqual(h.etiqueta, "65–70 % RM")
        XCTAssertEqual(Vivo.textoKgPlan(a1.fuerza!.carga), "121–131 kg")
        // La segunda superserie es B, no otra A.
        let b = e.pasos.filter { $0.origen?.segmento == 2 && $0.fuerza != nil }
        XCTAssertEqual(Array(b.prefix(2)).map { $0.posicion?.slot }, ["B1", "B2"])
        XCTAssertEqual(b.first?.fuerza?.esfuerzo, Vivo.EsfuerzoFuerza(eje: .rir, min: 3, max: 3))
    }

    @MainActor
    func testLaPiramideSonCincoSeriesConSuMedidaYLaBanda() throws {
        let s = P.arranca(try P.piramide392()); P.irA(s, segmento: 0)
        let e = estado(s)
        let series = e.pasos.filter { $0.fuerza != nil }
        XCTAssertEqual(series.map { $0.medida.prescrito }, [6, 6, 4, 4, 3])
        series.forEach { XCTAssertEqual($0.fuerza?.carga, .rm(pctMin: 75, pctMax: 85, rmKg: 186.5)) }
        XCTAssertEqual(e.pasos.filter { $0.rol == .descanso }.count, 4, "la última no hereda el descanso del bloque")
        XCTAssertEqual(Vivo.textoKgPlan(series[0].fuerza!.carga), "140–159 kg")
        XCTAssertEqual(Vivo.textoViene(series[2]), "Back Squat · 4 × 150 kg")
        XCTAssertEqual(Vivo.textoViene(series[2], arrastrada: 145), "Back Squat · 4 × 145 kg")
    }

    // MARK: - Colócate

    @MainActor
    func testLaPlanchaLlevaColocateEntreSeries() throws {
        let s = P.arranca(try P.sesion538()); P.irA(s, segmento: 0)
        let e = estado(s)
        let i = try XCTUnwrap(e.pasos.firstIndex { $0.id == "s0-q1" })
        XCTAssertEqual(Vivo.posicionDe(e.pasos[i]), ["Side Plank", "Serie 2/3", "20″"])
        XCTAssertEqual(e.pasos[i + 1].rol, .transicion)
        XCTAssertEqual(Vivo.posicionDe(e.pasos[i + 1]), ["Colócate", "5″"])
        XCTAssertEqual(Vivo.luegoDe(e.pasos, i), Vivo.LuegoVista(que: "Colócate 5″", despues: "Serie 3/3 · Side Plank · 20″"))
        XCTAssertEqual(e.pasos.filter { $0.rol == .transicion }.count, 2, "la serie 1 no tiene colócate: arranca el ejercicio")
    }

    @MainActor
    func testLaSeriePorTiempoSeCierraSolaYEntraColocateConSu321() throws {
        let s = P.arranca(try P.sesion538()); P.irA(s, segmento: 0)
        s.lapElapsedSeconds += 20
        s.vivoCerrarSerieCumplida()
        XCTAssertEqual(s.pendingSetIndex, 1, "la serie 1 la cerró el reloj")
        XCTAssertEqual(s.restRemainingSeconds, Vivo.colocateSDefecto)
        var e = estado(s)
        XCTAssertEqual(e.paso.rol, .transicion)
        XCTAssertNil(e.cuenta)
        s.restRemainingSeconds = 2.4
        e = estado(s)
        XCTAssertEqual(e.cuenta, 3)
    }

    // MARK: - La última serie no se atasca

    @MainActor
    func testTrasLaUltimaSerieDelBloqueSeEntraEnElSiguiente() throws {
        let s = P.arranca(try P.sesion529()); P.irA(s, segmento: 1)
        for k in 0..<7 { s.confirmSet(k); s.dismissRest() }
        s.confirmSet(7)
        let d = estado(s)
        XCTAssertEqual(d.paso.rol, .descanso, "la A2 4/4 abre su descanso de 2′")
        XCTAssertEqual(Vivo.seriesDelDescanso(d.pasos, d.i).count, 2)
        XCTAssertEqual(Vivo.luegoDe(d.pasos, d.i)?.que, "B1 · Deadlift · 8 reps")
        s.dismissRest()
        s.vivoAlAcabarDescanso()
        XCTAssertEqual(s.currentSegmentIndex, 2)
        XCTAssertFalse(s.isAwaitingBlockStart)
        XCTAssertEqual(Vivo.posicionDe(estado(s).paso), ["B1 · Deadlift", "Serie 1/4"])
    }

    @MainActor
    func testConTodasCerradasYSinDescansoElPasoEsElUltimoNoLaSerieUno() throws {
        let s = P.arranca(try P.p11()); P.irA(s, segmento: 0)
        for k in 0..<5 { s.confirmSet(k); s.dismissRest() }
        let e = estado(s)
        XCTAssertEqual(e.paso.posicion?.serie?.n, 5, "nunca la serie 1 otra vez")
        XCTAssertEqual(e.pasos.filter { $0.rol == .descanso }.count, 4)
    }

    // MARK: - El descanso tras +30 s

    @MainActor
    func testLoQueQuedaDelDescansoEsElDelMotorTrasMas30() throws {
        let s = P.arranca(try P.p11()); P.irA(s, segmento: 0)
        s.confirmSet(0)
        s.restRemainingSeconds = 100; s.restTotalSeconds = 150   // 120 prescritos + 30
        let e = estado(s)
        XCTAssertEqual(e.paso.rol, .descanso)
        XCTAssertEqual(Vivo.faltaDe(e.paso, e.lecturas), 100)
    }
}
