import XCTest
@testable import FAHYBRIK

// AUDIT-B3 — the decode-tolerance wrappers: a null/absent/wrong-type field or a
// malformed row degrades to a default / is dropped, so a backend shape change can't
// blank a whole screen. The required shape still decodes normally.
final class DecodingToleranceTests: XCTestCase {

    private struct Host: Decodable, Equatable {
        @LossyArray var items: [Int]
        @DefaultEmptyString var name: String
        @DefaultFalse var flag: Bool
    }
    private func decode(_ json: String) throws -> Host {
        try JSONDecoder().decode(Host.self, from: Data(json.utf8))
    }

    func testAbsentKeysUseDefaults() throws {
        let h = try decode("{}")
        XCTAssertEqual(h.items, [])
        XCTAssertEqual(h.name, "")
        XCTAssertFalse(h.flag)
    }

    func testNullValuesUseDefaults() throws {
        let h = try decode(#"{"items":null,"name":null,"flag":null}"#)
        XCTAssertEqual(h.items, [])
        XCTAssertEqual(h.name, "")
        XCTAssertFalse(h.flag)
    }

    func testPresentValuesDecodeNormally() throws {
        let h = try decode(#"{"items":[1,2,3],"name":"Ana","flag":true}"#)
        XCTAssertEqual(h.items, [1, 2, 3])
        XCTAssertEqual(h.name, "Ana")
        XCTAssertTrue(h.flag)
    }

    func testLossyDropsMalformedRows() throws {
        // A string mixed into an [Int] list → that element is dropped, the array survives.
        XCTAssertEqual(try decode(#"{"items":[1,"x",3]}"#).items, [1, 3])
    }

    func testWrongTypeDegradesToDefault() throws {
        // items arrives as a string (not an array) → [] instead of throwing the payload.
        XCTAssertEqual(try decode(#"{"items":"oops"}"#).items, [])
    }
}
