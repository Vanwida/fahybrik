import XCTest
@testable import FAHYBRIK

// EL CERO DE LA ALTITUD. El barómetro mide bien cuánto subes pero no sabe desde
// dónde; el GPS sabe desde dónde pero mide fatal. Estas pruebas fijan el reparto: la
// forma la pone el barómetro, el cero lo pone el GPS, y sin cero no sale nada.
final class RunAltitudeAnchorTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_760_000_000)
    private func at(_ s: Int) -> Date { t0.addingTimeInterval(Double(s)) }

    /// Un fix del GPS decente, para no repetir los mismos números en cada prueba.
    private func goodFix(_ meters: Double) -> (Double, Double) { (meters, 8.0) }

    // MIENTRAS NO HAY CERO, NO SE EMITE NADA. Un gimnasio, un permiso denegado: la
    // señal no existe en vez de existir mintiendo.
    func testNothingComesOutBeforeTheAnchor() {
        var a = RunAltitudeAnchor()
        for second in 0..<10 {
            XCTAssertTrue(a.barometric(relativeMeters: Double(second) * 0.4, at: at(second)).isEmpty)
        }
        XCTAssertFalse(a.isAnchored)
    }

    // Hacen falta VARIAS parejas antes de congelar el cero: con una sola, un fix
    // disparatado desplazaría la carrera entera.
    func testOneFixIsNotEnoughToAnchor() {
        var a = RunAltitudeAnchor()
        _ = a.barometric(relativeMeters: 0, at: at(0))
        let (m, acc) = goodFix(100)
        XCTAssertTrue(a.gps(meters: m, verticalAccuracy: acc).isEmpty)
        XCTAssertFalse(a.isAnchored)
    }

    // EN CUANTO HAY CERO SALE TODO LO QUE ESPERABA, cada lectura en SU instante. No es
    // rellenar el eje: son muestras que se tomaron de verdad y a las que sólo les
    // faltaba saber su origen.
    func testPendingReadingsFlushWithTheirOwnInstants() {
        var a = RunAltitudeAnchor()
        // Tres segundos de barómetro antes de que el GPS diga nada útil.
        _ = a.barometric(relativeMeters: 0.0, at: at(0))
        _ = a.barometric(relativeMeters: 1.0, at: at(1))
        _ = a.barometric(relativeMeters: 2.0, at: at(2))

        // Cinco fixes a 102 m con el barómetro en 2,0 → el cero es 100.
        var flushed: [RunAltitudeAnchor.Reading] = []
        for _ in 0..<RunAltitudeAnchor.anchorSamples {
            flushed = a.gps(meters: 102, verticalAccuracy: 8)
        }

        XCTAssertTrue(a.isAnchored)
        XCTAssertEqual(a.anchor, 100)
        XCTAssertEqual(flushed.count, 3, "las tres lecturas que esperaban")
        XCTAssertEqual(flushed.map(\.metersAboveSeaLevel), [100, 101, 102])
        XCTAssertEqual(flushed.map(\.at), [at(0), at(1), at(2)], "cada una en su segundo, no en el de ahora")
    }

    // Con el cero puesto, cada lectura del barómetro sale al momento y absoluta.
    func testAfterAnchoringEveryReadingComesOutAbsolute() {
        var a = anchored(at: 100)
        let out = a.barometric(relativeMeters: 12.5, at: at(60))
        XCTAssertEqual(out.count, 1)
        XCTAssertEqual(out[0].metersAboveSeaLevel, 112.5)
        XCTAssertEqual(out[0].at, at(60))
    }

    // MEDIANA Y NO MEDIA: un fix disparatado entre cinco no mueve el cero. Con la
    // media, ese único 400 m habría desplazado la carrera entera 60 metros.
    func testAWildFixDoesNotMoveTheZero() {
        var a = RunAltitudeAnchor()
        _ = a.barometric(relativeMeters: 0, at: at(0))
        for meters in [100.0, 101.0, 400.0, 99.0, 100.0] {
            _ = a.gps(meters: meters, verticalAccuracy: 8)
        }
        XCTAssertEqual(a.anchor, 100, "la mediana de [99,100,100,101,400] es 100")
    }

    // Un fix con vertical inválida (negativa) o mala no vale ni para poner un cero.
    func testBadVerticalAccuracyIsNotUsed() {
        var a = RunAltitudeAnchor()
        _ = a.barometric(relativeMeters: 0, at: at(0))
        for _ in 0..<20 {
            _ = a.gps(meters: 100, verticalAccuracy: -1)       // no la sabe
            _ = a.gps(meters: 100, verticalAccuracy: 120)      // demasiado mala
        }
        XCTAssertFalse(a.isAnchored, "sin un fix decente no hay cero, y sin cero no hay altitud")
    }

    // Un fix que llega ANTES de la primera lectura del barómetro no forma pareja:
    // sin saber cuánto marcaba el barómetro en ese instante no hay diferencia que sacar.
    func testAFixWithoutABarometricPartnerIsIgnored() {
        var a = RunAltitudeAnchor()
        for _ in 0..<10 { _ = a.gps(meters: 100, verticalAccuracy: 5) }
        XCTAssertFalse(a.isAnchored)
    }

    // EL CERO SE CONGELA. Recalcularlo a mitad de carrera desplazaría la parte ya
    // emitida y la curva daría un escalón que nadie subió.
    func testTheZeroIsFrozen() {
        var a = anchored(at: 100)
        for _ in 0..<10 { _ = a.gps(meters: 500, verticalAccuracy: 3) }
        XCTAssertEqual(a.anchor, 100)
        XCTAssertEqual(a.barometric(relativeMeters: 0, at: at(99))[0].metersAboveSeaLevel, 100)
    }

    // La espera está acotada: si en dos minutos no llega un fix con altura decente, esa
    // carrera no va a tener altitud y no vamos a llenar la memoria esperándola.
    func testTheWaitingBufferIsBounded() {
        var a = RunAltitudeAnchor()
        let overflow = RunAltitudeAnchor.maxPendingReadings + 50
        for second in 0..<overflow {
            _ = a.barometric(relativeMeters: Double(second), at: at(second))
        }
        var flushed: [RunAltitudeAnchor.Reading] = []
        for _ in 0..<RunAltitudeAnchor.anchorSamples {
            flushed = a.gps(meters: Double(overflow - 1), verticalAccuracy: 8)
        }
        XCTAssertEqual(flushed.count, RunAltitudeAnchor.maxPendingReadings)
        XCTAssertEqual(flushed.last?.at, at(overflow - 1), "lo que sale es lo MÁS RECIENTE")
    }

    // Una lectura no finita del sensor no entra ni como pendiente.
    func testNonFiniteReadingsAreIgnored() {
        var a = RunAltitudeAnchor()
        XCTAssertTrue(a.barometric(relativeMeters: .nan, at: at(0)).isEmpty)
        for _ in 0..<10 { _ = a.gps(meters: 100, verticalAccuracy: 5) }
        XCTAssertFalse(a.isAnchored, "una lectura NaN no forma pareja con nada")
    }

    func testMedian() {
        XCTAssertEqual(RunAltitudeAnchor.median([3, 1, 2]), 2)
        XCTAssertEqual(RunAltitudeAnchor.median([4, 1, 3, 2]), 2.5)
        XCTAssertEqual(RunAltitudeAnchor.median([7]), 7)
        XCTAssertEqual(RunAltitudeAnchor.median([]), 0)
    }

    /// Un ancla ya congelada en `meters`, con el barómetro en cero.
    private func anchored(at meters: Double) -> RunAltitudeAnchor {
        var a = RunAltitudeAnchor()
        _ = a.barometric(relativeMeters: 0, at: t0)
        for _ in 0..<RunAltitudeAnchor.anchorSamples {
            _ = a.gps(meters: meters, verticalAccuracy: 8)
        }
        return a
    }
}
