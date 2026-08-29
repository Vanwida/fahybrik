import XCTest
@testable import FAHYBRIK

// EL KILÓMETRO, DETECTADO UNA SOLA VEZ.
//
// El cursor vivía en `RunCueEngine` (el cerebro del audio) y lo empujaban los dos
// modelos de HUD, calle y cinta, cada uno desde su timer de medio segundo y con su
// propia idea de los metros y del tiempo del tramo. Aquí se prueba el detector puro;
// `WorkoutSessionKmSplitTests` prueba que el motor lo llama donde entran los metros y
// que lo reinicia al cambiar de tramo — el reinicio que en la calle no existía.
final class RunKmSplitsTests: XCTestCase {

    func testUnParcialPorKilometro() {
        var c = RunKmSplits()
        XCTAssertNil(c.step(coveredMeters: 500, elapsedSeconds: 150))     // aún km 0
        let uno = c.step(coveredMeters: 1000, elapsedSeconds: 300)
        XCTAssertEqual(uno?.km, 1)
        XCTAssertEqual(uno?.splitSeconds, 300)
        XCTAssertNil(c.step(coveredMeters: 1500, elapsedSeconds: 450))    // sigue el km 1
        let dos = c.step(coveredMeters: 2000, elapsedSeconds: 610)
        XCTAssertEqual(dos?.km, 2)
        XCTAssertEqual(dos?.splitSeconds, 310)                            // el SUYO, no los 610
    }

    // En un kilómetro, el ritmo por kilómetro ES el parcial. No hay regla de tres.
    func testElRitmoDeUnKilometroEsSuParcial() {
        var c = RunKmSplits()
        let s = c.step(coveredMeters: 1000, elapsedSeconds: 287.4)
        XCTAssertEqual(s?.paceSecPerKm, 287)
    }

    func testElReinicioVuelveAlKilometroUno() {
        var c = RunKmSplits()
        _ = c.step(coveredMeters: 1000, elapsedSeconds: 300)
        _ = c.step(coveredMeters: 2000, elapsedSeconds: 600)
        c.reset()
        XCTAssertEqual(c.step(coveredMeters: 1000, elapsedSeconds: 300)?.km, 1)
    }

    // SALTARSE DOS KILÓMETROS NO PRODUCE PARCIAL. Con un salto de GPS no se sabe qué
    // costó cada uno, y repartir los segundos a medias sería fabricar dos ritmos que
    // nadie midió. El cursor se re-ancla y el siguiente vuelve a ser medible.
    func testUnSaltoDeVariosKilometrosNoInventaRitmos() {
        var c = RunKmSplits()
        XCTAssertNil(c.step(coveredMeters: 2100, elapsedSeconds: 620))
        let tres = c.step(coveredMeters: 3000, elapsedSeconds: 900)
        XCTAssertEqual(tres?.km, 3)
        XCTAssertEqual(tres?.splitSeconds, 280)
    }

    // Un reloj congelado (el tramo no mide) no puede producir un parcial de cero.
    func testSinTiempoTranscurridoNoHayParcial() {
        var c = RunKmSplits()
        XCTAssertNil(c.step(coveredMeters: 1000, elapsedSeconds: 0))
    }

    // Retroceder no reabre un kilómetro ya cantado (una corrección de la distancia
    // acumulada no puede hacer que el reloj lo anuncie dos veces).
    func testRetrocederNoRepiteElParcial() {
        var c = RunKmSplits()
        XCTAssertEqual(c.step(coveredMeters: 1000, elapsedSeconds: 300)?.km, 1)
        XCTAssertNil(c.step(coveredMeters: 980, elapsedSeconds: 305))
        XCTAssertNil(c.step(coveredMeters: 1000, elapsedSeconds: 310))
    }
}
