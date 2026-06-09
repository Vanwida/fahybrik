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
}
