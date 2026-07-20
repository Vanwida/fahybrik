import XCTest
@testable import FAHYBRIK

// #61 — native execution of the structured run on a real WorkoutSession: the flat
// leg cursor walks the expanded legs, the treadmill model auto-closes DISTANCE
// bouts per-bout (heterogeneous pyramids included) while the session owns TIME
// legs, and the leg count / accessors match. Mirrors TreadmillAutoAdvanceTests'
// injected-source harness; asserts the LEGACY rotating path is never touched.
final class StructuredRunEngineTests: XCTestCase {

    // MARK: - Injected source doubles (no CoreBluetooth) — mirror the legacy harness

    final class FakeTreadmill: TreadmillDataSource {
        var onSample: ((TreadmillSample) -> Void)?
        var onLink: ((DeviceLink) -> Void)?
        var onDiscovered: (([DeviceCandidate]) -> Void)?
        var onBluetooth: ((BluetoothAvailability) -> Void)?
        func startScan() {}
        func connect(_ id: DeviceID) {}
        func disconnect() {}
        func stop() {}
        func diagnosticsText() -> String? { nil }
        func emit(_ totalDistanceM: Double, speedKmh: Double = 12) {
            onSample?(TreadmillSample(speedKmh: speedKmh, inclinePct: 1,
                                      totalDistanceM: totalDistanceM, elapsedS: nil,
                                      hrBpm: nil, lastUpdate: Date()))
        }
    }
    final class FakeHR: HeartRateSource {
        var onBpm: ((Int) -> Void)?
        var onBattery: ((Int) -> Void)?
        var onLink: ((DeviceLink) -> Void)?
        var onDiscovered: (([DeviceCandidate]) -> Void)?
        var onBluetooth: ((BluetoothAvailability) -> Void)?
        func startScan() {}
        func connect(_ id: DeviceID) {}
        func disconnect() {}
        func stop() {}
        func diagnosticsText() -> String? { nil }
    }

    // MARK: - Structure builders

    private func work(_ m: RunSegmentMeasure, _ t: RunSegmentTarget? = nil,
                      incline: Double? = nil, cadence: Int? = nil) -> RunElement {
        .segment(RunSegment(kind: .work, measure: m, target: t, resolved: nil,
                            inclinePct: incline, cadenceSpm: cadence, recoveryMode: nil))
    }
    private func rec(_ m: RunSegmentMeasure, _ mode: RunRecoveryMode) -> RunElement {
        .segment(RunSegment(kind: .recovery, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: mode))
    }
    private func rep(_ n: Int, _ els: [RunElement]) -> RunElement { .repeatBlock(times: n, elements: els) }
    private func main(_ els: [RunElement]) -> RunPhase { RunPhase(role: .main, elements: els) }

    // MARK: - Manual leg walk through a full structure

    func testManualLegWalkFinishesAfterLastLeg() {
        // 3×(400m work + 60s parado) = 6 legs, ending on a recovery.
        let s = structuredSession([main([rep(3, [work(.distance(m: 400)), rec(.duration(s: 60), .parado)])])])
        XCTAssertTrue(s.isRunStructureActive)
        XCTAssertTrue(s.isRunCountIn)
        XCTAssertEqual(s.runLegTotal, 6)
        XCTAssertFalse(s.rotRoundIndex > 0)   // the rotating machine is NOT driving this

        s.primaryAdvance()                     // first tap only skips the 3-2-1
        XCTAssertFalse(s.isRunCountIn)
        XCTAssertEqual(s.runLegIndex, 0)
        XCTAssertTrue(s.isRunLegWork)
        XCTAssertTrue(s.currentRunLegIsDistance)

        s.primaryAdvance(); XCTAssertEqual(s.runLegIndex, 1); XCTAssertFalse(s.isRunLegWork)  // work0→rec0
        s.primaryAdvance(); XCTAssertEqual(s.runLegIndex, 2); XCTAssertTrue(s.isRunLegWork)   // rec0→work1
        s.primaryAdvance(); s.primaryAdvance(); s.primaryAdvance()                            // →3,4,5
        XCTAssertEqual(s.runLegIndex, 5)
        XCTAssertFalse(s.isFinished)
        s.primaryAdvance()                     // last leg done → single segment → finish
        XCTAssertTrue(s.isFinished)
    }

    // MARK: - Treadmill auto-closes each DISTANCE bout; session owns the recovery

    func testTreadmillClosesHeterogeneousPyramidPerBout() {
        // 1200 / 1000 / 800 as a structure, 60s parado recoveries between.
        let s = structuredSession([main([
            work(.distance(m: 1200)), rec(.duration(s: 60), .parado),
            work(.distance(m: 1000)), rec(.duration(s: 60), .parado),
            work(.distance(m: 800)),
        ])])
        s.primaryAdvance()                     // skip the count-in
        let (m, src) = makeModel(s)

        XCTAssertEqual(m.currentLeg.goal, .distance(meters: 1200))  // per-bout, not a scalar
        src.emit(100); src.emit(1310)                              // covered 1210 ≥ 1200
        XCTAssertEqual(s.runLegIndex, 1)                           // → recovery
        XCTAssertFalse(s.isRunLegWork)

        // Recovery is a TIME leg → the belt must NOT advance it (session-owned).
        src.emit(2000); src.emit(3000)
        XCTAssertEqual(s.runLegIndex, 1)

        s.primaryAdvance()                                         // skip the recovery manually
        XCTAssertEqual(s.currentRunLeg?.distanceMeters, 1000)      // the SECOND, different distance
        src.emit(3100); src.emit(4110)                            // covered 1010 ≥ 1000
        XCTAssertEqual(s.runLegIndex, 3)                          // → its recovery
        m.teardown()
    }

    // MARK: - Manual override (no treadmill) closes a distance bout — the #64 seam

    func testDistanceBoutWithoutBeltClosesManually() {
        let s = structuredSession([main([work(.distance(m: 800)), work(.distance(m: 600))])])
        s.primaryAdvance()                     // skip count-in
        XCTAssertTrue(s.currentRunLegIsDistance)
        XCTAssertEqual(s.runLegIndex, 0)
        s.primaryAdvance()                     // "TRAMO HECHO" with no belt → manual close
        XCTAssertEqual(s.runLegIndex, 1)
        XCTAssertEqual(s.currentRunLeg?.distanceMeters, 600)
    }

    // MARK: - Pure resolver / count units

    func testStructuredLegResolvesPerBoutAndOwnership() {
        // A distance work bout is belt-owned; a distance RECOVERY is belt-owned too
        // (the trota-200m seam); a TIME work bout is session-owned.
        let distSeg = structuredSegment([main([rep(6, [work(.distance(m: 1000)), rec(.distance(m: 200), .trote)])])])
        let w = TreadmillLegResolver.leg(for: distSeg, structureLegIndex: 0)
        XCTAssertEqual(w.goal, .distance(meters: 1000)); XCTAssertTrue(w.ownsAutoAdvance)
        let r = TreadmillLegResolver.leg(for: distSeg, structureLegIndex: 1)
        XCTAssertEqual(r.phase, .recovery)
        XCTAssertEqual(r.goal, .distance(meters: 200)); XCTAssertTrue(r.ownsAutoAdvance)   // the seam
        XCTAssertEqual(r.target, .none)

        let timeSeg = structuredSegment([main([work(.duration(s: 180))])])
        let t = TreadmillLegResolver.leg(for: timeSeg, structureLegIndex: 0)
        XCTAssertEqual(t.goal, .time(seconds: 180)); XCTAssertFalse(t.ownsAutoAdvance)      // session clock
    }

    func testStructuredLegCountAndPosition() {
        let seg = structuredSegment([main([rep(6, [work(.distance(m: 1000)), rec(.distance(m: 200), .trote)])])])
        XCTAssertEqual(WorkoutLegCount.legs(in: seg), 12)
        // 3rd work bout = 5th global leg: w r w r w …
        XCTAssertEqual(WorkoutLegCount.current([seg], index: 0, structureLegIndex: 4), 5)
        XCTAssertEqual(WorkoutLegCount.total([seg]), 12)
    }

    func testResolvedZoneBandJudgesAsPaceAndInclineReaches() {
        let seg = structuredSegment([main([
            work(.distance(m: 200), .hrZone(4), incline: 8, cadence: 182),
        ])])
        // No resolved band supplied → an hr_zone shows the zone label, not a fake pace.
        let leg = seg.runStructureLegs![0]
        if case .zone = leg.runTarget {} else { XCTFail("hr_zone with no resolved band should judge as zone") }
        XCTAssertEqual(leg.inclinePct, 8)
        XCTAssertEqual(leg.cadenceSpm, 182)
    }

    // MARK: - Legacy is untouched

    func testLegacySeriesDoesNotEnterStructureEngine() {
        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: 4, workS: nil,
                              restS: 60, totalS: nil, target: nil, note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "4×400", kind: .running,
                                 targetDistanceMeters: 400, blockTitle: "Series", blockPosition: 1, prescription: rx)
        XCTAssertFalse(seg.hasRunStructure)
        let s = WorkoutSession(plan: plan([seg]))
        s.start(); s.beginBlock(); s.stop()
        XCTAssertFalse(s.isRunStructureActive)
        XCTAssertTrue(s.isCondCountIn)     // legacy still runs the conditioning engine
    }

    // MARK: - #62 · treadmill incline folds into the ONE segment lap

    func testTreadmillInclineAveragesIntoSegmentLap() {
        let s = structuredSession([main([work(.distance(m: 1000))])])
        s.primaryAdvance()                     // skip the count-in
        s.sampleTreadmillIncline(2.0)          // belt grade readings over the segment
        s.sampleTreadmillIncline(4.0)
        s.primaryAdvance()                     // last leg done → close the segment lap
        let lap = try! XCTUnwrap(s.laps.last)
        XCTAssertEqual(try XCTUnwrap(lap.inclinePct), 3.0, accuracy: 0.001)  // mean(2, 4)
        XCTAssertNil(lap.runCadenceSpm)        // no on-device cadence source → stays nil
    }

    func testNoTreadmillLeavesInclineNil() {
        let s = structuredSession([main([work(.distance(m: 1000))])])
        s.primaryAdvance()                     // skip count-in
        s.primaryAdvance()                     // close with NO belt readings
        XCTAssertNil(s.laps.last?.inclinePct)  // never a fabricated 0
    }

    func testInclineIgnoredOffRunSegmentAndWhilePaused() {
        let s = structuredSession([main([work(.distance(m: 1000))])])
        s.primaryAdvance()                     // skip count-in
        s.sampleTreadmillIncline(6.0)
        s.togglePause()
        s.sampleTreadmillIncline(100.0)        // paused → must NOT count
        s.togglePause()
        s.primaryAdvance()                     // close
        XCTAssertEqual(try XCTUnwrap(s.laps.last?.inclinePct), 6.0, accuracy: 0.001)
    }

    // MARK: - Fixtures

    private func makeModel(_ session: WorkoutSession) -> (TreadmillHUDModel, FakeTreadmill) {
        let src = FakeTreadmill()
        let model = TreadmillHUDModel(session: session, hrMaxSource: nil, treadmill: src, hr: FakeHR())
        model.start()
        src.onLink?(.connected(name: "Test"))
        return (model, src)
    }

    private func structuredSegment(_ structure: RunStructure, scheme: PrescriptionScheme = .intervals) -> WorkoutSegment {
        let rx = Prescription(scheme: scheme, modality: .run, sets: nil, rounds: nil, workS: nil,
                              restS: nil, totalS: nil, target: nil, note: nil, start: nil, increment: nil,
                              structure: structure)
        return WorkoutSegment(order: 1, title: "Series", kind: .running,
                              blockTitle: "Series", blockPosition: 1, prescription: rx)
    }

    private func structuredSession(_ structure: RunStructure) -> WorkoutSession {
        let s = WorkoutSession(plan: plan([structuredSegment(structure)]))
        s.start()        // arms the block (isAwaitingBlockStart = true) + schedules the timer
        s.beginBlock()   // clears the gate → startRunStructure (count-in, runLegIndex 0)
        s.stop()         // kill the timer; the leg-cursor state is preserved
        return s
    }

    private func plan(_ segments: [WorkoutSegment]) -> WorkoutPlan {
        WorkoutPlan(id: UUID(), name: "Test", format: .intervals, estimatedDurationSeconds: 900,
                    blockContext: "Test", zoneTargets: [], equipment: [], segments: segments,
                    coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
    }
}
