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
        // Target Setting Features is the SECOND uint32 (FTMS §4.3.1.2): bit0 = speed,
        // bit1 = incline, bit8 = targeted distance, bit9 = targeted training time.
        let both = FTMSControl.decodeTargetFeatures(Data([0, 0, 0, 0, 0x03, 0, 0, 0]))
        XCTAssertEqual(both?.speed, true)
        XCTAssertEqual(both?.incline, true)
        XCTAssertEqual(both?.targetedDistance, false)

        let speedOnly = FTMSControl.decodeTargetFeatures(Data([0, 0, 0, 0, 0x01, 0, 0, 0]))
        XCTAssertEqual(speedOnly?.speed, true)
        XCTAssertEqual(speedOnly?.incline, false)

        // 0x0300 = bits 8 and 9 → the two workout-programming ops, and NOT speed/incline.
        let piece = FTMSControl.decodeTargetFeatures(Data([0, 0, 0, 0, 0x00, 0x03, 0, 0]))
        XCTAssertEqual(piece?.targetedDistance, true)
        XCTAssertEqual(piece?.targetedTrainingTime, true)
        XCTAssertEqual(piece?.speed, false)
        XCTAssertEqual(piece?.raw, 0x0300)

        XCTAssertNil(FTMSControl.decodeTargetFeatures(Data([0, 0, 0, 0])))   // too short
    }

    // MARK: - Programming the piece onto the machine's own display

    func testEncodeTargetedDistanceIsUint24Meters() {
        // FTMS Table 4.15, op 0x0C: UINT24, meters, resolution 1 m, little-endian.
        XCTAssertEqual([UInt8](FTMSControl.encode(.setTargetedDistanceM(1000))), [0x0C, 0xE8, 0x03, 0x00])
        XCTAssertEqual([UInt8](FTMSControl.encode(.setTargetedDistanceM(400))), [0x0C, 0x90, 0x01, 0x00])
        // Three octets, not four — a big distance must not spill into a fourth byte.
        XCTAssertEqual([UInt8](FTMSControl.encode(.setTargetedDistanceM(70_000))), [0x0C, 0x70, 0x11, 0x01])
        XCTAssertEqual([UInt8](FTMSControl.encode(.setTargetedDistanceM(-5))), [0x0C, 0x00, 0x00, 0x00])
    }

    func testEncodeTargetedTrainingTimeIsUint16Seconds() {
        // FTMS Table 4.15, op 0x0D: UINT16, seconds, resolution 1 s.
        XCTAssertEqual([UInt8](FTMSControl.encode(.setTargetedTrainingTimeS(600))), [0x0D, 0x58, 0x02])
        XCTAssertEqual([UInt8](FTMSControl.encode(.setTargetedTrainingTimeS(90))), [0x0D, 0x5A, 0x00])
        XCTAssertEqual([UInt8](FTMSControl.encode(.setTargetedTrainingTimeS(-1))), [0x0D, 0x00, 0x00])
    }

    func testDecodeProgrammedPieceStatusEvents() {
        // Machine Status Table 4.26: 0x0D targeted distance (UINT24), 0x0E time (UINT16).
        XCTAssertEqual(FTMSControl.decodeMachineEvent(Data([0x0D, 0xE8, 0x03, 0x00])),
                       .targetedDistanceChangedM(1000))
        XCTAssertEqual(FTMSControl.decodeMachineEvent(Data([0x0E, 0x58, 0x02])),
                       .targetedTrainingTimeChangedS(600))
        // A truncated payload decodes to nothing rather than to a fabricated number —
        // same rule the speed / incline status events follow.
        XCTAssertNil(FTMSControl.decodeMachineEvent(Data([0x0D, 0xE8])))
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

    /// THE GATE THAT BROKE HIS TM2000. It used to also require the machine to DECLARE a
    /// settable target, so a firmware reporting a zeroed Target Setting Features word
    /// switched every control off before a byte was ever written — "solo recoge la info".
    /// A writable Control Point is now the whole test: a fact, not a claim.
    func testCapabilityGateIsTheControlPointAlone() {
        XCTAssertFalse(TreadmillControlCapability.none.canControl)
        var cap = TreadmillControlCapability.none
        cap.hasControlPoint = true
        XCTAssertTrue(cap.canControl, "a writable control point IS the gate")
        // Even with the feature word claiming nothing is settable, we still offer control
        // and let the machine refuse each command on its own merits.
        cap.canControlSpeed = false
        cap.canControlIncline = false
        cap.targetFeatureBits = 0
        XCTAssertTrue(cap.canControl, "a lying feature word must never disable the HUD")
    }

    func testInclineUnitsFollowTheResolvedDialectNotTheFamily() {
        var cap = TreadmillControlCapability.none
        cap.hasControlPoint = true
        XCTAssertFalse(cap.inclineIsLevel, "grade is what we try first")
        cap.profile = .iConcept
        XCTAssertFalse(cap.inclineIsLevel, "the FAMILY no longer dictates the units")
        cap.inclineDialect = .level
        XCTAssertTrue(cap.inclineIsLevel, "only the resolved dialect does")
    }
}
