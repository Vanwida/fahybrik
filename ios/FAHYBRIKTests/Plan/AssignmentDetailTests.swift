import XCTest
@testable import FAHYBRIK

// JSON decode coverage for the `AssignmentDetail` payload returned by
// GET /api/athlete/assignments/{id}/detail.
//
// APIClient uses `JSONDecoder.KeyDecodingStrategy.convertFromSnakeCase`, so
// the wire format is snake_case and the Swift models are camelCase. These
// tests pin a fresh decoder configured the same way to keep parity with the
// production code path.
final class AssignmentDetailTests: XCTestCase {
    // Matches APIClient.shared decoder configuration so behaviour is
    // identical to the runtime path.
    private func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }

    private func decode(_ json: String) throws -> AssignmentDetail {
        let data = Data(json.utf8)
        return try makeDecoder().decode(AssignmentDetail.self, from: data)
    }

    // MARK: - Rest day (workout == null)

    func test_decode_restDay_workoutIsNil() throws {
        let json = """
        {
          "assignment": {
            "id": "asg_001",
            "athlete_id": "ath_001",
            "scheduled_for": "2026-05-27",
            "status": "scheduled",
            "slot": null,
            "template_id": null,
            "template_version": null,
            "completed_at": null,
            "perceived_exertion": null,
            "station_assignment": null,
            "my_role": null
          },
          "workout": null
        }
        """

        let detail = try decode(json)
        XCTAssertEqual(detail.assignment.id, "asg_001")
        XCTAssertEqual(detail.assignment.status, "scheduled")
        XCTAssertNil(detail.workout, "Rest day must decode with workout == nil.")
        XCTAssertNil(detail.assignment.stationAssignment)
        XCTAssertNil(detail.assignment.myRole)
    }

    // MARK: - Full workout (blocks + items + params)

    func test_decode_fullWorkout_blocksItemsParams() throws {
        let json = """
        {
          "assignment": {
            "id": "asg_002",
            "athlete_id": "ath_002",
            "scheduled_for": "2026-05-28",
            "status": "scheduled",
            "slot": "AM",
            "template_id": "tpl_42",
            "template_version": 3,
            "completed_at": null,
            "perceived_exertion": null,
            "station_assignment": null,
            "my_role": null
          },
          "workout": {
            "name": "ATR · Acumulación I",
            "focus": "strength",
            "coach_note": "Calienta 10 min antes.",
            "estimated_duration_minutes": 60,
            "blocks": [
              {
                "uid": "blk_1",
                "title": "A — Fuerza máx",
                "format": "straight_sets",
                "block_position": 1,
                "coach_note": null,
                "config_json": { "rounds": 4 },
                "items": [
                  {
                    "uid": "itm_1",
                    "exercise_id": "ex_back_squat",
                    "exercise_name": "Back Squat",
                    "exercise_slug": "back-squat",
                    "exercise_category": "strength",
                    "exercise_video_url": null,
                    "cues": "Brace, knees out.",
                    "params_json": {
                      "sets": 4,
                      "reps": 5,
                      "load_kg": 120.0,
                      "load_pct": 82.5,
                      "rpe": 8.0,
                      "rest_seconds": 180
                    },
                    "notes": null
                  }
                ]
              },
              {
                "uid": "blk_2",
                "title": "B — Erg",
                "format": "intervals",
                "block_position": 2,
                "coach_note": null,
                "config_json": { "work_seconds": 60, "rest_seconds": 60 },
                "items": [
                  {
                    "uid": "itm_2",
                    "exercise_id": "ex_row_2k",
                    "exercise_name": "Row Erg",
                    "exercise_slug": "row-erg",
                    "exercise_category": "rowing",
                    "exercise_video_url": null,
                    "cues": null,
                    "params_json": {
                      "duration_seconds": 60,
                      "distance_meters": 250,
                      "pace_sec_per_km": 110,
                      "cadence_spm": 28
                    },
                    "notes": null
                  }
                ]
              }
            ]
          }
        }
        """

        let detail = try decode(json)

        // Workout shell
        let workout = try XCTUnwrap(detail.workout)
        XCTAssertEqual(workout.name, "ATR · Acumulación I")
        XCTAssertEqual(workout.focus, "strength")
        XCTAssertEqual(workout.estimatedDurationMinutes, 60)
        XCTAssertEqual(workout.blocks.count, 2)

        // Block 1 — strength
        let block1 = workout.blocks[0]
        XCTAssertEqual(block1.uid, "blk_1")
        XCTAssertEqual(block1.format, "straight_sets")
        XCTAssertEqual(block1.blockPosition, 1)
        XCTAssertEqual(block1.items.count, 1)

        let strengthItem = block1.items[0]
        XCTAssertEqual(strengthItem.exerciseSlug, "back-squat")
        XCTAssertEqual(strengthItem.exerciseCategory, "strength")
        XCTAssertEqual(strengthItem.paramsJson.sets, 4)
        XCTAssertEqual(strengthItem.paramsJson.reps, 5)
        XCTAssertEqual(strengthItem.paramsJson.loadKg, 120.0)
        XCTAssertEqual(strengthItem.paramsJson.loadPct, 82.5)
        XCTAssertEqual(strengthItem.paramsJson.rpe, 8.0)
        XCTAssertEqual(strengthItem.paramsJson.restSeconds, 180)
        // Erg-only fields stay nil on a strength item.
        XCTAssertNil(strengthItem.paramsJson.distanceMeters)
        XCTAssertNil(strengthItem.paramsJson.paceSecPerKm)

        // Block 2 — rowing intervals
        let block2 = workout.blocks[1]
        XCTAssertEqual(block2.format, "intervals")
        // `configJson` is decoded as a generic JSONValue object — Foundation
        // does NOT apply `convertFromSnakeCase` to `[String: JSONValue]`
        // dictionary keys (only to CodingKey lookups), so the raw snake_case
        // keys survive verbatim into the object. JSONValue's typed accessors
        // therefore receive the on-wire key. Pin this behaviour explicitly so
        // any future change is intentional.
        XCTAssertEqual(block2.configJson?.int("work_seconds"), 60)
        XCTAssertEqual(block2.configJson?.int("rest_seconds"), 60)

        let rowItem = block2.items[0]
        XCTAssertEqual(rowItem.exerciseCategory, "rowing")
        XCTAssertEqual(rowItem.paramsJson.durationSeconds, 60)
        XCTAssertEqual(rowItem.paramsJson.distanceMeters, 250)
        XCTAssertEqual(rowItem.paramsJson.paceSecPerKm, 110)
        XCTAssertEqual(rowItem.paramsJson.cadenceSpm, 28)
        // Strength-only fields stay nil on a rowing item.
        XCTAssertNil(rowItem.paramsJson.loadKg)
        XCTAssertNil(rowItem.paramsJson.rpe)
    }

    // MARK: - Dobles station_assignment

    func test_decode_stationAssignment_arrayWithAssignedToEnum() throws {
        let json = """
        {
          "assignment": {
            "id": "asg_003",
            "athlete_id": "ath_003",
            "scheduled_for": "2026-05-29",
            "status": "scheduled",
            "slot": null,
            "template_id": null,
            "template_version": null,
            "completed_at": null,
            "perceived_exertion": null,
            "station_assignment": {
              "stations": [
                { "name": "SkiErg",        "assigned_to": "a" },
                { "name": "Sled Push",     "assigned_to": "b" },
                { "name": "Sled Pull",     "assigned_to": "alternate" },
                { "name": "Burpee Broad",  "assigned_to": "a" }
              ]
            },
            "my_role": "a"
          },
          "workout": null
        }
        """

        let detail = try decode(json)
        let station = try XCTUnwrap(detail.assignment.stationAssignment)
        XCTAssertEqual(station.stations.count, 4)
        XCTAssertEqual(station.stations.map(\.assignedTo), ["a", "b", "alternate", "a"])
        XCTAssertEqual(station.stations[0].name, "SkiErg")
        XCTAssertEqual(detail.assignment.myRole, "a")
    }

    // MARK: - Graceful decoding when optional fields are absent

    func test_decode_minimalAssignment_doesNotFailOnMissingOptionals() throws {
        // Backend may omit fully-null optional fields rather than emit them
        // as explicit null. Decode must still succeed.
        let json = """
        {
          "assignment": {
            "id": "asg_004",
            "athlete_id": "ath_004",
            "scheduled_for": "2026-05-30",
            "status": "scheduled"
          },
          "workout": null
        }
        """

        let detail = try decode(json)
        XCTAssertEqual(detail.assignment.id, "asg_004")
        XCTAssertNil(detail.assignment.slot)
        XCTAssertNil(detail.assignment.templateId)
        XCTAssertNil(detail.assignment.templateVersion)
        XCTAssertNil(detail.assignment.completedAt)
        XCTAssertNil(detail.assignment.perceivedExertion)
        XCTAssertNil(detail.assignment.stationAssignment)
        XCTAssertNil(detail.assignment.myRole)
        XCTAssertNil(detail.workout)
    }

    // MARK: - Structured prescription_json decode + render (UNIT C)

    // Acceptance bar #1: a squat pyramid 10/10/8/8/6 @ 60→75%RM renders each
    // set's reps + load.
    func test_decode_strengthPyramid_perSetRepsAndLoad() throws {
        let json = """
        {
          "assignment": { "id": "asg_p1", "athlete_id": "ath_p1", "scheduled_for": "2026-06-21", "status": "scheduled" },
          "workout": {
            "name": "Fuerza máx",
            "blocks": [
              {
                "uid": "blk_1", "title": "A — Back Squat", "format": "straight_sets", "block_position": 1, "items": [
                  {
                    "uid": "itm_1", "exercise_id": "ex_sq", "exercise_name": "Back Squat",
                    "exercise_slug": "back-squat", "exercise_category": "strength",
                    "exercise_video_url": null, "cues": null,
                    "params_json": { "sets": 5 },
                    "prescription_json": {
                      "scheme": "sets",
                      "modality": "strength",
                      "sets": [
                        { "measure": { "kind": "reps", "value": 10 }, "target": { "kind": "percent_rm", "value": 60 }, "rest_s": 120 },
                        { "measure": { "kind": "reps", "value": 10 }, "target": { "kind": "percent_rm", "value": 65 }, "rest_s": 120 },
                        { "measure": { "kind": "reps", "value": 8 },  "target": { "kind": "percent_rm", "value": 70 }, "rest_s": 150 },
                        { "measure": { "kind": "reps", "value": 8 },  "target": { "kind": "percent_rm", "value": 70 }, "rest_s": 150 },
                        { "measure": { "kind": "reps", "value": 6 },  "target": { "kind": "percent_rm", "value": 75 }, "rest_s": 180 }
                      ]
                    },
                    "notes": null
                  }
                ]
              }
            ]
          }
        }
        """
        let detail = try decode(json)
        let item = try XCTUnwrap(detail.workout?.blocks.first?.items.first)
        let p = try XCTUnwrap(item.prescription)
        XCTAssertEqual(p.scheme, .sets)
        XCTAssertEqual(p.modality, .strength)
        XCTAssertEqual(p.sets?.count, 5)

        let rows = try XCTUnwrap(PrescriptionRenderer.setRows(p))
        XCTAssertEqual(rows.count, 5)
        XCTAssertEqual(rows.map(\.work), ["10", "10", "8", "8", "6"])
        XCTAssertEqual(rows.map { $0.load ?? "" }, ["60% 1RM", "65% 1RM", "70% 1RM", "70% 1RM", "75% 1RM"])
        // Pyramid → NOT uniform → expands to one row per set.
        XCTAssertFalse(PrescriptionRenderer.setsAreUniform(p))
        // Rest is no longer an em-dash: it's filled from the set data.
        XCTAssertEqual(rows.first?.rest, "2:00")
        XCTAssertEqual(rows.last?.rest, "3:00")
    }

    // Uniform sets collapse to a single "N× …" line.
    func test_strengthUniform_collapses() throws {
        let json = """
        {
          "assignment": { "id": "asg_p2", "athlete_id": "ath_p2", "scheduled_for": "2026-06-21", "status": "scheduled" },
          "workout": { "name": "x", "blocks": [ { "uid": "b", "title": "A", "format": "straight_sets", "block_position": 1, "items": [
            { "uid": "i", "exercise_id": "e", "exercise_name": "Bench", "exercise_slug": "bench", "exercise_category": "strength",
              "exercise_video_url": null, "cues": null, "params_json": { "sets": 4 },
              "prescription_json": { "scheme": "sets", "modality": "strength", "sets": [
                { "measure": { "kind": "reps", "value": 5 }, "target": { "kind": "kg", "value": 100 }, "rest_s": 180 },
                { "measure": { "kind": "reps", "value": 5 }, "target": { "kind": "kg", "value": 100 }, "rest_s": 180 },
                { "measure": { "kind": "reps", "value": 5 }, "target": { "kind": "kg", "value": 100 }, "rest_s": 180 },
                { "measure": { "kind": "reps", "value": 5 }, "target": { "kind": "kg", "value": 100 }, "rest_s": 180 }
              ] }, "notes": null }
          ] } ] } }
        """
        let detail = try decode(json)
        let p = try XCTUnwrap(detail.workout?.blocks.first?.items.first?.prescription)
        XCTAssertTrue(PrescriptionRenderer.setsAreUniform(p))
        XCTAssertEqual(PrescriptionRenderer.collapsedSetsLabel(p), "4 × 5 · 100 kg · descanso 3:00")
    }

    // Acceptance bar #2: a Bike Z1 500m renders as distance × zone (NOT a
    // sets/reps table).
    func test_bikeZone_rendersDistanceAndZone_notTable() throws {
        let json = """
        {
          "assignment": { "id": "asg_p3", "athlete_id": "ath_p3", "scheduled_for": "2026-06-21", "status": "scheduled" },
          "workout": { "name": "Z1 bike", "blocks": [ { "uid": "b", "title": "Bike", "format": "steady", "block_position": 1, "items": [
            { "uid": "i", "exercise_id": "e", "exercise_name": "Bike Erg", "exercise_slug": "bike-erg", "exercise_category": "bike_erg",
              "exercise_video_url": null, "cues": null, "params_json": { "distance_meters": 500 },
              "prescription_json": { "scheme": "steady", "modality": "bike", "target": { "kind": "hr_zone", "value": 1 },
                "sets": [ { "measure": { "kind": "distance", "meters": 500 } } ] }, "notes": null }
          ] } ] } }
        """
        let detail = try decode(json)
        let p = try XCTUnwrap(detail.workout?.blocks.first?.items.first?.prescription)
        XCTAssertEqual(p.modality, .bike)
        // Not strength → no per-set table.
        XCTAssertEqual(p.scheme, .steady)
        let line = PrescriptionRenderer.summaryLine(p)
        XCTAssertEqual(line.headline, "500 m")
        XCTAssertEqual(line.zone, .z1)
        XCTAssertNil(line.pace, "A pure zone target has no pace.")
    }

    // A run interval: 4 × 400m @ 3:40/km with rest.
    func test_runInterval_distancePaceRest() throws {
        let json = """
        {
          "assignment": { "id": "asg_p4", "athlete_id": "ath_p4", "scheduled_for": "2026-06-21", "status": "scheduled" },
          "workout": { "name": "Intervals", "blocks": [ { "uid": "b", "title": "Run", "format": "intervals", "block_position": 1, "items": [
            { "uid": "i", "exercise_id": "e", "exercise_name": "400m repeats", "exercise_slug": "run", "exercise_category": "running",
              "exercise_video_url": null, "cues": null, "params_json": {},
              "prescription_json": { "scheme": "interval", "modality": "run", "sets": [
                { "measure": { "kind": "distance", "meters": 400 }, "target": { "kind": "pace", "unit": "per_km", "value_s": 220 }, "rest_s": 90 },
                { "measure": { "kind": "distance", "meters": 400 }, "target": { "kind": "pace", "unit": "per_km", "value_s": 220 }, "rest_s": 90 },
                { "measure": { "kind": "distance", "meters": 400 }, "target": { "kind": "pace", "unit": "per_km", "value_s": 220 }, "rest_s": 90 },
                { "measure": { "kind": "distance", "meters": 400 }, "target": { "kind": "pace", "unit": "per_km", "value_s": 220 }, "rest_s": 90 }
              ] }, "notes": null }
          ] } ] } }
        """
        let detail = try decode(json)
        let p = try XCTUnwrap(detail.workout?.blocks.first?.items.first?.prescription)
        let line = PrescriptionRenderer.summaryLine(p)
        XCTAssertEqual(line.headline, "400 m")
        XCTAssertEqual(line.pace, "@ 3:40 /km")
        XCTAssertTrue(line.detail?.contains("4×") ?? false)
        // 90s rest reads as m:ss at/above a minute ("1:30"), "Ns" only under it.
        XCTAssertTrue(line.detail?.contains("descanso 1:30") ?? false)
    }

    // An erg pace stored per_km converts to /500m for the athlete's monitor.
    func test_ergPace_per500m() throws {
        let json = """
        {
          "assignment": { "id": "asg_p5", "athlete_id": "ath_p5", "scheduled_for": "2026-06-21", "status": "scheduled" },
          "workout": { "name": "Row", "blocks": [ { "uid": "b", "title": "Row", "format": "steady", "block_position": 1, "items": [
            { "uid": "i", "exercise_id": "e", "exercise_name": "Row 2k", "exercise_slug": "row", "exercise_category": "rowing",
              "exercise_video_url": null, "cues": null, "params_json": {},
              "prescription_json": { "scheme": "steady", "modality": "row", "sets": [
                { "measure": { "kind": "distance", "meters": 2000 }, "target": { "kind": "pace", "unit": "per_500m", "value_s": 115 } }
              ] }, "notes": null }
          ] } ] } }
        """
        let detail = try decode(json)
        let p = try XCTUnwrap(detail.workout?.blocks.first?.items.first?.prescription)
        let line = PrescriptionRenderer.summaryLine(p)
        XCTAssertEqual(line.headline, "2 km")
        XCTAssertEqual(line.pace, "@ 1:55 /500m")
    }

    // Legacy item with NO prescription_json still decodes (nil) and renders from
    // scalar params — no crash.
    func test_legacyItem_noPrescription_decodesNil() throws {
        let json = """
        {
          "assignment": { "id": "asg_p6", "athlete_id": "ath_p6", "scheduled_for": "2026-06-21", "status": "scheduled" },
          "workout": { "name": "Legacy", "blocks": [ { "uid": "b", "title": "A", "format": "straight_sets", "block_position": 1, "items": [
            { "uid": "i", "exercise_id": "e", "exercise_name": "Squat", "exercise_slug": "squat", "exercise_category": "strength",
              "exercise_video_url": null, "cues": null, "params_json": { "sets": 3, "reps": 8, "load_kg": 80 }, "notes": null }
          ] } ] } }
        """
        let detail = try decode(json)
        let item = try XCTUnwrap(detail.workout?.blocks.first?.items.first)
        XCTAssertNil(item.prescription)
        XCTAssertEqual(WorkoutItemParamsFormatter.summary(item), "3 × 8 · @ 80 kg")
    }

    // A range target (70-80% 1RM) renders as a dashed range, not a fabricated point.
    func test_rangeTarget_rendersRange() throws {
        let json = """
        {
          "assignment": { "id": "asg_p7", "athlete_id": "ath_p7", "scheduled_for": "2026-06-21", "status": "scheduled" },
          "workout": { "name": "x", "blocks": [ { "uid": "b", "title": "A", "format": "straight_sets", "block_position": 1, "items": [
            { "uid": "i", "exercise_id": "e", "exercise_name": "Squat", "exercise_slug": "squat", "exercise_category": "strength",
              "exercise_video_url": null, "cues": null, "params_json": { "sets": 1 },
              "prescription_json": { "scheme": "sets", "modality": "strength", "sets": [
                { "measure": { "kind": "reps", "value": 8 }, "target": { "kind": "percent_rm", "min": 70, "max": 80 } }
              ] }, "notes": null }
          ] } ] } }
        """
        let detail = try decode(json)
        let p = try XCTUnwrap(detail.workout?.blocks.first?.items.first?.prescription)
        let rows = try XCTUnwrap(PrescriptionRenderer.setRows(p))
        XCTAssertEqual(rows.first?.load, "70–80% 1RM")
    }

    func test_decode_blockWithMissingOptionalConfig_succeeds() throws {
        // Block.coachNote and Block.configJson are optional; absence must
        // not break the decoder.
        let json = """
        {
          "assignment": {
            "id": "asg_005",
            "athlete_id": "ath_005",
            "scheduled_for": "2026-05-31",
            "status": "scheduled"
          },
          "workout": {
            "name": "Free Flow",
            "blocks": [
              {
                "uid": "blk_x",
                "title": "Open",
                "format": "free",
                "block_position": 1,
                "items": []
              }
            ]
          }
        }
        """

        let detail = try decode(json)
        let workout = try XCTUnwrap(detail.workout)
        XCTAssertNil(workout.focus)
        XCTAssertNil(workout.coachNote)
        XCTAssertNil(workout.estimatedDurationMinutes)
        XCTAssertEqual(workout.blocks.count, 1)
        XCTAssertNil(workout.blocks[0].coachNote)
        XCTAssertNil(workout.blocks[0].configJson)
        XCTAssertTrue(workout.blocks[0].items.isEmpty)
    }

    // MARK: - Alternating EMOM merge (WorkoutPlan.from)
    //
    // The backend ships an ALTERNATING EMOM as ONE emom block with N movement
    // items, each carrying the SAME total in `rounds`. `WorkoutPlan.from` must fold
    // them into ONE segment whose `emomPlan` rotates the movements minute by minute
    // (min1 wallballs / min2 run / min3 wallballs …) — NOT N back-to-back EMOMs.

    func test_alternatingEmom_mergesIntoOneSegment_andCyclesMinuteByMinute() throws {
        // EMOM 15: minute alternates 10 Wallballs / 200 m Run. Both items carry
        // rounds=15 (the EMOM total) and work_s=60 (on the minute).
        let json = """
        {
          "assignment": { "id": "asg_emom1", "athlete_id": "ath_e1", "scheduled_for": "2026-06-25", "status": "scheduled" },
          "workout": { "name": "EMOM 15", "blocks": [ { "uid": "b", "title": "Metcon — EMOM 15", "format": "emom", "block_position": 1, "items": [
            { "uid": "i1", "exercise_id": "e1", "exercise_name": "Wallballs", "exercise_slug": "wall-balls", "exercise_category": "functional",
              "exercise_video_url": null, "cues": null, "params_json": { "reps": 10 },
              "prescription_json": { "scheme": "emom", "modality": "functional", "rounds": 15, "work_s": 60, "sets": [
                { "measure": { "kind": "reps", "value": 10 } }
              ] }, "notes": null },
            { "uid": "i2", "exercise_id": "e2", "exercise_name": "Run", "exercise_slug": "run", "exercise_category": "running",
              "exercise_video_url": null, "cues": null, "params_json": { "distance_meters": 200 },
              "prescription_json": { "scheme": "emom", "modality": "run", "rounds": 15, "work_s": 60, "sets": [
                { "measure": { "kind": "distance", "meters": 200 } }
              ] }, "notes": null }
          ] } ] } }
        """
        let detail = try decode(json)
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: detail))

        // ONE merged segment, not two — the whole point of the fix.
        XCTAssertEqual(plan.segments.count, 1, "Two movements must merge into ONE EMOM segment, not two 15-min EMOMs.")
        XCTAssertEqual(plan.format, .emom)
        let seg = try XCTUnwrap(plan.segments.first)
        // Title names both movements (the PostWorkout row + HUD fallback).
        XCTAssertEqual(seg.title, "Wallballs / Run")

        let emom = try XCTUnwrap(seg.emomPlan)
        XCTAssertEqual(emom.intervalCount, 15, "EMOM total = 15 minutes, NOT 15×2 = 30.")
        XCTAssertEqual(emom.intervalSeconds, 60, "On the minute.")
        XCTAssertTrue(emom.isAlternating, "Rotation has 2 distinct movements → alternating.")
        // The expanded minutes cycle the rotation: min1 wallballs, min2 run, min3 wallballs …
        XCTAssertEqual(emom.intervals.count, 15)
        XCTAssertEqual(emom.intervals[0].movement, "Wallballs")
        XCTAssertEqual(emom.intervals[1].movement, "Run")
        XCTAssertEqual(emom.intervals[2].movement, "Wallballs")
        XCTAssertEqual(emom.intervals[14].movement, "Wallballs")   // index 14 % 2 == 0
        // Each minute carries its OWN work (the right movement's dose).
        XCTAssertEqual(emom.intervals[0].work, "10 reps")
        XCTAssertEqual(emom.intervals[1].work, "200 m")
    }

    func test_singleMovementEmom_unchanged_oneMovementEveryMinute() throws {
        // A single-item EMOM is NOT merged: one movement every minute, isAlternating false.
        let json = """
        {
          "assignment": { "id": "asg_emom2", "athlete_id": "ath_e2", "scheduled_for": "2026-06-25", "status": "scheduled" },
          "workout": { "name": "EMOM 15", "blocks": [ { "uid": "b", "title": "EMOM 15", "format": "emom", "block_position": 1, "items": [
            { "uid": "i", "exercise_id": "e", "exercise_name": "Burpees", "exercise_slug": "burpees", "exercise_category": "functional",
              "exercise_video_url": null, "cues": null, "params_json": { "reps": 12 },
              "prescription_json": { "scheme": "emom", "modality": "functional", "rounds": 15, "work_s": 60, "sets": [
                { "measure": { "kind": "reps", "value": 12 } }
              ] }, "notes": null }
          ] } ] } }
        """
        let detail = try decode(json)
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: detail))
        XCTAssertEqual(plan.segments.count, 1)
        let emom = try XCTUnwrap(plan.segments.first?.emomPlan)
        XCTAssertEqual(emom.intervalCount, 15)
        XCTAssertFalse(emom.isAlternating, "One movement → not alternating.")
        XCTAssertTrue(emom.intervals.allSatisfy { $0.movement == "Burpees" })
    }

    func test_nonEmomMultiItemBlock_keepsOneSegmentPerItem() throws {
        // A non-EMOM multi-item block (a strength block's two lifts) is untouched:
        // one segment per item, as before.
        let json = """
        {
          "assignment": { "id": "asg_str", "athlete_id": "ath_s", "scheduled_for": "2026-06-25", "status": "scheduled" },
          "workout": { "name": "Fuerza", "blocks": [ { "uid": "b", "title": "A — Fuerza", "format": "straight_sets", "block_position": 1, "items": [
            { "uid": "i1", "exercise_id": "e1", "exercise_name": "Back Squat", "exercise_slug": "back-squat", "exercise_category": "strength",
              "exercise_video_url": null, "cues": null, "params_json": { "sets": 4, "reps": 5, "load_kg": 120 }, "notes": null },
            { "uid": "i2", "exercise_id": "e2", "exercise_name": "Bench Press", "exercise_slug": "bench", "exercise_category": "strength",
              "exercise_video_url": null, "cues": null, "params_json": { "sets": 4, "reps": 5, "load_kg": 90 }, "notes": null }
          ] } ] } }
        """
        let detail = try decode(json)
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: detail))
        XCTAssertEqual(plan.segments.count, 2, "Non-EMOM multi-item blocks keep one segment per item.")
    }
}
