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
        func start() {}
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
        func start() {}
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

    // MARK: - Fixtures

    private func makeModel(_ session: WorkoutSession) -> (TreadmillHUDModel, FakeTreadmill) {
        let src = FakeTreadmill()
        let model = TreadmillHUDModel(session: session, athleteAge: nil, treadmill: src, hr: FakeHR())
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

    private func plan(_ segments: [WorkoutSegment], format: PrescriptionScheme) -> WorkoutPlan {
        WorkoutPlan(id: UUID(), name: "Test", format: format, estimatedDurationSeconds: 900,
                    blockContext: "Test", zoneTargets: [], equipment: [], segments: segments,
                    coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
    }
}
