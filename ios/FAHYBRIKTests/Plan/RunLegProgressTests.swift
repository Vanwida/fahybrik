import XCTest
@testable import FAHYBRIK

// #68 — the wrist's per-leg covered-distance progression (RunLegProgress). The
// watch has no belt: covered distance arrives segment-cumulative from HealthKit,
// and this pure tracker turns it into the CURRENT leg's covered distance + the
// DISTANCE-leg auto-close, with a per-leg baseline that discards the prior leg's
// overshoot (same semantics as TreadmillHUDModel.distanceBaselineM). Driven with a
// scripted covered-distance stream against REAL expanded legs (leg.goal), so the
// close thresholds are the same ones the live driver reads.
final class RunLegProgressTests: XCTestCase {

    // Real leg goals from a small structure — distance work, timed recovery,
    // distance recovery — so the tests exercise leg.goal, not a hand-made enum.
    private func legs(_ phases: [RunPhase]) -> [RunLeg] { phases.expandedLegs() }

    private func work(_ m: RunSegmentMeasure) -> RunElement {
        .segment(RunSegment(kind: .work, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: nil))
    }
    private func rec(_ m: RunSegmentMeasure, _ mode: RunRecoveryMode) -> RunElement {
        .segment(RunSegment(kind: .recovery, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: mode))
    }
    private func main(_ els: [RunElement]) -> RunPhase { RunPhase(role: .main, elements: els) }

    // A DISTANCE leg auto-closes exactly once, at the target, discarding overshoot.
    func testDistanceLegClosesOnceAtTarget() {
        let ls = legs([main([work(.distance(m: 800))])])
        var p = RunLegProgress()
        let key = "0#0#go"
        func step(_ covered: Double) -> Bool {
            p.step(legKey: key, segmentCoveredMeters: covered, goal: ls[0].goal,
                   isDistanceLeg: true, isRunnableNow: true)
        }
        XCTAssertFalse(step(0))
        XCTAssertFalse(step(500))
        XCTAssertEqual(p.covered(segmentCoveredMeters: 500), 500)
        XCTAssertTrue(step(800), "reaches the 800 m target → close")
        XCTAssertFalse(step(830), "already closed this leg → never fires twice")
    }

    // A TIME leg / recovery countdown is session-owned — the driver never closes it,
    // however much distance the athlete covers during it.
    func testTimeLegNeverClosedByDriver() {
        let ls = legs([main([rec(.duration(s: 60), .trote)])])
        var p = RunLegProgress()
        XCTAssertFalse(p.step(legKey: "0#0#go", segmentCoveredMeters: 300, goal: ls[0].goal,
                              isDistanceLeg: false, isRunnableNow: true))
        XCTAssertFalse(p.step(legKey: "0#0#go", segmentCoveredMeters: 900, goal: ls[0].goal,
                              isDistanceLeg: false, isRunnableNow: true))
    }

    // A DISTANCE recovery ("trota 200m") is wrist-owned and DOES auto-close. The leg
    // opens at the reading it first sees (baseline), so covered is measured from there.
    func testDistanceRecoveryCloses() {
        let ls = legs([main([rec(.distance(m: 200), .trote)])])
        var p = RunLegProgress()
        XCTAssertFalse(p.step(legKey: "0#0#go", segmentCoveredMeters: 0, goal: ls[0].goal,
                              isDistanceLeg: true, isRunnableNow: true))   // opens → baseline 0
        XCTAssertFalse(p.step(legKey: "0#0#go", segmentCoveredMeters: 100, goal: ls[0].goal,
                              isDistanceLeg: true, isRunnableNow: true))   // covered 100 < 200
        XCTAssertTrue(p.step(legKey: "0#0#go", segmentCoveredMeters: 200, goal: ls[0].goal,
                             isDistanceLeg: true, isRunnableNow: true))    // covered 200 → close
    }

    // Baseline resets per leg and discards the previous leg's overshoot: leg 2 counts
    // from the reading at which it opened, not cumulatively.
    func testBaselineResetsAndDiscardsOvershoot() {
        // 800 m work · 60 s trote (time) · 400 m work.
        let ls = legs([main([work(.distance(m: 800)), rec(.duration(s: 60), .trote), work(.distance(m: 400))])])
        var p = RunLegProgress()

        // Leg 0 — closes at 800, athlete drifts to 830 before the engine advances.
        _ = p.step(legKey: "0#0#go", segmentCoveredMeters: 0, goal: ls[0].goal, isDistanceLeg: true, isRunnableNow: true)
        XCTAssertTrue(p.step(legKey: "0#0#go", segmentCoveredMeters: 800, goal: ls[0].goal, isDistanceLeg: true, isRunnableNow: true))
        _ = p.step(legKey: "0#0#go", segmentCoveredMeters: 830, goal: ls[0].goal, isDistanceLeg: true, isRunnableNow: true)

        // Leg 1 (time) opens at segment 830 → its covered starts at 0 (overshoot gone).
        _ = p.step(legKey: "0#1#go", segmentCoveredMeters: 830, goal: ls[1].goal, isDistanceLeg: false, isRunnableNow: true)
        XCTAssertEqual(p.covered(segmentCoveredMeters: 900), 70, "leg 1 covered = 900 − 830 baseline")

        // Leg 2 (400 m) opens at segment 900 → covered from there; closes at 400.
        _ = p.step(legKey: "0#2#go", segmentCoveredMeters: 900, goal: ls[2].goal, isDistanceLeg: true, isRunnableNow: true)
        XCTAssertEqual(p.covered(segmentCoveredMeters: 1200), 300)
        XCTAssertTrue(p.step(legKey: "0#2#go", segmentCoveredMeters: 1300, goal: ls[2].goal, isDistanceLeg: true, isRunnableNow: true))
    }

    // The count-in → GO transition re-baselines, so metres jogged during the 3-2-1
    // don't count toward the first tramo.
    func testCountInDistanceDiscardedAtGo() {
        let ls = legs([main([work(.distance(m: 800))])])
        var p = RunLegProgress()
        // Jogged 15 m during the count-in.
        _ = p.step(legKey: "0#0#in", segmentCoveredMeters: 15, goal: ls[0].goal, isDistanceLeg: true, isRunnableNow: false)
        // GO: same segment reading, new key → re-baseline to 15, covered resets to 0.
        _ = p.step(legKey: "0#0#go", segmentCoveredMeters: 15, goal: ls[0].goal, isDistanceLeg: true, isRunnableNow: true)
        XCTAssertEqual(p.covered(segmentCoveredMeters: 15), 0)
        XCTAssertFalse(p.step(legKey: "0#0#go", segmentCoveredMeters: 800, goal: ls[0].goal, isDistanceLeg: true, isRunnableNow: true),
                       "800 segment m − 15 baseline = 785 covered < 800 target → not yet")
        XCTAssertTrue(p.step(legKey: "0#0#go", segmentCoveredMeters: 815, goal: ls[0].goal, isDistanceLeg: true, isRunnableNow: true),
                      "815 − 15 = 800 covered → close")
    }

    // The manual "Tramo hecho" override is not modelled here (it calls
    // session.primaryAdvance directly); the driver must simply not fight it — a
    // paused / gated tick never auto-closes.
    func testNotRunnableNeverCloses() {
        let ls = legs([main([work(.distance(m: 800))])])
        var p = RunLegProgress()
        XCTAssertFalse(p.step(legKey: "0#0#go", segmentCoveredMeters: 900, goal: ls[0].goal,
                              isDistanceLeg: true, isRunnableNow: false))
    }

    // The store must live with WORKOUT lifetime (the coordinator's driver), NOT the
    // view: a persisted store keeps its baseline mid-leg, while a fresh store built
    // mid-leg (what a per-view @State recreation does) re-baselines and loses the
    // in-leg progress — the exact risk the workout-lifetime holder prevents.
    func testBaselineSurvivesOnlyIfStorePersists() {
        var store = RunLegProgress()
        _ = store.step(legKey: "0#0#go", segmentCoveredMeters: 0, goal: .distance(meters: 800),
                       isDistanceLeg: true, isRunnableNow: true)
        _ = store.step(legKey: "0#0#go", segmentCoveredMeters: 450, goal: .distance(meters: 800),
                       isDistanceLeg: true, isRunnableNow: true)
        XCTAssertEqual(store.covered(segmentCoveredMeters: 450), 450, "persisted store → covered from leg start")

        var reborn = RunLegProgress()   // a view-@State recreation mid-leg
        _ = reborn.step(legKey: "0#0#go", segmentCoveredMeters: 450, goal: .distance(meters: 800),
                        isDistanceLeg: true, isRunnableNow: true)
        XCTAssertEqual(reborn.covered(segmentCoveredMeters: 450), 0,
                       "reborn store baselines at 450 → loses in-leg progress")
    }

    // covered() is clamped at 0 (a segment reading below the baseline can't go negative).
    func testCoveredNeverNegative() {
        var p = RunLegProgress()
        _ = p.step(legKey: "0#1#go", segmentCoveredMeters: 500, goal: .distance(meters: 200),
                   isDistanceLeg: true, isRunnableNow: true)
        XCTAssertEqual(p.covered(segmentCoveredMeters: 480), 0)
    }
}
