import XCTest
@testable import FAHYBRIK

// EL RITMO ACTUAL, SIN GPS — funciones puras sobre muestras (t, metros
// acumulados): lo que corres AHORA (10 s), y NIL cuando no se sabe. Jamás un
// cero, jamás el último valor congelado, jamás un ritmo de alguien de pie.
final class VivoRitmoActualTests: XCTestCase {

    private typealias M = Vivo.MuestraDeDistancia

    /// Una muestra por segundo de `desde` a `hasta` a `v` m/s, partiendo de `m0`.
    private func rampa(_ v: Double, desde: Double = 0, hasta: Double, m0: Double = 0) -> [M] {
        stride(from: desde, through: hasta, by: 1).map { M(t: $0, metros: m0 + v * ($0 - desde)) }
    }

    private func ritmo(_ m: [M], ahora: Double) -> Double? { Vivo.ritmoActual(m, ahora: ahora) }

    // MARK: - Lo normal

    func testUnRitmoConstanteSeLeeEntero() throws {
        // 3 m/s = 333,3 s/km.
        let r = try XCTUnwrap(ritmo(rampa(3, hasta: 30), ahora: 30))
        XCTAssertEqual(r, 1000 / 3, accuracy: 0.01)
        // A 4 m/s (4:10/km).
        XCTAssertEqual(try XCTUnwrap(ritmo(rampa(4, hasta: 30), ahora: 30)), 250, accuracy: 0.01)
    }

    func testSoloCuentanLosUltimosDiezSegundos() throws {
        // 20 s a 3 m/s y luego 10 s a 4 m/s: «ahora» es 4 m/s, no la media.
        let m = rampa(3, hasta: 20) + rampa(4, desde: 21, hasta: 30, m0: 60 + 4)
        XCTAssertEqual(try XCTUnwrap(ritmo(m, ahora: 30)), 250, accuracy: 3)
        // Y un cambio a mitad de ventana pesa lo que dura dentro de ella: 5 s a cada ritmo.
        let mixto = rampa(3, hasta: 25) + rampa(4, desde: 26, hasta: 30, m0: 75 + 4)
        let esperado = 10 / ((5 * 3 + 5 * 4) / 1000.0)
        XCTAssertEqual(try XCTUnwrap(ritmo(mixto, ahora: 30)), esperado, accuracy: 6)
    }

    func testMuestrasEspaciadasComoLasDelBuilder() throws {
        // El builder entrega cada 5 s: 15 m por golpe = 3 m/s.
        let m = (0...6).map { M(t: Double($0) * 5, metros: Double($0) * 15) }
        XCTAssertEqual(try XCTUnwrap(ritmo(m, ahora: 30)), 1000 / 3, accuracy: 0.01)
    }

    func testLoQueAunNoHaPasadoNoCuenta() throws {
        let m = rampa(3, hasta: 30)
        XCTAssertEqual(try XCTUnwrap(ritmo(m, ahora: 20)), 1000 / 3, accuracy: 0.01, "las muestras de después de `ahora` se ignoran")
    }

    // MARK: - Cuando no se sabe: nil

    func testSinMuestrasOConUnaSolaNoHayRitmo() {
        XCTAssertNil(ritmo([], ahora: 10))
        XCTAssertNil(ritmo([M(t: 5, metros: 20)], ahora: 10))
        XCTAssertNil(ritmo(rampa(3, hasta: 30), ahora: .nan))
    }

    func testAlArrancarNoSeFiaDeUnSegundoDeDatos() {
        // 3 s de carrera a 3 m/s: 9 m y 3 s. Ni 10 m ni 5 s: nada que decir todavía.
        XCTAssertNil(ritmo(rampa(3, hasta: 3), ahora: 3))
        // Con 5 s de observación y 15 m ya sí.
        XCTAssertNotNil(ritmo(rampa(3, hasta: 5), ahora: 5))
        // 5 s pero 8 m: quieto o casi.
        XCTAssertNil(ritmo(rampa(1.6, hasta: 5), ahora: 5))
    }

    func testParadoElRitmoSeDegradaYDesaparece() throws {
        // Corres a 3 m/s hasta t = 10 y te paras: el builder deja de entregar.
        let m = rampa(3, hasta: 10)
        let a12 = try XCTUnwrap(ritmo(m, ahora: 12))
        let a14 = try XCTUnwrap(ritmo(m, ahora: 14))
        XCTAssertGreaterThan(a12, 1000 / 3, "ya no es el de antes")
        XCTAssertGreaterThan(a14, a12, "y cada segundo quieto va a peor")
        // Con menos de 10 m en la ventana, se calla.
        XCTAssertNil(ritmo(m, ahora: 17), "17 - 10 = 7: quedan 3 s de carrera = 9 m")
        XCTAssertNil(ritmo(m, ahora: 40), "quieto del todo: jamás el último valor congelado")
    }

    func testAndandoLentoDiezMetrosEsElSuelo() throws {
        // 1 m/s durante la ventana = 10 m = 16:40/km: es lo último que se dice.
        XCTAssertEqual(try XCTUnwrap(ritmo(rampa(1, hasta: 20), ahora: 20)), 1000, accuracy: 0.01)
        // 0,9 m/s = 9 m: no hay ritmo.
        XCTAssertNil(ritmo(rampa(0.9, hasta: 20), ahora: 20))
    }

    func testUnGpsQueSeCorrigeHaciaAtrasNoDaUnRitmoNegativoNiCero() throws {
        // A t = 15 la distancia retrocede 30 m: ese tramo no cuenta, el resto sí.
        var m = rampa(3, hasta: 14)
        m.append(M(t: 15, metros: 42 - 30))
        m += rampa(3, desde: 16, hasta: 30, m0: 12 + 3)
        let r = try XCTUnwrap(ritmo(m, ahora: 30))
        XCTAssertEqual(r, 1000 / 3, accuracy: 15)
        XCTAssertGreaterThan(r, 0)
    }

    // MARK: - Saltos y absurdos

    func testUnSaltoDelGpsSeDescartaSinTirarLaVentana() throws {
        // A t = 25 el GPS salta 300 m en 1 s (300 m/s), en mitad de la ventana: ese tramo no es correr.
        var m = rampa(3, hasta: 24)
        m.append(M(t: 25, metros: 72 + 300))
        m += rampa(3, desde: 26, hasta: 30, m0: 372 + 3)
        XCTAssertEqual(try XCTUnwrap(ritmo(m, ahora: 30)), 1000 / 3, accuracy: 0.5)
    }

    func testUnRitmoAbsurdoNoSeDa() {
        // 20 m/s constantes (3:20 cada 1000 m... a 50 s/km): nadie corre así, es un GPS roto.
        XCTAssertNil(ritmo(rampa(20, hasta: 30), ahora: 30))
        // El límite es el de un esprínter de élite: 11 m/s se cree, 12 no.
        XCTAssertNotNil(ritmo(rampa(11, hasta: 30), ahora: 30))
        XCTAssertNil(ritmo(rampa(12, hasta: 30), ahora: 30))
    }

    func testTiemposRepetidosODesordenadosNoRompenNada() throws {
        let m = [M(t: 0, metros: 0), M(t: 5, metros: 15), M(t: 5, metros: 90), M(t: 3, metros: 999), M(t: 10, metros: 30), M(t: 15, metros: .infinity), M(t: 20, metros: 60)]
        let r = try XCTUnwrap(ritmo(m, ahora: 20))
        XCTAssertEqual(r, 1000 / 3, accuracy: 0.5, "el orden se respeta, lo repetido se ignora, lo infinito no cuenta")
    }

    /// Sea lo que sea lo que llegue: o no se sabe, o es un número creíble. Nunca cero, nunca infinito.
    func testJamasUnCeroNiUnInfinito() {
        var semilla: UInt64 = 42
        func azar() -> Double {
            semilla = semilla &* 6364136223846793005 &+ 1442695040888963407
            return Double(semilla >> 33) / Double(1 << 31)
        }
        for _ in 0..<400 {
            var t = 0.0
            var metros = 0.0
            var m: [M] = []
            for _ in 0..<Int(azar() * 30) {
                t += azar() * 6
                metros += (azar() - 0.15) * 40
                m.append(M(t: t, metros: Swift.max(0, metros)))
            }
            if let r = ritmo(m, ahora: t + azar() * 12) {
                XCTAssertTrue(r.isFinite && r > 0 && r <= Vivo.RitmoActual.techoS, "\(r)")
                XCTAssertGreaterThanOrEqual(r, 1000 / Vivo.RitmoActual.velocidadMaximaMS - 1e-9)
            }
        }
    }

    func testElTechoEsElDeHonestidadDeLaApp() {
        XCTAssertEqual(Vivo.RitmoActual.techoS, 1200)
        XCTAssertEqual(Vivo.RitmoActual.techoS, Vivo.ritmoTechoS)
        XCTAssertEqual(Vivo.RitmoActual.ventanaS, 10)
        XCTAssertEqual(Vivo.RitmoActual.metrosMinimos, 10)
    }

    // MARK: - La cola que llena el reloj

    func testLaColaDaElMismoRitmoQueLaFuncion() throws {
        var v = Vivo.VentanaDeRitmo()
        for s in stride(from: 0.0, through: 40, by: 1) { v.anotar(t: s, metros: 3.5 * s) }
        XCTAssertEqual(try XCTUnwrap(v.ritmo(ahora: 40)), 1000 / 3.5, accuracy: 0.01)
    }

    func testLaColaAcumulaDeltasComoLosDelBuilder() throws {
        var v = Vivo.VentanaDeRitmo()
        for s in stride(from: 5.0, through: 60, by: 5) { v.anotar(t: s, deltaMetros: 15) }
        XCTAssertEqual(try XCTUnwrap(v.ritmo(ahora: 60)), 1000 / 3, accuracy: 0.01)
        v.anotar(t: 65, deltaMetros: -5)
        XCTAssertEqual(v.muestras.last?.metros, 180, "un delta negativo no entra")
    }

    func testLaColaNoCreceSinLimite() {
        var v = Vivo.VentanaDeRitmo()
        for s in 0..<5000 { v.anotar(t: Double(s) / 4, metros: Double(s) * 0.75) }
        XCTAssertLessThanOrEqual(v.muestras.count, 45, "solo la ventana y una muestra de origen")
        XCTAssertNotNil(v.ritmo(ahora: 1250))
    }

    func testLaColaSeReiniciaEntreSesiones() {
        var v = Vivo.VentanaDeRitmo()
        for s in 0...30 { v.anotar(t: Double(s), metros: 3 * Double(s)) }
        v.reiniciar()
        XCTAssertNil(v.ritmo(ahora: 30))
        XCTAssertTrue(v.muestras.isEmpty)
    }
}
