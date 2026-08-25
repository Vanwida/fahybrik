import XCTest
@testable import FAHYBRIK

// Card 128 · hueco 7. El motor en vivo no puede callarse ni inventar hierro.
//
// Dos mentiras que convivían en el decoder / renderer:
//   · `Measure.unknown` se saltaba y la dosis desaparecía.
//   · Un scheme que no está en el catálogo se guardaba como `.sets`.
//
// Las fixtures son el cable, no un `Prescription(...)` a mano: así se prueba
// el decode tolerante y lo que lee el atleta.

final class MotorEnVivoHonestidadTests: XCTestCase {
    private func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }

    func testMedidaDesconocidaDiceNoLoSe() throws {
        let m = try makeDecoder().decode(
            Measure.self,
            from: Data(#"{"kind":"future_dose"}"#.utf8)
        )
        XCTAssertEqual(m, .unknown)
        XCTAssertEqual(PrescriptionRenderer.measureWork(m), nil)
        XCTAssertNil(PrescriptionRenderer.measureWork(m))
    }

    func testMedidaDesconocidaEnSeriesNoInventaReps() throws {
        let p = try makeDecoder().decode(
            Prescription.self,
            from: Data(#"""
            {"scheme":"sets","modality":"strength","sets":[
              {"measure":{"kind":"future_dose"}}
            ]}
            """#.utf8)
        )
        XCTAssertEqual(p.scheme, .sets)
        XCTAssertNil(PrescriptionRenderer.measureWork(p.sets?.first?.measure))
        XCTAssertNil(PrescriptionRenderer.setRows(p)?.first?.work)
        XCTAssertNotEqual(PrescriptionRenderer.setRows(p)?.first?.work, "0")
    }

    func testSchemeDesconocidoNoInventaTablaDeSeries() throws {
        let p = try makeDecoder().decode(
            Prescription.self,
            from: Data(#"""
            {"scheme":"future_wod","modality":"functional","sets":[
              {"measure":{"kind":"reps","value":8}}
            ]}
            """#.utf8)
        )
        XCTAssertEqual(p.scheme, .unknown)
        XCTAssertNotEqual(p.scheme, .sets)
        XCTAssertNotEqual(p.scheme.presentation, .setTable)
        XCTAssertNil(PrescriptionRenderer.setRows(p))
        XCTAssertNil(PrescriptionRenderer.wodHeader(p))
        XCTAssertEqual(p.scheme.nombreEs, "")
    }

    func testStraightSetsSigueSiendoFuerza() throws {
        let p = try makeDecoder().decode(
            Prescription.self,
            from: Data(#"{"scheme":"straight_sets","modality":"strength"}"#.utf8)
        )
        XCTAssertEqual(p.scheme, .sets)
        XCTAssertEqual(p.scheme.presentation, .setTable)
        XCTAssertNil(PrescriptionRenderer.wodHeader(p))
    }
}
