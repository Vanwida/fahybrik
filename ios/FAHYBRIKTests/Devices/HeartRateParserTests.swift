import XCTest
@testable import FAHYBRIK

// Fixtures for the Heart Rate Measurement characteristic (0x2A37): flag byte then
// an 8- or 16-bit HR value, per bit0 of the flags.
final class HeartRateParserTests: XCTestCase {

    func testUInt8Value() {
        // Flags 0x00 (8-bit), value 80.
        XCTAssertEqual(HeartRateParser.parse(Data([0x00, 0x50])), 80)
    }

    func testUInt16Value() {
        // Flags 0x01 (16-bit LE), value 300 = 0x012C.
        XCTAssertEqual(HeartRateParser.parse(Data([0x01, 0x2C, 0x01])), 300)
    }

    func testUInt16RealisticValue() {
        // Flags 0x01, value 190 = 0x00BE.
        XCTAssertEqual(HeartRateParser.parse(Data([0x01, 0xBE, 0x00])), 190)
    }

    func testExtraFlagsDoNotShiftUInt8Value() {
        // Energy-expended + sensor-contact flags set, but bit0 == 0 → value is still
        // the single byte at index 1 (we ignore the trailing energy bytes).
        XCTAssertEqual(HeartRateParser.parse(Data([0x08, 0x5A])), 90)
    }

    func testZeroValueIsNil() {
        XCTAssertNil(HeartRateParser.parse(Data([0x00, 0x00])))
    }

    // MARK: - Sensor contact (b2 = feature supported, b1 = contact detected)

    func testContactUnsupportedPasses() {
        // b2 == 0 → feature not supported; b1 is meaningless → value passes.
        // (Flags 0x00: this is the plain uint8 case.)
        XCTAssertEqual(HeartRateParser.parse(Data([0x00, 0x4B])), 75)
    }

    func testContactUnsupportedButBit1SetStillPasses() {
        // b2 == 0, b1 == 1 → the "detected" bit is spurious without support; ignore
        // it and pass the value through.
        XCTAssertEqual(HeartRateParser.parse(Data([0x02, 0x4B])), 75)
    }

    func testContactSupportedAndNotDetectedIsNil() {
        // b2 == 1 (supported), b1 == 0 (no skin contact) → drop the reading.
        XCTAssertNil(HeartRateParser.parse(Data([0x04, 0x4B])))
    }

    func testContactSupportedAndDetectedPasses() {
        // b2 == 1 (supported), b1 == 1 (contact) → valid reading.
        XCTAssertEqual(HeartRateParser.parse(Data([0x06, 0x4B])), 75)
    }

    func testUInt16WithContactCoexist() {
        // b0 == 1 (uint16 LE), b2 == 1, b1 == 1 → 190 with contact present passes.
        XCTAssertEqual(HeartRateParser.parse(Data([0x07, 0xBE, 0x00])), 190)
    }

    func testUInt16WithoutContactIsNil() {
        // b0 == 1 (uint16 LE), b2 == 1, b1 == 0 → no contact drops the reading even
        // when the 16-bit value is otherwise well-formed.
        XCTAssertNil(HeartRateParser.parse(Data([0x05, 0xBE, 0x00])))
    }

    func testEmptyOrTruncatedIsNil() {
        XCTAssertNil(HeartRateParser.parse(Data()))
        XCTAssertNil(HeartRateParser.parse(Data([0x00])))       // flags only, no value
        XCTAssertNil(HeartRateParser.parse(Data([0x01, 0x2C]))) // 16-bit flagged but 1 value byte
    }
}
