import XCTest
@testable import FAHYBRIK

// AUDIT-B2 — the wire enums degrade to .unknown for an unrecognized value instead of
// throwing and blanking the payload. A backend that adds a new value can't break the app.
final class WireEnumToleranceTests: XCTestCase {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    func testFoodSourceDegradesToUnknown() throws {
        XCTAssertEqual(try decode(FoodSource.self, "\"barcode\""), .barcode)
        XCTAssertEqual(try decode(FoodSource.self, "\"recipe_v2\""), .unknown)
    }

    func testDoblesTogethernessDegradesToUnknown() throws {
        XCTAssertEqual(try decode(DoblesTogetherness.self, "\"joint_mandatory\""), .jointMandatory)
        XCTAssertEqual(try decode(DoblesTogetherness.self, "\"future_mode\""), .unknown)
    }

    func testDoblesCarrierDegradesToUnknown() throws {
        XCTAssertEqual(try decode(DoblesCarrier.self, "\"self\""), .mine)
        XCTAssertEqual(try decode(DoblesCarrier.self, "\"future_carrier\""), .unknown)
    }
}
