import XCTest
@testable import FAHYBRIK

// Execution-spine regression coverage: the closed loop coach → athlete → coach for
// the HYROX formats where results USED to be lost on the way back.
//
//   BREAK 1  EMOM completion (X/Y rondas) survives into the closed lap + DTO.
//   BREAK 3a A scalar "N × reps" strength materializes N sets (not one).
//   BREAK 3b A single-set strength close carries its tempo / rest (per-set detail).
//   ERG-1    A calorie erg's target is visible on the segment (not "—").
//   ERG-2    Ski / bike / row emit DISTINCT modalities (not a merged "row").
//   ERG-3    A watts target decodes and reaches `targetPowerWatts`.
//   TIME-CAP A time_cap target decodes and reads as a ceiling to beat — not
//            silently dropped to `.unknown`, and not read as a duration to fill.
//
// (BREAK 2 — structured/interval run per-leg execution — lives in
// StructuredRunEngineTests, which already owns the treadmill-fed leg harness.)
final class WorkoutExecutionSpineTests: XCTestCase {

    // MARK: - Decoder + plan helpers (mirror AssignmentDetailTests / APIClient config)

    private func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }

    private func decode(_ json: String) throws -> AssignmentDetail {
        try makeDecoder().decode(AssignmentDetail.self, from: Data(json.utf8))
    }

    private func plan(_ segments: [WorkoutSegment]) -> WorkoutPlan {
        WorkoutPlan(id: UUID(), name: "Test", format: .sets, estimatedDurationSeconds: 600,
                    blockContext: "Test", zoneTargets: [], equipment: [], segments: segments,
                    coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
    }

    /// Build a live session parked on its first segment with the timer OFF (state
    /// preserved), so a test can drive it deterministically via `primaryAdvance()`.
    private func armedSession(_ segments: [WorkoutSegment]) -> WorkoutSession {
        let s = WorkoutSession(plan: plan(segments))
        s.start()
        s.beginBlock()
        s.stop()
        return s
    }

    // Single-item block JSON — the common shape for the segment-build assertions.
    private func oneItemWorkout(category: String, slug: String, name: String,
                                params: String, prescription: String? = nil,
                                resolvedLoad: String? = nil,
                                format: String = "straight_sets") -> String {
        let rx = prescription.map { ", \"prescription_json\": \($0)" } ?? ""
        let rl = resolvedLoad.map { ", \"resolved_load\": \($0)" } ?? ""
        return """
        {
          "assignment": { "id": "asg1", "athlete_id": "ath1", "scheduled_for": "2026-07-20", "status": "scheduled" },
          "workout": { "name": "\(name)", "blocks": [ { "uid": "b", "title": "Bloque", "format": "\(format)", "block_position": 1, "items": [
            { "uid": "i1", "exercise_id": "e1", "exercise_name": "\(name)", "exercise_slug": "\(slug)", "exercise_category": "\(category)",
              "exercise_video_url": null, "cues": null, "params_json": \(params)\(rx)\(rl), "notes": null }
          ] } ] } }
        """
    }

    // MARK: - BREAK 1 · EMOM completion survives into the lap

    private func emomSegment(rounds: Int, reps: Int = 15, order: Int = 1, templateSegmentId: Int = 10) -> WorkoutSegment {
        let rx = Prescription(scheme: .emom, modality: nil, sets: nil, rounds: rounds, workS: 60,
                              restS: nil, totalS: nil, target: nil, note: nil, start: nil, increment: nil)
        return WorkoutSegment(order: order, title: "Wallballs", kind: .reps,
                              templateSegmentId: templateSegmentId, targetReps: reps,
                              blockTitle: "EMOM", blockPosition: 1, prescription: rx)
    }

    func testEMOMRoundsSurviveIntoLapBeforeClear() throws {
        // 3-interval EMOM driven to completion. The bug zeroed the counter BEFORE the
        // lap closed, so a lap carrying 3/3 PROVES the capture runs before clearEMOMState.
        let s = armedSession([emomSegment(rounds: 3)])
        XCTAssertEqual(s.currentSegment?.isEMOM, true)

        s.primaryAdvance()   // skip the 3-2-1 count-in
        s.primaryAdvance()   // interval 0 done → 1
        s.primaryAdvance()   // interval 1 done → 2
        s.primaryAdvance()   // interval 2 done → close + finish

        let lap = try XCTUnwrap(s.laps.last)
        XCTAssertEqual(lap.emomRoundsCompleted, 3, "All 3 EMOM intervals must survive into the lap.")
        XCTAssertEqual(lap.emomRoundsPrescribed, 3)
        // The EMOM lap records completion, NOT reps (its work is interval-driven).
        XCTAssertNil(lap.repsCompleted)
    }

    func testEMOMRoundsRideTheExecutionDTO() throws {
        // The wire DTO carries the completion verbatim (snake_case, no key drift).
        let dto = SegmentExecutionDTO(
            template_segment_id: 10, position: 0, modality: "other",
            started_at: "2026-07-20T10:00:00Z", ended_at: "2026-07-20T10:15:00Z",
            duration_seconds: 900, distance_meters: nil, avg_pace_s_per_500m: nil,
            avg_pace_s_per_km: nil, avg_power_w: nil, stroke_rate_spm: nil, avg_hr: nil,
            max_hr: nil, calories: nil, reps_completed: nil, weight_used_kg: nil,
            zone_seconds_json: nil, source: "manual", reps_prescribed: nil, reps_actual: nil,
            reps_status: nil, reps_confirmed: nil, is_structural: nil, rx_scaled: nil,
            scaled_note: nil, sets: nil, emom_rounds_completed: 8, emom_rounds_prescribed: 10)
        let enc = JSONEncoder()
        let obj = try JSONSerialization.jsonObject(with: enc.encode(dto)) as? [String: Any]
        XCTAssertEqual(obj?["emom_rounds_completed"] as? Int, 8)
        XCTAssertEqual(obj?["emom_rounds_prescribed"] as? Int, 10)
    }

    // MARK: - BREAK 3a · scalar N×reps materializes N sets

    func testScalarMultiSetStrengthMaterializesAllSets() throws {
        // "4×10 @ 60kg" as bare params_json {sets:4} (NO prescription) primed ONE lap
        // of 10 → 3 sets vanished. It must now build a real 4-set prescription.
        let detail = try decode(oneItemWorkout(
            category: "strength", slug: "back-squat", name: "Back Squat",
            params: "{ \"sets\": 4, \"reps\": 10, \"load_kg\": 60 }"))
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)

        XCTAssertEqual(seg.prescription?.sets?.count, 4, "A scalar 4×10 must materialize 4 sets, not 1.")
        XCTAssertTrue(seg.usesMultiSetStrength, "4 materialized sets → the multi-set logger drives it.")
        XCTAssertEqual(seg.prescription?.sets?.first?.prescribedReps, 10)
        XCTAssertEqual(seg.prescription?.sets?.first?.prescribedLoadKg, 60)
    }

    func testAuthoredMultiSetPrescriptionIsNotOverwritten() throws {
        // A well-authored per-set prescription (a 3-set pyramid) is preserved verbatim —
        // the scalar materializer only fills the prescription-LESS gap.
        let rx = "{ \"scheme\": \"sets\", \"modality\": \"strength\", \"sets\": [ " +
                 "{ \"measure\": { \"kind\": \"reps\", \"value\": 5 }, \"target\": { \"kind\": \"percent_rm\", \"value\": 70 } }, " +
                 "{ \"measure\": { \"kind\": \"reps\", \"value\": 3 }, \"target\": { \"kind\": \"percent_rm\", \"value\": 80 } }, " +
                 "{ \"measure\": { \"kind\": \"reps\", \"value\": 1 }, \"target\": { \"kind\": \"percent_rm\", \"value\": 90 } } ] }"
        let detail = try decode(oneItemWorkout(
            category: "strength", slug: "deadlift", name: "Deadlift",
            params: "{ \"sets\": 3 }", prescription: rx))
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)
        XCTAssertEqual(seg.prescription?.sets?.count, 3)
        XCTAssertEqual(seg.prescription?.sets?.map { $0.prescribedReps }, [5, 3, 1], "Authored pyramid preserved.")
    }

    func testSingleSetScalarStrengthKeepsSingleSetPath() throws {
        // A genuine 1-set scalar is NOT materialized into a multi-set prescription.
        let detail = try decode(oneItemWorkout(
            category: "strength", slug: "clean", name: "Power Clean",
            params: "{ \"sets\": 1, \"reps\": 3, \"load_kg\": 80 }"))
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)
        XCTAssertFalse(seg.usesMultiSetStrength, "One set stays on the single-set path.")
    }

    // MARK: - BREAK 3b · single-set strength close carries tempo / rest

    func testSingleSetStrengthCloseCarriesPerSetDetail() throws {
        // A single-set lift used to record only reps+weight; its prescribed tempo / rest
        // must now ride a one-element sets[] → the coach's per-set analytics (set_executions).
        let set = PrescriptionSet(measure: .reps(5), target: .kg(value: 100, min: nil, max: nil),
                                  modality: .strength, restS: 90, tempo: "30X1", note: nil)
        let rx = Prescription(scheme: .sets, modality: .strength, sets: [set], rounds: nil, workS: nil,
                              restS: nil, totalS: nil, target: nil, note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "Back Squat", kind: .strength, templateSegmentId: 7,
                                 targetReps: 5, loadKg: 100, blockTitle: "A", blockPosition: 1, prescription: rx)
        XCTAssertFalse(seg.usesMultiSetStrength)   // exactly one set → single-set path

        let s = armedSession([seg])
        s.primaryAdvance()   // strength → closes the single segment

        let lap = try XCTUnwrap(s.laps.last)
        let sets = try XCTUnwrap(lap.sets, "A single-set strength close must emit a one-element sets[].")
        XCTAssertEqual(sets.count, 1)
        XCTAssertEqual(sets[0].tempo, "30X1", "Prescribed tempo must reach set_executions.")
        XCTAssertEqual(sets[0].restS, 90, "Prescribed rest must reach set_executions.")
        XCTAssertEqual(sets[0].repsActual, 5)
        // The load is the COACH's until the athlete says otherwise: prescribed 100
        // is archived as prescribed, and the actual stays unknown.
        XCTAssertEqual(sets[0].loadPrescribedKg, 100)
        XCTAssertNil(sets[0].loadActualKg, "An untouched prescribed load is not a load the athlete lifted.")
        XCTAssertNil(lap.weightUsedKg, "…and it must not reach weight_used_kg either.")
    }

    func testDeclaredLoadIsRecordedAsUsed() throws {
        // The other half of the rule: what the athlete DOES declare is recorded, and
        // the segment reads as manual entry.
        let set = PrescriptionSet(measure: .reps(5), target: .kg(value: 100, min: nil, max: nil),
                                  modality: .strength, restS: 90, tempo: nil, note: nil)
        let rx = Prescription(scheme: .sets, modality: .strength, sets: [set], rounds: nil, workS: nil,
                              restS: nil, totalS: nil, target: nil, note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "Back Squat", kind: .strength, templateSegmentId: 7,
                                 targetReps: 5, loadKg: 100, blockTitle: "A", blockPosition: 1, prescription: rx)
        let s = armedSession([seg])
        s.primeManualLoadIfNeeded()
        XCTAssertFalse(s.loadConfirmed, "Priming shows a number; it does not declare one.")
        s.manualLoadKg = 80                     // "hoy he movido 80, no 100"
        XCTAssertTrue(s.loadConfirmed)
        s.primaryAdvance()

        let lap = try XCTUnwrap(s.laps.last)
        XCTAssertEqual(lap.weightUsedKg, 80)
        XCTAssertEqual(lap.sets?.first?.loadActualKg, 80)
        XCTAssertEqual(lap.sets?.first?.loadPrescribedKg, 100)
        XCTAssertEqual(lap.source, "manual")
    }

    func testMultiSetLoadIsUnknownUntilTouchedAndDeclaredByConfirm() throws {
        // A 3×5 primes its reps but NOT its loads; "Hecho" (did as written) is the
        // declaration that turns the prescribed load into the actual one.
        let one = PrescriptionSet(measure: .reps(5), target: .kg(value: 60, min: nil, max: nil),
                                  modality: .strength, restS: 60, tempo: nil, note: nil)
        let rx = Prescription(scheme: .sets, modality: .strength, sets: [one, one, one], rounds: nil,
                              workS: nil, restS: nil, totalS: nil, target: nil, note: nil,
                              start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "Front Squat", kind: .strength, templateSegmentId: 9,
                                 targetReps: 5, loadKg: 60, blockTitle: "A", blockPosition: 1, prescription: rx)
        let s = armedSession([seg])
        s.primeSetsIfNeeded()
        XCTAssertEqual(s.setRecords.count, 3)
        XCTAssertEqual(s.setRecords[0].repsActual, 5, "Reps still prime from the prescription.")
        XCTAssertTrue(s.setRecords.allSatisfy { $0.loadActualKg == nil }, "Loads do not.")

        s.confirmSet(0)
        XCTAssertEqual(s.setRecords[0].loadActualKg, 60, "\"Hecho\" declares the prescribed load.")
        XCTAssertNil(s.setRecords[1].loadActualKg)

        s.primaryAdvance()
        let lap = try XCTUnwrap(s.laps.last)
        XCTAssertEqual(lap.weightUsedKg, 60, "The aggregate load is the max DECLARED one.")
    }

    // MARK: - FH-46 · kg al cerrar el ejercicio

    private func resolvedLoadJSON(minKg: Double, pct: Int = 80, oneRm: Double = 110) -> String {
        "{ \"pct_label\": \"\(pct)%\", \"kg_label\": \"\(Int(minKg)) kg\", \"min_kg\": \(minKg), \"max_kg\": null, \"one_rm_kg\": \(oneRm), \"needs_review\": false }"
    }

    func testResolvedLoadMinKgSeedsSegmentLoadKg() throws {
        // Causa: un %RM se aplana a load_pct; segment(from:) solo leía load_kg y
        // el vivo caía al fallback de 20 kg. Semilla = ResolvedLoad.minKg.
        let detail = try decode(oneItemWorkout(
            category: "strength", slug: "back-squat", name: "Back Squat",
            params: "{ \"sets\": 4, \"reps\": 5, \"load_pct\": 80 }",
            resolvedLoad: resolvedLoadJSON(minKg: 88)))
        let item = try XCTUnwrap(detail.workout?.blocks.first?.items.first)
        XCTAssertNil(item.paramsJson.loadKg)
        XCTAssertEqual(item.resolvedLoad?.minKg, 88)
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)
        XCTAssertEqual(seg.loadKg, 88, "The live scalar must carry the brief's resolved kg.")
    }

    func testParamsLoadKgWinsOverResolvedLoad() throws {
        // params.loadKg is already absolute — do not replace it with minKg.
        let detail = try decode(oneItemWorkout(
            category: "strength", slug: "back-squat", name: "Back Squat",
            params: "{ \"sets\": 4, \"reps\": 5, \"load_kg\": 100, \"load_pct\": 80 }",
            resolvedLoad: resolvedLoadJSON(minKg: 88)))
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)
        XCTAssertEqual(seg.loadKg, 100)
    }

    func testPercentRMWithoutResolvedLoadDoesNotInventKg() throws {
        let detail = try decode(oneItemWorkout(
            category: "strength", slug: "back-squat", name: "Back Squat",
            params: "{ \"sets\": 4, \"reps\": 5, \"load_pct\": 80 }"))
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)
        XCTAssertNil(seg.loadKg, "No resolved_load → no fabricated kg. Do not recompute %RM.")
    }

    func testConfirmExerciseLoadWithoutSpinSavesProposed() throws {
        let set = PrescriptionSet(measure: .reps(5), target: .kg(value: 100, min: nil, max: nil),
                                  modality: .strength, restS: 90, tempo: nil, note: nil)
        let rx = Prescription(scheme: .sets, modality: .strength, sets: [set], rounds: nil, workS: nil,
                              restS: nil, totalS: nil, target: nil, note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "Back Squat", kind: .strength, templateSegmentId: 7,
                                 targetReps: 5, loadKg: 100, blockTitle: "A", blockPosition: 1, prescription: rx)
        let s = armedSession([seg])
        s.primeManualLoadIfNeeded()
        XCTAssertEqual(s.manualLoadKg, 100)
        XCTAssertFalse(s.loadConfirmed, "Priming is not a declaration.")
        s.confirmExerciseLoad(100)
        XCTAssertTrue(s.loadConfirmed, "HECHO without spinning declares the proposed kg.")
        s.primaryAdvance()
        let lap = try XCTUnwrap(s.laps.last)
        XCTAssertEqual(lap.weightUsedKg, 100)
        XCTAssertEqual(lap.sets?.first?.loadActualKg, 100)
        XCTAssertEqual(lap.sets?.first?.loadPrescribedKg, 100)
    }

    func testConfirmExerciseLoadStaysOnThisExerciseOnly() throws {
        func lift(_ title: String, kg: Double, order: Int) -> WorkoutSegment {
            let set = PrescriptionSet(measure: .reps(5), target: .kg(value: kg, min: nil, max: nil),
                                      modality: .strength, restS: 60, tempo: nil, note: nil)
            let rx = Prescription(scheme: .sets, modality: .strength, sets: [set], rounds: nil, workS: nil,
                                  restS: nil, totalS: nil, target: nil, note: nil, start: nil, increment: nil)
            return WorkoutSegment(order: order, title: title, kind: .strength, templateSegmentId: order,
                                  targetReps: 5, loadKg: kg, blockTitle: "A", blockPosition: 1, prescription: rx)
        }
        let s = armedSession([lift("Back Squat", kg: 80, order: 1), lift("Bench Press", kg: 60, order: 2)])
        s.primeManualLoadIfNeeded()
        s.confirmExerciseLoad(95)
        s.primaryAdvance()
        XCTAssertEqual(s.laps.last?.weightUsedKg, 95)
        XCTAssertEqual(s.laps.last?.sets?.first?.loadActualKg, 95)

        s.primeManualLoadIfNeeded()
        XCTAssertEqual(s.currentSegment?.title, "Bench Press")
        XCTAssertEqual(s.currentSegment?.loadKg, 60)
        XCTAssertEqual(s.manualLoadKg, 60, "Next exercise primes from ITS load, not the previous declaration.")
        XCTAssertFalse(s.loadConfirmed)
    }

    func testConfirmExerciseLoadWritesNonSkippedSeriesOnly() throws {
        let one = PrescriptionSet(measure: .reps(5), target: .kg(value: 60, min: nil, max: nil),
                                  modality: .strength, restS: 60, tempo: nil, note: nil)
        let rx = Prescription(scheme: .sets, modality: .strength, sets: [one, one, one], rounds: nil,
                              workS: nil, restS: nil, totalS: nil, target: nil, note: nil,
                              start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "Front Squat", kind: .strength, templateSegmentId: 9,
                                 targetReps: 5, loadKg: 60, blockTitle: "A", blockPosition: 1, prescription: rx)
        let s = armedSession([seg])
        s.primeSetsIfNeeded()
        s.setSetSkipped(1, true)
        s.confirmExerciseLoad(77.5)
        XCTAssertEqual(s.setRecords[0].loadActualKg, 77.5)
        XCTAssertNil(s.setRecords[1].loadActualKg, "A skipped series does not take the exercise kg.")
        XCTAssertEqual(s.setRecords[1].status, "skipped")
        XCTAssertEqual(s.setRecords[2].loadActualKg, 77.5)
    }

    func testConfirmExerciseLoadDoesNotOpenWhenAllSeriesSkipped() throws {
        // Cruce con FH-47: si todas las series están saltadas, no se declara kg.
        let one = PrescriptionSet(measure: .reps(5), target: .kg(value: 60, min: nil, max: nil),
                                  modality: .strength, restS: 60, tempo: nil, note: nil)
        let rx = Prescription(scheme: .sets, modality: .strength, sets: [one, one], rounds: nil,
                              workS: nil, restS: nil, totalS: nil, target: nil, note: nil,
                              start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "Front Squat", kind: .strength, templateSegmentId: 9,
                                 targetReps: 5, loadKg: 60, blockTitle: "A", blockPosition: 1, prescription: rx)
        let s = armedSession([seg])
        s.primeSetsIfNeeded()
        s.setSetSkipped(0, true)
        s.setSetSkipped(1, true)
        s.primeManualLoadIfNeeded()
        s.confirmExerciseLoad(80)
        XCTAssertTrue(s.setRecords.allSatisfy { $0.loadActualKg == nil })
        XCTAssertFalse(s.loadConfirmed, "All skipped → the close picker must not declare a load.")
    }

    func testBodyweightRepsCloseHasNoSyntheticSet() throws {
        // A bodyweight REP movement (no load/tempo/rest) must NOT get a fake strength set.
        let seg = WorkoutSegment(order: 1, title: "Push-ups", kind: .reps, templateSegmentId: 8,
                                 targetReps: 20, blockTitle: "A", blockPosition: 1)
        let s = armedSession([seg])
        s.primaryAdvance()
        XCTAssertNil(s.laps.last?.sets, "Rep movements carry no per-set strength detail.")
    }

    // MARK: - ERG-1 · calorie erg target is visible on the segment

    func testCalorieErgTargetIsVisible() throws {
        let detail = try decode(oneItemWorkout(
            category: "rowing", slug: "row-erg", name: "Row",
            params: "{ \"calories\": 20 }"))
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)
        XCTAssertEqual(seg.targetCalories, 20, "A calorie erg must expose its target, not show \"—\".")
    }

    // MARK: - ERG-2 · ski / bike / row emit distinct modalities

    func testErgSubtypesEmitDistinctModalities() throws {
        func seg(_ category: String, _ slug: String) throws -> WorkoutSegment {
            let detail = try decode(oneItemWorkout(category: category, slug: slug, name: "Erg",
                                                   params: "{ \"distance_meters\": 1000 }"))
            return try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)
        }
        XCTAssertEqual(try seg("rowing", "row-erg").wireModality, "row")
        XCTAssertEqual(try seg("ski_erg", "ski-erg").wireModality, "ski", "Ski must NOT collapse to row.")
        XCTAssertEqual(try seg("bike_erg", "bike-erg").wireModality, "bike", "Bike must NOT collapse to row.")
        // A non-erg run still falls back to the kind's default modality.
        XCTAssertEqual(try seg("running", "run").wireModality, "run")
    }

    func testErgSubtypeReachesTheClosedLapModality() throws {
        // The lap emitted on close carries the resolved erg subtype (what the coach reads).
        let detail = try decode(oneItemWorkout(category: "ski_erg", slug: "ski-erg", name: "SkiErg",
                                               params: "{ \"distance_meters\": 500 }"))
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)
        let s = armedSession([seg])
        s.primaryAdvance()   // erg segment → lap() → close
        XCTAssertEqual(s.laps.last?.modality, "ski")
    }

    func testMixedErgFoldIsNotSealedWithOneMachine() throws {
        // Un bloque steady con ski Y remo se pliega en UN segmento. Four layers had
        // already learned that ski is not row — and the FOLD skipped all four,
        // stamping the block with the first movement's machine. Ski and row share
        // one `SegmentKind`, so the test has to be on the MACHINES.
        let detail = try decode(twoItemBlock(
            format: "steady",
            first: (category: "ski_erg", slug: "ski-erg", name: "SkiErg"),
            second: (category: "rowing", slug: "row-erg", name: "Row")))
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)
        XCTAssertEqual(seg.ergMachines, ["ski", "row"], "The fold keeps BOTH machines.")
        XCTAssertEqual(seg.wireModality, "other", "A mixed block is neither ski nor row.")
        // And the per-movement truth survives the fold, minute by minute.
        XCTAssertEqual(seg.prescription?.sets?.compactMap { $0.modality?.rawValue }, ["ski", "row"])

        let s = armedSession([seg])
        XCTAssertTrue(s.canEndBlockEarly, "precondition")
        XCTAssertFalse(s.currentBlockIsStructural, "precondition")
        s.endBlockEarly()   // a folded conditioning block closes as a block, not a step
        XCTAssertEqual(s.laps.count, 1, "precondition: the block closed one lap")
        XCTAssertEqual(s.laps.last?.modality, "other", "…and that is what reaches the coach.")
    }

    func testHomogeneousErgFoldKeepsItsMachine() throws {
        // The other half: a two-movement ski block IS ski, and still says so.
        let detail = try decode(twoItemBlock(
            format: "steady",
            first: (category: "ski_erg", slug: "ski-erg", name: "SkiErg"),
            second: (category: "ski_erg", slug: "ski-erg", name: "SkiErg")))
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)
        XCTAssertEqual(seg.wireModality, "ski")
    }

    // Two-movement block JSON — the shape every FOLD assertion needs.
    private func twoItemBlock(format: String,
                              first: (category: String, slug: String, name: String),
                              second: (category: String, slug: String, name: String)) -> String {
        func item(_ uid: String, _ m: (category: String, slug: String, name: String)) -> String {
            """
            { "uid": "\(uid)", "exercise_id": "e-\(uid)", "exercise_name": "\(m.name)",
              "exercise_slug": "\(m.slug)", "exercise_category": "\(m.category)",
              "exercise_video_url": null, "cues": null,
              "params_json": { "distance_meters": 1000, "duration_seconds": 600 }, "notes": null }
            """
        }
        return """
        {
          "assignment": { "id": "asg1", "athlete_id": "ath1", "scheduled_for": "2026-07-20", "status": "scheduled" },
          "workout": { "name": "Ergómetros Z2", "blocks": [ { "uid": "b", "title": "Ergómetros Z2",
            "format": "\(format)", "block_position": 1, "items": [ \(item("i1", first)), \(item("i2", second)) ] } ] } }
        """
    }

    // MARK: - TANDA 2 · a Tabata score is declared, never assumed

    private func tabataSegment(rounds: Int) -> WorkoutSegment {
        let rx = Prescription(scheme: .tabata, modality: nil, sets: nil, rounds: rounds, workS: 20,
                              restS: 10, totalS: nil, target: nil, note: nil, start: nil, increment: nil)
        return WorkoutSegment(order: 1, title: "Burpees", kind: .reps, templateSegmentId: 11,
                              blockTitle: "Tabata", blockPosition: 1, prescription: rx)
    }

    func testTabataWithoutCountedRepsHasNoRepScore() throws {
        // Counting reps is optional. An array of zeros used to publish "8 rondas ·
        // 0 reps (mín.)" for everyone who simply did the eight rounds.
        let s = armedSession([tabataSegment(rounds: 8)])
        s.endBlockEarly()
        XCTAssertNil(s.capturedScoreReps, "No counted round → no min-reps score.")
    }

    func testTabataRoundsAreTheOnesDone() throws {
        // Abandoning at the start used to be sealed as the eight rounds prescribed.
        let s = armedSession([tabataSegment(rounds: 8)])
        s.endBlockEarly()
        XCTAssertNil(s.capturedScoreRounds, "Zero rounds completed is not eight.")
    }

    // MARK: - ERG-3 · watts target decodes and reaches targetPowerWatts

    func testWattsTargetDecodesFromWire() throws {
        let t = try makeDecoder().decode(Target.self, from: Data(#"{"kind":"watts","value":250}"#.utf8))
        guard case let .watts(value, _, _) = t else { return XCTFail("watts must decode to .watts, not .unknown") }
        XCTAssertEqual(value, 250)
    }

    func testWattsTargetReachesSegmentPower() throws {
        let rx = "{ \"scheme\": \"steady\", \"modality\": \"row\", \"target\": { \"kind\": \"watts\", \"value\": 250 } }"
        let detail = try decode(oneItemWorkout(
            category: "rowing", slug: "row-erg", name: "Row",
            params: "{ \"duration_seconds\": 300 }", prescription: rx))
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)
        XCTAssertEqual(seg.targetPowerWatts, 250, "A watts target must reach targetPowerWatts (the HUD branch).")
    }

    // MARK: - TIME-CAP · a clock to beat, not a duration

    func testTimeCapTargetDecodesAsCeiling() throws {
        // The roxzone-transition shape: a bare `max_s` ceiling, no `value_s`.
        let t = try makeDecoder().decode(Target.self, from: Data(#"{"kind":"time_cap","max_s":8}"#.utf8))
        guard case let .timeCap(value, min, max) = t else {
            return XCTFail("time_cap must decode to .timeCap, not .unknown")
        }
        XCTAssertNil(value)
        XCTAssertNil(min)
        XCTAssertEqual(max, 8)
        // A ceiling reads as "≤ 0:08" — reading it as a bare duration ("8s") would
        // say "spend 8 seconds", the opposite of "be under 8 seconds".
        XCTAssertEqual(PrescriptionRenderer.targetLoad(t), "≤ 0:08")
    }

    func testTimeCapTargetReachesExerciseSummary() throws {
        // A roxzone transition prescribed as a capped set (no measure — the clock
        // IS the prescription) must survive decode all the way to the exercise
        // card the athlete reads on the day's workout screen.
        let rx = "{ \"scheme\": \"sets\", \"modality\": \"functional\", \"sets\": [ { \"target\": { \"kind\": \"time_cap\", \"max_s\": 8 } } ] }"
        let detail = try decode(oneItemWorkout(
            category: "functional", slug: "roxzone-transition", name: "Transición Roxzone",
            params: "{}", prescription: rx))
        let p = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first?.prescription)
        let line = PrescriptionRenderer.summaryLine(p)
        XCTAssertEqual(line.detail, "≤ 0:08", "The roxzone cap must read as a ceiling on the exercise card.")
    }
}
