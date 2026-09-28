import XCTest
@testable import FAHYBRIK

// LA FAMILIA CIRCUITO, CONTRA EL CONTRATO — el plan real (`VivoPlanesCircuito`)
// pasa por el adaptador (`Vivo.planDe`) y la cabecera, la acción y la ronda
// salen como en `screens/iphone-vivo-circuito` (`texto.ts`, `casos.ts`).
final class VivoCircuitoTests: XCTestCase {

    private typealias C = VivoPlanesCircuito

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

        XCTAssertEqual(Vivo.tituloCircuito(ski, .rondas), ["SkiErg", "500 m"])
        XCTAssertEqual(Vivo.formatoCircuito(ski, .rondas), ["Circuito", "Ronda 1/5"])
        XCTAssertEqual(Vivo.tituloCircuito(run2, .rondas), ["Run", "1000 m"])
        XCTAssertEqual(Vivo.formatoCircuito(desc, .rondas), ["Circuito", "Ronda 1/5"])
        XCTAssertEqual(Vivo.tituloCircuito(p[6], .rondas), ["Burpee Broad Jump"], "sin medir: la dosis va al trabajo")

        XCTAssertEqual(Vivo.claveCircuito(ski), .estacionHecha)
        XCTAssertEqual(Vivo.claveCircuito(run2), .cerrarElTramo)
        XCTAssertEqual(Vivo.claveCircuito(desc), .empezarYa)

        // «Luego · Descanso · 90″ · después Ronda 2/5 · Run · 1000 m a RPE 8».
        let luego = Vivo.luegoDe(p, 2)
        XCTAssertEqual(luego?.despues, "Ronda 2/5 · Run · 1000 m a RPE 8")
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
        XCTAssertEqual(Vivo.formatoCircuito(p[1], .rondas), ["Circuito", "Ronda 1/5", "Estación 1/3"])
    }

    // MARK: - HYROX con Roxzone

    func testHyrox_roxzoneComoPaso() throws {
        let p = pasos(try C.hyrox())
        XCTAssertEqual(p.count, 8 + 8 + 8 + 7)
        let run1 = p[0], entrada = p[1], ski = p[2], salida = p[3]
        XCTAssertEqual(Vivo.tituloCircuito(run1, .hyrox), ["Run 1/8", "1000 m"])
        XCTAssertEqual(Vivo.formatoCircuito(run1, .hyrox), ["HYROX"])
        XCTAssertEqual(entrada.clase, .roxzone)
        XCTAssertEqual(entrada.roxzone, .entrada)
        XCTAssertEqual(Vivo.formatoCircuito(entrada, .hyrox), ["HYROX", "Estación 1/8"])
        XCTAssertEqual(Vivo.claveCircuito(entrada), .empiezo)
        XCTAssertEqual(ski.posicion?.estacion, Vivo.Contador(n: 1, de: 8))
        XCTAssertEqual(Vivo.tituloCircuito(ski, .hyrox), ["SkiErg", "1000 m"])
        XCTAssertEqual(salida.roxzone, .salida)
        XCTAssertEqual(Vivo.formatoCircuito(salida, .hyrox), ["HYROX", "Ronda 1/8"])
        XCTAssertEqual(Vivo.claveCircuito(salida), .salgoACorrer)
        let sled = p[6]
        XCTAssertEqual(sled.nombre, "Sled Push")
        XCTAssertEqual(Vivo.formatoCircuito(sled, .hyrox), ["HYROX", "Estación 2/8"])
        XCTAssertEqual(Vivo.tituloCircuito(sled, .hyrox), ["Sled Push"])
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
        XCTAssertEqual(Vivo.tituloCircuito(sin, .hyrox), ["SkiErg"])
        let con = Vivo.pasoSegunEnlace(ski, Vivo.Dispositivos(maquina: .ski, pulsometro: .banda))
        XCTAssertEqual(con.medida.mide, .ergo)
    }

    // MARK: - El continuo: tres tramos

    func testContinuo_tresTramos() throws {
        let p = pasos(try C.continuo())
        XCTAssertEqual(p.count, 3)
        XCTAssertEqual(p.map { $0.posicion?.tramo?.n }, [1, 2, 3])
        XCTAssertEqual(p.map(\.maquina?.tipo), [.remo, .ski, .bici])
        XCTAssertEqual(Vivo.posicionDe(p[0]), ["Remo", "tramo 1/3"])
        XCTAssertEqual(Vivo.formatoDe(p[0]), "Continuo")
        XCTAssertEqual(Vivo.luegoDe(p, 0)?.que, "Ski · 15′ a Z2")
    }

    // MARK: - El libre, igual

    func testLibre_mismoObjeto() throws {
        let p = pasos(try C.libre())
        XCTAssertEqual(p.count, 12)
        let wb = p[4]
        XCTAssertEqual(wb.nombre, "Wall Balls")
        XCTAssertEqual(Vivo.formatoCircuito(wb, .rondas), ["Circuito", "Ronda 2/4", "Estación 1/2"])
        XCTAssertEqual(Vivo.tituloCircuito(p[5], .rondas), ["Row", "500 m"])
        XCTAssertEqual(Vivo.formatoCircuito(p[5], .rondas), ["Circuito", "Ronda 2/4", "Estación 2/2"])
    }
}
