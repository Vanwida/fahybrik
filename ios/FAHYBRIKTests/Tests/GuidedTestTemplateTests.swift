import XCTest
@testable import FAHYBRIK

// Tests guiados — the DEFAULT test templates, pinned at the wire level. The
// fleco this closes: the tt_5k template used to ship `prescription_json: null`,
// so the #61 structured-run cursor had no tramos to guide (the athlete got a
// naked clock). The web side now materializes real structure; these tests assert
// the app actually LIGHTS UP the guided cursor on that exact payload — and that
// the erg test still runs its own (structure-less) path, since RunStructure is
// running-only.
//
// Fixtures mirror the shapes verified E2E against main by the web side.
final class GuidedTestTemplateTests: XCTestCase {

    private func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }

    private func decode(_ json: String) throws -> AssignmentDetail {
        try makeDecoder().decode(AssignmentDetail.self, from: Data(json.utf8))
    }

    // MARK: - tt_5k — the guided cursor must have tramos

    /// The 5K time-trial payload, hand-mirrored from what the web side
    /// materializes (verified E2E against main + prod, coach 62, 2026-07-16):
    ///   warmup   → duration 600 s · rpe 3
    ///   main     → distance 5000 m · rpe 9-10
    ///   cooldown → duration 600 s · rpe 2
    ///
    /// WHAT THIS FIXTURE CAN AND CANNOT PROVE. It is a hand-copy, so it can NEVER
    /// detect web-side drift: asserting its exact numbers back to itself is
    /// self-referential (only a live E2E sees the real template change). What it
    /// DOES prove is the app-side contract — given a payload of this shape, the
    /// guided cursor lights up. So the contract test below asserts only the
    /// INVARIANTS that make the cursor guide; the warmup/cooldown durations are
    /// editable coach content and live in a separate, clearly-labelled snapshot.
    ///
    /// FIXTURE RULE (learned the hard way): every value here mirrors the REAL
    /// payload. An earlier revision invented a 300 s cooldown from a prose
    /// description — the test then passed against a fiction. Never fabricate a
    /// fixture value; copy it from the real payload or don't assert it.
    private let tt5kJSON = """
    {
      "assignment": { "id": "482", "athlete_id": "67", "scheduled_for": "2026-07-16", "status": "scheduled",
        "store_results": [
          { "slug": "run_5k", "label": "5K", "measure": "time", "unit": "seconds",
            "derives": "run_zones", "modality": "run", "optional": false },
          { "slug": "hrr60", "label": "Recuperación", "measure": "hrr", "unit": "bpm",
            "derives": null, "modality": null, "optional": true }
        ] },
      "workout": { "name": "Test 5K", "blocks": [ { "uid": "b1", "title": "Test 5K", "format": "free", "block_position": 1, "items": [
        { "uid": "i1", "exercise_id": "e1", "exercise_name": "Run", "exercise_slug": "run", "exercise_category": "running",
          "exercise_video_url": null, "cues": null, "params_json": { "distance_meters": 5000 },
          "prescription_json": {
            "scheme": "for_time", "modality": "run",
            "structure": [
              { "role": "warmup", "elements": [
                { "kind": "work", "measure": { "type": "duration", "s": 600 },
                  "target": { "type": "rpe", "value": 3 } } ] },
              { "role": "main", "elements": [
                { "kind": "work", "measure": { "type": "distance", "m": 5000 },
                  "target": { "type": "rpe", "min": 9, "max": 10 } } ] },
              { "role": "cooldown", "elements": [
                { "kind": "work", "measure": { "type": "duration", "s": 600 },
                  "target": { "type": "rpe", "value": 2 } } ] }
            ] },
          "notes": null }
      ] } ] } }
    """

    /// CONTRACT — what must hold for the guided cursor to guide a 5K test, and
    /// nothing more. Deliberately silent on the warmup/cooldown DURATIONS: those
    /// are coach-editable content (Pablo can make the warmup 8 or 15 min without
    /// telling anyone) and asserting them here would break the build over a
    /// legitimate content edit while proving nothing about the app.
    func testTT5kLightsUpTheGuidedCursor() throws {
        let detail = try decode(tt5kJSON)
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: detail))
        let runSeg = try XCTUnwrap(plan.segments.first { $0.kind == .running })

        // THE regression this fleco was about: structure survives
        // prescription_json → Prescription → WorkoutSegment, so the cursor guides.
        XCTAssertTrue(runSeg.hasRunStructure, "El test 5K debe traer tramos: sin esto el guiado no guía.")

        let legs = try XCTUnwrap(runSeg.runStructureLegs)
        // Phases in order — the cursor walks them warmup → main → cooldown.
        XCTAssertEqual(legs.map(\.phaseRole), [.warmup, .main, .cooldown])
        // The test's IDENTITY: the main tramo measures the 5 km being timed. If
        // this drifts it isn't a 5K test any more — that's a real contract break,
        // unlike a warmup the coach retuned.
        let main = try XCTUnwrap(legs.first { $0.phaseRole == .main })
        XCTAssertEqual(main.measure, .distance(m: 5000))
        XCTAssertTrue(main.isWork)
    }

    /// SNAPSHOT of today's default content (web, coach 62, 2026-07-16) — NOT a
    /// contract. Its job is decode coverage: durations and rpe value/min/max
    /// survive the wire → Prescription → legs chain intact. If the coach edits the
    /// warmup or the cooldown, UPDATE OR DELETE this test — it must never be the
    /// reason a legitimate content change is blocked.
    func testTT5kDefaultContentSnapshotDecodes() throws {
        let detail = try decode(tt5kJSON)
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: detail))
        let runSeg = try XCTUnwrap(plan.segments.first { $0.kind == .running })
        let legs = try XCTUnwrap(runSeg.runStructureLegs)

        XCTAssertEqual(legs.map(\.measure), [.duration(s: 600), .distance(m: 5000), .duration(s: 600)])
        XCTAssertEqual(legs.map(\.target), [
            .rpe(value: 3, min: nil, max: nil),
            .rpe(value: nil, min: 9, max: 10),   // "a fondo" — min/max both decode
            .rpe(value: 2, min: nil, max: nil),
        ])
        XCTAssertTrue(legs.allSatisfy(\.isWork))
    }

    /// The contract side of the same payload: the required 5K result gates the
    /// test, hrr60 rides along as optional → the recovery window opens and the
    /// save is never blocked by it.
    func testTT5kContractDrivesRecoveryAndGating() throws {
        let detail = try decode(tt5kJSON)
        let specs = detail.storeResults
        XCTAssertEqual(specs.map(\.slug), ["run_5k", "hrr60"])
        XCTAssertFalse(specs[0].isOptional)
        XCTAssertTrue(specs[1].isOptional)
        XCTAssertEqual(TestMeasure(specs[1].measure), .hrr)

        // The container's recovery predicate (an hrr result ⇒ measure the pulse
        // after the effort) — asserted on the same condition it evaluates.
        XCTAssertTrue(specs.contains { TestMeasure($0.measure) == .hrr || $0.slug == "hrr60" })

        // Required 5K entered, HRR unmeasured (no strap) → still saveable.
        XCTAssertTrue(TestResultGating.canSave(entries: [
            (value: 1334, isOptional: specs[0].isOptional),
            (value: nil, isOptional: specs[1].isOptional),
        ]))
    }

    // MARK: - tt_2k_row — erg path, no structure (RunStructure is running-only)

    /// The 2K row template: warmup + 2000 m a fondo. Rowing carries NO structure
    /// by design, so the segment must NOT claim the run cursor — it executes
    /// through the erg/PM5 path off its distance measure.
    func testTT2kRowRunsTheErgPathWithoutRunStructure() throws {
        let json = """
        {
          "assignment": { "id": "483", "athlete_id": "67", "scheduled_for": "2026-07-16", "status": "scheduled",
            "store_results": [
              { "slug": "row_2k", "label": "2K remo", "measure": "time", "unit": "seconds",
                "derives": "run_zones", "modality": "row", "optional": false },
              { "slug": "hrr60", "label": "Recuperación", "measure": "hrr", "unit": "bpm",
                "derives": null, "modality": null, "optional": true }
            ] },
          "workout": { "name": "Test 2K remo", "blocks": [ { "uid": "b1", "title": "Test 2K remo", "format": "free", "block_position": 1, "items": [
            { "uid": "i1", "exercise_id": "e1", "exercise_name": "Calentamiento", "exercise_slug": "row", "exercise_category": "rowing",
              "exercise_video_url": null, "cues": null, "params_json": { "duration_seconds": 600 },
              "prescription_json": { "scheme": "steady", "modality": "row", "total_s": 600 }, "notes": null },
            { "uid": "i2", "exercise_id": "e2", "exercise_name": "2K remo a fondo", "exercise_slug": "row", "exercise_category": "rowing",
              "exercise_video_url": null, "cues": null, "params_json": { "distance_meters": 2000 },
              "prescription_json": { "scheme": "for_time", "modality": "row",
                "sets": [ { "measure": { "kind": "distance", "meters": 2000 } } ] }, "notes": null }
          ] } ] } }
        """
        let detail = try decode(json)
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: detail))
        let ergSegs = plan.segments.filter { $0.kind.isErg }
        XCTAssertFalse(ergSegs.isEmpty, "El test de remo debe producir segmentos de ergo.")
        // RunStructure is running-only: no erg segment may claim the run cursor.
        XCTAssertTrue(ergSegs.allSatisfy { !$0.hasRunStructure })

        // The HRR contract still applies to the erg test (it's an endurance test).
        XCTAssertTrue(detail.storeResults.contains { TestMeasure($0.measure) == .hrr })
    }

    // MARK: - The 1RM battery skips the recovery window

    /// A strength battery carries no hrr result → the container must NOT hold the
    /// athlete on a recovery screen after a lift.
    func testStrengthBatteryHasNoRecoveryContract() throws {
        let json = """
        {
          "assignment": { "id": "484", "athlete_id": "67", "scheduled_for": "2026-07-16", "status": "scheduled",
            "store_results": [
              { "slug": "back_squat_1rm", "label": "Sentadilla", "measure": "load", "unit": "kg",
                "derives": "strength_max", "modality": null, "optional": false }
            ] },
          "workout": { "name": "Test 1RM", "blocks": [ { "uid": "b1", "title": "1RM", "format": "free", "block_position": 1, "items": [
            { "uid": "i1", "exercise_id": "e1", "exercise_name": "Back Squat", "exercise_slug": "back-squat", "exercise_category": "strength",
              "exercise_video_url": null, "cues": null, "params_json": { "reps": 1 },
              "prescription_json": { "scheme": "straight_sets", "modality": "strength" }, "notes": null }
          ] } ] } }
        """
        let detail = try decode(json)
        XCTAssertFalse(detail.storeResults.contains { TestMeasure($0.measure) == .hrr || $0.slug == "hrr60" })
        // Required load with nothing entered → blocked (no optional escape hatch).
        XCTAssertFalse(TestResultGating.canSave(entries: [(value: nil, isOptional: false)]))
    }
}
