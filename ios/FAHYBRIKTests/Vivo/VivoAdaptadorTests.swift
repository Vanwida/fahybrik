import XCTest
@testable import FAHYBRIK

// EL ADAPTADOR: del plan y el motor de hoy al estado vivo (I1). Cada familia
// del contrato entra en el modelo con sus pasos y su posición, el paso vivo
// sigue al cursor del motor, y las lecturas dicen lo que el motor mide (y
// callan lo que no).
final class VivoAdaptadorTests: XCTestCase {

    private typealias P = VivoPlanesDePrueba

    @MainActor
    private func estado(_ s: WorkoutSession, test: Bool = false) -> Vivo.EstadoVivo {
        let plan = Vivo.planDe(s.plan, zonas: s.hrZones, entorno: s.runEnvironment, test: test)
        return Vivo.estadoDe(s, plan: plan)
    }

    // MARK: - Correr

    @MainActor
    func testSeisPorMilSonSeisSeriesConSuRecuperacion() throws {
        let s = P.arranca(try P.seisPorMil(), entorno: .outdoor)
        let e = estado(s)
        let series = e.pasos.filter { $0.clase == .series }
        XCTAssertEqual(series.count, 6)
        XCTAssertEqual(series.map { $0.posicion?.serie?.n }, [1, 2, 3, 4, 5, 6])
        XCTAssertEqual(series.first?.objetivos.first, Vivo.Objetivo(eje: .ritmo, min: 225, max: 235, papel: .principal))
        XCTAssertEqual(series.first?.medida, Vivo.Medida(tipo: .distancia, prescrito: 1000, mide: .gps))
        XCTAssertEqual(e.pasos.filter { $0.rol == .recuperacion }.count, 5)
        XCTAssertEqual(Vivo.posicionDe(e.paso), ["Serie 1/6", "1000\u{00A0}m"])
        XCTAssertEqual(Vivo.formatoDe(e.paso), "Series")
        XCTAssertEqual(Vivo.familiaDe(e.paso), .correr)
        XCTAssertEqual(Vivo.luegoDe(e.pasos, e.i)?.que, "Recupera 90″ trote")
        XCTAssertEqual(Vivo.luegoDe(e.pasos, e.i)?.despues, "1000\u{00A0}m a 3:45–3:55")
        XCTAssertNil(e.lecturas.ritmo, "sin GPS no se inventa un ritmo")
        // El motor pasa a la serie 2 tras la recuperación: el paso vivo sigue al cursor.
        s.runCountInRemaining = 0
        s.primaryAdvance()
        XCTAssertEqual(estado(s).paso.rol, .recuperacion)
        s.primaryAdvance()
        XCTAssertEqual(estado(s).paso.posicion?.serie?.n, 2)
    }

    @MainActor
    func testRodajeAZonaMandaElPulso() throws {
        let s = P.arranca(try P.rodajeZ2(), entorno: .outdoor)
        s.injectLiveHR(146, source: .strap)
        let e = estado(s)
        XCTAssertEqual(e.paso.clase, .rodaje)
        XCTAssertEqual(e.paso.objetivos.first?.eje, .zona)
        XCTAssertEqual(e.paso.vueltaAutoM, 1000)
        let h = Vivo.heroeDeFamilia(e.paso, e.lecturas, e.zonas)
        XCTAssertEqual(h.clase, .pulso); XCTAssertEqual(h.texto, "146"); XCTAssertEqual(h.zona?.n, 2)
        XCTAssertEqual(Vivo.tinteDelPaso(e.paso, e.lecturas, e.zonas), 2)
        XCTAssertEqual(Vivo.clavePorDefecto(e.paso), .vuelta)
    }

    // MARK: - Fuerza

    @MainActor
    func testLaSuperserieSonOchoSeriesConSuHuecoYSuDescanso() throws {
        let s = P.arranca(try P.superserie())
        s.primeSetsIfNeeded()
        let e = estado(s)
        let series = e.pasos.filter { $0.fuerza != nil }
        XCTAssertEqual(series.count, 8)
        XCTAssertEqual(series.map { $0.posicion?.slot }, ["A1", "A2", "A1", "A2", "A1", "A2", "A1", "A2"])
        XCTAssertEqual(series[0].posicion?.serie, Vivo.Contador(n: 1, de: 4))
        XCTAssertEqual(Vivo.posicionDe(e.paso), ["A1 · Back Squat", "Serie 1/4"])
        if case let .rm(pMin, pMax, _)? = series[0].fuerza?.carga { XCTAssertEqual(pMin, 65); XCTAssertEqual(pMax, 70) } else { XCTFail("la carga del plan es %RM") }
        // El objetivo de bloque (RIR) no sobrevive al plegado de la superserie del motor: se queda en nil, no se inventa.
        if case .corporal? = series[1].fuerza?.carga {} else { XCTFail("el box jump es a peso corporal") }
        XCTAssertEqual(e.pasos.filter { $0.rol == .descanso }.count, 4, "un descanso de 2′ tras cada A2")
        XCTAssertEqual(Vivo.clavePorDefecto(e.paso), .serieHecha)
        XCTAssertEqual(Vivo.luegoDe(e.pasos, e.i)?.que, "A2 · Box Jump · 6 reps")
        // Cierra la A1: el paso vivo es la A2 (sin descanso entre medias).
        s.primaryAdvance()
        XCTAssertEqual(estado(s).paso.posicion?.slot, "A2")
        // Cierra la A2: corre el descanso, y el paso vivo es ese descanso.
        s.primaryAdvance()
        let d = estado(s)
        XCTAssertEqual(d.paso.rol, .descanso)
        XCTAssertEqual(d.paso.medida.prescrito, 120)
        XCTAssertEqual(Vivo.seriesDelDescanso(d.pasos, d.i), [0, 1])
        XCTAssertEqual(Vivo.luegoDe(d.pasos, d.i)?.que, "A1 · Back Squat · 8 reps")
    }

    @MainActor
    func testLasSeriesRectasLlevanKilosYRir() throws {
        let s = P.arranca(try P.seriesRectas())
        s.primeSetsIfNeeded()
        let e = estado(s)
        let p = e.paso
        XCTAssertEqual(p.nombre, "Back Squat")
        XCTAssertEqual(p.fuerza?.carga, .kg(min: 100, max: 100))
        XCTAssertEqual(p.fuerza?.esfuerzo, Vivo.EsfuerzoFuerza(eje: .rir, min: 2, max: 2))
        let h = Vivo.heroeDeFamilia(p, e.lecturas, e.zonas)
        XCTAssertEqual(h.texto, "5 × 100"); XCTAssertEqual(h.unidad, "kg"); XCTAssertEqual(h.etiqueta, "RIR 2")
        XCTAssertEqual(Vivo.textoViene(e.pasos[2]), "Back Squat · 5 × 100 kg")
    }

    // MARK: - Ergo y test

    @MainActor
    func testElSkiPorSeriesConSuMonitor() throws {
        let s = P.arranca(try P.skiSeries())
        s.ergConnected = true
        s.sampleErg(paceSecPer500m: 119, powerWatts: 210, strokeRate: 44, distanceMeters: 0, caloriesKcal: 0)
        s.sampleErg(paceSecPer500m: 119, powerWatts: 210, strokeRate: 44, distanceMeters: 96, caloriesKcal: 7)
        s.injectLiveHR(157, source: .pm5)
        let e = estado(s)
        XCTAssertEqual(Vivo.familiaDe(e.paso), .ski)
        XCTAssertEqual(e.paso.maquina?.tipo, .ski)
        XCTAssertEqual(e.paso.medida, Vivo.Medida(tipo: .distancia, prescrito: 250, mide: .ergo))
        XCTAssertEqual(Vivo.posicionDe(e.paso), ["SkiErg", "Serie 1/8", "250\u{00A0}m"])
        XCTAssertEqual(e.lecturas.split500, 119)
        XCTAssertEqual(e.lecturas.hecho, 96)
        let h = Vivo.heroeDeFamilia(e.paso, e.lecturas, e.zonas)
        XCTAssertEqual(h.clase, .split); XCTAssertEqual(h.texto, "1:59"); XCTAssertEqual(h.unidad, "/500")
        XCTAssertEqual(Vivo.laminaDelPaso(e.paso, e.lecturas, e.zonas).banda?.palabra?.texto, "rápido")
        let m = Vivo.metricasDelPaso(e.paso, e.lecturas, heroe: .split, e.zonas, .init(metrosPaso: e.metrosPaso))
        XCTAssertEqual(m.map(\.clave), [.cadencia, .pulso, .cal, .vatios])
        XCTAssertEqual(Vivo.luegoDe(e.pasos, e.i)?.que, "Recupera 1′ parado")
    }

    @MainActor
    func testElTestSeMarca() throws {
        let s = P.arranca(try P.testRemo())
        let e = estado(s, test: true)
        XCTAssertTrue(Vivo.esTest(e.paso))
        XCTAssertEqual(Vivo.familiaDe(e.paso), .remo)
        XCTAssertEqual(Vivo.formatoDe(e.paso), "Test")
        // «Row Erg» es el nombre de catálogo: en la cabecera, el de box (`Vivo.nombreDeBox`).
        XCTAssertEqual(Vivo.posicionDe(e.paso).first, "Remo")
    }

    // MARK: - WOD

    @MainActor
    func testElEmomAlternoSonDieciseisMinutos() throws {
        let s = P.arranca(try P.emom())
        s.skipCountIn()
        let e = estado(s)
        let minutos = e.pasos.filter { $0.clase == .emom }
        XCTAssertEqual(minutos.count, 16)
        XCTAssertEqual(Vivo.posicionDe(e.paso), ["Minuto 1/16"])
        XCTAssertEqual(Vivo.formatoDe(e.paso), "EMOM 16′")
        XCTAssertEqual(Vivo.trabajoDe(e.paso, e.lecturas, heroe: .falta)?.valor, "15 Wall Balls · 9 kg")
        XCTAssertEqual(Vivo.familiaDe(minutos[1]), .emom)
        XCTAssertEqual(minutos[1].maquina?.tipo, .ski)
        if case let .emom(tarea, _, _, _)? = minutos[1].wod { XCTAssertEqual(tarea.dosis?.tipo, .cal); XCTAssertEqual(tarea.dosis?.prescrito, 12) } else { XCTFail() }
        XCTAssertEqual(Vivo.clavePorDefecto(e.paso), .hecho)
        s.primaryAdvance(fromAthleteTap: true)
        XCTAssertEqual(estado(s).paso.posicion?.serie?.n, 2)
    }

    @MainActor
    func testElAmrapEsUnPasoConSusTareas() throws {
        let s = P.arranca(try P.amrap())
        s.tickConditioning(dt: 3.5)
        let e = estado(s)
        XCTAssertEqual(e.pasos.count, 1)
        guard case let .amrap(tareas, d)? = e.paso.wod else { return XCTFail("es un AMRAP") }
        XCTAssertEqual(tareas.map(\.nombre), ["Pull-ups", "Push-ups", "Air Squats"])
        XCTAssertEqual(d, 1200)
        XCTAssertEqual(Vivo.formatoDe(e.paso), "AMRAP 20′")
        s.bumpAmrapRound(); s.bumpAmrapRound()
        XCTAssertEqual(Vivo.posicionDe(estado(s).paso, .init(rondas: s.fixedRoundsDone)), ["Ronda 3"])
        XCTAssertEqual(Vivo.heroeDeFamilia(e.paso, e.lecturas, e.zonas, .init(rondas: 2)).texto, "2")
    }

    @MainActor
    func testElChipperEsUnaRutaDeEstaciones() throws {
        let s = P.arranca(try P.chipper())
        s.tickConditioning(dt: 3.5)
        let e = estado(s)
        XCTAssertEqual(e.pasos.count, 4)
        XCTAssertEqual(e.pasos.map(\.nombre), ["Double Unders", "Wall Balls", "Row Erg", "Burpees"])
        XCTAssertEqual(e.pasos[2].maquina?.tipo, .remo)
        XCTAssertEqual(e.pasos[2].medida, Vivo.Medida(tipo: .cal, prescrito: 30, mide: .ergo))
        XCTAssertEqual(Vivo.formatoDe(e.paso), "For Time · cap 20′")
        XCTAssertEqual(Vivo.familiaDe(e.paso), .fortime)
        XCTAssertEqual(Vivo.clavePorDefecto(e.paso), .estacionHecha)
        s.markRoundDone()
        let e2 = estado(s)
        XCTAssertEqual(e2.i, 1)
        XCTAssertEqual(e2.parciales.count, 1)
        XCTAssertEqual(e2.parciales.first?.i, 0)
        XCTAssertEqual(Vivo.alrededorDe(e2.pasos, e2.i, e2.parciales).masAdelante, 1)
    }

    @MainActor
    func testElCircuitoDeRondasConSuDescanso() throws {
        let s = P.arranca(try P.circuito(), entorno: .outdoor)
        s.tickConditioning(dt: 3.5)
        let e = estado(s)
        let trabajo = e.pasos.filter { $0.rol == .trabajo }
        XCTAssertEqual(trabajo.count, 12)
        XCTAssertEqual(e.pasos.filter { $0.rol == .descanso }.count, 3)
        XCTAssertEqual(e.paso.clase, .carrera)
        XCTAssertEqual(e.paso.posicion?.ronda, Vivo.Contador(n: 1, de: 4))
        XCTAssertEqual(e.paso.posicion?.estacion, Vivo.Contador(n: 1, de: 3))
        XCTAssertEqual(Vivo.formatoDe(e.paso), "Circuito")
        XCTAssertEqual(trabajo[1].nombre, "Kettlebell Swings")
        XCTAssertEqual(Vivo.textoViene(trabajo[3], abre: true), "Ronda 2/4 · Carrera · 400\u{00A0}m")
        // Tres estaciones hechas: corre el descanso de la ronda y el paso vivo es ese descanso.
        s.markRoundDone(); s.markRoundDone(); s.markRoundDone()
        let d = estado(s)
        XCTAssertEqual(d.paso.rol, .descanso)
        XCTAssertEqual(d.paso.medida.prescrito, 90)
        XCTAssertEqual(d.parciales.count, 3)
    }

    @MainActor
    func testElTabataEsRelojDePared() throws {
        let s = P.arranca(try P.tabata())
        s.tickConditioning(dt: 3.5)
        let e = estado(s)
        XCTAssertEqual(e.pasos.filter { $0.rol == .trabajo }.count, 8)
        XCTAssertEqual(e.pasos.filter { $0.rol == .descanso }.count, 7)
        XCTAssertEqual(Vivo.familiaDe(e.paso), .pared)
        XCTAssertEqual(Vivo.formatoDe(e.paso), "Tabata 8 × 20″/10″")
        XCTAssertEqual(Vivo.posicionDe(e.paso), ["Burpees", "Ronda 1/8"])
        XCTAssertNil(Vivo.clavePorDefecto(e.paso), "el tabata lo lleva el reloj")
        let h = Vivo.heroeDeFamilia(e.paso, e.lecturas, e.zonas)
        XCTAssertEqual(h.clase, .falta); XCTAssertEqual(h.etiqueta, "trabajo")
    }

    @MainActor
    func testElDeathBySonMinutosConSuEscalera() throws {
        let s = P.arranca(try P.deathBy())
        s.tickConditioning(dt: 3.5)
        let e = estado(s)
        XCTAssertEqual(e.pasos.count, Vivo.deathByVentanasDefecto)
        XCTAssertEqual(Vivo.familiaDe(e.paso), .deathby)
        XCTAssertEqual(Vivo.posicionDe(e.paso), ["Minuto 1"])
        XCTAssertEqual(Vivo.heroeDeFamilia(e.pasos[6], e.lecturas, e.zonas).texto, "7")
        XCTAssertEqual(Vivo.formatoDe(e.paso), "Death by · +1 cada 1′")
    }

    // MARK: - Lo que no se inventa

    @MainActor
    func testSinSensoresLasLecturasCallan() throws {
        let s = P.arranca(try P.seisPorMil(), entorno: .outdoor, zonas: nil)
        let e = estado(s)
        XCTAssertNil(e.zonas)
        XCTAssertNil(e.lecturas.ppm)
        XCTAssertNil(e.lecturas.ritmo)
        XCTAssertNil(e.lecturas.hecho)
        XCTAssertNil(e.lecturas.split500)
        let h = Vivo.heroeDeFamilia(e.paso, e.lecturas, nil)
        XCTAssertEqual(h.clase, .crono, "sin GPS ni metros, lo que llevas")
        XCTAssertEqual(Vivo.laminaDelPaso(e.paso, e.lecturas, nil).banda?.marca, nil)
    }
}
