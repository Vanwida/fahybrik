import XCTest
@testable import FAHYBRIK

// GET /api/athlete/exercises → FreeExerciseListResponse. A ::text `id` or one
// malformed row used to fail the whole picker. The list must still load.

final class FreeExerciseCatalogDecodeTests: XCTestCase {

    private func decode(_ json: String) throws -> FreeExerciseListResponse {
        try APIClient.makeJSONDecoder().decode(
            FreeExerciseListResponse.self, from: Data(json.utf8))
    }

    func testNumericIdDecodes() throws {
        let r = try decode("""
            {"exercises":[{"id":7,"name":"SkiErg","slug":"ski-erg",\
            "category":"hyrox_station","modality":"ski"}]}
            """)
        XCTAssertEqual(r.exercises.count, 1)
        XCTAssertEqual(r.exercises[0].id, 7)
        XCTAssertEqual(r.exercises[0].modality, "ski")
    }

    func testStringIdDoesNotBlankTheCatalog() throws {
        let r = try decode("""
            {"exercises":[{"id":"12","name":"Remo","slug":"row",\
            "category":"rowing","modality":"row"}]}
            """)
        XCTAssertEqual(r.exercises.first?.id, 12)
    }

    func testExtraCatalogFieldsAreIgnored() throws {
        let r = try decode("""
            {"exercises":[{"id":3,"name":"Wall Balls","slug":"wall-balls",\
            "category":"hyrox_station","modality":"functional",\
            "name_es":"Wall Balls","name_en":"Wall Balls",\
            "search_terms":"wall balls wall-ball","origin":"base"}]}
            """)
        XCTAssertEqual(r.exercises.first?.id, 3)
        XCTAssertEqual(r.exercises.first?.name, "Wall Balls")
    }

    func testOneBadRowDoesNotBlankTheCatalog() throws {
        let r = try decode("""
            {"exercises":[\
              {"id":1,"name":"SkiErg","slug":"ski-erg","category":"hyrox_station","modality":"ski"},\
              {"id":null,"name":"Roto","slug":"roto","category":"other"},\
              {"id":2,"name":"Remo","slug":"row","category":"rowing","modality":"row"}\
            ]}
            """)
        XCTAssertEqual(r.exercises.map(\.id), [1, 2])
    }
}
