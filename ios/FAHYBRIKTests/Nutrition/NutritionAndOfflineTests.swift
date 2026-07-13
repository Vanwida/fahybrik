import XCTest
@testable import FAHYBRIK

// AUDIT (nutrición + cola offline):
//  - guardar comida decodifica el envelope real `{ entry }` (no un NutritionEntry pelado)
//  - el lookup de barras decodifica aunque `raw` sea un OBJETO (found:true ya no revienta)
//  - la cola offline NO reintenta 4xx (deterministas); sí offline/5xx/red.
final class NutritionAndOfflineTests: XCTestCase {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try APIClient.makeJSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    // MARK: - Save envelope

    func testCreateResponseDecodesEntryEnvelope() throws {
        let json = #"""
        {"entry":{"id":"e1","name":"Pollo","kcal":200,"protein_g":30,"carbs_g":0,"fat_g":5,"source":"manual"}}
        """#
        let resp = try decode(NutritionCreateResponse.self, json)
        XCTAssertEqual(resp.entry.id, "e1")
        XCTAssertEqual(resp.entry.name, "Pollo")
        XCTAssertEqual(resp.entry.source, .manual)
    }

    // MARK: - Barcode lookup (raw is an OFF object)

    func testBarcodeFoundDecodesEvenWithObjectRaw() throws {
        let json = #"""
        {"found":true,"name":"Yogur","kcal":60,"protein_g":4,"carbs_g":5,"fat_g":3,"per":"100g",
         "barcode":"123","raw":{"product":{"code":"123","brands":"X"}}}
        """#
        let r = try decode(BarcodeLookupResponse.self, json)   // no typeMismatch anymore
        XCTAssertTrue(r.found)
        XCTAssertEqual(r.name, "Yogur")
        XCTAssertEqual(r.barcode, "123")
    }

    func testBarcodeNotFoundDecodes() throws {
        let r = try decode(BarcodeLookupResponse.self, #"{"found":false}"#)
        XCTAssertFalse(r.found)
        XCTAssertNil(r.name)
    }

    // MARK: - Offline queue: only transient failures are retriable

    func testIsRetriableDropsClientErrors() {
        XCTAssertFalse(RequestQueue.isRetriable(APIError.http(400, Data())))
        XCTAssertFalse(RequestQueue.isRetriable(APIError.http(404, Data())))   // no_partner
        XCTAssertFalse(RequestQueue.isRetriable(APIError.http(409, Data())))
    }

    func testIsRetriableKeepsTransientFailures() {
        XCTAssertTrue(RequestQueue.isRetriable(APIError.http(500, Data())))
        XCTAssertTrue(RequestQueue.isRetriable(APIError.http(503, Data())))
        XCTAssertTrue(RequestQueue.isRetriable(APIError.offline))
        XCTAssertTrue(RequestQueue.isRetriable(APIError.invalidResponse))
        XCTAssertTrue(RequestQueue.isRetriable(URLError(.notConnectedToInternet)))
    }
}
