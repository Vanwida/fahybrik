import XCTest
@testable import FAHYBRIK

// The rules that decide whether a real treadmill OBEYS, exercised with a fake clock and
// zero Bluetooth: one op in flight at a time, nothing written before the Control Point's
// CCCD is confirmed, Request-Control asked once per grant, the per-family dialects, and
// the escalation that catches a machine which ACKS a target and then ignores it.
final class FTMSControlSequencerTests: XCTestCase {

    /// Captures scheduled work instead of sleeping, so a test fires a timeout on demand.
    final class FakeScheduler {
        private(set) var pending: [(delay: TimeInterval, work: () -> Void)] = []
        func schedule(_ delay: TimeInterval, _ work: @escaping () -> Void) {
            pending.append((delay, work))
        }
        /// Fire every currently-pending item once (new ones queue for the next call).
        func fireAll() {
            let due = pending
            pending.removeAll()
            for item in due { item.work() }
        }
        /// Fire only the items scheduled with roughly this delay.
        func fire(after delay: TimeInterval) {
            let due = pending.filter { abs($0.delay - delay) < 0.001 }
            pending.removeAll { abs($0.delay - delay) < 0.001 }
            for item in due { item.work() }
        }
    }

    private func makeSequencer(profile: FTMSControlProfile = .standard, ready: Bool = true)
        -> (FTMSControlSequencer, FakeScheduler, Writes) {
        let scheduler = FakeScheduler()
        let writes = Writes()
        let seq = FTMSControlSequencer(schedule: { scheduler.schedule($0, $1) })
        seq.onWrite = { writes.record($0) }
        seq.onResult = { writes.results.append($0) }
        seq.adoptProfile(profile)
        if ready { seq.transportReady() }
        return (seq, scheduler, writes)
    }

    /// Collects everything the sequencer put on the wire.
    final class Writes {
        private(set) var data: [Data] = []
        var results: [TreadmillControlResult] = []
        func record(_ d: Data) { data.append(d) }
        var opCodes: [UInt8] { data.compactMap { $0.first } }
        var hex: [String] { data.map { $0.map { String(format: "%02X", $0) }.joined() } }
    }

    /// A Control Point indication acknowledging `op` with `result`.
    private func ack(_ op: UInt8, _ result: UInt8 = 0x01) -> Data { Data([0x80, op, result]) }

    private let opRequestControl: UInt8 = 0x00
    private let opSetSpeed: UInt8 = 0x02
    private let opSetIncline: UInt8 = 0x03
    private let opStart: UInt8 = 0x07

    // MARK: - Rule 1: serialization

    func testOneOpInFlightUntilAck() {
        let (seq, _, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(10))
        // Only the Request-Control prelude has gone out — the target waits behind it.
        XCTAssertEqual(w.opCodes, [opRequestControl])
        seq.send(.setTargetSpeedKmh(12))          // a second tap while the first is in flight
        XCTAssertEqual(w.opCodes, [opRequestControl], "a second write must NOT overlap a procedure")

        seq.handleIndication(ack(opRequestControl))
        XCTAssertEqual(w.opCodes, [opRequestControl, opSetSpeed])
        seq.handleIndication(ack(opSetSpeed))
        XCTAssertEqual(w.opCodes, [opRequestControl, opSetSpeed, opSetSpeed])
    }

    func testTimeoutReleasesAStuckPipeline() {
        let (seq, scheduler, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(10))
        seq.send(.stop)
        XCTAssertEqual(w.opCodes, [opRequestControl])
        // The machine never answers the Request-Control → the ack timeout must let the
        // queue drain anyway, or every later stepper tap is dead.
        scheduler.fire(after: FTMSControlTuning.ackTimeoutSeconds)
        XCTAssertEqual(w.opCodes, [opRequestControl, opSetSpeed])
        scheduler.fire(after: FTMSControlTuning.ackTimeoutSeconds)
        XCTAssertEqual(w.opCodes.count, 3)
    }

    // MARK: - Rule 2: CCCD before any write

    func testNothingIsWrittenBeforeIndicationsAreConfirmed() {
        let (seq, _, w) = makeSequencer(ready: false)
        seq.send(.setTargetSpeedKmh(10))
        seq.send(.start)
        XCTAssertTrue(w.data.isEmpty, "writing before the CCCD is configured earns an ATT error")
        seq.transportReady()
        XCTAssertEqual(w.opCodes, [opRequestControl], "the queue flushes in order, still serialized")
    }

    // MARK: - Request-Control lifecycle

    func testRequestControlAskedOncePerGrant() {
        let (seq, _, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(10))
        seq.handleIndication(ack(opRequestControl))
        seq.handleIndication(ack(opSetSpeed))
        XCTAssertTrue(seq.hasControl)
        seq.send(.setTargetSpeedKmh(11))
        seq.handleIndication(ack(opSetSpeed))
        seq.send(.stop)
        // Exactly one 0x00 across three commands.
        XCTAssertEqual(w.opCodes.filter { $0 == opRequestControl }.count, 1)
    }

    func testControlPermissionLostReArmsTheRequest() {
        let (seq, _, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(10))
        seq.handleIndication(ack(opRequestControl))
        seq.handleIndication(ack(opSetSpeed))
        seq.handleMachineEvent(.controlPermissionLost)
        XCTAssertFalse(seq.hasControl)
        seq.send(.setTargetSpeedKmh(11))
        XCTAssertEqual(w.opCodes.filter { $0 == opRequestControl }.count, 2)
    }

    func testReconnectReArmsTheRequestAndClearsTheQueue() {
        let (seq, _, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(10))
        seq.handleIndication(ack(opRequestControl))
        XCTAssertTrue(seq.hasControl)

        seq.reset()                                   // disconnect → reconnect
        XCTAssertFalse(seq.hasControl)
        XCTAssertFalse(seq.isTransportReady, "the CCCD must be re-confirmed on the new link")
        let before = w.data.count
        seq.send(.setTargetSpeedKmh(10))
        XCTAssertEqual(w.data.count, before, "held until the new link confirms indications")
        seq.transportReady()
        XCTAssertEqual(w.opCodes.last, opRequestControl, "control is re-requested after a reconnect")
    }

    func testNotSupportedRequestControlIsTreatedAsGranted() {
        let (seq, _, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(10))
        seq.handleIndication(ack(opRequestControl, 0x02))   // statically unsupported
        XCTAssertTrue(seq.hasControl, "firmware that refuses the ask has already granted it")
        XCTAssertEqual(w.opCodes.last, opSetSpeed)
        XCTAssertTrue(w.results.isEmpty, "a prelude ack must never reach the athlete's HUD")
    }

    // MARK: - i.Concept family

    func testT01NameSelectsIConcept() {
        XCTAssertEqual(FTMSControlProfile.detect(name: "T01_BD37E"), .iConcept)
        XCTAssertEqual(FTMSControlProfile.detect(name: "t01_bd37e"), .iConcept)
        XCTAssertEqual(FTMSControlProfile.detect(name: " T01_ABCDE "), .iConcept)
        XCTAssertEqual(FTMSControlProfile.detect(name: "Titanium TM2000"), .standard)
        XCTAssertEqual(FTMSControlProfile.detect(name: nil), .standard)
        XCTAssertTrue(FTMSControlProfile.iConcept.inclineIsLevel)
        XCTAssertFalse(FTMSControlProfile.standard.inclineIsLevel)
    }

    func testIConceptSendsTargetsBare() {
        let (seq, _, w) = makeSequencer(profile: .iConcept)
        seq.send(.setTargetSpeedKmh(10))
        XCTAssertEqual(w.opCodes, [opSetSpeed], "no Request-Control, no Start — this firmware chokes on them")
        seq.handleIndication(ack(opSetSpeed))
        seq.send(.setTargetInclineLevel(3))
        XCTAssertEqual(w.opCodes, [opSetSpeed, opSetIncline])
    }

    func testIConceptNeverEscalates() {
        let (seq, scheduler, w) = makeSequencer(profile: .iConcept)
        seq.send(.setTargetSpeedKmh(12))
        seq.handleIndication(ack(opSetSpeed))          // acked Success…
        scheduler.fireAll()                            // …and the belt never moves
        XCTAssertEqual(seq.profile, .iConcept)
        XCTAssertEqual(w.opCodes, [opSetSpeed], "no hammer prelude ever appears on i.Concept")
    }

    // MARK: - Escalation

    func testAckedButUnmovedSpeedEscalatesToHammer() {
        let (seq, scheduler, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(12))
        seq.handleIndication(ack(opRequestControl))
        seq.handleIndication(ack(opSetSpeed))          // Success…
        seq.noteBeltSpeed(kmh: 0)                      // …belt stays put
        scheduler.fire(after: FTMSControlTuning.targetVerificationSeconds)

        XCTAssertEqual(seq.profile, .genericHammer)
        // The escalation RE-SENDS the athlete's target through the new dialect — the tap
        // they made must actually land, not just change our internal strategy.
        XCTAssertEqual(w.opCodes.last, opRequestControl)
        seq.noteWriteCompleted(error: nil)            // prelude ops release on the write ack
        seq.noteWriteCompleted(error: nil)
        XCTAssertEqual(Array(w.opCodes.suffix(3)), [opRequestControl, opStart, opSetSpeed])
    }

    func testMachineStatusTargetSpeedChangedPreventsEscalation() {
        let (seq, scheduler, _) = makeSequencer()
        seq.send(.setTargetSpeedKmh(12))
        seq.handleIndication(ack(opRequestControl))
        seq.handleIndication(ack(opSetSpeed))
        seq.handleMachineEvent(.targetSpeedChangedKmh(12))   // the machine APPLIED it
        scheduler.fireAll()
        XCTAssertEqual(seq.profile, .standard)
    }

    func testBeltConvergingPreventsEscalation() {
        let (seq, scheduler, _) = makeSequencer()
        seq.send(.setTargetSpeedKmh(12))
        seq.handleIndication(ack(opRequestControl))
        seq.handleIndication(ack(opSetSpeed))
        seq.noteBeltSpeed(kmh: 4)      // ramping up from 0 — the machine IS responding
        scheduler.fireAll()
        XCTAssertEqual(seq.profile, .standard, "a slow ramp is obedience, not a deaf machine")
    }

    func testHammerPreludePrecedesEveryTargetButNotStartStop() {
        let (seq, _, w) = makeSequencer(profile: .genericHammer)
        seq.send(.setTargetSpeedKmh(10))
        XCTAssertEqual(w.opCodes, [opRequestControl])
        seq.noteWriteCompleted(error: nil)             // prelude releases on the write ack
        XCTAssertEqual(w.opCodes, [opRequestControl, opStart])
        seq.noteWriteCompleted(error: nil)
        XCTAssertEqual(w.opCodes, [opRequestControl, opStart, opSetSpeed])
        seq.handleIndication(ack(opSetSpeed))

        seq.send(.stop)                                // NOT a target → no prelude
        XCTAssertEqual(w.opCodes.last, 0x08)
        XCTAssertEqual(w.opCodes.count, 4)
    }

    // MARK: - Results reaching the HUD

    func testOnlyRealCommandResultsSurface() {
        let (seq, _, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(10))
        seq.handleIndication(ack(opRequestControl))          // prelude → silent
        XCTAssertTrue(w.results.isEmpty)
        seq.handleIndication(ack(opSetSpeed, 0x05))          // the real op was refused
        XCTAssertEqual(w.results, [.controlNotPermitted])
        XCTAssertFalse(seq.hasControl, "0x05 means the grant is gone")
    }

    func testWriteErrorReleasesAndReportsFailure() {
        let (seq, _, w) = makeSequencer(profile: .iConcept)
        seq.send(.setTargetSpeedKmh(10))
        seq.send(.stop)
        struct Boom: Error {}
        seq.noteWriteCompleted(error: Boom())
        XCTAssertEqual(w.results, [.operationFailed])
        XCTAssertEqual(w.opCodes, [opSetSpeed, 0x08], "a failed write must not wedge the queue")
    }

    // MARK: - Diagnostics trace

    func testTraceCarriesOpNamesAndResults() {
        let scheduler = FakeScheduler()
        var lines: [String] = []
        let seq = FTMSControlSequencer(schedule: { scheduler.schedule($0, $1) })
        seq.onDiagnostic = { lines.append($0) }
        seq.adoptProfile(.iConcept)
        seq.transportReady()
        seq.send(.setTargetSpeedKmh(12.5))
        seq.handleIndication(ack(opSetSpeed, 0x02))

        XCTAssertTrue(lines.contains { $0.contains("i.Concept") })
        XCTAssertTrue(lines.contains { $0.contains("TX 0x02") && $0.contains("02 E2 04") })
        XCTAssertTrue(lines.contains { $0.contains("RX 0x80") && $0.contains("NO SOPORTADO") })
    }
}

// MARK: - Inclination level table (BH i.Concept)

final class FTMSInclineLevelTests: XCTestCase {

    func testLevelToRawMatchesTheConsoleTable() {
        XCTAssertEqual(FTMSInclineLevels.raw(forLevel: 1), 60)
        XCTAssertEqual(FTMSInclineLevels.raw(forLevel: 2), 130)
        XCTAssertEqual(FTMSInclineLevels.raw(forLevel: 3), 200)
        XCTAssertEqual(FTMSInclineLevels.raw(forLevel: 4), 260)
        XCTAssertEqual(FTMSInclineLevels.raw(forLevel: 5), 330)
        XCTAssertEqual(FTMSInclineLevels.raw(forLevel: 6), 400)
        XCTAssertEqual(FTMSInclineLevels.raw(forLevel: 15), 1000)
        // The 6→15 segment is linear at ~66.7 raw per level.
        XCTAssertEqual(Double(FTMSInclineLevels.raw(forLevel: 10)), 400 + 4 * 200.0 / 3, accuracy: 1)
    }

    func testLevelIsClampedToTheRealConsoleRange() {
        XCTAssertEqual(FTMSInclineLevels.raw(forLevel: 0), 60)     // below level 1
        XCTAssertEqual(FTMSInclineLevels.raw(forLevel: 99), 1000)  // above level 15
    }

    func testRawToLevelIsTheInverse() {
        XCTAssertEqual(FTMSInclineLevels.level(forRaw: 60), 1, accuracy: 0.001)
        XCTAssertEqual(FTMSInclineLevels.level(forRaw: 400), 6, accuracy: 0.001)
        XCTAssertEqual(FTMSInclineLevels.level(forRaw: 1000), 15, accuracy: 0.001)
        // His field capture: a "16.0 %" reading is raw 160 — between levels 2 and 3.
        XCTAssertEqual(FTMSInclineLevels.level(forRaw: 160), 2.43, accuracy: 0.02)
        XCTAssertEqual(FTMSInclineLevels.displayLevel(forRaw: 160), 2)
        // Out-of-table readings clamp instead of extrapolating into nonsense.
        XCTAssertEqual(FTMSInclineLevels.level(forRaw: 0), 1, accuracy: 0.001)
        XCTAssertEqual(FTMSInclineLevels.level(forRaw: 5000), 15, accuracy: 0.001)
    }

    func testRoundTripHoldsOnWholeLevels() {
        for level in 1...15 {
            let raw = Double(FTMSInclineLevels.raw(forLevel: Double(level)))
            XCTAssertEqual(FTMSInclineLevels.level(forRaw: raw), Double(level), accuracy: 0.05,
                           "level \(level) must survive the round trip")
        }
    }

    func testEncodedInclineLevelUsesInternalUnitsNotGrade() {
        // Level 3 → raw 200 (0x00C8), NOT 30 (which is what "3 %" would encode).
        XCTAssertEqual([UInt8](FTMSControl.encode(.setTargetInclineLevel(3))), [0x03, 0xC8, 0x00])
        XCTAssertEqual([UInt8](FTMSControl.encode(.setTargetInclinePct(3))), [0x03, 0x1E, 0x00])
        XCTAssertEqual([UInt8](FTMSControl.encode(.setTargetInclineLevel(15))), [0x03, 0xE8, 0x03])
    }
}
