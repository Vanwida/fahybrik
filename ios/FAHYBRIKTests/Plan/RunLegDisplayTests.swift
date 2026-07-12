import XCTest
@testable import FAHYBRIK

// #68 — the wrist tramo HUD's pure display formatting (RunLegDisplay): the measure
// label, the per-leg pace, the objetivo band IN/OUT judgment (the coloring the view
// maps to green/amber), the recovery mode words and the "luego: …" preview. The
// band in/out is the load-bearing case: it must judge against the SAME PaceTarget
// the athlete sees on the plan, and DEGRADE to a plain label when there's no band.
final class RunLegDisplayTests: XCTestCase {

    private func leg(_ measure: RunSegmentMeasure,
                     kind: RunSegment.Kind = .work,
                     target: RunSegmentTarget? = nil,
                     resolved: ResolvedIntensity? = nil,
                     mode: RunRecoveryMode? = nil) -> RunLeg {
        RunLeg(kind: kind == .recovery ? .recovery : .work, measure: measure, target: target,
               resolved: resolved, inclinePct: nil, cadenceSpm: nil, recoveryMode: mode, phaseRole: .main)
    }

    private func band(fast: Double, slow: Double?) -> ResolvedIntensity {
        ResolvedIntensity(zoneLabel: "Z3", rangeLabel: "banda", fastS: fast, slowS: slow,
                          paceUnit: "per_km", needsReview: false)
    }

    // MARK: - Measure label + per-leg pace

    func testMeasureLabel() {
        XCTAssertEqual(RunLegDisplay.measureLabel(leg(.distance(m: 800))), "800 m")
        XCTAssertEqual(RunLegDisplay.measureLabel(leg(.duration(s: 125))), "2:05")
        XCTAssertEqual(RunLegDisplay.measureLabel(leg(.unknown)), "")
    }

    func testLegPace() {
        XCTAssertEqual(RunLegDisplay.legPaceSecPerKm(coveredMeters: 200, elapsedS: 60), 300) // 5:00/km
        XCTAssertNil(RunLegDisplay.legPaceSecPerKm(coveredMeters: 5, elapsedS: 60), "below the noise floor")
        XCTAssertNil(RunLegDisplay.legPaceSecPerKm(coveredMeters: 200, elapsedS: 0))
    }

    // MARK: - Objetivo band IN / OUT (the coloring decision)

    func testObjetivoPaceBandInAndOut() {
        // Explicit pace band 4:25–4:35 (265–275 s/km).
        let l = leg(.distance(m: 1000), target: .pace(valueS: nil, minS: 265, maxS: 275))

        let inBand = RunLegDisplay.objetivo(for: l, livePaceSecPerKm: 270)
        XCTAssertEqual(inBand?.label, "4:25–4:35 /km")
        XCTAssertEqual(inBand?.status, .inTarget)
        XCTAssertEqual(RunLegDisplay.statusWord(inBand!.status), "✓")

        XCTAssertEqual(RunLegDisplay.objetivo(for: l, livePaceSecPerKm: 260)?.status, .tooFast) // below fast bound
        XCTAssertEqual(RunLegDisplay.objetivo(for: l, livePaceSecPerKm: 280)?.status, .tooSlow) // above slow bound
        XCTAssertEqual(RunLegDisplay.objetivo(for: l, livePaceSecPerKm: nil)?.status, .unknown, "no pace yet → not judged")
    }

    // A coach ZONE that the backend resolved to an absolute band is judged like any
    // pace band (the SAME source the athlete sees on the plan).
    func testObjetivoResolvedZoneBand() {
        let l = leg(.distance(m: 1000), target: .paceZone(3), resolved: band(fast: 240, slow: 254))
        let o = RunLegDisplay.objetivo(for: l, livePaceSecPerKm: 247)
        XCTAssertEqual(o?.label, "4:00–4:14 /km")
        XCTAssertEqual(o?.status, .inTarget)
    }

    // DEGRADATION: a zone with NO resolved band (athlete lacks the benchmark) shows
    // the zone label PLAIN — never judged, never a fabricated pace/color.
    func testObjetivoZoneWithoutBandDegrades() {
        let l = leg(.distance(m: 1000), target: .paceZone(3), resolved: nil)
        let o = RunLegDisplay.objetivo(for: l, livePaceSecPerKm: 247)
        XCTAssertEqual(o?.label, "Z3")
        XCTAssertEqual(o?.status, .unknown)
        XCTAssertEqual(RunLegDisplay.statusWord(.unknown), "")
    }

    func testObjetivoFreeLegHasNone() {
        XCTAssertNil(RunLegDisplay.objetivo(for: leg(.distance(m: 400), target: nil), livePaceSecPerKm: 250))
    }

    func testStatusWords() {
        XCTAssertEqual(RunLegDisplay.statusWord(.inTarget), "✓")
        XCTAssertEqual(RunLegDisplay.statusWord(.tooFast), "rápido")
        XCTAssertEqual(RunLegDisplay.statusWord(.tooSlow), "lento")
        XCTAssertEqual(RunLegDisplay.statusWord(.unknown), "")
    }

    // MARK: - Recovery words + next-leg preview

    func testRecoveryModeWords() {
        XCTAssertEqual(RunLegDisplay.recoveryModeWord(.trote), "suave")
        XCTAssertEqual(RunLegDisplay.recoveryModeWord(.caminar), "caminando")
        XCTAssertEqual(RunLegDisplay.recoveryModeWord(.parado), "parado")
        XCTAssertEqual(RunLegDisplay.recoveryModeWord(nil), "")
    }

    func testNextLegPreview() {
        XCTAssertEqual(RunLegDisplay.nextLegPreview(leg(.duration(s: 120), kind: .recovery, mode: .trote)),
                       "rec. 2:00 suave")
        XCTAssertEqual(RunLegDisplay.nextLegPreview(leg(.distance(m: 200), kind: .recovery, mode: .caminar)),
                       "rec. 200 m caminando")
        XCTAssertEqual(RunLegDisplay.nextLegPreview(leg(.distance(m: 800))), "800 m")
        XCTAssertNil(RunLegDisplay.nextLegPreview(nil), "last leg → nothing next")
    }
}
