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
                    coachNote: nil, warmupChecklist: [])
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
                                format: String = "straight_sets") -> String {
        let rx = prescription.map { ", \"prescription_json\": \($0)" } ?? ""
        return """
        {
          "assignment": { "id": "asg1", "athlete_id": "ath1", "scheduled_for": "2026-07-20", "status": "scheduled" },
          "workout": { "name": "\(name)", "blocks": [ { "uid": "b", "title": "Bloque", "format": "\(format)", "block_position": 1, "items": [
            { "uid": "i1", "exercise_id": "e1", "exercise_name": "\(name)", "exercise_slug": "\(slug)", "exercise_category": "\(category)",
              "exercise_video_url": null, "cues": null, "params_json": \(params)\(rx), "notes": null }
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

        // Cerrar el ejercicio exige cerrar SUS series: el avance salta el descanso y
        // confirma la que toque, y solo cuando no queda ninguna cierra el tramo.
        s.primaryAdvance()   // salta el descanso de la serie 1
        s.primaryAdvance()   // serie 2 hecha
        s.primaryAdvance()   // salta su descanso
        s.primaryAdvance()   // serie 3 hecha
        XCTAssertTrue(s.laps.isEmpty, "Con series cerradas pero descanso corriendo el tramo sigue abierto.")
        s.primaryAdvance()   // salta el último descanso
        s.primaryAdvance()   // ya no queda serie → cierra el ejercicio
        let lap = try XCTUnwrap(s.laps.last)
        XCTAssertEqual(lap.weightUsedKg, 60, "The aggregate load is the max DECLARED one.")
        XCTAssertEqual(lap.sets?.count, 3, "Las tres series llegan al registro del coach.")
    }

    // MARK: - Gym 4-ago · el avance es de la SERIE, y la regla es del motor
    //
    // Los dos fallos de fuerza del 4-ago son el mismo agujero: «con series pendientes
    // no se cierra el ejercicio» vivía en `FuerzaVivoView`, así que el botón
    // «Siguiente» del reloj —que entra por `primaryAdvance`— se lo saltaba. Estos
    // tests fijan la regla EN EL MOTOR, que es por donde entra cualquier mando.

    /// Dos ejercicios de 4 series en el MISMO bloque. Un avance por serie no puede
    /// cerrar el primero: 4 series de banca antes de que aparezca el curl.
    func testPrimaryAdvanceClosesTheSetNotTheExerciseWhileSetsArePending() throws {
        let s = armedSession(dosEjerciciosDeCuatroSeries())
        XCTAssertEqual(s.currentSegment?.title, "Press de banca")

        for serie in 1...4 {
            XCTAssertEqual(s.pendingSetIndex, serie - 1)
            s.primaryAdvance()                              // serie hecha → arranca su descanso
            XCTAssertEqual(s.currentSegment?.title, "Press de banca",
                           "La serie \(serie) no puede sacarte del ejercicio.")
            s.primaryAdvance()                              // salta el descanso
        }
        XCTAssertNil(s.pendingSetIndex, "Las cuatro series están cerradas.")
        s.primaryAdvance()                                  // ahora sí: cierra el ejercicio
        XCTAssertEqual(s.currentSegment?.title, "Curl", "Solo entonces se pasa al siguiente.")
        XCTAssertEqual(s.laps.last?.sets?.count, 4, "Las cuatro series entran en el registro.")
    }

    /// El descanso que suena es el del ejercicio que tienes delante. El 4-ago sonó
    /// el 1:30 del curl (su valor por defecto) mientras el atleta seguía en banca,
    /// porque el salto prematuro ya había recargado las series del curl.
    func testRestIsTheOneOfTheExerciseInFront() throws {
        let s = armedSession(dosEjerciciosDeCuatroSeries())
        s.primaryAdvance()
        XCTAssertEqual(s.restRemainingSeconds, 15, "Banca descansa 15 s, los suyos.")

        for _ in 1...7 { s.primaryAdvance() }               // cerrar banca entera
        s.primaryAdvance()                                  // pasar al curl
        XCTAssertEqual(s.currentSegment?.title, "Curl")
        // LA PUERTA DEL SIGUIENTE EJERCICIO (card 112): cambiar de ejercicio en un
        // bloque de hierro ya no arranca solo — el 20-ago la app saltó del peso
        // muerto al rumano con el reloj corriendo y el atleta sin los discos
        // puestos. Aquí se aparca y espera un Empezar, igual que en la app.
        XCTAssertTrue(s.isAwaitingNextExercise, "el curl espera a que le den a Empezar")
        s.beginNextExercise()
        s.primaryAdvance()
        XCTAssertEqual(s.restRemainingSeconds, 90, "Y el curl los suyos: 1:30.")
    }

    /// La muñeca no puede rotular TERMINAR mientras quede trabajo: un entreno de
    /// fuerza libre mete todos los ejercicios en UN bloque, así que «no hay bloque
    /// después» era cierto desde la primera serie del primer ejercicio.
    func testMirrorFinalStepIsNotClaimedWhileSetsOrSegmentsRemain() throws {
        let s = armedSession(dosEjerciciosDeCuatroSeries())
        XCTAssertFalse(s.hasBlockAfterCurrent, "Un solo bloque: no hay bloque después.")
        XCTAssertFalse(s.isLastSegment, "…pero sí queda ejercicio por delante.")
        XCTAssertNotNil(s.pendingSetIndex, "…y series por cerrar.")
    }

    /// Banca 4×10 con 15 s + Curl 4×10 con 1:30, los dos en el bloque «Fuerza» —
    /// exactamente lo que construye el builder de fuerza libre.
    private func dosEjerciciosDeCuatroSeries() -> [WorkoutSegment] {
        func ejercicio(_ titulo: String, orden: Int, descanso: Int) -> WorkoutSegment {
            let serie = PrescriptionSet(measure: .reps(10), target: .bodyweight, modality: nil,
                                        restS: descanso, tempo: nil, note: nil)
            let rx = Prescription(scheme: .sets, modality: .strength,
                                  sets: Array(repeating: serie, count: 4),
                                  rounds: nil, workS: nil, restS: nil, totalS: nil,
                                  target: nil, note: nil, start: nil, increment: nil)
            return WorkoutSegment(order: orden, title: titulo, kind: .strength, templateSegmentId: nil,
                                  targetReps: 10, blockTitle: "Fuerza", blockPosition: 1, prescription: rx)
        }
        return [ejercicio("Press de banca", orden: 1, descanso: 15),
                ejercicio("Curl", orden: 2, descanso: 90)]
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

    // MARK: - SUPERSERIE · el bloque ROTA y conserva todas sus series
    //
    // Un bloque `superset` se ejecuta A1 serie 1 → A2 serie 1 → A3 serie 1 →
    // descanso → A1 serie 2 … (docs/DECISIONS.md 2026-08-05). Lo que se prueba aquí
    // es lo que se pierde si se hace mal: el ORDEN, y las series de cada ejercicio
    // con su carga y su descanso — que es justo lo que `conditioningFold` tira.

    /// Un ejercicio con `series` series de `reps`, cada una con su propia carga
    /// (`cargaBase` + 5 kg por serie) para poder comprobar que ninguna se pierde.
    private func itemDeFuerza(uid: String, nombre: String, slug: String,
                              series: Int, reps: Int, cargaBase: Double,
                              descansoS: Int) -> String {
        let sets = (0..<series).map { i in
            "{ \"measure\": { \"kind\": \"reps\", \"value\": \(reps) }, " +
            "\"target\": { \"kind\": \"kg\", \"value\": \(cargaBase + Double(i) * 5) }, " +
            "\"rest_s\": \(descansoS) }"
        }.joined(separator: ", ")
        let rx = "{ \"scheme\": \"sets\", \"modality\": \"strength\", \"sets\": [ \(sets) ] }"
        return """
        { "uid": "\(uid)", "exercise_id": "\(uid)", "exercise_name": "\(nombre)", "exercise_slug": "\(slug)",
          "exercise_category": "strength", "exercise_video_url": null, "cues": null,
          "params_json": {}, "prescription_json": \(rx), "notes": null }
        """
    }

    private func bloque(formato: String, items: [String]) -> String {
        """
        {
          "assignment": { "id": "asg1", "athlete_id": "ath1", "scheduled_for": "2026-08-05", "status": "scheduled" },
          "workout": { "name": "Fuerza", "blocks": [ { "uid": "b", "title": "A", "format": "\(formato)",
            "block_position": 1, "items": [ \(items.joined(separator: ", ")) ] } ] } }
        """
    }

    private func supersetDeTres(series: Int = 4) -> String {
        bloque(formato: "superset", items: [
            itemDeFuerza(uid: "i1", nombre: "Sentadilla", slug: "back-squat",
                         series: series, reps: 8, cargaBase: 100, descansoS: 0),
            itemDeFuerza(uid: "i2", nombre: "Press banca", slug: "bench-press",
                         series: series, reps: 10, cargaBase: 60, descansoS: 0),
            itemDeFuerza(uid: "i3", nombre: "Remo", slug: "barbell-row",
                         series: series, reps: 12, cargaBase: 40, descansoS: 90),
        ])
    }

    func testSuperserieRotaEnElOrdenDeEjecucion() throws {
        // 3 ejercicios x 4 series = UN tramo con 12 turnos en orden de rotación.
        let detail = try decode(supersetDeTres())
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: detail))

        XCTAssertEqual(plan.segments.count, 1,
                       "Una superserie es UN bloque, luego UN tramo — no uno por ejercicio.")
        let seg = try XCTUnwrap(plan.segments.first)
        XCTAssertEqual(seg.prescription?.scheme, .superset)
        XCTAssertEqual(seg.prescription?.rounds, 4, "Cuatro vueltas a la rotación.")

        let sets = try XCTUnwrap(seg.prescription?.sets)
        XCTAssertEqual(sets.count, 12, "Las 12 series se conservan: 3 ejercicios x 4.")
        XCTAssertEqual(sets.map(\.note),
                       ["Sentadilla", "Press banca", "Remo",
                        "Sentadilla", "Press banca", "Remo",
                        "Sentadilla", "Press banca", "Remo",
                        "Sentadilla", "Press banca", "Remo"],
                       "El orden ES la superserie: A1 s1, A2 s1, A3 s1, A1 s2 …")

        // La vuelta va escrita en cada turno, no se deduce dividiendo.
        XCTAssertEqual(seg.supersetSlots?.map(\.round), [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4])
        XCTAssertEqual(seg.supersetSlots?.allSatisfy { $0.rounds == 4 }, true)
        XCTAssertEqual(seg.supersetSlot(at: 4)?.movement, "Press banca")
    }

    func testSuperserieConservaCargaYDescansoDeCadaSerie() throws {
        // Lo que `conditioningFold` tiraba: coge solo el PRIMER set de cada item.
        let detail = try decode(supersetDeTres())
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)
        let sets = try XCTUnwrap(seg.prescription?.sets)

        // Las cuatro sentadillas suben de 100 a 115: cada serie con SU carga.
        let sentadillas = sets.enumerated().filter { $0.offset % 3 == 0 }.map(\.element)
        XCTAssertEqual(sentadillas.map(\.prescribedLoadKg), [100, 105, 110, 115])
        XCTAssertEqual(sentadillas.map(\.prescribedReps), [8, 8, 8, 8])
        // Y el descanso es del turno: cero al pasar de un ejercicio al siguiente,
        // 90 s al cerrar la vuelta. Un descanso de bloque los aplanaría a uno.
        XCTAssertEqual(sets.map(\.restS), [0, 0, 90, 0, 0, 90, 0, 0, 90, 0, 0, 90])
    }

    func testSuperserieSeRegistraSerieASerieYNoArrancaRelojDeMetcon() throws {
        let detail = try decode(supersetDeTres())
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)

        XCTAssertTrue(seg.usesMultiSetStrength,
                      "Una superserie se registra serie a serie, con su carga.")
        XCTAssertFalse(seg.isConditioningTimer,
                       "No es un metcon: no arranca reloj de acondicionamiento.")
        XCTAssertFalse(seg.isMetconFamily, "Es fuerza, no lleva Rx/Scaled.")
        XCTAssertFalse(seg.isEMOM)

        // Y el registro por serie se ceba con las 12 series de la rotación.
        let s = armedSession([seg])
        s.primeSetsIfNeeded()
        XCTAssertEqual(s.setRecords.count, 12)
        XCTAssertEqual(s.setRecords.first?.loadPrescribedKg, 100)
    }

    func testSuperserieConSeriesDesigualesNoPierdeNinguna() throws {
        // A1 con 4 series y A2 con 2: la vuelta 3 y la 4 las corre A1 solo. Ni se
        // inventa una serie de A2 ni se recortan las de A1.
        let detail = try decode(bloque(formato: "superset", items: [
            itemDeFuerza(uid: "i1", nombre: "Sentadilla", slug: "back-squat",
                         series: 4, reps: 8, cargaBase: 100, descansoS: 0),
            itemDeFuerza(uid: "i2", nombre: "Press banca", slug: "bench-press",
                         series: 2, reps: 10, cargaBase: 60, descansoS: 90),
        ]))
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)
        XCTAssertEqual(seg.prescription?.sets?.map(\.note),
                       ["Sentadilla", "Press banca", "Sentadilla", "Press banca",
                        "Sentadilla", "Sentadilla"])
        XCTAssertEqual(seg.supersetSlots?.map(\.round), [1, 1, 2, 2, 3, 4])
        XCTAssertEqual(seg.prescription?.rounds, 4)
    }

    func testSuperserieDeUnSoloEjercicioDegradaASeriesRectas() throws {
        // Un ejercicio no rota contra nadie. Degrada, no revienta (doctrina EMOM/AMRAP).
        let detail = try decode(bloque(formato: "superset", items: [
            itemDeFuerza(uid: "i1", nombre: "Sentadilla", slug: "back-squat",
                         series: 4, reps: 8, cargaBase: 100, descansoS: 90),
        ]))
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: detail))
        XCTAssertEqual(plan.segments.count, 1)
        let seg = try XCTUnwrap(plan.segments.first)
        XCTAssertNil(seg.supersetSlots, "Sin rotación no hay turnos que enseñar.")
        XCTAssertEqual(seg.prescription?.scheme, .sets, "Vuelve a ser fuerza recta.")
        XCTAssertEqual(seg.prescription?.sets?.count, 4, "Y conserva sus cuatro series.")
        XCTAssertEqual(seg.title, "Sentadilla")
    }

    func testSuperserieConEjercicioSinSeriesDegradaASeriesRectas() throws {
        // El segundo ejercicio no declara ninguna serie: no se sabe cuántas vueltas
        // hace ni con qué, así que no se inventa la rotación.
        let sinSeries = """
        { "uid": "i2", "exercise_id": "i2", "exercise_name": "Press banca", "exercise_slug": "bench-press",
          "exercise_category": "strength", "exercise_video_url": null, "cues": null,
          "params_json": {}, "notes": null }
        """
        let detail = try decode(bloque(formato: "superset", items: [
            itemDeFuerza(uid: "i1", nombre: "Sentadilla", slug: "back-squat",
                         series: 4, reps: 8, cargaBase: 100, descansoS: 90),
            sinSeries,
        ]))
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: detail))
        XCTAssertEqual(plan.segments.count, 2, "Un tramo por ejercicio: series rectas.")
        XCTAssertNil(plan.segments.first?.supersetSlots)
        XCTAssertEqual(plan.segments.map(\.title), ["Sentadilla", "Press banca"])
    }

    func testBloqueDeFuerzaNormalSigueSiendoSeriesRectas() throws {
        // La regla que no puede romperse: dos ejercicios en el mismo bloque NUNCA
        // han rotado, y no empiezan a hacerlo por estar juntos.
        let detail = try decode(bloque(formato: "straight_sets", items: [
            itemDeFuerza(uid: "i1", nombre: "Sentadilla", slug: "back-squat",
                         series: 4, reps: 8, cargaBase: 100, descansoS: 90),
            itemDeFuerza(uid: "i2", nombre: "Press banca", slug: "bench-press",
                         series: 4, reps: 10, cargaBase: 60, descansoS: 90),
        ]))
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: detail))
        XCTAssertEqual(plan.segments.count, 2)
        XCTAssertTrue(plan.segments.allSatisfy { $0.supersetSlots == nil })
        XCTAssertEqual(plan.segments.first?.prescription?.sets?.count, 4)
    }

    // MARK: - MEDIDA CON RANGO · «12-15» es una banda, no dos series

    func testMedidaConMaxDecodificaLaBanda() throws {
        let m = try makeDecoder().decode(
            Measure.self, from: Data(#"{"kind":"reps","value":12,"max":15}"#.utf8))
        guard case let .reps(suelo, techo) = m else { return XCTFail("debe decodificar como .reps") }
        XCTAssertEqual(suelo, 12)
        XCTAssertEqual(techo, 15)
        XCTAssertEqual(m.suelo, 12, "El suelo es con lo que se calcula.")
        XCTAssertTrue(m.esRango)
        XCTAssertEqual(PrescriptionRenderer.measureWork(m), "12-15")
        XCTAssertEqual(PrescriptionRenderer.measureWork(m, deletreandoReps: true), "12-15 reps")
    }

    func testMedidaSinMaxDecodificaExactamenteComoAntes() throws {
        // El cambio es ADITIVO: un JSON de ayer se comporta igual que ayer.
        let m = try makeDecoder().decode(
            Measure.self, from: Data(#"{"kind":"reps","value":12}"#.utf8))
        XCTAssertEqual(m, .reps(12))
        XCTAssertFalse(m.esRango)
        XCTAssertNil(m.techo)
        XCTAssertEqual(PrescriptionRenderer.measureWork(m), "12")
        XCTAssertEqual(PrescriptionRenderer.measureWork(m, deletreandoReps: true), "12 reps")
    }

    func testMaxQueNoAbreBandaNoSePintaComoRango() throws {
        // «15-15» no es un rango, y «15-12» es una errata: ni uno ni otro se enseñan
        // como banda (§7 — lo que no es un dato no se pinta).
        for json in [#"{"kind":"reps","value":15,"max":15}"#, #"{"kind":"reps","value":15,"max":12}"#] {
            let m = try makeDecoder().decode(Measure.self, from: Data(json.utf8))
            XCTAssertFalse(m.esRango, json)
            XCTAssertEqual(PrescriptionRenderer.measureWork(m), "15", json)
        }
    }

    func testBandaDeRepsLlegaAlRegistroDeSeriesSinContaminarElCalculo() throws {
        // El prellenado usa el SUELO (12); la pantalla enseña la banda (12-15).
        let rx = "{ \"scheme\": \"sets\", \"modality\": \"strength\", \"sets\": [ " +
                 "{ \"measure\": { \"kind\": \"reps\", \"value\": 12, \"max\": 15 }, " +
                 "\"target\": { \"kind\": \"kg\", \"value\": 60 } }, " +
                 "{ \"measure\": { \"kind\": \"reps\", \"value\": 12, \"max\": 15 }, " +
                 "\"target\": { \"kind\": \"kg\", \"value\": 60 } } ] }"
        let detail = try decode(oneItemWorkout(
            category: "strength", slug: "curl", name: "Curl", params: "{}", prescription: rx))
        let seg = try XCTUnwrap(WorkoutPlan.from(detail: detail)?.segments.first)
        let set = try XCTUnwrap(seg.prescription?.sets?.first)
        XCTAssertEqual(set.prescribedReps, 12, "El suelo es lo prescrito para calcular.")
        XCTAssertEqual(set.prescribedRepsMax, 15)

        let s = armedSession([seg])
        s.primeSetsIfNeeded()
        let rec = try XCTUnwrap(s.setRecords.first)
        XCTAssertEqual(rec.repsPrescribed, 12)
        XCTAssertEqual(rec.repsActual, 12, "Se prellena con el suelo, nunca con el techo.")
        XCTAssertEqual(rec.repsPrescribedMax, 15)
        XCTAssertEqual(Formato.serie(reps: rec.repsPrescribed, repsMax: rec.repsPrescribedMax,
                                     cargaKg: rec.loadPrescribedKg)?.linea, "12-15 × 60 kg")
    }

    // MARK: - LA PREVIA de una superserie · misma forma que el entreno

    func testLaPreviaLeeLaMismaPuertaQueElMotor() throws {
        // La previa decide con `supersetFold`, exactamente igual que el motor: si el
        // bloque rota, rotan las dos pantallas; si degrada, degradan las dos. Es lo
        // que impide que la previa prometa una rotación que el entreno no hace.
        let rota = try decode(supersetDeTres())
        let bloqueRota = try XCTUnwrap(rota.workout?.blocks.first)
        XCTAssertNotNil(bloqueRota.supersetFold)
        XCTAssertEqual(bloqueRota.supersetFold?.prescription.rounds, 4)

        let degrada = try decode(bloque(formato: "superset", items: [
            itemDeFuerza(uid: "i1", nombre: "Sentadilla", slug: "back-squat",
                         series: 4, reps: 8, cargaBase: 100, descansoS: 90),
        ]))
        XCTAssertNil(try XCTUnwrap(degrada.workout?.blocks.first).supersetFold,
                     "Un solo ejercicio: la previa lo enseña como fuerza recta.")
    }

    func testLaDosisDeLaRotacionColapsaLoUniformeYNoInventaCarga() throws {
        // Series iguales → «4 × 8» + la carga. Es el caso normal.
        let uniforme = Prescription(
            scheme: .sets, modality: .strength,
            sets: (0..<4).map { _ in
                PrescriptionSet(measure: .reps(8), target: .kg(value: 100, min: nil, max: nil),
                                modality: .strength, restS: nil, tempo: nil, note: nil)
            },
            rounds: nil, workS: nil, restS: nil, totalS: nil, target: nil, note: nil,
            start: nil, increment: nil)
        let d1 = PrescriptionRenderer.rotationDose(uniforme)
        XCTAssertEqual(d1.work, "4 × 8")
        XCTAssertEqual(d1.load, "100 kg")

        // PIRÁMIDE: reps y carga cambian serie a serie. La secuencia de reps se
        // escribe como la escribe el coach, y la carga se lee como lo que es, una
        // PROGRESIÓN: de dónde sale y dónde acaba, con flecha y no con guion.
        let piramide = Prescription(
            scheme: .sets, modality: .strength,
            sets: [(10, 100.0), (10, 105.0), (8, 110.0), (8, 110.0), (6, 115.0)].map { reps, kg in
                PrescriptionSet(measure: .reps(reps), target: .kg(value: kg, min: nil, max: nil),
                                modality: .strength, restS: nil, tempo: nil, note: nil)
            },
            rounds: nil, workS: nil, restS: nil, totalS: nil, target: nil, note: nil,
            start: nil, increment: nil)
        let d2 = PrescriptionRenderer.rotationDose(piramide)
        XCTAssertEqual(d2.work, "10/10/8/8/6")
        XCTAssertEqual(d2.load, "100 → 115 kg")
        XCTAssertFalse(d2.load!.contains("-"), "Una banda con guion diría «elige ahí dentro».")
    }

    func testLaProgresionSeEscribeConLaMismaCaraQueLaCarga() throws {
        // La flecha no inventa una grafía nueva: escribe el afijo de cada objetivo
        // exactamente donde lo pone `targetLoad` — sufijo en %RM y kg, prefijo en RPE.
        func escalera(_ objetivos: [Target]) -> [PrescriptionSet] {
            objetivos.map { PrescriptionSet(measure: .reps(5), target: $0, modality: .strength,
                                            restS: nil, tempo: nil, note: nil) }
        }
        XCTAssertEqual(
            PrescriptionRenderer.progressionLoad(escalera([
                .percentRM(value: 60, min: nil, max: nil),
                .percentRM(value: 70, min: nil, max: nil),
                .percentRM(value: 75, min: nil, max: nil),
            ])), "60 → 75% 1RM")
        XCTAssertEqual(
            PrescriptionRenderer.progressionLoad(escalera([
                .rpe(value: 6, min: nil, max: nil), .rpe(value: 8, min: nil, max: nil),
            ])), "RPE 6 → 8")
        // Una escalera DESCENDENTE también es una progresión: las series bajando existen.
        XCTAssertEqual(
            PrescriptionRenderer.progressionLoad(escalera([
                .kg(value: 115, min: nil, max: nil), .kg(value: 110, min: nil, max: nil),
                .kg(value: 100, min: nil, max: nil),
            ])), "115 → 100 kg")
    }

    func testUnaCargaQueSubeYBajaNoSePinta() throws {
        // Si no es monótona, la flecha mentiría: diría que va de la primera a la
        // última cuando por el camino pasó otra cosa. Mejor nada (§7).
        func escalera(_ kgs: [Double]) -> [PrescriptionSet] {
            kgs.map { PrescriptionSet(measure: .reps(5), target: .kg(value: $0, min: nil, max: nil),
                                      modality: .strength, restS: nil, tempo: nil, note: nil) }
        }
        XCTAssertNil(PrescriptionRenderer.progressionLoad(escalera([100, 110, 105])))
        // Mezclar kg con %RM tampoco es una escalera: son dos formas de decir la carga.
        let mezcla = [
            PrescriptionSet(measure: .reps(5), target: .kg(value: 100, min: nil, max: nil),
                            modality: .strength, restS: nil, tempo: nil, note: nil),
            PrescriptionSet(measure: .reps(5), target: .percentRM(value: 80, min: nil, max: nil),
                            modality: .strength, restS: nil, tempo: nil, note: nil),
        ]
        XCTAssertNil(PrescriptionRenderer.progressionLoad(mezcla))
        // Y una serie que YA es una banda por sí misma («70-80 %») no es un peldaño.
        let banda = [
            PrescriptionSet(measure: .reps(5), target: .percentRM(value: nil, min: 70, max: 80),
                            modality: .strength, restS: nil, tempo: nil, note: nil),
            PrescriptionSet(measure: .reps(5), target: .percentRM(value: 85, min: nil, max: nil),
                            modality: .strength, restS: nil, tempo: nil, note: nil),
        ]
        XCTAssertNil(PrescriptionRenderer.progressionLoad(banda))
    }

    func testLaDosisSinMedidaDeclaradaSoloCuentaLasSeries() throws {
        // Sin medida no hay «4 × —»: se dice lo que sí se sabe, que son cuatro.
        let sinMedida = Prescription(
            scheme: .sets, modality: .strength,
            sets: (0..<4).map { _ in
                PrescriptionSet(measure: nil, target: .kg(value: 30, min: nil, max: nil),
                                modality: .strength, restS: nil, tempo: nil, note: nil)
            },
            rounds: nil, workS: nil, restS: nil, totalS: nil, target: nil, note: nil,
            start: nil, increment: nil)
        let d = PrescriptionRenderer.rotationDose(sinMedida)
        XCTAssertEqual(d.work, "4 series")
        XCTAssertEqual(d.load, "30 kg")
    }

    func testSeriesDesigualesSeCuentanPorEjercicioSinRedondear() throws {
        // A1 con 4 series y A2 con 2: la cabecera dice 4 rondas y cada fila dice las
        // suyas. Ni se recorta la primera ni se infla la segunda.
        let detail = try decode(bloque(formato: "superset", items: [
            itemDeFuerza(uid: "i1", nombre: "Sentadilla", slug: "back-squat",
                         series: 4, reps: 8, cargaBase: 100, descansoS: 0),
            itemDeFuerza(uid: "i2", nombre: "Press banca", slug: "bench-press",
                         series: 2, reps: 10, cargaBase: 60, descansoS: 90),
        ]))
        let block = try XCTUnwrap(detail.workout?.blocks.first)
        let fold = try XCTUnwrap(block.supersetFold)
        XCTAssertEqual(fold.prescription.rounds, 4, "La cabecera dice las rondas del bloque.")

        let dosis = block.items.map { item in
            PrescriptionRenderer.rotationDose(item.prescription!)
        }
        // Las reps sí son iguales dentro de cada ejercicio, así que colapsan — y el
        // conteo colapsado ES la verdad de las series desiguales: «4 × 8» al lado de
        // «2 × 10» enseña por sí solo que el segundo se retira antes.
        XCTAssertEqual(dosis.map(\.work), ["4 × 8", "2 × 10"])
        // Y la carga sube 5 kg por serie en los dos: cada uno dice su progresión.
        XCTAssertEqual(dosis.map(\.load), ["100 → 115 kg", "60 → 65 kg"])
    }

    func testElVocabularioDeLaRotacionEsElMismoEnLasDosPantallas() throws {
        // «Ronda», no «vuelta»: la previa, el sujeto del entreno en vivo y la muñeca
        // dicen la misma palabra, o son dos conceptos para quien las lee.
        let detail = try decode(supersetDeTres())
        let fold = try XCTUnwrap(try XCTUnwrap(detail.workout?.blocks.first).supersetFold)
        let cabecera = try XCTUnwrap(PrescriptionRenderer.wodHeader(fold.prescription))
        XCTAssertEqual(cabecera, "Superserie · 4 rondas")
        XCTAssertFalse(cabecera.lowercased().contains("vuelta"))
    }

    /// Un gesto = un tramo. LEG SWINGS (ítem 3 de 4 del calentamiento) no
    /// se come el 80 m ni salta al gate del bloque 2.
    func testUnGestoDelCalentamientoCierraSoloEseTramo() {
        let titulos = ["Run 8:00", "Drills", "LEG SWINGS", "Run 80 m"]
        let warmup = titulos.enumerated().map { i, titulo in
            WorkoutSegment(order: i + 1, title: titulo, kind: .reps,
                           blockTitle: "Calentamiento", blockPosition: 0)
        }
        let principal = WorkoutSegment(order: 5, title: "Series", kind: .running,
                                       blockTitle: "Series de carrera", blockPosition: 1)
        let s = armedSession(warmup + [principal])
        XCTAssertTrue(s.currentBlockIsStructural)
        XCTAssertEqual(s.currentSegment?.title, "Run 8:00")
        XCTAssertFalse(s.isLastStructuralSegment)

        s.primaryAdvance()
        XCTAssertEqual(s.currentSegment?.title, "Drills")
        XCTAssertFalse(s.isAwaitingBlockStart)

        s.primaryAdvance()
        XCTAssertEqual(s.currentSegment?.title, "LEG SWINGS")
        XCTAssertFalse(s.isAwaitingBlockStart)
        XCTAssertTrue(s.laps.isEmpty, "los ítems de lista no fabrican volumen")

        s.primaryAdvance()
        XCTAssertEqual(s.currentSegment?.title, "Run 80 m",
                       "el gesto cierra LEG SWINGS, no el bloque")
        XCTAssertFalse(s.isAwaitingBlockStart)
        XCTAssertTrue(s.currentBlockIsStructural)
        XCTAssertTrue(s.isLastStructuralSegment)

        s.primaryAdvance()
        XCTAssertTrue(s.isAwaitingBlockStart, "el último ítem sí abre el gate del siguiente bloque")
        XCTAssertEqual(s.currentSegment?.title, "Series")
    }

    /// El 4×80 del calentamiento es el último segmento. Un tap no cierra
    /// el bloque: cierra UN tramo (80 m o su rest) y el motor arma el siguiente.
    func testCalentamientoHechoNoCierraElBloqueEnEl80() {
        let swings = WorkoutSegment(order: 1, title: "LEG SWINGS", kind: .reps,
                                    blockTitle: "Calentamiento", blockPosition: 0)
        let rx = Prescription(
            scheme: .intervals, modality: .run, sets: nil, rounds: 4,
            workS: nil, restS: nil, totalS: nil, target: nil, note: nil,
            start: nil, increment: nil,
            structure: [RunPhase(role: .main, elements: [
                .repeatBlock(times: 4, elements: [
                    .segment(RunSegment(kind: .work, measure: .distance(m: 80),
                                        target: nil, resolved: nil, inclinePct: nil,
                                        cadenceSpm: nil, recoveryMode: nil)),
                    .segment(RunSegment(kind: .recovery, measure: .duration(s: 60),
                                        target: nil, resolved: nil, inclinePct: nil,
                                        cadenceSpm: nil, recoveryMode: .parado))
                ])
            ])]
        )
        let ochenta = WorkoutSegment(order: 2, title: "Run 80 m", kind: .running,
                                     blockTitle: "Calentamiento", blockPosition: 0,
                                     prescription: rx)
        let series = WorkoutSegment(order: 3, title: "Series", kind: .running,
                                    blockTitle: "Series", blockPosition: 1)
        let s = armedSession([swings, ochenta, series])
        s.primaryAdvance()
        XCTAssertEqual(s.currentSegment?.title, "Run 80 m")
        XCTAssertTrue(s.isLastStructuralSegment)
        XCTAssertTrue(s.isRunStructureActive)
        s.primaryAdvance()
        XCTAssertTrue(s.isRunLegWork)
        s.primaryAdvance()
        XCTAssertTrue(s.isTramoResting)
        XCTAssertEqual(s.livePicture.label, "Descanso")
        XCTAssertFalse(s.isAwaitingBlockStart, "el rest del 80 no abre el gate")
        XCTAssertTrue(s.currentBlockIsStructural)
        s.primaryAdvance()
        XCTAssertTrue(s.isRunLegWork)
        XCTAssertEqual(s.runLegIndex, 2)
        XCTAssertFalse(s.isAwaitingBlockStart)
        XCTAssertEqual(s.currentSegment?.title, "Run 80 m")
    }

    func testMedidaConRangoSobreviveElViajeDeIdaYVuelta() throws {
        // Encode + decode: el techo no se pierde por el camino (el espejo del reloj
        // y la cola sin conexión guardan medidas ya decodificadas).
        for m in [Measure.reps(12, max: 15),
                  .distance(meters: 800, max: 1000),
                  .duration(seconds: 40, max: 60),
                  .calories(12, max: 15)] {
            let ida = try JSONEncoder().encode(m)
            XCTAssertEqual(try makeDecoder().decode(Measure.self, from: ida), m)
        }
    }
}
