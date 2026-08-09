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
