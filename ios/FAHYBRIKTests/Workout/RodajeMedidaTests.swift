import XCTest
@testable import FAHYBRIK

// FH-33 — Vivo/Datos: Apple meters or an honest hole. Never the plan target.
final class RodajeMedidaTests: XCTestCase {

    private func calle(
        metros: Double? = nil,
        ritmo: Int? = nil,
        objetivoM: Double? = nil,
        objetivoS: Double? = nil,
        segundos: Double = 90,
        serie: Bool = false
    ) -> RodajeMedida.Entrada {
        RodajeMedida.Entrada(
            esCalle: true,
            metrosApple: metros,
            ritmoSecPorKm: ritmo,
            objetivoMetros: objetivoM,
            objetivoSegundos: objetivoS,
            segundosPieza: segundos,
            esSerie: serie
        )
    }

    // 1. Calle, no Apple meters → clock + sin señal. No 0,00.
    func testCalleSinMetrosNoInventaCero() {
        let l = RodajeMedida.vivo(calle(objetivoM: 5_000, segundos: 42))
        XCTAssertEqual(l.sujeto, WatchFormat.clock(42))
        XCTAssertTrue(l.notaSinSenal)
        XCTAssertNil(l.ritmoSecPorKm)
        XCTAssertFalse(l.sujeto.contains("0,00"))
        XCTAssertNotEqual(l.sujeto, "5000")
        XCTAssertNotEqual(l.unidad, "km")
    }

    // 2. Calle + Apple meters → remaining of the piece + pace.
    func testCalleConMetrosMueveElRestante() {
        let l = RodajeMedida.vivo(calle(metros: 1_200, ritmo: 300, objetivoM: 5_000))
        XCTAssertEqual(l.sujeto, WatchDistancia.cifra(3_800))
        XCTAssertEqual(l.unidad, WatchDistancia.unidad(3_800))
        XCTAssertEqual(l.ritmoSecPorKm, 300)
        XCTAssertTrue(l.quedan)
        XCTAssertFalse(l.notaSinSenal)
    }

    // 3. Meters arrived; pace 0 is not a reading.
    func testTrasMetrosUnRitmoCeroNoSePinta() {
        let l = RodajeMedida.vivo(calle(metros: 400, ritmo: 0, objetivoM: 1_000))
        XCTAssertNil(l.ritmoSecPorKm)
        XCTAssertFalse(l.notaSinSenal)
        XCTAssertNotEqual(l.sujeto, "0")
    }

    // 4. Indoor + Apple meters → Watch figure. Never "sin señal".
    func testIndoorConMetrosEsCifraWatch() {
        var e = calle(metros: 220, ritmo: 330, objetivoM: 1_000)
        e.esCalle = false
        let l = RodajeMedida.vivo(e)
        XCTAssertEqual(l.sujeto, WatchDistancia.cifra(780))
        XCTAssertEqual(l.ritmoSecPorKm, 330)
        XCTAssertFalse(l.notaSinSenal)
    }

    // 5. Indoor + no meters → hole, not the plan target.
    func testIndoorSinMetrosNoPintaElPlan() {
        var e = calle(objetivoM: 1_000, segundos: 15)
        e.esCalle = false
        let l = RodajeMedida.vivo(e)
        XCTAssertEqual(l.sujeto, WatchFormat.clock(15))
        XCTAssertFalse(l.notaSinSenal)
        XCTAssertNotEqual(l.sujeto, "1000")
        XCTAssertNotEqual(l.unidad, "m")
    }

    // 6. 5×500, covered nil → subject is the piece clock, not "500".
    func testSerieSinAppleNoCongelaElObjetivo() {
        let l = RodajeMedida.vivo(calle(objetivoM: 500, segundos: 8, serie: true))
        XCTAssertEqual(l.sujeto, WatchFormat.clock(8))
        XCTAssertNotEqual(l.sujeto, "500")
        XCTAssertTrue(l.notaSinSenal)
        XCTAssertFalse(l.quedan)
    }

    // 7. 5×500 + 180 m HK → remaining drops.
    func testSerieLosMetrosQueFaltanBajan() {
        let l = RodajeMedida.vivo(calle(metros: 180, ritmo: 295, objetivoM: 500, serie: true))
        XCTAssertEqual(l.sujeto, "320")
        XCTAssertEqual(l.unidad, "m")
        XCTAssertTrue(l.quedan)
        XCTAssertFalse(l.notaSinSenal)
    }

    func testEsCallePorDefectoYIndoorLoApaga() {
        XCTAssertTrue(RodajeMedida.esCalle(environment: nil))
        XCTAssertTrue(RodajeMedida.esCalle(environment: .outdoor))
        XCTAssertFalse(RodajeMedida.esCalle(environment: .indoor))
        XCTAssertFalse(RodajeMedida.esCalle(environment: .treadmill))
    }

    // 10. A cumulative HK sum produces a positive delta, never a 0 sample.
    func testDeltaDeDistanciaSoloSiAppleAvanza() {
        XCTAssertEqual(WatchHKActivityPlan.distanceDelta(fromCumulative: 12.5, lastReported: 0), 12.5)
        XCTAssertNil(WatchHKActivityPlan.distanceDelta(fromCumulative: 12.5, lastReported: 12.5))
        XCTAssertNil(WatchHKActivityPlan.distanceDelta(fromCumulative: 10, lastReported: 12.5))
    }
}
