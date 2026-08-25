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
        XCTAssertEqual(PrescriptionRenderer.measureWork(m), "no lo sé")
        XCTAssertNotEqual(PrescriptionRenderer.measureWork(m), nil)
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
        XCTAssertEqual(PrescriptionRenderer.measureWork(p.sets?.first?.measure), "no lo sé")
        XCTAssertEqual(PrescriptionRenderer.setRows(p)?.first?.work, "no lo sé")
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
        XCTAssertEqual(PrescriptionRenderer.wodHeader(p), "no lo sé")
        XCTAssertEqual(p.scheme.nombreEs, "no lo sé")
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
