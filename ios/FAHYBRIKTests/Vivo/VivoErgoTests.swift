import XCTest
@testable import FAHYBRIK

// LA FAMILIA ERGO CONTRA EL CONTRATO — los planes de `VivoPlanesErgo` por el
// adaptador real (`Vivo.planDe`) y las reglas nuevas del kit (`Vivo+Entrada`):
// lo que la cabecera, el héroe y la acción del doble dicen, dicho aquí.
final class VivoErgoTests: XCTestCase {

    private typealias P = VivoPlanesDePrueba

    /// La posición con espacios normales (el kit usa el duro «500\u{00A0}m»).
    private func pos(_ p: Vivo.Paso) -> [String] { Vivo.posicionDe(p).map { $0.replacingOccurrences(of: "\u{00A0}", with: " ") } }

    private func pasos(_ plan: WorkoutPlan, test: Bool = false) -> [Vivo.Paso] {
        Vivo.planDe(plan, zonas: P.zonas(), entorno: nil, test: test).pasos
    }

    func testRemoSeriesEnPasos() throws {
        let ps = pasos(try P.remoSeries())
        XCTAssertEqual(ps.count, 9, "5 series + 4 recuperaciones")
        let s3 = ps[4]
        XCTAssertEqual(s3.clase, .ergo)
        XCTAssertEqual(s3.maquina?.tipo, .remo)
        XCTAssertNil(s3.nombre, "«Row Erg» no es palabra de box: la cabecera dice «Remo»")
        XCTAssertEqual(pos(s3), ["Remo", "Serie 3/5", "500 m"])
        XCTAssertEqual(Vivo.formatoDe(s3), "Series")
        XCTAssertEqual(Vivo.principal(s3)?.eje, .split500)
        XCTAssertEqual(Vivo.principal(s3)?.min, 112)
        XCTAssertEqual(Vivo.principal(s3)?.max, 116)
        XCTAssertEqual(ps[5].rol, .recuperacion)
        XCTAssertEqual(ps[5].modoRecupera, .parado)
        XCTAssertEqual(pos(ps[5]), ["Recupera", "parado", "2′"])
        XCTAssertEqual(Vivo.clavePorDefecto(s3), .siguientePaso, "el remo cierra la serie solo")
    }

    func testSkiPorCalorias() throws {
        let s2 = pasos(try P.skiCalorias())[2]
        XCTAssertEqual(s2.nombre, "SkiErg")
        XCTAssertEqual(s2.medida.tipo, .cal)
        XCTAssertEqual(s2.medida.mide, .ergo)
        XCTAssertEqual(pos(s2), ["SkiErg", "Serie 2/5", "25 cal"])
        let l = Vivo.Lecturas(t: 44, hecho: 15, ppm: 166, split500: 118, vatios: 215, cadencia: 39, cal: 15)
        let h = Vivo.heroeDeFamilia(s2, l, nil)
        XCTAssertEqual(h.texto, "10")
        XCTAssertEqual(h.unidad, "cal")
        let claves = Vivo.metricasDelPaso(s2, l, heroe: h.clase, nil).map(\.clave)
        XCTAssertEqual(claves, [.split, .cadencia, .pulso, .vatios], "las calorías no se repiten: un dato, un sitio")
    }

    func testBiciPorMilEnLaBanda() throws {
        let p = pasos(try P.biciContinuo())[0]
        XCTAssertEqual(p.maquina?.tipo, .bici)
        XCTAssertEqual(Vivo.formatoDe(p), "Continuo")
        let o = try XCTUnwrap(Vivo.principal(p))
        XCTAssertEqual(o.eje, .split500, "el /km de una máquina viaja en s/500")
        XCTAssertEqual(o.min, 62.5)
        XCTAssertEqual(o.max, 65)
        XCTAssertEqual(Vivo.fmtObjetivo(o, p.maquina), "2:05–2:10 /1000")
        XCTAssertEqual(pos(p), ["BikeErg", "20′"])
        let l = Vivo.Lecturas(t: 440, split500: 64, vatios: 249, cadencia: 87, cal: 161)
        let unidades = Vivo.metricasDelPaso(p, l, heroe: .split, nil).compactMap(\.unidad)
        XCTAssertTrue(unidades.contains("rpm"))
    }

    func testRemoAZona() throws {
        let p = pasos(try P.remoZona())[0]
        XCTAssertEqual(Vivo.principal(p)?.eje, .zona)
        XCTAssertEqual(pos(p), ["Remo", "Z2", "30′"])
        XCTAssertEqual(p.medida.mide, .ergo, "el continuo en el remo: el monitor manda sus lecturas")
        let l = Vivo.Lecturas(t: 612, ppm: 146, split500: 129, vatios: 165, cadencia: 23, cal: 165)
        XCTAssertEqual(Vivo.metricasDelPaso(p, l, heroe: .pulso, nil).map(\.clave), [.split, .cadencia, .cal, .vatios])
    }

    func testTestSinTotalYConNombreDeBox() throws {
        let p = pasos(try P.testRemo(), test: true)[0]
        XCTAssertEqual(p.clase, .test)
        XCTAssertEqual(pos(p), ["Remo", "2000 m"])
        XCTAssertEqual(Vivo.formatoDe(p), "Test")
    }

    // MARK: - Sin la máquina: lo dices tú

    func testSinMaquinaLoDicesTu() throws {
        let base = Vivo.planDe(try P.remoSeries(), zonas: P.zonas(), entorno: nil)
        let sin = Vivo.segunEnlace(base, maquina: nil).pasos[4]
        XCTAssertEqual(sin.medida.mide, .atleta)
        XCTAssertEqual(sin.cierre, .atleta)
        XCTAssertEqual(Vivo.clavePorDefecto(sin), .serieHecha)
        let l = Vivo.Lecturas(t: 43, ppm: 168)
        let h = Vivo.heroeDeFamilia(sin, l, nil)
        XCTAssertEqual(h.clase, .crono)
        XCTAssertEqual(h.etiqueta, "lo dices tú")
        XCTAssertEqual(Vivo.metricasDelPaso(sin, l, heroe: h.clase, nil).map(\.clave), [.pulso])
        // Con el remo enlazado no cambia nada; la recuperación nunca cambia.
        XCTAssertEqual(Vivo.segunEnlace(base, maquina: .remo), base)
        XCTAssertEqual(Vivo.segunEnlace(base, maquina: nil).pasos[5], base.pasos[5])
    }

    func testContinuoPorTiempoSinMaquinaNoCambia() throws {
        let base = Vivo.planDe(try P.biciContinuo(), zonas: nil, entorno: nil)
        XCTAssertEqual(Vivo.segunEnlace(base, maquina: nil), base, "el continuo lo mide el reloj")
    }

    // MARK: - 3-2-1, GO y preaviso

    func testCuentaYGoAlSalirDeLaRecuperacion() throws {
        let ps = pasos(try P.remoSeries())
        let rec = ps[5]
        XCTAssertNil(Vivo.cuentaDeEntrada(ps, 5, Vivo.Lecturas(t: 100)))
        let c = try XCTUnwrap(Vivo.cuentaDeEntrada(ps, 5, Vivo.Lecturas(t: 117.4)))
        XCTAssertEqual(c.n, 3)
        XCTAssertEqual(c.paso.id, ps[6].id, "la cuenta enseña lo que viene")
        XCTAssertNil(Vivo.cuentaDeEntrada(ps, 4, Vivo.Lecturas(t: 30, hecho: 499)), "una serie no entra con cuenta")
        XCTAssertTrue(Vivo.veGo(desde: rec, hacia: ps[6], cerroElAtleta: false))
        XCTAssertFalse(Vivo.veGo(desde: ps[4], hacia: rec, cerroElAtleta: true), "a una recuperación no se entra con GO")
    }

    func testPreaviso() throws {
        let ps = pasos(try P.remoSeries())
        let reglas = Vivo.reglasAvisoDefecto
        XCTAssertNil(Vivo.preavisoDe(ps[5], Vivo.Lecturas(t: 100), reglas))
        XCTAssertEqual(Vivo.preavisoDe(ps[5], Vivo.Lecturas(t: 111), reglas), 10)
        XCTAssertEqual(Vivo.preavisoDe(ps[4], Vivo.Lecturas(t: 90, hecho: 420), reglas), 100)
    }

    func testNombreDeBox() {
        let remo = Vivo.Maquina(tipo: .remo)
        XCTAssertNil(Vivo.nombreDeBox("Row Erg", remo))
        XCTAssertNil(Vivo.nombreDeBox("Remo ergómetro", remo))
        XCTAssertEqual(Vivo.nombreDeBox("Remo 2K del club", remo), "Remo 2K del club")
        XCTAssertEqual(Vivo.nombreDeBox("SkiErg", Vivo.Maquina(tipo: .ski)), "SkiErg")
        XCTAssertEqual(Vivo.nombreDeBox("Row Erg", nil), "Row Erg")
    }
}
