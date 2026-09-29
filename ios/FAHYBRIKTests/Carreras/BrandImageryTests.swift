import XCTest
@testable import FAHYBRIK

// LA FOTO DE UNA CARRERA — una sola llave para todas las superficies.
//
// Antes Inicio elegía la foto por `nombre|fecha` y Carreras por `raceId`: la MISMA carrera salía con dos
// fotos. La identidad estable es el `raceId` cuando se conoce y `nombre|fecha` cuando no; Inicio, que
// solo sabe el nombre y la fecha, encuentra su carrera en el hub y elige con el mismo `raceId`.
final class BrandImageryTests: XCTestCase {

    private func upcoming(id: Int, nombre: String, fecha: String?) throws -> UpcomingRace {
        let f = fecha.map { "\"\($0)\"" } ?? "null"
        let json = #"{"race_id": \#(id), "name": "\#(nombre)", "race_date": \#(f)}"#
        return try APIClient.makeJSONDecoder().decode(UpcomingRace.self, from: Data(json.utf8))
    }

    func testLaIdentidadEsElRaceIdSiSeConoceYNombreYFechaSiNo() {
        XCTAssertEqual(BrandImagery.identidadDeCarrera(raceId: 105, nombre: "HYROX Valencia", fecha: "2026-05-16"), "105")
        XCTAssertEqual(BrandImagery.identidadDeCarrera(raceId: nil, nombre: "HYROX Valencia", fecha: "2026-05-16"), "HYROX Valencia|2026-05-16")
        XCTAssertEqual(BrandImagery.identidadDeCarrera(raceId: nil, nombre: "HYROX Valencia", fecha: nil), "HYROX Valencia|")
    }

    /// El FNV-1a de 64 bits, no `hashValue` (que cambia por proceso): las fotos de estos ids no se mueven jamás.
    func testLaFotoEsEstableEntreProcesos() {
        XCTAssertEqual(BrandImagery.raceCardBackground(raceId: 105, nombre: "x", fecha: nil), "RaceCardBackground")
        XCTAssertEqual(BrandImagery.raceCardBackground(raceId: 201, nombre: "x", fecha: nil), "RaceCardBackground5")
        XCTAssertEqual(BrandImagery.raceCardBackground(raceId: 202, nombre: "x", fecha: nil), "RaceCardBackground4")
        XCTAssertEqual(BrandImagery.raceCardBackground(raceId: nil, nombre: "HYROX Barcelona", fecha: "2026-11-07"), "RaceCardBackground3")
        for id in 1...50 {
            XCTAssertTrue(BrandImagery.raceCardBackgrounds.contains(BrandImagery.raceCardBackground(raceId: id, nombre: "x", fecha: nil)))
        }
    }

    func testElRaceIdNoDependeDelNombreNiDeLaFecha() {
        // Mover la fecha de una carrera (o corregir su nombre) no cambia su foto.
        XCTAssertEqual(
            BrandImagery.raceCardBackground(raceId: 201, nombre: "HYROX Barcelona", fecha: "2026-11-07"),
            BrandImagery.raceCardBackground(raceId: 201, nombre: "HYROX BCN", fecha: "2026-12-01")
        )
    }

    /// El fallo: Inicio y Carreras elegían con llaves distintas. Inicio encuentra su carrera en el hub.
    func testInicioYCarrerasEligenLaMismaFoto() throws {
        let hub = [try upcoming(id: 201, nombre: "HYROX Barcelona", fecha: "2026-11-07"), try upcoming(id: 202, nombre: "HYROX Madrid", fecha: "2026-10-11")]
        for c in hub {
            XCTAssertEqual(
                BrandImagery.raceCardBackground(nombre: c.name, fecha: c.raceDate, entre: hub),
                BrandImagery.raceCardBackground(raceId: c.raceId, nombre: c.name, fecha: c.raceDate),
                c.name
            )
        }
        // Y la de Carreras, la de su tarjeta y su póster:
        let proxima = CasosCarreras.proxima(201, "HYROX Barcelona", 39)
        XCTAssertEqual(proxima.foto, BrandImagery.raceCardBackground(nombre: "HYROX Barcelona", fecha: proxima.fecha, entre: hub))
    }

    func testSiElHubAunNoCargoLaLlaveEsLaNaturalYNoSeInventaNada() {
        XCTAssertEqual(
            BrandImagery.raceCardBackground(nombre: "HYROX Barcelona", fecha: "2026-11-07", entre: []),
            BrandImagery.raceCardBackground(raceId: nil, nombre: "HYROX Barcelona", fecha: "2026-11-07")
        )
    }
}
