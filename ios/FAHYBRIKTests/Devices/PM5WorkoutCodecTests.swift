import XCTest
@testable import FAHYBRIK

// Byte-level tests for the PM5 workout-programming codec. The GOLDEN frames
// below reproduce the worked examples in the official "Concept2 PM CSAFE
// Communication Definition" rev 0.27 (pp. 80-84) byte-for-byte — the part of the
// wire we can verify with zero hardware. Hand-derived fixtures extend them
// (checksums recomputed by XOR from the spec bases).
final class PM5WorkoutCodecTests: XCTestCase {

    private func hex(_ data: Data) -> [UInt8] { [UInt8](data) }

    // MARK: - Golden frames (official spec examples, byte-for-byte)

    func testJustRowMatchesSpecExample() {
        // Spec p.80 "JustRow": type JUSTROW_SPLITS + screen PREPARETOROW.
        XCTAssertEqual(hex(PM5WorkoutCodec.programFrame(for: .justRow())), [
            0xF1, 0x76, 0x07, 0x01, 0x01, 0x01, 0x13, 0x02, 0x01, 0x01, 0x61, 0xF2,
        ])
    }

    func testFixedDistance2000MatchesSpecExample() {
        // Spec p.81 "Fixed Distance 2000m": the split defaults to the monitor's
        // own 5-per-piece convention (2000/5 = 400m) — exactly the spec frame.
        XCTAssertEqual(hex(PM5WorkoutCodec.programFrame(for: .fixedDistance(meters: 2000))), [
            0xF1, 0x76, 0x18,
            0x01, 0x01, 0x03,                                   // type FIXEDDIST_SPLITS
            0x03, 0x05, 0x80, 0x00, 0x00, 0x07, 0xD0,           // duration 2000 m
            0x05, 0x05, 0x80, 0x00, 0x00, 0x01, 0x90,           // split 400 m
            0x14, 0x01, 0x01,                                   // configure
            0x13, 0x02, 0x01, 0x01,                             // screen → prepare to row
            0x28, 0xF2,
        ])
    }

    func testFixedTime1200MatchesSpecExample() {
        // Spec p.81 "Fixed Time 20:00/4:00 splits": 1200 s → 120000 ticks
        // (0x0001D4C0), default split 240 s → 24000 (0x5DC0).
        XCTAssertEqual(hex(PM5WorkoutCodec.programFrame(for: .fixedTime(seconds: 1200))), [
            0xF1, 0x76, 0x18,
            0x01, 0x01, 0x05,
            0x03, 0x05, 0x00, 0x00, 0x01, 0xD4, 0xC0,
            0x05, 0x05, 0x00, 0x00, 0x00, 0x5D, 0xC0,
            0x14, 0x01, 0x01,
            0x13, 0x02, 0x01, 0x01,
            0xE0, 0xF2,
        ])
    }

    func testDistanceIntervals500r30MatchesSpecExample() {
        // Spec p.83 "Fixed Distance Interval 500m/:30 rest". Rest is uint16 BE
        // WHOLE seconds. Note: no interval COUNT exists for fixed intervals — the
        // monitor repeats until the athlete stops; our session engine owns rounds.
        XCTAssertEqual(hex(PM5WorkoutCodec.programFrame(for: .distanceIntervals(workMeters: 500, restSeconds: 30))), [
            0xF1, 0x76, 0x15,
            0x01, 0x01, 0x07,                                   // type FIXEDDIST_INTERVAL
            0x03, 0x05, 0x80, 0x00, 0x00, 0x01, 0xF4,           // work 500 m
            0x04, 0x02, 0x00, 0x1E,                             // rest 30 s
            0x14, 0x01, 0x01,
            0x13, 0x02, 0x01, 0x01,
            0x0A, 0xF2,
        ])
    }

    func testTimeIntervals120r30MatchesSpecExample() {
        // Spec p.83-84 "Fixed Time Interval 2:00/:30 rest" — 12000 ticks (0x2EE0).
        // The PDF prints checksum 0x0A there, but that is a copy-paste of the
        // distance-interval example above it: the XOR of the example's own body
        // is 0xB0 (all five other spec examples match our XOR byte-for-byte).
        XCTAssertEqual(hex(PM5WorkoutCodec.programFrame(for: .timeIntervals(workSeconds: 120, restSeconds: 30))), [
            0xF1, 0x76, 0x15,
            0x01, 0x01, 0x06,
            0x03, 0x05, 0x00, 0x00, 0x00, 0x2E, 0xE0,
            0x04, 0x02, 0x00, 0x1E,
            0x14, 0x01, 0x01,
            0x13, 0x02, 0x01, 0x01,
            0xB0, 0xF2,
        ])
    }

    func testFixedCalories100MatchesSpecExample() {
        // Spec p.82 "Fixed Calories 100/20 splits" — duration identifier 0xC0 as
        // printed in BOTH calorie examples (the command table's 0x40 disagrees;
        // the worked examples win — flagged for physical verification).
        XCTAssertEqual(hex(PM5WorkoutCodec.programFrame(for: .fixedCalories(calories: 100))), [
            0xF1, 0x76, 0x18,
            0x01, 0x01, 0x0A,
            0x03, 0x05, 0xC0, 0x00, 0x00, 0x00, 0x64,
            0x05, 0x05, 0xC0, 0x00, 0x00, 0x00, 0x14,
            0x14, 0x01, 0x01,
            0x13, 0x02, 0x01, 0x01,
            0x17, 0xF2,
        ])
    }

    // MARK: - Hand-derived fixtures (the flagship free piece + stuffing)

    func testDistanceIntervals500r90() {
        // The free "5×500 r1:30": rest 90 s = 0x005A. Checksum from the spec base
        // (0x0A with rest 0x1E): 0x0A ^ 0x1E ^ 0x5A = 0x4E.
        XCTAssertEqual(hex(PM5WorkoutCodec.programFrame(for: .distanceIntervals(workMeters: 500, restSeconds: 90))), [
            0xF1, 0x76, 0x15,
            0x01, 0x01, 0x07,
            0x03, 0x05, 0x80, 0x00, 0x00, 0x01, 0xF4,
            0x04, 0x02, 0x00, 0x5A,
            0x14, 0x01, 0x01,
            0x13, 0x02, 0x01, 0x01,
            0x4E, 0xF2,
        ])
    }

    func testBodyByteStuffing() {
        // Rest 240 s = 0x00F0 — the 0xF0 in the body MUST be stuffed to F3 00
        // (raw flag bytes may never appear inside a frame). Checksum runs over
        // the UNSTUFFED body: 0x0A ^ 0x1E ^ 0xF0 = 0xE4.
        XCTAssertEqual(hex(PM5WorkoutCodec.programFrame(for: .distanceIntervals(workMeters: 500, restSeconds: 240))), [
            0xF1, 0x76, 0x15,
            0x01, 0x01, 0x07,
            0x03, 0x05, 0x80, 0x00, 0x00, 0x01, 0xF4,
            0x04, 0x02, 0x00, 0xF3, 0x00,                       // stuffed 0xF0
            0x14, 0x01, 0x01,
            0x13, 0x02, 0x01, 0x01,
            0xE4, 0xF2,
        ])
    }

    func testChecksumByteStuffing() {
        // Rest 230 s = 0x00E6 makes the CHECKSUM land on 0xF2 (0x0A^0x1E^0xE6) —
        // it must be stuffed too, exactly like the spec's response examples show.
        let frame = hex(PM5WorkoutCodec.programFrame(for: .distanceIntervals(workMeters: 500, restSeconds: 230)))
        XCTAssertEqual(Array(frame.suffix(3)), [0xF3, 0x02, 0xF2])
    }

    func testTargetPaceRidesBeforeConfigure() {
        // 1:52.0 /500m → 11200 ticks (0x2BC0), command 0x06 (NOT 0x07 — that id
        // is the unimplemented SET_INTERVALIDENTIFIER), placed before CONFIGURE.
        XCTAssertEqual(hex(PM5WorkoutCodec.programFrame(for: .distanceIntervals(workMeters: 500, restSeconds: 90, pace: 112))), [
            0xF1, 0x76, 0x1B,
            0x01, 0x01, 0x07,
            0x03, 0x05, 0x80, 0x00, 0x00, 0x01, 0xF4,
            0x04, 0x02, 0x00, 0x5A,
            0x06, 0x04, 0x00, 0x00, 0x2B, 0xC0,
            0x14, 0x01, 0x01,
            0x13, 0x02, 0x01, 0x01,
            0xA9, 0xF2,
        ])
    }

    func testTerminateFrame() {
        // Screen → TERMINATEWORKOUT: sent before re-programming a busy monitor.
        XCTAssertEqual(hex(PM5WorkoutCodec.terminateFrame()), [
            0xF1, 0x76, 0x04, 0x13, 0x02, 0x01, 0x02, 0x60, 0xF2,
        ])
    }

    // MARK: - Limits clamping (a violated limit would abort with PrevReject)

    func testClampsToPM5Limits() {
        // Distance floor 100 m; rest ceiling 9:55 (595 s).
        XCTAssertEqual(
            PM5WorkoutCodec.programFrame(for: .distanceIntervals(workMeters: 40, restSeconds: 700)),
            PM5WorkoutCodec.programFrame(for: .distanceIntervals(workMeters: 100, restSeconds: 595))
        )
        // Fixed time floor :20; split floor :20.
        XCTAssertEqual(
            PM5WorkoutCodec.programFrame(for: .fixedTime(seconds: 10)),
            PM5WorkoutCodec.programFrame(for: .fixedTime(seconds: 20, splitSeconds: 20))
        )
        // Split may never exceed 50 per piece: 30 km with a requested 100 m split
        // must bump the split to 600 m (30000/50).
        XCTAssertEqual(
            PM5WorkoutCodec.programFrame(for: .fixedDistance(meters: 30_000, splitMeters: 100)),
            PM5WorkoutCodec.programFrame(for: .fixedDistance(meters: 30_000, splitMeters: 600))
        )
        // …and the split has its own ceiling (Table 19): a 10-hour piece caps the
        // time split at 1:30:00, never the raw total/5.
        XCTAssertEqual(
            PM5WorkoutCodec.programFrame(for: .fixedTime(seconds: 35_999)),
            PM5WorkoutCodec.programFrame(for: .fixedTime(seconds: 35_999, splitSeconds: 5_400))
        )
    }

    // MARK: - Chunking (≤20-byte writes)

    func testChunkingSplitsFramesAtTwentyBytes() {
        let frame = PM5WorkoutCodec.programFrame(for: .fixedDistance(meters: 2000))   // 29 bytes
        let chunks = PM5WorkoutCodec.chunks(frame)
        XCTAssertEqual(chunks.map(\.count), [20, 9])
        XCTAssertEqual(chunks.reduce(Data(), +), frame)
        // A short frame stays a single write.
        XCTAssertEqual(PM5WorkoutCodec.chunks(PM5WorkoutCodec.programFrame(for: .justRow())).count, 1)
    }

    // MARK: - Response assembly + verdict (ack → state)

    // Spec p.81 response to the fixed-distance program: status, echoed wrapper
    // listing the five processed command ids, checksum (stuffed when it lands on
    // a flag byte), stop.
    private let ackOkStatus01: [UInt8] = [0xF1, 0x01, 0x76, 0x05, 0x01, 0x03, 0x05, 0x14, 0x13, 0x72, 0xF2]
    private let ackOkStatus81: [UInt8] = [0xF1, 0x81, 0x76, 0x05, 0x01, 0x03, 0x05, 0x14, 0x13, 0xF3, 0x02, 0xF2]

    func testAssemblerDecodesWholeResponse() {
        var assembler = PM5CSAFEResponseAssembler()
        let responses = assembler.feed(Data(ackOkStatus01))
        XCTAssertEqual(responses.count, 1)
        XCTAssertEqual(responses.first?.prevFrameStatus, .ok)
        XCTAssertEqual(responses.first?.echoedWrappedIds, [0x01, 0x03, 0x05, 0x14, 0x13])
    }

    func testAssemblerReassemblesAcrossNotificationSlices() {
        // The PM may slice a response at any 20-byte boundary — feed it in three
        // arbitrary cuts (including one through the stuffed checksum).
        var assembler = PM5CSAFEResponseAssembler()
        XCTAssertEqual(assembler.feed(Data(ackOkStatus81[0..<4])), [])
        XCTAssertEqual(assembler.feed(Data(ackOkStatus81[4..<10])), [])
        let responses = assembler.feed(Data(ackOkStatus81[10...]))
        XCTAssertEqual(responses.count, 1)
        XCTAssertEqual(responses.first?.status, 0x81)
        XCTAssertEqual(responses.first?.prevFrameStatus, .ok)   // frame-toggle bit is not a status
        XCTAssertEqual(responses.first?.echoedWrappedIds, [0x01, 0x03, 0x05, 0x14, 0x13])
    }

    func testAssemblerDropsCorruptChecksum() {
        var corrupted = ackOkStatus01
        corrupted[4] ^= 0xFF   // flip a body byte → checksum mismatch
        var assembler = PM5CSAFEResponseAssembler()
        XCTAssertEqual(assembler.feed(Data(corrupted)), [])
        // …and a good frame right after still decodes (resync on flags).
        XCTAssertEqual(assembler.feed(Data(ackOkStatus01)).count, 1)
    }

    func testProgramVerdictStateMapping() {
        // The expected ack of the flagship interval piece: type + duration +
        // rest + configure + screen.
        let expected = PM5WorkoutCodec.expectedAck(for: .distanceIntervals(workMeters: 500, restSeconds: 90))
        XCTAssertEqual(expected, [0x01, 0x03, 0x04, 0x14, 0x13])

        // Full echo + OK status → sending → PROGRAMMED.
        let full = PM5WorkoutCodec.Response(status: 0x01, echoedWrappedIds: [0x01, 0x03, 0x04, 0x14, 0x13])
        guard case .success = PM5WorkoutCodec.programVerdict(of: full, expecting: expected) else {
            return XCTFail("full ok echo must be a success verdict")
        }

        // The TERMINATE frame's echo (only 0x13) must NOT settle the program —
        // keep waiting for the real ack.
        let terminateEcho = PM5WorkoutCodec.Response(status: 0x01, echoedWrappedIds: [0x13])
        XCTAssertNil(PM5WorkoutCodec.programVerdict(of: terminateEcho, expecting: expected))

        // Reject status (bits 0x30 = 0x10) → FAILED regardless of the echo.
        let rejected = PM5WorkoutCodec.Response(status: 0x11, echoedWrappedIds: [])
        guard case .failure(.rejected) = PM5WorkoutCodec.programVerdict(of: rejected, expecting: expected) else {
            return XCTFail("reject status must be a rejected verdict")
        }

        // Partial echo without the final SET_SCREENSTATE ack → not settled.
        let partial = PM5WorkoutCodec.Response(status: 0x01, echoedWrappedIds: [0x01, 0x03, 0x04, 0x14])
        XCTAssertNil(PM5WorkoutCodec.programVerdict(of: partial, expecting: expected))
    }
}
