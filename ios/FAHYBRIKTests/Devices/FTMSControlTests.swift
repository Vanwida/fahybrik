import XCTest
@testable import FAHYBRIK

// Byte-level tests for the FTMS control-plane codec. These lock the wire format we
// write to / read from a real treadmill — the part we can verify with zero hardware.
final class FTMSControlTests: XCTestCase {

    // MARK: - Encode (app → machine)

    func testEncodeSimpleCommands() {
        XCTAssertEqual([UInt8](FTMSControl.encode(.requestControl)), [0x00])
        XCTAssertEqual([UInt8](FTMSControl.encode(.reset)), [0x01])
        XCTAssertEqual([UInt8](FTMSControl.encode(.start)), [0x07])
        XCTAssertEqual([UInt8](FTMSControl.encode(.stop)), [0x08, 0x01])
        XCTAssertEqual([UInt8](FTMSControl.encode(.pause)), [0x08, 0x02])
    }

    func testEncodeTargetSpeedLittleEndian() {
        // 12.5 km/h → 1250 (0x04E2) at 0.01 km/h resolution, little-endian.
        XCTAssertEqual([UInt8](FTMSControl.encode(.setTargetSpeedKmh(12.5))), [0x02, 0xE2, 0x04])
        // 0 km/h → 0.
        XCTAssertEqual([UInt8](FTMSControl.encode(.setTargetSpeedKmh(0))), [0x02, 0x00, 0x00])
        // Negative speed is nonsense → clamped to 0, never a huge unsigned wrap.
        XCTAssertEqual([UInt8](FTMSControl.encode(.setTargetSpeedKmh(-5))), [0x02, 0x00, 0x00])
    }

    func testEncodeTargetInclineSignedLittleEndian() {
        // +3.0 % → 30 (0x001E).
        XCTAssertEqual([UInt8](FTMSControl.encode(.setTargetInclinePct(3.0))), [0x03, 0x1E, 0x00])
        // -2.5 % → -25 → sint16 0xFFE7.
        XCTAssertEqual([UInt8](FTMSControl.encode(.setTargetInclinePct(-2.5))), [0x03, 0xE7, 0xFF])
    }

    // MARK: - Decode Control Point response

    func testDecodeResponse() {
        let ok = FTMSControl.decodeResponse(Data([0x80, 0x00, 0x01]))
        XCTAssertEqual(ok?.request, 0x00)
        XCTAssertEqual(ok?.result, .success)

        let denied = FTMSControl.decodeResponse(Data([0x80, 0x02, 0x05]))
        XCTAssertEqual(denied?.request, 0x02)
        XCTAssertEqual(denied?.result, .controlNotPermitted)

        XCTAssertEqual(FTMSControl.decodeResponse(Data([0x80, 0x07, 0x02]))?.result, .notSupported)
        // Not a response indication (wrong leading op code) → nil.
        XCTAssertNil(FTMSControl.decodeResponse(Data([0x00, 0x00, 0x01])))
        XCTAssertNil(FTMSControl.decodeResponse(Data([0x80, 0x00])))   // too short
    }

    // MARK: - Decode Machine Status (the sync seam)

    func testDecodeMachineEvents() {
        XCTAssertEqual(FTMSControl.decodeMachineEvent(Data([0x04])), .startedByUser)
        XCTAssertEqual(FTMSControl.decodeMachineEvent(Data([0x02, 0x01])), .stoppedByUser)
        XCTAssertEqual(FTMSControl.decodeMachineEvent(Data([0x02, 0x02])), .pausedByUser)
        XCTAssertEqual(FTMSControl.decodeMachineEvent(Data([0x02])), .stoppedByUser)   // no param → stop
        XCTAssertEqual(FTMSControl.decodeMachineEvent(Data([0x03])), .stoppedBySafetyKey)
        // Athlete bumps speed on the console → app must mirror it.
        XCTAssertEqual(FTMSControl.decodeMachineEvent(Data([0x05, 0xE2, 0x04])), .targetSpeedChangedKmh(12.5))
        XCTAssertEqual(FTMSControl.decodeMachineEvent(Data([0x06, 0xE7, 0xFF])), .targetInclineChangedPct(-2.5))
        XCTAssertEqual(FTMSControl.decodeMachineEvent(Data([0xFF])), .controlPermissionLost)
        XCTAssertNil(FTMSControl.decodeMachineEvent(Data()))
    }

    // MARK: - Decode capability (feature + ranges)

    func testDecodeTargetFeatures() {
        // Target Setting Features is the SECOND uint32; bit0 = speed, bit1 = incline.
        let both = FTMSControl.decodeTargetFeatures(Data([0, 0, 0, 0, 0x03, 0, 0, 0]))
        XCTAssertEqual(both?.speed, true)
        XCTAssertEqual(both?.incline, true)

        let speedOnly = FTMSControl.decodeTargetFeatures(Data([0, 0, 0, 0, 0x01, 0, 0, 0]))
        XCTAssertEqual(speedOnly?.speed, true)
        XCTAssertEqual(speedOnly?.incline, false)

        XCTAssertNil(FTMSControl.decodeTargetFeatures(Data([0, 0, 0, 0])))   // too short
    }

    func testDecodeSpeedRange() {
        // min 0.8, max 25.0, step 0.1 km/h → 80, 2500, 10 (×0.01), little-endian.
        let r = FTMSControl.decodeSpeedRange(Data([0x50, 0x00, 0xC4, 0x09, 0x0A, 0x00]))
        XCTAssertEqual(r?.min ?? -1, 0.8, accuracy: 0.001)
        XCTAssertEqual(r?.max ?? -1, 25.0, accuracy: 0.001)
        XCTAssertEqual(r?.step ?? -1, 0.1, accuracy: 0.001)
    }

    func testDecodeInclineRangeSigned() {
        // min -10.0, max 15.0, step 0.5 % → -100, 150, 5 (×0.1), sint16 little-endian.
        let r = FTMSControl.decodeInclineRange(Data([0x9C, 0xFF, 0x96, 0x00, 0x05, 0x00]))
        XCTAssertEqual(r?.min ?? 999, -10.0, accuracy: 0.001)
        XCTAssertEqual(r?.max ?? -1, 15.0, accuracy: 0.001)
        XCTAssertEqual(r?.step ?? -1, 0.5, accuracy: 0.001)
    }

    // MARK: - Capability gate

    func testCapabilityGate() {
        XCTAssertFalse(TreadmillControlCapability.none.canControl)
        // Control point but no settable target → still not controllable.
        var cap = TreadmillControlCapability.none
        cap.hasControlPoint = true
        XCTAssertFalse(cap.canControl)
        cap.canControlSpeed = true
        XCTAssertTrue(cap.canControl)
    }
}
