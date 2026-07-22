import XCTest
@testable import FAHYBRIK

// The rules that decide whether a real treadmill OBEYS, exercised with a fake clock and
// zero Bluetooth: one op in flight at a time, nothing written before the transport says
// go, Request-Control asked once per grant, and — the heart of it — the LADDER that finds
// the machine's dialect empirically instead of assuming one.
//
// The regression these lock down is the TM2000 field failure: a hard-coded assumption
// ("i.Concept takes bare targets, never escalate") left the app with no way out when the
// assumption was wrong, so the belt only ever streamed data. Every rung must be reachable,
// the athlete's target must survive every escalation, and the ladder must settle.
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

    private func makeSequencer(profile: FTMSControlProfile = .standard,
                               ready: Bool = true, indications: Bool = true)
        -> (FTMSControlSequencer, FakeScheduler, Writes) {
        let scheduler = FakeScheduler()
        let writes = Writes()
        let seq = FTMSControlSequencer(schedule: { scheduler.schedule($0, $1) })
        seq.onWrite = { writes.record($0) }
        seq.onResult = { writes.results.append($0) }
        seq.adoptProfile(profile)
        if ready { seq.transportReady(indications: indications) }
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
    private let opReset: UInt8 = 0x01
    private let opSetSpeed: UInt8 = 0x02
    private let opSetIncline: UInt8 = 0x03
    private let opStart: UInt8 = 0x07
    private let opTargetDistance: UInt8 = 0x0C
    private let opTargetTime: UInt8 = 0x0D

    /// Drive whatever prelude the CURRENT rung needs until the real target reaches the
    /// wire — write acks for fire-and-forget ops, timeouts for waited ones, and the S4
    /// settling pause. Mirrors what CoreBluetooth + a silent machine would do.
    private func flushToTarget(_ seq: FTMSControlSequencer, _ s: FakeScheduler,
                               _ w: Writes, target: UInt8) {
        for _ in 0..<12 {
            if w.opCodes.last == target { return }
            seq.noteWriteCompleted(error: nil)
            if w.opCodes.last == target { return }
            s.fire(after: FTMSControlTuning.interOpDelaySeconds)
            s.fire(after: FTMSControlTuning.preludeAckTimeoutSeconds)
        }
    }

    /// One full "the machine nods and does nothing" cycle: land the target, ack it, keep
    /// the belt still, and let the verification window expire.
    private func failVerification(_ seq: FTMSControlSequencer, _ s: FakeScheduler, _ w: Writes) {
        flushToTarget(seq, s, w, target: opSetSpeed)
        seq.handleIndication(ack(opSetSpeed))
        seq.noteBeltSpeed(kmh: 0)
        s.fire(after: FTMSControlTuning.targetVerificationSeconds)
    }

    // MARK: - Rule 1: serialization

    func testOneOpInFlightUntilAckAndTheLastTapWins() {
        let (seq, _, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(10))
        // Only the Request-Control prelude has gone out — the target waits behind it.
        XCTAssertEqual(w.opCodes, [opRequestControl])
        seq.send(.setTargetSpeedKmh(12))          // a second tap while the first is in flight
        XCTAssertEqual(w.opCodes, [opRequestControl], "a second write must NOT overlap a procedure")

        seq.handleIndication(ack(opRequestControl))
        // The queued 10 was SUPERSEDED by the 12: a burst of stepper taps must land the
        // athlete's final value, not ramp the belt through every intermediate one.
        XCTAssertEqual(w.opCodes, [opRequestControl, opSetSpeed])
        XCTAssertEqual(w.hex.last, "02B004", "12.0 km/h → 1200 → 0x04B0")
    }

    func testTimeoutReleasesAStuckPipeline() {
        let (seq, scheduler, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(10))
        seq.send(.stop)
        XCTAssertEqual(w.opCodes, [opRequestControl])
        // The machine never answers the Request-Control → the prelude timeout must let the
        // queue drain anyway, or every later stepper tap is dead.
        scheduler.fire(after: FTMSControlTuning.preludeAckTimeoutSeconds)
        XCTAssertEqual(w.opCodes, [opRequestControl, opSetSpeed])
        scheduler.fire(after: FTMSControlTuning.ackTimeoutSeconds)
        XCTAssertEqual(w.opCodes, [opRequestControl, opSetSpeed, 0x08])
    }

    /// A machine whose Control Point never indicates must not stall a beat per op.
    func testWithoutIndicationsNothingWaitsForAnAck() {
        let (seq, _, w) = makeSequencer(indications: false)
        seq.send(.setTargetSpeedKmh(10))
        // Request Control released on the WRITE ack alone, so the target follows at once.
        seq.noteWriteCompleted(error: nil)
        seq.noteWriteCompleted(error: nil)
        XCTAssertEqual(w.opCodes, [opRequestControl, opSetSpeed])
    }

    // MARK: - Rule 2: transport gate before any write

    func testNothingIsWrittenBeforeTheTransportIsReady() {
        let (seq, _, w) = makeSequencer(ready: false)
        seq.send(.setTargetSpeedKmh(10))
        seq.send(.start)
        XCTAssertTrue(w.data.isEmpty, "writing before the CCCD is configured earns an ATT error")
        seq.transportReady()
        XCTAssertEqual(w.opCodes, [opRequestControl], "the queue flushes in order, still serialized")
    }

    // MARK: - Request-Control lifecycle (rung S2)

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

    /// The vendor sequence for his TM2000 is explicit: write 00, WAIT for `80 00 01`, only
    /// then the target. S2 must not pipeline them.
    func testS2WaitsForTheRequestControlAckBeforeTheTarget() {
        let (seq, scheduler, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(5))
        XCTAssertEqual(w.opCodes, [opRequestControl])
        seq.noteWriteCompleted(error: nil)   // the WRITE landed — but no indication yet
        XCTAssertEqual(w.opCodes, [opRequestControl], "the target must wait for 80 00 01")
        scheduler.fire(after: FTMSControlTuning.ackTimeoutSeconds)   // wrong timer, no effect
        XCTAssertEqual(w.opCodes, [opRequestControl])
        seq.handleIndication(ack(opRequestControl))
        XCTAssertEqual(w.opCodes, [opRequestControl, opSetSpeed])
        XCTAssertEqual(w.hex.last, "02F401", "5 km/h → 500 → 0x01F4, exactly as nRF Connect")
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
        XCTAssertEqual(w.data.count, before, "held until the new link is ready")
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

    /// A learned rung / dialect belongs to the MACHINE and survives the link dropping.
    func testReconnectKeepsWhatTheMachineTaught() {
        let (seq, _, _) = makeSequencer()
        seq.reset(profile: .iConcept, strategy: .s4, inclineDialect: .level)
        XCTAssertEqual(seq.strategy, .s4)
        XCTAssertEqual(seq.inclineDialect, .level)
    }

    // MARK: - Family detection

    func testT01NameSelectsIConcept() {
        XCTAssertEqual(FTMSControlProfile.detect(name: "T01_BD37E"), .iConcept)
        XCTAssertEqual(FTMSControlProfile.detect(name: "t01_bd37e"), .iConcept)
        XCTAssertEqual(FTMSControlProfile.detect(name: " T01_ABCDE "), .iConcept)
        XCTAssertEqual(FTMSControlProfile.detect(name: "Titanium TM2000"), .standard)
        XCTAssertEqual(FTMSControlProfile.detect(name: nil), .standard)
    }

    /// The family now only chooses where the ladder STARTS. Both families lead with S2 —
    /// the spec's own rule and the TM2000 vendor sequence — and both can reach every rung.
    func testEveryFamilyStartsAtS2AndCanReachEveryRung() {
        for profile in [FTMSControlProfile.standard, .iConcept] {
            XCTAssertEqual(profile.strategyLadder.first, .s2, "\(profile) must lead with S2")
            XCTAssertEqual(Set(profile.strategyLadder), Set(FTMSControlStrategy.allCases),
                           "\(profile) must be able to reach every rung")
            XCTAssertEqual(profile.strategyLadder.count, FTMSControlStrategy.allCases.count,
                           "\(profile) must not repeat a rung — the ladder has to settle")
        }
        // i.Concept tries the BARE target second (qdomyos-zwift's assumption), not first.
        XCTAssertEqual(FTMSControlProfile.iConcept.strategyLadder[1], .s1)
    }

    // MARK: - THE LADDER

    /// THE i.Concept MODEL (matches qdomyos-zwift). Its Control-Point acks LIE — it answers
    /// Set Target Speed with "not supported" on a belt that actually obeys — so we drive it
    /// fire-and-forget, IGNORE the ack, and never climb a ladder. The belt is commanded by a
    /// re-assert poll, not by chasing a rung the ack can't inform.
    func testIConceptFiresAndForgetsIgnoresTheLyingAckAndDoesNotClimb() {
        let (seq, scheduler, w) = makeSequencer(profile: .iConcept)
        XCTAssertEqual(seq.strategy, .s2, "0x00 request control + 0x02 target — no Start, no wait")
        seq.send(.setTargetSpeedKmh(6))
        seq.noteWriteCompleted(error: nil)      // request control write (fire-and-forget)
        seq.noteWriteCompleted(error: nil)      // target write (fire-and-forget)
        XCTAssertEqual(w.opCodes, [opRequestControl, opSetSpeed], "no Start (0x07) in the routine path")
        XCTAssertEqual(w.hex.last, "025802", "6.0 km/h → 600 → 0x0258, LE")

        // The machine's "Op Code Not Supported" is IGNORED — no result to the HUD, no climb.
        seq.handleIndication(ack(opSetSpeed, 0x02))
        XCTAssertTrue(w.results.isEmpty, "the lying ack must never reach the athlete")
        seq.noteBeltSpeed(kmh: 0)
        scheduler.fire(after: FTMSControlTuning.targetVerificationSeconds)
        XCTAssertEqual(seq.strategy, .s2, "i.Concept never escalates — it re-asserts instead")
    }

    /// The QZ poll: the target is re-written on a timer, fire-and-forget, and CRUCIALLY the
    /// re-assert never carries a Start (0x07) — so it can't revive a stopped belt.
    func testIConceptReassertsTheTargetOnAPollWithoutEverStarting() {
        let (seq, scheduler, w) = makeSequencer(profile: .iConcept)
        seq.send(.setTargetSpeedKmh(8))
        seq.noteWriteCompleted(error: nil); seq.noteWriteCompleted(error: nil)
        let before = w.opCodes.count

        scheduler.fire(after: FTMSControlTuning.reassertIntervalSeconds)   // one poll tick
        seq.noteWriteCompleted(error: nil); seq.noteWriteCompleted(error: nil)
        XCTAssertEqual(Array(w.opCodes.suffix(2)), [opRequestControl, opSetSpeed],
                       "re-assert = request control + speed")
        XCTAssertFalse(w.opCodes.dropFirst(before).contains(opStart),
                       "a re-assert must NEVER send Start — it could restart a stopped belt")
        XCTAssertEqual(w.hex.last, "022003", "still 8.0 km/h → 800 → 0x0320, LE")
    }

    /// SAFETY: a stop kills the re-assert poll — a belt he stopped is never re-commanded.
    func testAStopKillsTheIConceptReassertPoll() {
        let (seq, scheduler, w) = makeSequencer(profile: .iConcept)
        seq.send(.setTargetSpeedKmh(6))
        seq.noteWriteCompleted(error: nil); seq.noteWriteCompleted(error: nil)
        seq.send(.stop)
        seq.noteWriteCompleted(error: nil)
        let afterStop = w.opCodes.count

        scheduler.fireAll()   // fire the re-assert (and anything else) — nothing may go out
        seq.noteWriteCompleted(error: nil)
        XCTAssertEqual(w.opCodes.count, afterStop, "the poll is dead after a stop")
        XCTAssertFalse(w.opCodes.dropFirst(afterStop).contains(opSetSpeed),
                       "a stopped belt is never re-sent a speed target")
    }

    func testLadderClimbsEveryRungThenSettles() {
        let (seq, scheduler, w) = makeSequencer()
        XCTAssertEqual(seq.strategy, .s2)
        seq.send(.setTargetSpeedKmh(12))

        var walked: [FTMSControlStrategy] = [seq.strategy]
        for _ in 0..<6 {
            failVerification(seq, scheduler, w)
            walked.append(seq.strategy)
        }
        // Standard order, then the ladder is EXHAUSTED and stays put — no infinite churn.
        XCTAssertEqual(walked, [.s2, .s3, .s4, .s5, .s1, .s1, .s1])
    }

    func testEveryEscalationReSendsTheAthletesTarget() {
        let (seq, scheduler, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(12))
        for _ in 0..<4 { failVerification(seq, scheduler, w) }
        // 12.0 km/h → 1200 → 0x04B0. One write per rung tried (S2…S1), never lost.
        let targetWrites = w.hex.filter { $0 == "02B004" }
        XCTAssertEqual(targetWrites.count, 5,
                       "the tap he made must be re-issued through each new dialect")
    }

    func testEachRungPutsItsOwnPreludeOnTheWire() {
        // S3: request control + start before the target, fire-and-forget.
        let (s3, _, w3) = makeSequencer()
        s3.forceStrategy(.s3)
        s3.send(.setTargetSpeedKmh(10))
        XCTAssertEqual(w3.opCodes, [opRequestControl])
        s3.noteWriteCompleted(error: nil)
        s3.noteWriteCompleted(error: nil)
        XCTAssertEqual(w3.opCodes, [opRequestControl, opStart, opSetSpeed])

        // S4: the same, with a settling pause that writes nothing before the target.
        let (s4, sch4, w4) = makeSequencer()
        s4.forceStrategy(.s4)
        s4.send(.setTargetSpeedKmh(10))
        s4.noteWriteCompleted(error: nil)
        s4.noteWriteCompleted(error: nil)
        XCTAssertEqual(w4.opCodes, [opRequestControl, opStart], "the target waits out the pause")
        sch4.fire(after: FTMSControlTuning.interOpDelaySeconds)
        XCTAssertEqual(w4.opCodes, [opRequestControl, opStart, opSetSpeed])

        // S5: reset first, everything waited.
        let (s5, sch5, w5) = makeSequencer()
        s5.forceStrategy(.s5)
        s5.send(.setTargetSpeedKmh(10))
        XCTAssertEqual(w5.opCodes, [opReset])
        for _ in 0..<3 { sch5.fire(after: FTMSControlTuning.preludeAckTimeoutSeconds) }
        XCTAssertEqual(w5.opCodes, [opReset, opRequestControl, opStart, opSetSpeed])

        // S1: nothing at all before the target.
        let (s1, _, w1) = makeSequencer()
        s1.forceStrategy(.s1)
        s1.send(.setTargetSpeedKmh(10))
        XCTAssertEqual(w1.opCodes, [opSetSpeed])
    }

    func testPreludeNeverDelaysAStop() {
        let (seq, _, w) = makeSequencer()
        seq.forceStrategy(.s3)
        seq.send(.stop)
        XCTAssertEqual(w.opCodes, [0x08], "the safety stop must never queue behind a handshake")
    }

    // MARK: - The winning rung sticks

    func testAConfirmedRungIsKeptForTheRestOfTheSession() {
        let (seq, scheduler, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(12))
        seq.handleIndication(ack(opRequestControl))
        seq.handleIndication(ack(opSetSpeed))
        seq.noteBeltSpeed(kmh: 4)                 // the belt IS ramping → S2 works
        XCTAssertTrue(seq.strategyConfirmed)
        scheduler.fireAll()
        XCTAssertEqual(seq.strategy, .s2)

        // A later miss (busy machine, someone on the console) must NOT undo what we know.
        seq.send(.setTargetSpeedKmh(16))
        flushToTarget(seq, scheduler, w, target: opSetSpeed)
        seq.handleIndication(ack(opSetSpeed))
        seq.noteBeltSpeed(kmh: 4)
        scheduler.fire(after: FTMSControlTuning.targetVerificationSeconds)
        XCTAssertEqual(seq.strategy, .s2, "a proven rung is the answer for the session")
    }

    func testMachineStatusTargetSpeedChangedConfirmsTheRung() {
        let (seq, scheduler, _) = makeSequencer()
        seq.send(.setTargetSpeedKmh(12))
        seq.handleIndication(ack(opRequestControl))
        seq.handleIndication(ack(opSetSpeed))
        seq.handleMachineEvent(.targetSpeedChangedKmh(12))   // the machine APPLIED it
        scheduler.fireAll()
        XCTAssertEqual(seq.strategy, .s2)
        XCTAssertTrue(seq.strategyConfirmed)
    }

    func testBeltConvergingPreventsEscalation() {
        let (seq, scheduler, _) = makeSequencer()
        seq.send(.setTargetSpeedKmh(12))
        seq.handleIndication(ack(opRequestControl))
        seq.handleIndication(ack(opSetSpeed))
        seq.noteBeltSpeed(kmh: 4)      // ramping up from 0 — the machine IS responding
        scheduler.fireAll()
        XCTAssertEqual(seq.strategy, .s2, "a slow ramp is obedience, not a deaf machine")
    }

    /// A machine that never acks at all still has to be caught out for not obeying —
    /// verification is armed when the op LEAVES the pipeline, not only on a success ack.
    func testASilentMachineStillEscalates() {
        let (seq, scheduler, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(12))
        scheduler.fire(after: FTMSControlTuning.preludeAckTimeoutSeconds)  // no 0x00 ack
        XCTAssertEqual(w.opCodes.last, opSetSpeed)
        scheduler.fire(after: FTMSControlTuning.ackTimeoutSeconds)         // no 0x02 ack
        seq.noteBeltSpeed(kmh: 0)
        scheduler.fire(after: FTMSControlTuning.targetVerificationSeconds)
        XCTAssertEqual(seq.strategy, .s3, "silence is not obedience")
    }

    /// "Control Not Permitted" is the machine spelling out that the prelude is wrong —
    /// no reason to sit out the 5 s window.
    func testControlNotPermittedEscalatesImmediately() {
        let (seq, _, _) = makeSequencer()
        seq.send(.setTargetSpeedKmh(12))
        seq.handleIndication(ack(opRequestControl))
        seq.handleIndication(ack(opSetSpeed, 0x05))
        XCTAssertEqual(seq.strategy, .s3)
    }

    // MARK: - SAFETY: an escalation must never resurrect a stopped belt

    func testAStopCancelsAnyPendingReSendOfTheSpeedTarget() {
        let (seq, scheduler, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(12))
        seq.handleIndication(ack(opRequestControl))
        seq.handleIndication(ack(opSetSpeed))          // verification armed, belt still
        seq.send(.stop)                                // he hits STOP
        seq.handleIndication(ack(0x08))
        let writesAtStop = w.opCodes.count

        seq.noteBeltSpeed(kmh: 0)
        scheduler.fire(after: FTMSControlTuning.targetVerificationSeconds)
        XCTAssertEqual(w.opCodes.count, writesAtStop,
                       "a pending escalation must NEVER re-send a speed target after a stop")
        XCTAssertFalse(w.opCodes.dropFirst(writesAtStop).contains(opSetSpeed))
    }

    func testTheSafetyKeyAlsoCancelsAPendingReSend() {
        let (seq, scheduler, w) = makeSequencer()
        seq.send(.setTargetSpeedKmh(12))
        seq.handleIndication(ack(opRequestControl))
        seq.handleIndication(ack(opSetSpeed))
        seq.handleMachineEvent(.stoppedBySafetyKey)    // the belt stopped itself
        let writesAtStop = w.opCodes.count

        scheduler.fire(after: FTMSControlTuning.targetVerificationSeconds)
        XCTAssertEqual(w.opCodes.count, writesAtStop,
                       "the app does not restart a belt the safety key just stopped")
    }

    // MARK: - Manual override (field diagnosis)

    func testPinningARungStopsTheLadder() {
        let (seq, scheduler, w) = makeSequencer()
        seq.forceStrategy(.s3)
        XCTAssertTrue(seq.isStrategyPinned)
        seq.send(.setTargetSpeedKmh(12))
        failVerification(seq, scheduler, w)
        XCTAssertEqual(seq.strategy, .s3, "he is testing this rung by hand — don't move it")

        seq.forceStrategy(nil)          // back to automatic
        XCTAssertFalse(seq.isStrategyPinned)
        seq.send(.setTargetSpeedKmh(12))
        failVerification(seq, scheduler, w)
        XCTAssertEqual(seq.strategy, .s4, "the ladder picks up from where he left it")
    }

    // MARK: - The incline UNITS axis (independent of the prelude)

    /// Land an incline target through whatever prelude the rung needs, then ack it.
    private func sendAndAckIncline(_ seq: FTMSControlSequencer, _ s: FakeScheduler,
                                   _ w: Writes, value: Double) {
        seq.sendIncline(value: value)
        flushToTarget(seq, s, w, target: opSetIncline)
        seq.handleIndication(ack(opSetIncline))
    }

    func testInclineDialectFlipsWhenTheMachineIgnoresTheGrade() {
        let (seq, scheduler, w) = makeSequencer()
        XCTAssertEqual(seq.inclineDialect, .grade, "the spec meaning is what we try first")
        sendAndAckIncline(seq, scheduler, w, value: 3)
        XCTAssertEqual(w.hex.last, "031E00", "3 % → raw 30")
        seq.noteInclineRaw(0)                       // the belt stays flat
        scheduler.fire(after: FTMSControlTuning.targetVerificationSeconds)

        XCTAssertEqual(seq.inclineDialect, .level, "try the other meaning of the field")
        // The SAME number is re-sent in the new units — "3" still means the third notch.
        flushToTarget(seq, scheduler, w, target: opSetIncline)
        XCTAssertEqual(w.hex.last, "03C800", "level 3 → raw 200")
    }

    func testInclineThatArrivesConfirmsTheDialectAndStopsFlipping() {
        let (seq, scheduler, w) = makeSequencer()
        sendAndAckIncline(seq, scheduler, w, value: 3)
        seq.noteInclineRaw(30)                      // exactly what "3 %" asked for
        XCTAssertTrue(seq.inclineDialectConfirmed)
        scheduler.fireAll()
        XCTAssertEqual(seq.inclineDialect, .grade)
    }

    /// The two axes must not contaminate each other: a belt whose incline never reports
    /// back must not knock a speed dialect that is working off its rung.
    func testAnUnansweredInclineNeverMovesTheStrategyRung() {
        let (seq, scheduler, w) = makeSequencer()
        sendAndAckIncline(seq, scheduler, w, value: 3)
        seq.noteInclineRaw(0)
        scheduler.fire(after: FTMSControlTuning.targetVerificationSeconds)
        XCTAssertEqual(seq.strategy, .s2, "incline proves UNITS, never the prelude")
        XCTAssertEqual(seq.inclineDialect, .level)

        // The re-sent level command goes unanswered too → the units ladder is exhausted
        // and settles, and the prelude rung is STILL untouched.
        seq.handleIndication(ack(opSetIncline))
        seq.noteInclineRaw(0)
        scheduler.fire(after: FTMSControlTuning.targetVerificationSeconds)
        XCTAssertEqual(seq.strategy, .s2)
        XCTAssertEqual(seq.inclineDialect, .level, "no third interpretation to churn through")
    }

    func testPinningTheInclineDialectStopsTheFlip() {
        let (seq, scheduler, w) = makeSequencer()
        seq.forceInclineDialect(.level)
        sendAndAckIncline(seq, scheduler, w, value: 3)
        XCTAssertEqual(w.hex.last, "03C800", "pinned to levels → level 3, raw 200")
        seq.noteInclineRaw(0)
        scheduler.fireAll()
        XCTAssertEqual(seq.inclineDialect, .level, "he is testing this interpretation by hand")
    }

    // MARK: - Programming the piece onto the machine's display

    func testWorkoutProgrammingIsBestEffortAndSilent() {
        let (seq, _, w) = makeSequencer()
        seq.sendBestEffort(.setTargetedDistanceM(1000))
        seq.handleIndication(ack(opRequestControl))
        XCTAssertEqual(w.opCodes.last, opTargetDistance)
        // The machine refuses it → the athlete must never see an error for something we
        // added ourselves, and the run carries on untouched.
        seq.handleIndication(ack(opTargetDistance, 0x02))
        XCTAssertTrue(w.results.isEmpty, "a rejected nice-to-have is not the athlete's problem")

        seq.sendBestEffort(.setTargetedTrainingTimeS(600))
        seq.handleIndication(ack(opTargetTime, 0x02))
        XCTAssertTrue(w.results.isEmpty)
    }

    func testWorkoutProgrammingNeverMovesTheLadder() {
        let (seq, scheduler, _) = makeSequencer()
        seq.sendBestEffort(.setTargetedDistanceM(1000))
        seq.handleIndication(ack(opRequestControl))
        seq.handleIndication(ack(opTargetDistance, 0x05))   // control not permitted
        scheduler.fireAll()
        XCTAssertEqual(seq.strategy, .s2, "a display nicety must never re-dialect the belt")
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
        let (seq, _, w) = makeSequencer()
        seq.forceStrategy(.s1)
        seq.send(.setTargetSpeedKmh(10))
        seq.send(.stop)
        struct Boom: Error {}
        seq.noteWriteCompleted(error: Boom())
        XCTAssertEqual(w.results, [.operationFailed])
        XCTAssertEqual(w.opCodes, [opSetSpeed, 0x08], "a failed write must not wedge the queue")
    }

    // MARK: - Diagnostics trace

    func testTraceCarriesOpNamesResultsAndTheRung() {
        let scheduler = FakeScheduler()
        var lines: [String] = []
        let seq = FTMSControlSequencer(schedule: { scheduler.schedule($0, $1) })
        seq.onDiagnostic = { lines.append($0) }
        seq.adoptProfile(.iConcept)
        seq.transportReady()
        seq.forceStrategy(.s1)
        seq.send(.setTargetSpeedKmh(12.5))
        seq.handleIndication(ack(opSetSpeed, 0x02))

        XCTAssertTrue(lines.contains { $0.contains("i.Concept") })
        // The hex is byte-for-byte what he would type into nRF Connect on 0x2AD9.
        XCTAssertTrue(lines.contains { $0.contains("TX 0x02") && $0.contains("02 E2 04") })
        XCTAssertTrue(lines.contains { $0.contains("RX 0x80") && $0.contains("NO SOPORTADO") })
        XCTAssertTrue(lines.contains { $0.contains("S1") }, "the trace must say which rung is live")
    }
}

// MARK: - Inclination level table (BH i.Concept)

final class FTMSInclineLevelTests: XCTestCase {

    func testLevelToRawMatchesTheConsoleTable() {
        // Every level is transcribed verbatim from qdomyos-zwift horizontreadmill.cpp
        // (val1/val2 → Inclination), so raw ↔ level is exact, not interpolated.
        let table: [(Double, Int)] = [
            (1, 60), (2, 130), (3, 200), (4, 260), (5, 330), (6, 400), (7, 460), (8, 530),
            (9, 600), (10, 660), (11, 730), (12, 800), (13, 860), (14, 930), (15, 1000)
        ]
        for (level, raw) in table {
            XCTAssertEqual(FTMSInclineLevels.raw(forLevel: level), raw, "level \(level) → raw \(raw)")
        }
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

    /// Both meanings must stay reachable and must encode differently — the whole point of
    /// keeping two interpretations is that the machine gets to choose.
    func testTheTwoDialectsDisagreeOnPurpose() {
        XCTAssertEqual(FTMSInclineDialect.grade.rawValue(for: 3), 30)
        XCTAssertEqual(FTMSInclineDialect.level.rawValue(for: 3), 200)
        XCTAssertEqual(FTMSInclineDialect.grade.command(for: 3), .setTargetInclinePct(3))
        XCTAssertEqual(FTMSInclineDialect.level.command(for: 3), .setTargetInclineLevel(3))
        XCTAssertEqual(FTMSInclineDialect.grade.controlUnit, "%")
        XCTAssertEqual(FTMSInclineDialect.level.controlUnit, "")
    }
}
