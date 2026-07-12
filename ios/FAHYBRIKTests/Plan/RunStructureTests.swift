import XCTest
@testable import FAHYBRIK

// #61 — native execution of the structured running grammar on iOS. Mirrors the
// 12 CANONICAL cases from web/tests/prescription/run-structure.test.ts (Pablo's
// real plan): each must EXPAND to the same flat, ordered leg list the web
// `flattenSegments` produces, with ZERO free text and each bout carrying its OWN
// measure/target/incline/cadence. Also pins the real wire decode path
// (APIClient's `.convertFromSnakeCase`) and the tolerance contract.
final class RunStructureTests: XCTestCase {

    // MARK: - Builders (mirror the TS test's work/rec/dist/dur helpers)

    private func dist(_ m: Int) -> RunSegmentMeasure { .distance(m: m) }
    private func dur(_ s: Int) -> RunSegmentMeasure { .duration(s: s) }
    private func work(_ m: RunSegmentMeasure, _ t: RunSegmentTarget? = nil,
                      incline: Double? = nil, cadence: Int? = nil) -> RunElement {
        .segment(RunSegment(kind: .work, measure: m, target: t, resolved: nil,
                            inclinePct: incline, cadenceSpm: cadence, recoveryMode: nil))
    }
    private func rec(_ m: RunSegmentMeasure, _ mode: RunRecoveryMode,
                     _ t: RunSegmentTarget? = nil) -> RunElement {
        .segment(RunSegment(kind: .recovery, measure: m, target: t, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: mode))
    }
    private func rep(_ times: Int, _ els: [RunElement]) -> RunElement { .repeatBlock(times: times, elements: els) }
    private func main(_ els: [RunElement]) -> RunPhase { RunPhase(role: .main, elements: els) }
    private func paceZone(_ z: Int) -> RunSegmentTarget { .paceZone(z) }
    private func rpe(_ v: Double) -> RunSegmentTarget { .rpe(value: v, min: nil, max: nil) }

    // MARK: - The 12 canonical cases expand to the right flat leg list

    func testCanonical_6x1000_con_200m_trote_Z1() {
        let s: RunStructure = [main([rep(6, [work(dist(1000), paceZone(3)), rec(dist(200), .trote, paceZone(1))])])]
        let legs = s.expandedLegs()
        XCTAssertEqual(legs.count, 12)
        XCTAssertEqual(legs.filter { $0.isWork }.count, 6)
        XCTAssertEqual(legs.filter { $0.isRecovery }.count, 6)
        // A recovery measured by DISTANCE (the treadmill "trota 200m" seam).
        XCTAssertEqual(legs[1].goal, .distance(meters: 200))
        XCTAssertEqual(legs[1].recoveryMode, .trote)
    }

    func testCanonical_3x_4x400_rec_1min_parado_rec_3min() {
        let s: RunStructure = [main([rep(3, [rep(4, [work(dist(400), rpe(9)), rec(dur(60), .parado)]), rec(dur(180), .parado)])])]
        let legs = s.expandedLegs()
        // 3 × (4×[work+rec] + rec) = 3 × (8 + 1) = 27 legs; 12 work bouts.
        XCTAssertEqual(legs.count, 27)
        XCTAssertEqual(legs.filter { $0.isWork }.count, 12)
        // TWO consecutive recoveries at the inner-block boundary (the 4th rec 1' then
        // the rec 3') — proof the flat leg list expresses what a binary work/rest
        // round cannot.
        XCTAssertTrue(legs[7].isRecovery && legs[8].isRecovery)
        XCTAssertTrue(legs[9].isWork)
    }

    func testCanonical_progresivo_heterogeneous_distances_preserved() {
        let s: RunStructure = [main([work(dist(4000), paceZone(2)), work(dist(4000), paceZone(3)), work(dist(2000), paceZone(4))])]
        let legs = s.expandedLegs()
        XCTAssertEqual(legs.map(\.measure), [dist(4000), dist(4000), dist(2000)])
        XCTAssertTrue(legs.allSatisfy { $0.isWork })   // work-only progression, no recovery
    }

    func testCanonical_tempo_20min_paceZone() {
        let s: RunStructure = [main([work(dur(1200), paceZone(4))])]
        let legs = s.expandedLegs()
        XCTAssertEqual(legs.count, 1)
        XCTAssertEqual(legs[0].goal, .time(seconds: 1200))   // duration → session-clock owned
    }

    func testCanonical_fartlek_10x_2min_1min() {
        let s: RunStructure = [main([rep(10, [work(dur(120), rpe(8)), rec(dur(60), .trote, rpe(3))])])]
        let legs = s.expandedLegs()
        XCTAssertEqual(legs.count, 20)
        XCTAssertEqual(legs.filter { $0.isWork }.count, 10)
        XCTAssertEqual(legs[0].rpeLabel, "RPE 8")
    }

    func testCanonical_cuestas_8x200m_al_8pct() {
        let s: RunStructure = [main([rep(8, [work(dist(200), rpe(9), incline: 8), rec(dist(200), .caminar)])])]
        let legs = s.expandedLegs()
        XCTAssertEqual(legs.count, 16)
        XCTAssertEqual(legs[0].inclinePct, 8)      // prescribed incline reaches the bout
        XCTAssertEqual(legs[1].recoveryMode, .caminar)
    }

    func testCanonical_warmup_main_cooldown_phases_in_order() {
        let s: RunStructure = [
            RunPhase(role: .warmup, elements: [work(dur(900), paceZone(1))]),
            RunPhase(role: .main, elements: [work(dur(1200), paceZone(4))]),
            RunPhase(role: .cooldown, elements: [work(dur(600), paceZone(1))]),
        ]
        let legs = s.expandedLegs()
        XCTAssertEqual(legs.map(\.phaseRole), [.warmup, .main, .cooldown])
    }

    func testCanonical_5x3min_pace_band() {
        let s: RunStructure = [main([rep(5, [work(dur(180), .pace(valueS: nil, minS: 255, maxS: 265))])])]
        let legs = s.expandedLegs()
        XCTAssertEqual(legs.count, 5)
        // The pace band resolves to a strict treadmill judge band (fast=255, slow=265).
        if case let .pace(t) = legs[0].runTarget {
            XCTAssertEqual(t.fastS, 255); XCTAssertEqual(t.slowS, 265)
        } else { XCTFail("expected a pace band") }
    }

    func testCanonical_rodaje_45min_Z2() {
        let s: RunStructure = [main([work(dur(2700), paceZone(2))])]
        XCTAssertEqual(s.expandedLegs().count, 1)
    }

    func testCanonical_piramide_400_800_1200_800_400() {
        let s: RunStructure = [main([
            work(dist(400), paceZone(4)), rec(dur(90), .parado),
            work(dist(800), paceZone(4)), rec(dur(90), .parado),
            work(dist(1200), paceZone(3)), rec(dur(90), .parado),
            work(dist(800), paceZone(4)), rec(dur(90), .parado),
            work(dist(400), paceZone(4)),
        ])]
        let legs = s.expandedLegs()
        XCTAssertEqual(legs.count, 9)
        // HETEROGENEOUS per-bout distances reach execution (the pyramid seam): the
        // web drops the scalar for unequal bouts, structure carries all five.
        XCTAssertEqual(legs.filter { $0.isWork }.map(\.measure), [dist(400), dist(800), dist(1200), dist(800), dist(400)])
    }

    func testCanonical_test_3_9_30_min_does_not_break() {
        let s: RunStructure = [main([work(dur(180), rpe(10)), work(dur(540), rpe(10)), work(dur(1800), rpe(10))])]
        XCTAssertEqual(s.expandedLegs().map(\.goal), [.time(seconds: 180), .time(seconds: 540), .time(seconds: 1800)])
    }

    func testCanonical_serie_con_cadencia_180() {
        let s: RunStructure = [main([rep(4, [work(dist(1000), paceZone(3), cadence: 180), rec(dur(90), .parado)])])]
        let legs = s.expandedLegs()
        XCTAssertEqual(legs.count, 8)
        XCTAssertEqual(legs[0].cadenceSpm, 180)
    }

    // MARK: - Real wire decode (APIClient's `.convertFromSnakeCase`)

    private func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }

    /// A sets-only heterogeneous pyramid on the wire decodes to a structure with 3
    /// DISTINCT distance measures — the whole point of the athlete structure wire.
    func testWire_heterogeneousPyramid_decodesThreeDistinctMeasures() throws {
        let json = """
        {
          "scheme": "intervals", "modality": "run",
          "rounds": 3, "work_s": null, "rest_s": 90,
          "structure": [
            { "role": "main", "elements": [
              { "kind": "work", "measure": { "type": "distance", "m": 1200 }, "target": { "type": "pace_zone", "zone": 3 } },
              { "kind": "recovery", "measure": { "type": "duration", "s": 90 }, "target": null, "recovery_mode": "parado" },
              { "kind": "work", "measure": { "type": "distance", "m": 1000 }, "target": { "type": "pace_zone", "zone": 3 } },
              { "kind": "recovery", "measure": { "type": "duration", "s": 90 }, "target": null, "recovery_mode": "parado" },
              { "kind": "work", "measure": { "type": "distance", "m": 800 }, "target": { "type": "pace_zone", "zone": 4 } }
            ] }
          ]
        }
        """
        let p = try makeDecoder().decode(Prescription.self, from: Data(json.utf8))
        let legs = try XCTUnwrap(p.runStructureLegs)
        XCTAssertEqual(legs.filter { $0.isWork }.map(\.measure), [dist(1200), dist(1000), dist(800)])
        // Additive: the legacy scalar fields still decoded alongside the structure.
        XCTAssertEqual(p.scheme, .intervals)
        XCTAssertEqual(p.restS, 90)
    }

    /// incline_pct / cadence_spm / value_s / min_s / max_s convert from snake_case
    /// and land as strict numbers; recovery_mode + the resolved band decode too.
    func testWire_inclineCadencePaceAndResolvedBand() throws {
        let json = """
        {
          "scheme": "intervals", "modality": "run",
          "structure": [
            { "role": "main", "elements": [
              { "times": 8, "elements": [
                { "kind": "work", "measure": { "type": "distance", "m": 200 },
                  "target": { "type": "pace", "value_s": null, "min_s": 240, "max_s": 250 },
                  "incline_pct": 8, "cadence_spm": 182,
                  "resolved": { "zone_label": "Z4", "range_label": "4:00–4:10/km",
                                "fast_s": 240, "slow_s": 250, "pace_unit": "per_km", "needs_review": false } },
                { "kind": "recovery", "measure": { "type": "distance", "m": 200 }, "target": null, "recovery_mode": "caminar" }
              ] }
            ] }
          ]
        }
        """
        let p = try makeDecoder().decode(Prescription.self, from: Data(json.utf8))
        let legs = try XCTUnwrap(p.runStructureLegs)
        XCTAssertEqual(legs.count, 16)
        XCTAssertEqual(legs[0].inclinePct, 8)
        XCTAssertEqual(legs[0].cadenceSpm, 182)
        XCTAssertEqual(legs[0].resolved?.fastS, 240)
        if case let .pace(t) = legs[0].runTarget {
            XCTAssertEqual(t.fastS, 240); XCTAssertEqual(t.slowS, 250)
        } else { XCTFail("expected a pace band from the explicit target") }
        XCTAssertEqual(legs[1].recoveryMode, .caminar)
        XCTAssertEqual(legs[1].goal, .distance(meters: 200))
    }

    /// A zone target with NO explicit pace still shows a pace band from the
    /// server-resolved band (the same source the athlete already sees).
    func testWire_zoneResolvedBandBecomesPaceJudge() throws {
        let json = """
        {
          "scheme": "steady", "modality": "run",
          "structure": [ { "role": "main", "elements": [
            { "kind": "work", "measure": { "type": "duration", "s": 1200 },
              "target": { "type": "pace_zone", "zone": 4 },
              "resolved": { "zone_label": "Z4", "range_label": "4:00–4:14/km",
                            "fast_s": 240, "slow_s": 254, "pace_unit": "per_km", "needs_review": false } }
          ] } ]
        }
        """
        let p = try makeDecoder().decode(Prescription.self, from: Data(json.utf8))
        let leg = try XCTUnwrap(p.runStructureLegs?.first)
        if case let .pace(t) = leg.runTarget {
            XCTAssertEqual(t.fastS, 240); XCTAssertEqual(t.slowS, 254)
        } else { XCTFail("a resolved zone band must judge as pace") }
    }

    // MARK: - Tolerance contract (never crashes the whole item)

    /// A malformed `structure` degrades to nil and the legacy fields still decode,
    /// so a truncated/future payload never fails the assignment item.
    func testWire_malformedStructureDegradesToLegacy() throws {
        let json = """
        { "scheme": "intervals", "modality": "run", "rounds": 6, "work_s": 240, "structure": "oops-not-an-array" }
        """
        let p = try makeDecoder().decode(Prescription.self, from: Data(json.utf8))
        XCTAssertNil(p.structure)
        XCTAssertNil(p.runStructureLegs)
        XCTAssertEqual(p.rounds, 6)      // legacy floor intact
        XCTAssertEqual(p.workS, 240)
    }

    /// A legacy prescription (no `structure` key) simply has no structure — the
    /// scalar rotating path stays in charge.
    func testWire_legacyPrescriptionHasNoStructure() throws {
        let json = """
        { "scheme": "intervals", "modality": "run", "rounds": 5, "work_s": 30 }
        """
        let p = try makeDecoder().decode(Prescription.self, from: Data(json.utf8))
        XCTAssertNil(p.runStructureLegs)
        XCTAssertFalse(WorkoutSegment(order: 1, title: "Series", kind: .running, prescription: p).hasRunStructure)
    }

    // MARK: - Encode round-trip (persistence snapshot survives)

    func testStructureSurvivesEncodeDecodeRoundTrip() throws {
        let s: RunStructure = [main([rep(3, [work(dist(800), paceZone(4), incline: 2, cadence: 180), rec(dur(60), .trote)])])]
        let p = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: 3, workS: nil,
                             restS: 60, totalS: nil, target: nil, note: nil, start: nil, increment: nil,
                             structure: s)
        let data = try JSONEncoder().encode(p)
        let back = try makeDecoder().decode(Prescription.self, from: data)
        XCTAssertEqual(back.runStructureLegs, p.runStructureLegs)
    }
}
