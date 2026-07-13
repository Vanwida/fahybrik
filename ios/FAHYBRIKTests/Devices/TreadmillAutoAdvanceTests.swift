import XCTest
@testable import FAHYBRIK

// Machine-level tests for the AUTOMATIC advancement: the model, fed real treadmill
// samples through an injected source, drives a real WorkoutSession's progression.
// Covers auto-close by distance (incl. a notification that lands PAST the
// threshold), auto-close by time, work→recovery→next-series chaining, pause
// freezing the count, and the manual override mid-leg.
final class TreadmillAutoAdvanceTests: XCTestCase {

    // MARK: - Injected source doubles (no CoreBluetooth)

    final class FakeTreadmill: TreadmillDataSource {
        var onSample: ((TreadmillSample) -> Void)?
        var onLink: ((DeviceLink) -> Void)?
        var onDiscovered: (([DeviceCandidate]) -> Void)?
        var onBluetooth: ((BluetoothAvailability) -> Void)?
        func startScan() {}
        func connect(_ id: DeviceID) {}
        func connectRemembered(_ id: DeviceID) {}
        func disconnect() {}
        func stop() {}
        func diagnosticsText() -> String? { nil }
        /// Push one odometer reading through the model.
        func emit(_ totalDistanceM: Double, speedKmh: Double = 12) {
            onSample?(TreadmillSample(speedKmh: speedKmh, inclinePct: 1,
                                      totalDistanceM: totalDistanceM, elapsedS: nil,
                                      hrBpm: nil, lastUpdate: Date()))
        }
    }
    final class FakeHR: HeartRateSource {
        var onBpm: ((Int) -> Void)?
        var onLink: ((DeviceLink) -> Void)?
        var onDiscovered: (([DeviceCandidate]) -> Void)?
        var onBluetooth: ((BluetoothAvailability) -> Void)?
        func startScan() {}
        func connect(_ id: DeviceID) {}
        func connectRemembered(_ id: DeviceID) {}
        func disconnect() {}
        func stop() {}
        func diagnosticsText() -> String? { nil }
    }

    // MARK: - Distance auto-close + overshoot discarded

    func testDistanceAutoCloseAndOvershootDiscarded() {
        let s = continuousSession([800, 400, 1000])
        let (m, src) = makeModel(s)

        src.emit(100)                                   // opening reading → baseline 100
        src.emit(500)                                   // covered 400 — not there yet
        XCTAssertEqual(s.currentSegmentIndex, 0)

        src.emit(912)                                   // notification lands PAST 800 (covered 812)
        XCTAssertEqual(s.currentSegmentIndex, 1)        // auto-advanced EXACTLY once (not to 2)

        src.emit(920)                                   // leg 2 opens here → counts from 920
        XCTAssertEqual(m.legDistanceM, 0, accuracy: 0.001) // the 12 m overshoot is discarded

        src.emit(1320)                                  // covered 400 ≥ 400
        XCTAssertEqual(s.currentSegmentIndex, 2)
        m.teardown()
    }

    // MARK: - Time auto-close (continuous)

    func testTimeAutoCloseContinuous() {
        let s = continuousTimeSession()                 // seg0 = 1200 s
        let (m, src) = makeModel(s)

        src.emit(0)
        XCTAssertEqual(s.currentSegmentIndex, 0)

        s.lapElapsedSeconds = 1200                      // the session's segment clock reaches target
        src.emit(10)                                    // next sample re-evaluates completion
        XCTAssertEqual(s.currentSegmentIndex, 1)
        m.teardown()
    }

    // MARK: - Series chaining work → recovery → next series

    func testSeriesWorkChainsToRecoveryThenNextBout() {
        let s = seriesSession(rounds: 4, distanceM: 400, restS: 60)
        XCTAssertTrue(s.isCondCountIn)
        s.primaryAdvance()                              // first tap only skips the 3-2-1
        XCTAssertFalse(s.isCondCountIn)
        XCTAssertEqual(s.rotRoundIndex, 0)

        let (m, src) = makeModel(s)
        // Work bout 0 (distance) — the model owns the close.
        src.emit(50)                                    // baseline
        src.emit(460)                                   // covered 410 ≥ 400
        XCTAssertEqual(s.rotPhase, .rest)               // chained into the recovery
        XCTAssertEqual(s.rotRoundIndex, 0)

        // During recovery the model must NOT drive the advance (the session owns the
        // time countdown) — feeding more belt distance changes nothing.
        src.emit(700); src.emit(900)
        XCTAssertEqual(s.rotPhase, .rest)
        XCTAssertEqual(s.rotRoundIndex, 0)

        // The session's recovery countdown ends → next work bout.
        s.primaryAdvance()
        XCTAssertEqual(s.rotRoundIndex, 1)
        XCTAssertEqual(s.rotPhase, .work)

        // Round 1 work counts from its own opening reading (overshoot discarded).
        src.emit(950)
        XCTAssertEqual(m.legDistanceM, 0, accuracy: 0.001)
        src.emit(1360)                                  // covered 410 ≥ 400
        XCTAssertEqual(s.rotPhase, .rest)               // round 1 work closed → its recovery
        XCTAssertEqual(s.rotRoundIndex, 1)
        m.teardown()
    }

    // MARK: - Pause freezes the count

    func testPauseFreezesCount() {
        let s = continuousSession([800, 400, 1000])
        let (m, src) = makeModel(s)

        src.emit(100)                                   // baseline, covered 0
        m.togglePause()
        XCTAssertTrue(m.paused)

        src.emit(1000)                                  // 900 covered ≥ 800, but paused
        XCTAssertEqual(s.currentSegmentIndex, 0)        // no advance
        XCTAssertEqual(m.legDistanceM, 0, accuracy: 0.001) // distance frozen
        m.teardown()
    }

    // MARK: - Manual override mid-leg

    func testManualOverrideMidLeg() {
        let s = continuousSession([800, 400, 1000])
        let (m, src) = makeModel(s)

        src.emit(100); src.emit(400)                    // covered 300 < 800
        XCTAssertEqual(s.currentSegmentIndex, 0)

        m.endLegNow()                                   // override — cut the leg short
        XCTAssertEqual(s.currentSegmentIndex, 1)
        m.teardown()
    }

    // MARK: - Sets-only pyramid runs ALL bouts via the session

    func testSetsOnlyPyramidRunsAllBoutsViaSession() {
        // 1200/1000/800 legacy pyramid: no `rounds`, 3 `sets`. The formatRounds
        // single-source fix makes the session count 3 bouts (was 1) so it advances
        // through ALL of them instead of closing the series after the first.
        let s = pyramidSession([1200, 1000, 800])
        XCTAssertTrue(s.isCondCountIn)
        s.primaryAdvance()                          // skip the 3-2-1 count-in
        XCTAssertFalse(s.isCondCountIn)
        XCTAssertEqual(s.rotTotalRounds, 3)         // the fix: sets.count, not 0/1
        let (m, _) = makeModel(s)

        m.endLegNow()                               // bout 0 done
        XCTAssertEqual(s.rotRoundIndex, 1)          // pre-fix this closed the whole series
        XCTAssertFalse(s.isFinished)
        m.endLegNow()                               // bout 1 done
        XCTAssertEqual(s.rotRoundIndex, 2)
        XCTAssertFalse(s.isFinished)
        m.endLegNow()                               // bout 2 (last) done → series closes
        XCTAssertTrue(s.isFinished)
        m.teardown()
    }

    // MARK: - Belt distance PERSISTS to the closed lap (+ pace + provenance)

    func testBeltDistancePersistsToClosedLapWithPaceAndSource() {
        let s = continuousSession([800, 400, 1000])
        let (m, src) = makeModel(s)
        s.lapElapsedSeconds = 240                        // 4:00 over the segment → a real covered pace

        src.emit(100)                                    // baseline 100
        src.emit(500)                                    // covered 400 (fed as increments)
        src.emit(912)                                    // covered 812 ≥ 800 → auto-close lap 0
        XCTAssertEqual(s.currentSegmentIndex, 1)

        let lap = s.laps.first
        XCTAssertEqual(lap?.distanceCoveredMeters ?? 0, 812, accuracy: 0.5)   // WAS nil before this fix
        XCTAssertEqual(lap?.source, "treadmill")                              // honest belt provenance
        XCTAssertNotNil(lap?.avgPaceSecPerKm)                                 // derived from belt distance
        m.teardown()
    }

    // MARK: - Precedence: the belt beats a stray GPS/manual distance on close

    func testBeltDistanceBeatsGpsOnClose() {
        let s = continuousSession([800])
        let (m, src) = makeModel(s)
        s.sampleRunGPS(deltaMeters: 300)                 // a stray phone-GPS reading
        src.emit(100); src.emit(950)                     // belt covered 850 ≥ 800 → close
        let lap = s.laps.first
        XCTAssertEqual(lap?.distanceCoveredMeters ?? 0, 850, accuracy: 0.5)   // belt, not the 300 GPS
        XCTAssertEqual(lap?.source, "treadmill")
        m.teardown()
    }

    // MARK: - Pause freezes the SESSION accumulator (not just the HUD's leg counter)

    func testPauseFreezesBeltAccumulator() {
        let s = continuousSession([800, 400, 1000])
        let (m, src) = makeModel(s)
        src.emit(100); src.emit(300)                     // covered 200 fed to the session
        XCTAssertEqual(s.lapBeltDistanceMeters, 200, accuracy: 0.001)
        m.togglePause()
        src.emit(900)                                    // paused → nothing feeds
        XCTAssertEqual(s.lapBeltDistanceMeters, 200, accuracy: 0.001)
        m.teardown()
    }

    // MARK: - Reopen mid-run rehydrates a CONTINUOUS leg from the session (no reset to 0)

    func testReopenRehydratesContinuousLegFromSession() {
        let s = continuousSession([2000])                // one long continuous leg
        let (m1, src1) = makeModel(s)
        src1.emit(100); src1.emit(600)                   // covered 500
        XCTAssertEqual(m1.legDistanceM, 500, accuracy: 0.001)
        XCTAssertEqual(s.lapBeltDistanceMeters, 500, accuracy: 0.001)
        m1.teardown()                                    // cover dismissed (belt stays connected)

        // Reopen: a fresh model over the SAME session — start() rehydrates the tramo.
        let (m2, src2) = makeModel(s)
        XCTAssertEqual(m2.legDistanceM, 500, accuracy: 0.001)   // resumed, not dropped to 0

        src2.emit(9000)                                  // odometer jumps → baseline anchors below 500
        XCTAssertEqual(m2.legDistanceM, 500, accuracy: 0.001)   // first sample adds nothing (no double count)
        XCTAssertEqual(s.lapBeltDistanceMeters, 500, accuracy: 0.001)
        src2.emit(9200)                                  // +200 covered
        XCTAssertEqual(m2.legDistanceM, 700, accuracy: 0.001)
        XCTAssertEqual(s.lapBeltDistanceMeters, 700, accuracy: 0.001)
        m2.teardown()
    }

    // MARK: - A SERIES leg does NOT rehydrate (segment total mixes bouts) — but persists

    func testSeriesReopenDoesNotRehydrateButKeepsSegmentTotal() {
        let s = seriesSession(rounds: 4, distanceM: 400, restS: 60)
        s.primaryAdvance()                               // skip the 3-2-1 → work bout 0
        let (m1, src1) = makeModel(s)
        src1.emit(50); src1.emit(250)                    // covered 200 in bout 0
        XCTAssertEqual(s.lapBeltDistanceMeters, 200, accuracy: 0.001)
        m1.teardown()

        let (m2, _) = makeModel(s)                       // reopen mid-bout
        XCTAssertEqual(m2.legDistanceM, 0, accuracy: 0.001)          // the bout is NOT rehydrated
        XCTAssertEqual(s.lapBeltDistanceMeters, 200, accuracy: 0.001) // the segment total is intact
        m2.teardown()
    }

    // MARK: - Fixtures

    private func makeModel(_ session: WorkoutSession) -> (TreadmillHUDModel, FakeTreadmill) {
        let src = FakeTreadmill()
        let model = TreadmillHUDModel(session: session, hrMaxSource: nil, treadmill: src, hr: FakeHR())
        model.start()
        src.onLink?(.connected(name: "Test"))
        return (model, src)
    }

    private func continuousSession(_ distances: [Double]) -> WorkoutSession {
        let segs = distances.enumerated().map { i, d in
            WorkoutSegment(order: i + 1, title: "\(Int(d)) m", kind: .running,
                           targetDistanceMeters: d, blockTitle: "Carrera", blockPosition: 1)
        }
        return WorkoutSession(plan: plan(segs, format: .steady))
    }

    private func continuousTimeSession() -> WorkoutSession {
        let s1 = WorkoutSegment(order: 1, title: "20 min", kind: .running,
                                targetDurationSeconds: 1200, blockTitle: "Carrera", blockPosition: 1)
        let s2 = WorkoutSegment(order: 2, title: "5 min", kind: .running,
                                targetDurationSeconds: 300, blockTitle: "Carrera", blockPosition: 1)
        return WorkoutSession(plan: plan([s1, s2], format: .steady))
    }

    private func seriesSession(rounds: Int, distanceM: Double, restS: Int?) -> WorkoutSession {
        let rx = Prescription(scheme: .intervals, modality: nil, sets: nil, rounds: rounds,
                              workS: nil, restS: restS, totalS: nil, target: nil,
                              note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "\(rounds)×\(Int(distanceM))", kind: .running,
                                 targetDistanceMeters: distanceM, blockTitle: "Series",
                                 blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: plan([seg], format: .intervals))
        s.start()        // arms the block (isAwaitingBlockStart = true) + schedules the timer
        s.beginBlock()   // clears the gate → startConditioning (count-in, rotRoundIndex 0)
        s.stop()         // kill the timer; conditioning state is preserved
        return s
    }

    private func pyramidSession(_ distancesM: [Double]) -> WorkoutSession {
        // Legacy heterogeneous pyramid: no rounds, one distance PrescriptionSet per
        // bout, no scalar targetDistanceMeters (the web drops it for unequal bouts).
        let sets = distancesM.map { d in
            PrescriptionSet(measure: .distance(meters: d), target: nil, modality: .run,
                            restS: nil, tempo: nil, note: nil)
        }
        let rx = Prescription(scheme: .intervals, modality: .run, sets: sets, rounds: nil,
                              workS: nil, restS: nil, totalS: nil, target: nil,
                              note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "Pirámide", kind: .running,
                                 blockTitle: "Series", blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: plan([seg], format: .intervals))
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    private func plan(_ segments: [WorkoutSegment], format: PrescriptionScheme) -> WorkoutPlan {
        WorkoutPlan(id: UUID(), name: "Test", format: format, estimatedDurationSeconds: 900,
                    blockContext: "Test", zoneTargets: [], equipment: [], segments: segments,
                    coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
    }
}
