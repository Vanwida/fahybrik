import XCTest
@testable import FAHYBRIK

// Tests guiados — the HRR60 engine. Pure offset arithmetic, no clocks: the
// window bounds, the effort-tail mean (hr_end), the 60 s band mean (hr_60), the
// coverage rule (a 57 s skip is NOT a 60 s value), and the honest-nil rules
// (no signal → nil, negative drop → nil — junk never becomes a benchmark).
final class HRRecoveryTests: XCTestCase {

    // MARK: - hr_end (mean of the final 10 s of effort)

    func testHREndAveragesOnlyTheFinalTenSeconds() {
        let capture = HRRecoveryCapture(effortTail: [
            (secondsBeforeFinish: 15, bpm: 140),   // outside the 10 s tail → ignored
            (secondsBeforeFinish: 11, bpm: 150),   // outside → ignored
            (secondsBeforeFinish: 9, bpm: 170),
            (secondsBeforeFinish: 5, bpm: 174),
            (secondsBeforeFinish: 1, bpm: 178),
        ])
        XCTAssertEqual(capture.hrEnd, 174)   // (170+174+178)/3
    }

    func testHREndNilWithoutEffortSignal() {
        XCTAssertNil(HRRecoveryCapture(effortTail: []).hrEnd)
        // Only stale samples (outside the tail) is the same as no signal.
        XCTAssertNil(HRRecoveryCapture(effortTail: [(secondsBeforeFinish: 20, bpm: 160)]).hrEnd)
    }

    func testHREndIgnoresNegativeOffsets() {
        // A sample "after" the finish must never count as effort.
        let capture = HRRecoveryCapture(effortTail: [
            (secondsBeforeFinish: -2, bpm: 120),
            (secondsBeforeFinish: 3, bpm: 170),
        ])
        XCTAssertEqual(capture.hrEnd, 170)
    }

    // MARK: - recovery sampling window

    func testAddSampleDropsOutOfWindowAndNonPositiveReadings() {
        let capture = HRRecoveryCapture(effortTail: [(secondsBeforeFinish: 2, bpm: 170)])
        capture.addSample(bpm: 150, secondsSinceFinish: -1)    // before the finish
        capture.addSample(bpm: 145, secondsSinceFinish: 95)    // past the 90 s window
        capture.addSample(bpm: 0, secondsSinceFinish: 30)      // no reading
        capture.addSample(bpm: -5, secondsSinceFinish: 30)
        XCTAssertTrue(capture.samples.isEmpty)
        capture.addSample(bpm: 150, secondsSinceFinish: 30)
        XCTAssertEqual(capture.samples.count, 1)
    }

    // MARK: - hr_60 (the 60 s mark)

    func testHR60AveragesTheBandAroundSixtySeconds() {
        let capture = HRRecoveryCapture(effortTail: [(secondsBeforeFinish: 2, bpm: 170)])
        capture.addSample(bpm: 160, secondsSinceFinish: 20)    // outside the band → ignored
        capture.addSample(bpm: 142, secondsSinceFinish: 56)
        capture.addSample(bpm: 140, secondsSinceFinish: 60)
        capture.addSample(bpm: 138, secondsSinceFinish: 64)
        capture.addSample(bpm: 130, secondsSinceFinish: 80)    // outside → ignored
        XCTAssertEqual(capture.hr60, 140)   // (142+140+138)/3
    }

    func testHR60RequiresCoverageOfTheMark() {
        // Samples at 55–57 s only (athlete skipped at 57 s): the band has data but
        // the mark itself was never reached → nil, the measurement was abandoned.
        let capture = HRRecoveryCapture(effortTail: [(secondsBeforeFinish: 2, bpm: 170)])
        capture.addSample(bpm: 146, secondsSinceFinish: 55)
        capture.addSample(bpm: 145, secondsSinceFinish: 57)
        XCTAssertNil(capture.hr60)
        // One reading at 58 s+ proves coverage → the band mean stands.
        capture.addSample(bpm: 143, secondsSinceFinish: 58.5)
        XCTAssertEqual(capture.hr60, 145)   // (146+145+143)/3 = 144.67 → 145
    }

    func testHR60NilWithoutRecoverySignal() {
        let capture = HRRecoveryCapture(effortTail: [(secondsBeforeFinish: 2, bpm: 170)])
        XCTAssertNil(capture.hr60)
    }

    // MARK: - hrr60 (the derived result)

    func testHRR60IsTheDropFromEffortEnd() {
        let capture = HRRecoveryCapture(effortTail: [
            (secondsBeforeFinish: 4, bpm: 172),
            (secondsBeforeFinish: 1, bpm: 174),
        ])
        capture.addSample(bpm: 141, secondsSinceFinish: 59)
        capture.addSample(bpm: 141, secondsSinceFinish: 61)
        XCTAssertEqual(capture.hrEnd, 173)
        XCTAssertEqual(capture.hr60, 141)
        XCTAssertEqual(capture.hrr60, 32)
    }

    func testHRR60NilWhenEitherSideMissing() {
        // No effort tail → no hr_end → no result (recovery signal alone is not enough).
        let noEnd = HRRecoveryCapture(effortTail: [])
        noEnd.addSample(bpm: 140, secondsSinceFinish: 60)
        XCTAssertNil(noEnd.hrr60)
        // Effort tail but no recovery signal → no result.
        let noSixty = HRRecoveryCapture(effortTail: [(secondsBeforeFinish: 1, bpm: 170)])
        XCTAssertNil(noSixty.hrr60)
    }

    func testNegativeDropIsAnArtifactAndReadsNil() {
        // Pulse HIGHER a minute after "the end of effort" — the athlete had already
        // stopped before finishing, or the signal glitched. Never a benchmark.
        let capture = HRRecoveryCapture(effortTail: [(secondsBeforeFinish: 2, bpm: 120)])
        capture.addSample(bpm: 150, secondsSinceFinish: 60)
        XCTAssertNil(capture.hrr60)
        // A zero drop is a real (bad) result, not an artifact — kept.
        let flat = HRRecoveryCapture(effortTail: [(secondsBeforeFinish: 2, bpm: 150)])
        flat.addSample(bpm: 150, secondsSinceFinish: 60)
        XCTAssertEqual(flat.hrr60, 0)
    }

    // MARK: - WorkoutSession bridge

    @MainActor
    func testSessionRoutesPostFinishHRIntoTheRecoveryWindowOnly() throws {
        let session = WorkoutSession(plan: .minimal(title: "Test 5K"), hrMaxSource: nil)
        session.start()
        session.injectLiveHR(172, source: .strap)      // effort sample → tail
        session.finish()
        XCTAssertNotNil(session.finishedAt)

        // No window opened → post-finish readings are dropped (normal sessions).
        session.injectLiveHR(160, source: .strap)
        XCTAssertNil(session.hrRecovery)

        session.beginRecoveryWindow()
        let recovery = try XCTUnwrap(session.hrRecovery)
        // hr_end came from the effort tail captured BEFORE finish.
        XCTAssertEqual(recovery.hrEnd, 172)
        // A recovery reading feeds the capture (offset ≈ 0 s) and the live value.
        session.injectLiveHR(158, source: .strap)
        XCTAssertEqual(recovery.samples.count, 1)
        XCTAssertEqual(session.liveHRBpm, 158)
        // Second begin is a no-op (the first window owns the tail).
        session.beginRecoveryWindow()
        XCTAssertTrue(session.hrRecovery === recovery)
    }
}
