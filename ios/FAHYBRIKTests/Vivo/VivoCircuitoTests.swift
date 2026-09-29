import XCTest
@testable import FAHYBRIK

// LA FAMILIA CIRCUITO, CONTRA EL CONTRATO — el plan real (`VivoPlanesCircuito`)
// pasa por el adaptador (`Vivo.planDe`) y la cabecera, la acción y la ronda
// salen como en `screens/iphone-vivo-circuito` (`texto.ts`, `casos.ts`).
final class VivoCircuitoTests: XCTestCase {

    private typealias C = VivoPlanesCircuito

    /// El kit une cifra y unidad con espacio fino (NBSP): aquí se compara el texto.
    private func t(_ x: [String]) -> [String] { x.map { $0.replacingOccurrences(of: "\u{00A0}", with: " ") } }
    private func t(_ x: String?) -> String? { x?.replacingOccurrences(of: "\u{00A0}", with: " ") }

    private func pasos(_ plan: WorkoutPlan) -> [Vivo.Paso] {
        Vivo.planDe(plan, zonas: VivoPlanesDePrueba.zonas(), entorno: .outdoor).pasos
    }

    // MARK: - 493 · cada Run abre una ronda

    func test493_rondasPorCarrera() throws {
        let p = pasos(try C.sesion493())
        // Calentamiento + 5 × (Run + estación) + 4 descansos (tras la última, ninguno).
        XCTAssertEqual(p.count, 1 + 10 + 4)
        let run1 = p[1], ski = p[2], desc = p[3], run2 = p[4]
        XCTAssertEqual(run1.clase, .carrera)
        XCTAssertEqual(run1.posicion?.ronda, Vivo.Contador(n: 1, de: 5))
        XCTAssertNil(run1.posicion?.estacion)
        XCTAssertEqual(ski.posicion?.ronda, Vivo.Contador(n: 1, de: 5))
        XCTAssertEqual(ski.posicion?.estacion, Vivo.Contador(n: 1, de: 1))
        XCTAssertEqual(desc.rol, .descanso)
        XCTAssertEqual(desc.posicion?.ronda, Vivo.Contador(n: 1, de: 5))
        XCTAssertEqual(run2.posicion?.ronda, Vivo.Contador(n: 2, de: 5))

        XCTAssertEqual(t(Vivo.tituloCircuito(ski, .rondas)), ["SkiErg", "500 m"])
        XCTAssertEqual(t(Vivo.formatoCircuito(ski, .rondas)), ["Circuito", "Ronda 1/5"])
        XCTAssertEqual(t(Vivo.tituloCircuito(run2, .rondas)), ["Run", "1000 m"])
        XCTAssertEqual(t(Vivo.formatoCircuito(desc, .rondas)), ["Circuito", "Ronda 1/5"])
        XCTAssertEqual(t(Vivo.tituloCircuito(p[5], .rondas)), ["Burpee Broad Jump"], "sin medir: la dosis va al trabajo")

        XCTAssertEqual(Vivo.claveCircuito(ski), .estacionHecha)
        XCTAssertEqual(Vivo.claveCircuito(run2), .cerrarElTramo)
        XCTAssertEqual(Vivo.claveCircuito(desc), .empezarYa)

        // «Luego · Descanso · 90″ · después Ronda 2/5 · Run · 1000 m a RPE 8».
        let luego = Vivo.luegoDe(p, 2)
        XCTAssertEqual(t(luego?.despues), "Ronda 2/5 · Run · 1000 m a RPE 8")
    }

    func test493_tiempoDeRonda() throws {
        let p = pasos(try C.sesion493())
        let parciales = [Vivo.Parcial(i: 4, segundos: 268, metros: 1000, ppm: nil, hecho: nil)]
        XCTAssertEqual(Vivo.tiempoDeRonda(p, 5, parciales, 90), 358, "ronda 2 = Run 2 + lo que va de la estación")
    }

    // MARK: - 492 · rondas de trineo

    func test492_estacionesYDescansoConPosicion() throws {
        let p = pasos(try C.sesion492())
        XCTAssertEqual(p[0].posicion?.ronda, Vivo.Contador(n: 1, de: 5))
        XCTAssertEqual(p[0].posicion?.estacion, Vivo.Contador(n: 1, de: 3))
        XCTAssertEqual(p[1].rol, .descanso)
        XCTAssertEqual(t(Vivo.formatoCircuito(p[1], .rondas)), ["Circuito", "Ronda 1/5", "Estación 1/3"])
    }

    // MARK: - HYROX con Roxzone

    func testHyrox_roxzoneComoPaso() throws {
        let p = pasos(try C.hyrox())
        XCTAssertEqual(p.count, 8 + 8 + 8 + 7)
        let run1 = p[0], entrada = p[1], ski = p[2], salida = p[3]
        XCTAssertEqual(t(Vivo.tituloCircuito(run1, .hyrox)), ["Run 1/8", "1000 m"])
        XCTAssertEqual(t(Vivo.formatoCircuito(run1, .hyrox)), ["HYROX"])
        XCTAssertEqual(entrada.clase, .roxzone)
        XCTAssertEqual(entrada.roxzone, .entrada)
        XCTAssertEqual(t(Vivo.formatoCircuito(entrada, .hyrox)), ["HYROX", "Estación 1/8"])
        XCTAssertEqual(Vivo.claveCircuito(entrada), .empiezo)
        XCTAssertEqual(ski.posicion?.estacion, Vivo.Contador(n: 1, de: 8))
        XCTAssertEqual(t(Vivo.tituloCircuito(ski, .hyrox)), ["SkiErg", "1000 m"])
        XCTAssertEqual(salida.roxzone, .salida)
        XCTAssertEqual(t(Vivo.formatoCircuito(salida, .hyrox)), ["HYROX", "Ronda 1/8"])
        XCTAssertEqual(Vivo.claveCircuito(salida), .salgoACorrer)
        let sled = p[6]
        XCTAssertEqual(sled.nombre, "Sled Push")
        XCTAssertEqual(t(Vivo.formatoCircuito(sled, .hyrox)), ["HYROX", "Estación 2/8"])
        XCTAssertEqual(t(Vivo.tituloCircuito(sled, .hyrox)), ["Sled Push"])
        XCTAssertEqual(Vivo.avisoCircuito(p[4], .hyrox), "Run 2 cerrado")
        // La última estación no lleva Roxzone de salida: detrás no se corre.
        XCTAssertEqual(p.last?.nombre, "Wall Balls")
    }

    func testHyrox_sinRoxzoneComoAntes() throws {
        let p = pasos(try C.hyrox(roxzone: false))
        XCTAssertEqual(p.count, 16)
        XCTAssertEqual(p[8].posicion?.ronda, Vivo.Contador(n: 5, de: 8))
        XCTAssertEqual(p[9].posicion?.estacion, Vivo.Contador(n: 5, de: 8))
    }

    func testHyrox_sinMaquinaLoDicesTu() throws {
        let ski = pasos(try C.hyrox())[2]
        let sin = Vivo.pasoSegunEnlace(ski, Vivo.Dispositivos(pulsometro: .banda))
        XCTAssertEqual(sin.medida.mide, .atleta)
        XCTAssertEqual(t(Vivo.tituloCircuito(sin, .hyrox)), ["SkiErg"])
        let con = Vivo.pasoSegunEnlace(ski, Vivo.Dispositivos(maquina: .ski, pulsometro: .banda))
        XCTAssertEqual(con.medida.mide, .ergo)
    }

    // MARK: - El continuo: tres tramos

    func testContinuo_tresTramos() throws {
        let p = pasos(try C.continuo())
        XCTAssertEqual(p.count, 3)
        XCTAssertEqual(p.map { $0.posicion?.tramo?.n }, [1, 2, 3])
        XCTAssertEqual(p.map(\.maquina?.tipo), [.remo, .ski, .bici])
        XCTAssertEqual(t(Vivo.posicionDe(p[0])), ["Remo", "tramo 1/3"])
        XCTAssertEqual(Vivo.formatoDe(p[0]), "Continuo")
        XCTAssertEqual(t(Vivo.luegoDe(p, 0)?.que), "Ski · 15′ a Z2")
    }

    // MARK: - El libre, igual

    func testLibre_mismoObjeto() throws {
        let p = pasos(try C.libre())
        XCTAssertEqual(p.count, 12)
        let wb = p[4]
        XCTAssertEqual(wb.nombre, "Wall Balls")
        XCTAssertEqual(t(Vivo.formatoCircuito(wb, .rondas)), ["Circuito", "Ronda 2/4", "Estación 1/2"])
        XCTAssertEqual(t(Vivo.tituloCircuito(p[5], .rondas)), ["Row", "500 m"])
        XCTAssertEqual(t(Vivo.formatoCircuito(p[5], .rondas)), ["Circuito", "Ronda 2/4", "Estación 2/2"])
    }

    // MARK: - El motor: la estación empieza al acabar el descanso

    @MainActor
    func testLaEstacionTrasElDescansoNoCuentaElDescanso() throws {
        let s = VivoPlanesDePrueba.arranca(try C.sesion493())
        s.jumpTo(1); if s.isAwaitingBlockStart { s.beginBlock() }
        s.condCountInRemaining = 0
        s.lapElapsedSeconds += 270; s.markRoundDone()          // Run 1
        s.lapElapsedSeconds += 120; s.markRoundDone()          // SkiErg: entra el r90″
        XCTAssertEqual(s.fixedRestRemaining, 90)
        s.lapElapsedSeconds += 90; s.tickConditioning(dt: 90)  // el descanso se agota solo
        XCTAssertEqual(s.fixedRestRemaining, 0)
        s.lapElapsedSeconds += 10
        XCTAssertEqual(s.tramoElapsedSeconds, 10, accuracy: 1, "el Run 2 no cuenta los 90″ de descanso")
        s.stop()
    }

    @MainActor
    func testSaltarElDescansoReanclaLaEstacion() throws {
        let s = VivoPlanesDePrueba.arranca(try C.sesion493())
        s.jumpTo(1); if s.isAwaitingBlockStart { s.beginBlock() }
        s.condCountInRemaining = 0
        s.lapElapsedSeconds += 270; s.markRoundDone()
        s.lapElapsedSeconds += 120; s.markRoundDone()
        s.lapElapsedSeconds += 40; s.skipFixedRest()           // «Empezar ya» a los 40″
        s.lapElapsedSeconds += 5
        XCTAssertEqual(s.tramoElapsedSeconds, 5, accuracy: 1)
        s.stop()
    }

    @MainActor
    func testElContinuoPasaDeMaquinaSinCuentaAtras() throws {
        let s = VivoPlanesDePrueba.arranca(try C.continuo())
        XCTAssertGreaterThan(s.condCountInRemaining, 0, "el primer tramo sí lleva su 3-2-1")
        s.condCountInRemaining = 0
        s.lapElapsedSeconds += 900
        s.primaryAdvance()
        XCTAssertEqual(s.currentSegmentIndex, 1)
        XCTAssertFalse(s.isAwaitingBlockStart, "mismo bloque: sin puerta")
        XCTAssertEqual(s.condCountInRemaining, 0, "ni cuenta atrás: se cambia de máquina sin parar")
        s.stop()
    }

    // MARK: - La Estructura del circuito es la sesión entera

    func testEstructuraDelCircuito_laSesionEnteraConElCircuitoEnSuSitio() throws {
        let p = pasos(try C.sesion493ConVueltaALaCalma())
        let circuito = try XCTUnwrap(p.firstIndex { $0.clase == .estacion }, "la primera estación")
        let seg = p[circuito].origen?.segmento
        let piezas = Vivo.estructuraConCircuito(p, i: circuito)
        XCTAssertEqual(piezas.count, 3, "calentamiento · el circuito · vuelta a la calma: \(piezas)")
        guard case let .fila(antes) = piezas[0], case .circuito = piezas[1], case let .fila(despues) = piezas[2] else {
            return XCTFail("el circuito va entre sus bloques: \(piezas)")
        }
        XCTAssertEqual(antes.estado, .hecho)
        XCTAssertEqual(antes.fase, .calentamiento)
        XCTAssertEqual(despues.estado, .pendiente)
        // Cada fila de otro bloque lleva su salto (el mismo que en las demás familias).
        XCTAssertEqual(Vivo.segmentoDeSalto(antes, segmentoActual: seg), antes.trabajo.origen?.segmento)
        XCTAssertEqual(Vivo.segmentoDeSalto(despues, segmentoActual: seg), despues.trabajo.origen?.segmento)
        XCTAssertNotEqual(antes.trabajo.origen?.segmento, seg)
        XCTAssertNotEqual(despues.trabajo.origen?.segmento, seg)
    }

    func testEstructuraDelCircuito_laRutaSoloLlevaSuSegmento() throws {
        let p = pasos(try C.sesion493ConVueltaALaCalma())
        let circuito = try XCTUnwrap(p.firstIndex { $0.clase == .estacion })
        let seg = p[circuito].origen?.segmento
        let ruta = Vivo.rutaDelCircuito(p, i: circuito, parciales: [], terminado: false, hyrox: false)
        let indices = ruta.compactMap { f -> Int? in if case let .paso(j, _, _, _, _) = f { return j }; return nil }
        XCTAssertFalse(indices.isEmpty)
        XCTAssertTrue(indices.allSatisfy { p[$0].origen?.segmento == seg },
                      "ni el calentamiento ni la vuelta a la calma entran en la ruta: son sus filas")
        XCTAssertTrue(ruta.contains(.ronda(n: 1, de: 2)), "las rondas del coach siguen agrupando")
    }

    func testEstructuraDelCircuito_sinOtrosBloquesEsSoloLaRuta() throws {
        let p = pasos(try C.sesion492())
        XCTAssertEqual(Vivo.estructuraConCircuito(p, i: 0), [.circuito])
    }
}

