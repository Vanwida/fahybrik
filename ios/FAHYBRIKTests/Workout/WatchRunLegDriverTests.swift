import XCTest
@testable import FAHYBRIK

// #68 — the wrist DISTANCE-leg driver (WatchRunLegDriver) on a REAL WorkoutSession.
// It proves the two properties the team lead required of the design:
//   (1) a DISTANCE tramo auto-closes from covered distance + a tick — with NO view
//       involved — so paging away to another watch screen never stops the close;
//   (2) the per-leg baseline lives with the DRIVER (workout lifetime on the
//       coordinator), so it survives the structured view being recreated by paging;
//       a driver rebuilt mid-leg (the rejected per-view design) would lose it.
// The driver reads the SAME covered distance the HK stream feeds via sampleRunDistance and
// closes via the SAME primaryAdvance() the treadmill uses (recording stays aggregate).
final class WatchRunLegDriverTests: XCTestCase {

    // MARK: - Builders (mirror StructuredRunEngineTests)

    private func work(_ m: RunSegmentMeasure) -> RunElement {
        .segment(RunSegment(kind: .work, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: nil))
    }
    private func rec(_ m: RunSegmentMeasure, _ mode: RunRecoveryMode) -> RunElement {
        .segment(RunSegment(kind: .recovery, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: mode))
    }
    private func main(_ els: [RunElement]) -> RunPhase { RunPhase(role: .main, elements: els) }

    private func structuredSession(_ structure: RunStructure) -> WorkoutSession {
        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: nil, workS: nil,
                              restS: nil, totalS: nil, target: nil, note: nil, start: nil, increment: nil,
                              structure: structure)
        let seg = WorkoutSegment(order: 1, title: "Series", kind: .running,
                                 blockTitle: "Series", blockPosition: 1, prescription: rx)
        let plan = WorkoutPlan(id: UUID(), name: "Test", format: .intervals, estimatedDurationSeconds: 900,
                               blockContext: "Test", zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start(); s.beginBlock(); s.stop()   // into count-in, cursor preserved, timer off
        return s
    }

    // (1) Auto-close purely from covered distance + tick() — NO view. A DISTANCE tramo
    // closes; a TIME recovery is session-owned and the driver never closes it.
    func testAutoClosesDistanceLegViaTickWithNoView() {
        let s = structuredSession([main([
            work(.distance(m: 800)), rec(.duration(s: 60), .parado), work(.distance(m: 600)),
        ])])
        s.primaryAdvance()                    // skip the 3-2-1 → leg 0 (800 m)
        let driver = WatchRunLegDriver(session: s)

        driver.tick()                         // baseline at 0
        s.sampleRunDistance(deltaMeters: 500, source: .healthkit); driver.tick()
        XCTAssertEqual(s.runLegIndex, 0)
        XCTAssertEqual(driver.legCoveredMeters, 500, accuracy: 0.001)

        s.sampleRunDistance(deltaMeters: 350, source: .healthkit); driver.tick()   // covered 850 ≥ 800 → close
        XCTAssertEqual(s.runLegIndex, 1)      // → the recovery (TIME)
        XCTAssertFalse(s.isRunLegWork)

        // Recovery is a TIME leg → covered distance must NOT close it (session clock).
        s.sampleRunDistance(deltaMeters: 1000, source: .healthkit); driver.tick(); driver.tick()
        XCTAssertEqual(s.runLegIndex, 1)

        s.primaryAdvance()                    // manual "saltar descanso" → leg 2 (600 m)
        XCTAssertEqual(s.currentRunLeg?.distanceMeters, 600)
        driver.tick()                         // re-baseline, discarding the recovery overshoot
        s.sampleRunDistance(deltaMeters: 600, source: .healthkit); driver.tick()   // covered 600 in-leg → close last
        // The wrist closed the last leg, so the prescribed work is done — and the athlete
        // is asked once rather than the watch ending his session for him.
        XCTAssertTrue(s.isAwaitingFinishDecision)
        XCTAssertFalse(s.isFinished)
        s.finish()
        XCTAssertTrue(s.isFinished)
    }

    // (2) The baseline SURVIVES a view recreation because the driver (not the view)
    // holds it — and a driver rebuilt mid-leg (the rejected per-view design) loses it.
    func testBaselineSurvivesViewRecreationButNotDriverRecreation() {
        let s = structuredSession([main([work(.distance(m: 800))])])
        s.primaryAdvance()                    // skip count-in → leg 0
        let driver = WatchRunLegDriver(session: s)
        driver.tick()                         // baseline 0
        s.sampleRunDistance(deltaMeters: 400, source: .healthkit); driver.tick()
        XCTAssertEqual(driver.legCoveredMeters, 400, accuracy: 0.001)

        // A paging-recreated VIEW just re-reads THIS driver → covered is intact.
        s.sampleRunDistance(deltaMeters: 50, source: .healthkit); driver.tick()
        XCTAssertEqual(driver.legCoveredMeters, 450, accuracy: 0.001,
                       "coordinator-owned driver → covered keeps counting from leg start")
        XCTAssertEqual(s.runLegIndex, 0)      // 450 < 800 → still mid-leg, not miscounted

        // The rejected per-view design: a driver REBUILT mid-leg baselines at the
        // current reading and loses the in-leg progress — the bug we avoid.
        let rebuiltMidLeg = WatchRunLegDriver(session: s)
        rebuiltMidLeg.tick()                  // first tick baselines at covered 450
        XCTAssertEqual(rebuiltMidLeg.legCoveredMeters, 0, accuracy: 0.001,
                       "a driver rebuilt mid-leg loses the tramo's progress → must live with workout lifetime")
    }
}
