import XCTest
@testable import FAHYBRIK

// Byte fixtures for the FTMS Treadmill Data characteristic (0x2ACD). Each packet
// is [Flags(LE u16)] + present fields in spec order. These pin the flag-walk so a
// later field (HR, elapsed) is only correct if every preceding field's width is.
final class FTMSTreadmillParserTests: XCTestCase {

    func testSpeedOnly() {
        // Flags 0x0000 → only Instantaneous Speed (bit0 == 0). 10.00 km/h = 1000.
        let s = FTMSTreadmillParser.parse(Data([0x00, 0x00, 0xE8, 0x03]))
        XCTAssertEqual(s?.speedKmh, 10.0)
        XCTAssertNil(s?.totalDistanceM)
        XCTAssertNil(s?.inclinePct)
        XCTAssertNil(s?.elapsedS)
        XCTAssertNil(s?.hrBpm)
    }

    func testSpeedDistanceInclineElapsed() {
        // bits 2 (dist), 3 (incl+ramp), 10 (elapsed) → flags 0x040C.
        // speed 12.00 (1200) · dist 500 (u24) · incl 1.5% (15) · ramp 0 · elapsed 300.
        let packet = Data([0x0C, 0x04, 0xB0, 0x04, 0xF4, 0x01, 0x00, 0x0F, 0x00, 0x00, 0x00, 0x2C, 0x01])
        let s = FTMSTreadmillParser.parse(packet)
        XCTAssertEqual(s?.speedKmh, 12.0)
        XCTAssertEqual(s?.totalDistanceM, 500)
        XCTAssertEqual(s?.inclinePct, 1.5)
        XCTAssertEqual(s?.elapsedS, 300)
    }

    func testNegativeInclination() {
        // bit3 only. speed 8.00 (800) · incl -2.0% (sint16 0xFFEC) · ramp 0.
        let packet = Data([0x08, 0x00, 0x20, 0x03, 0xEC, 0xFF, 0x00, 0x00])
        let s = FTMSTreadmillParser.parse(packet)
        XCTAssertEqual(s?.speedKmh, 8.0)
        XCTAssertEqual(s?.inclinePct, -2.0)
    }

    func testMoreDataBitSuppressesInstantaneousSpeed() {
        // bit0 (More Data) set → NO instantaneous speed; bit1 avg speed present.
        // We don't surface avg speed, so speedKmh must be nil.
        let packet = Data([0x03, 0x00, 0x84, 0x03])
        let s = FTMSTreadmillParser.parse(packet)
        XCTAssertNil(s?.speedKmh)
    }

    func testHeartRatePresent() {
        // bit8 (HR) + speed. flags 0x0100. speed 11.00 (1100) · HR 145.
        let packet = Data([0x00, 0x01, 0x4C, 0x04, 0x91])
        let s = FTMSTreadmillParser.parse(packet)
        XCTAssertEqual(s?.speedKmh, 11.0)
        XCTAssertEqual(s?.hrBpm, 145)
    }

    func testFullWalkReachesHeartRateAndElapsed() {
        // Exercises energy(5B) + inst pace(1B) skips so HR + elapsed land correctly.
        // bits 2,5,7,8,10 + speed → flags 0x05A4.
        // speed 10.00 · dist 1000 (u24) · inst pace 5 · energy[50,600,10] · HR 150 · elapsed 600.
        let packet = Data([0xA4, 0x05,          // flags
                           0xE8, 0x03,          // speed 1000
                           0xE8, 0x03, 0x00,    // distance 1000 (u24)
                           0x05,                // inst pace
                           0x32, 0x00, 0x58, 0x02, 0x0A, // energy total/hour/min
                           0x96,                // HR 150
                           0x58, 0x02])         // elapsed 600
        let s = FTMSTreadmillParser.parse(packet)
        XCTAssertEqual(s?.speedKmh, 10.0)
        XCTAssertEqual(s?.totalDistanceM, 1000)
        XCTAssertEqual(s?.hrBpm, 150)
        XCTAssertEqual(s?.elapsedS, 600)
    }

    func testTruncatedFieldDegradesToNil() {
        // Flags say speed present but no bytes follow → sample returned, speed nil.
        let s = FTMSTreadmillParser.parse(Data([0x00, 0x00]))
        XCTAssertNotNil(s)
        XCTAssertNil(s?.speedKmh)
    }

    func testEmptyDataReturnsNil() {
        XCTAssertNil(FTMSTreadmillParser.parse(Data()))
        XCTAssertNil(FTMSTreadmillParser.parse(Data([0x00]))) // one byte < flags width
    }

    func testMaxSpeedBoundary() {
        // Large speed value near uint16 range: 65.535 km/h (raw 6553... actually 0xFFFF/100).
        let packet = Data([0x00, 0x00, 0xFF, 0xFF])
        let s = FTMSTreadmillParser.parse(packet)
        XCTAssertEqual(s?.speedKmh ?? 0, 655.35, accuracy: 0.001)
    }
}
