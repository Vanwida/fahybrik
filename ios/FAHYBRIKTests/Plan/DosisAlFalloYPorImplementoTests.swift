import XCTest
@testable import FAHYBRIK

// Las dos formas que el importador aprendió a tipar el 9-ago-2026 y que hasta
// hoy el móvil NO sabía enseñar:
//
//   · `Measure.repsToFailure` — «4× máx», «máximo unbroken». Decodificaba a
//     `.unknown` (sin crashear, eso sí) y el renderer lo saltaba: el atleta veía
//     el ejercicio con la dosis EN BLANCO.
//   · `Target.kg.implementCount` — un farmers 2×32 son DOS de 32. El decoder
//     tiraba el campo y se pintaba «32 kg», con lo que el atleta coge una pesa
//     en vez de dos.
//
// El decoder se configura igual que `APIClient.shared` (convertFromSnakeCase),
// que es lo que convierte `reps_to_failure` / `implement_count` en las claves
// que estos tipos esperan.
final class DosisAlFalloYPorImplementoTests: XCTestCase {
    private func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }

    // MARK: - Al fallo

    func testAlFalloDecodificaYSeLee() throws {
        let m = try makeDecoder().decode(Measure.self, from: Data(#"{"kind":"reps_to_failure"}"#.utf8))
        XCTAssertEqual(m, .repsToFailure)
        XCTAssertEqual(PrescriptionRenderer.measureWork(m), "al fallo")
    }

    func testAlFalloNoSeQuedaEnBlanco() throws {
        // La regresión concreta: antes esto devolvía nil y la card salía sin dosis.
        let m = try makeDecoder().decode(Measure.self, from: Data(#"{"kind":"reps_to_failure"}"#.utf8))
        XCTAssertNotNil(PrescriptionRenderer.measureWork(m))
        XCTAssertFalse(PrescriptionRenderer.measureWork(m)?.isEmpty ?? true)
    }

    func testAlFalloNoTieneSueloNiTecho() throws {
        // No hay cifra: contarlo como 0 lo haría desaparecer del volumen, y
        // contarlo como cualquier otro número sería inventárselo.
        let m = try makeDecoder().decode(Measure.self, from: Data(#"{"kind":"reps_to_failure"}"#.utf8))
        XCTAssertNil(m.suelo)
        XCTAssertNil(m.techo)
    }

    func testAlFalloIdaYVuelta() throws {
        let data = try JSONEncoder().encode(Measure.repsToFailure)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["kind"] as? String, "reps_to_failure")
    }

    // MARK: - Carga por implemento

    func testFarmersDosPorTreintaYDos() throws {
        let t = try makeDecoder().decode(
            Target.self,
            from: Data(#"{"kind":"kg","value":32,"implement_count":2}"#.utf8)
        )
        XCTAssertEqual(PrescriptionRenderer.targetLoad(t), "2×32 kg")
    }

    func testUnSoloImplementoNoPintaElMultiplicador() throws {
        // Una barra o una mancuerna sola: «100 kg», nunca «1×100 kg».
        let sinCampo = try makeDecoder().decode(
            Target.self, from: Data(#"{"kind":"kg","value":100}"#.utf8)
        )
        XCTAssertEqual(PrescriptionRenderer.targetLoad(sinCampo), "100 kg")

        let conUno = try makeDecoder().decode(
            Target.self, from: Data(#"{"kind":"kg","value":100,"implement_count":1}"#.utf8)
        )
        XCTAssertEqual(PrescriptionRenderer.targetLoad(conUno), "100 kg")
    }

    func testLaCargaPorImplementoSobreviveAlIdaYVuelta() throws {
        let original = Target.kg(value: 32, min: nil, max: nil, implementCount: 2)
        let data = try JSONEncoder().encode(original)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["kind"] as? String, "kg")
        XCTAssertEqual(json["implementCount"] as? Int, 2)
    }

    func testCargaSinImplementosSiguePesandoLoMismo() throws {
        // El peso de referencia (el que usan prellenado y analíticas) no cambia
        // por llevar el ×2: son 32 kg en cada mano, no 64.
        let t = try makeDecoder().decode(
            Target.self,
            from: Data(#"{"kind":"kg","value":32,"implement_count":2}"#.utf8)
        )
        guard case let .kg(v, _, _, implementos) = t else {
            return XCTFail("esperaba un target de kg")
        }
        XCTAssertEqual(v, 32)
        XCTAssertEqual(implementos, 2)
    }
}

// El objetivo va en RITMO, que es el idioma del coach; la consola de la cinta se
// marca en km/h, que es el de la máquina. Y en las cintas que hemos encontrado la
// app no puede fijar la velocidad por BLE, así que la cuenta la hace el atleta
// a mano y sudando. Estos tests fijan que se la damos hecha y bien.
final class VelocidadDeCintaTests: XCTestCase {
    func testElEjemploDelCoach() {
        // «correr a 14» ↔ 4:17/km, las dos direcciones.
        XCTAssertEqual(TreadmillMath.paceSecPerKm(fromSpeedKmh: 14), 257)
        XCTAssertEqual(TreadmillMath.speedKmh(fromPaceSecPerKm: 257), 14.0)
    }

    func testSeRedondeaAlEscalonDeLaConsola() throws {
        // 3600/270 = 13,333… No se puede marcar. Con escalón de 0,1 → 13,3;
        // en una consola que va de medio en medio → 13,5.
        let fino = try XCTUnwrap(TreadmillMath.speedKmh(fromPaceSecPerKm: 270))
        let grueso = try XCTUnwrap(TreadmillMath.speedKmh(fromPaceSecPerKm: 270, step: 0.5))
        XCTAssertEqual(fino, 13.3, accuracy: 0.001)
        XCTAssertEqual(grueso, 13.5, accuracy: 0.001)
    }

    func testLaIdaYVueltaNoSeDesvia() {
        // El número que le damos tiene que devolver el ritmo pedido dentro de la
        // tolerancia que el propio modelo usa para un objetivo de punto (±8 s).
        for pace in [240, 257, 270, 285, 300, 330] {
            let kmh = try! XCTUnwrap(TreadmillMath.speedKmh(fromPaceSecPerKm: pace))
            let vuelta = try! XCTUnwrap(TreadmillMath.paceSecPerKm(fromSpeedKmh: kmh))
            XCTAssertLessThanOrEqual(abs(vuelta - pace), PaceTarget.singleToleranceSecPerKm, "\(pace)")
        }
    }

    func testLaBandaSeCruza() {
        // 4:30–4:45/km: el ritmo RÁPIDO es la velocidad ALTA. Si no se cruzan los
        // extremos, el atleta corre al contrario de lo que le pidieron.
        let objetivo = RunTarget.pace(PaceTarget(single: nil, fastS: 270, slowS: 285))
        XCTAssertEqual(objetivo.velocidadDeCinta(), "12,6–13,3")
    }

    func testUnaZonaDePulsoNoSeMarcaEnLaConsola() {
        // La cinta no sabe tu pulso: no hay número que dar, y no se inventa.
        XCTAssertNil(RunTarget.zone(.z2).velocidadDeCinta())
        XCTAssertNil(RunTarget.none.velocidadDeCinta())
    }

    func testLaCintaParadaNoTieneRitmo() {
        XCTAssertNil(TreadmillMath.paceSecPerKm(fromSpeedKmh: 0))
    }
}
