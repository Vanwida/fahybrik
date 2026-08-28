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
            "name": "Microciclo 1 · Base",
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
        XCTAssertEqual(workout.name, "Microciclo 1 · Base")
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
        XCTAssertEqual(rows.compactMap(\.work), ["10", "10", "8", "8", "6"])
        XCTAssertEqual(rows.map { $0.load ?? "" }, ["60% 1RM", "65% 1RM", "70% 1RM", "70% 1RM", "75% 1RM"])
        // Pyramid → NOT uniform → expands to one row per set.
        XCTAssertFalse(PrescriptionRenderer.setsAreUniform(p))
        // Rest is no longer an em-dash: it's filled from the set data.
        XCTAssertEqual(rows.first?.rest, "2:00")
        XCTAssertEqual(rows.last?.rest, "3:00")
    }

    /// UNA PIRÁMIDE NO SE COLAPSA A UNA MENTIRA — la regresión del formateador que
    /// se borró el 11-ago.
    ///
    /// `Formato.dosisDeSeries` multiplicaba las series por las repeticiones de la
    /// PRIMERA, así que el 6-6-4-4-3 real del bloque 392 salía «5×6». Vivía en la
    /// línea del plan del hierro en vivo (ya quitada), pero la clase del bug es de
    /// las TARJETAS: cualquier sitio que cuente series y multiplique por una medida
    /// miente en el 49 % del corpus. Aquí se fija que las tres puertas del renderer
    /// no lo hacen — y con el caso literal del coach, que además escribe la
    /// secuencia igual en su `notes`: «5 rounds Back Squat 6/6/4/4/3 @75-85%».
    func test_strengthPyramid_neverCollapsesIntoALie() throws {
        func serie(_ reps: Int, _ restS: Int?) -> PrescriptionSet {
            PrescriptionSet(measure: .reps(reps),
                            target: .percentRM(value: nil, min: 75, max: 85),
                            modality: .strength, restS: restS, tempo: nil, note: nil)
        }
        let p = Prescription(
            scheme: .sets, modality: .strength,
            sets: [serie(6, 150), serie(6, 150), serie(4, 150), serie(4, 150), serie(3, nil)],
            rounds: nil, workS: nil, restS: nil, totalS: nil,
            target: nil, note: nil, start: nil, increment: nil)

        // 1 · La tabla no se colapsa: las series no son uniformes.
        XCTAssertFalse(PrescriptionRenderer.setsAreUniform(p))
        // 2 · El multiplicador del titular no existe cuando las medidas difieren, así
        //     que `summaryLine` no puede escribir «5 × 6».
        XCTAssertNil(PrescriptionRenderer.repetitionCount(p))
        XCTAssertNotEqual(PrescriptionRenderer.summaryLine(p).headline, "5 × 6")
        // 3 · Y la dosis de una rotación escribe la SECUENCIA, con barra: el guion ya
        //     significa banda («12-15») y darle dos sentidos al mismo signo es como
        //     empiezan las tres grafías del ritmo.
        let dose = PrescriptionRenderer.rotationDose(p)
        XCTAssertEqual(dose.work, "6/6/4/4/3")
        XCTAssertFalse(dose.work?.contains("5 × 6") ?? false)
        XCTAssertFalse(dose.work?.contains("-") ?? false, "el guion es la banda, no la secuencia")
        // La carga uniforme sí se dice una vez, y sigue siendo un porcentaje.
        //
        // OJO AL GUION, que es un hallazgo y no un detalle: aquí es un EN DASH
        // (U+2013) porque `PrescriptionRenderer.range` escribe los rangos así,
        // mientras `Formato` los escribe con guion normal («12-15» de `serie`,
        // «75-85» de `rango`). Son DOS grafías del mismo rango y el atleta ve las
        // dos —la tarjeta del plan y el numeral del vivo— así que hay que unificarlas
        // en su propio lote: cambiarlas aquí movería el copy de todas las tarjetas
        // del plan desde un porte del entreno en vivo.
        XCTAssertEqual(dose.load, "75\u{2013}85% 1RM")

        // Y el contraste: cuatro series IGUALES sí se colapsan, que es lo correcto.
        let uniforme = Prescription(
            scheme: .sets, modality: .strength,
            sets: (0..<4).map { _ in serie(10, 90) },
            rounds: nil, workS: nil, restS: nil, totalS: nil,
            target: nil, note: nil, start: nil, increment: nil)
        XCTAssertTrue(PrescriptionRenderer.setsAreUniform(uniforme))
        XCTAssertEqual(PrescriptionRenderer.repetitionCount(uniforme), 4)
        XCTAssertEqual(PrescriptionRenderer.rotationDose(uniforme).work, "4 × 10")
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
        // El multiplicador va PEGADO a la medida, en el titular: «4 × 400 m» es la
        // dosis entera. Antes colgaba del detalle, en gris y detrás de la carga.
        XCTAssertEqual(line.headline, "4 × 400 m")
        XCTAssertEqual(line.pace, "@ 3:40/km")
        // 90s rest reads as m:ss at/above a minute ("1:30"), "Ns" only under it.
        XCTAssertTrue(line.detail?.contains("descanso 1:30") ?? false)
    }

    // MARK: - Gym 4-ago · la previa dice la dosis entera, en TODOS los tipos

    /// El caso reportado: un 4×10 corporal con 15 s llegaba a la pantalla de antes de
    /// empezar como «10 · Corporal · descanso 15s» — sin las cuatro series.
    func test_strengthSets_countReachesTheHeadline() throws {
        let serie = PrescriptionSet(measure: .reps(10), target: .bodyweight, modality: nil,
                                    restS: 15, tempo: nil, note: nil)
        let p = Prescription(scheme: .sets, modality: .strength,
                             sets: Array(repeating: serie, count: 4),
                             rounds: nil, workS: nil, restS: nil, totalS: nil,
                             target: nil, note: nil, start: nil, increment: nil)
        let line = PrescriptionRenderer.summaryLine(p)
        XCTAssertEqual(line.headline, "4 × 10")
        XCTAssertTrue(line.detail?.contains("descanso 15s") ?? false)
    }

    /// Y la contraparte que impide que la regla mienta: la ROTACIÓN de un bloque
    /// plegado son movimientos distintos, no repeticiones. «3 ×» delante de
    /// remo/ski/cinta diría que hay que hacer cada uno tres veces.
    func test_foldedRotation_isNeverCollapsedIntoAMultiplier() throws {
        func estacion(_ nombre: String) -> PrescriptionSet {
            PrescriptionSet(measure: .calories(15), target: nil, modality: nil,
                            restS: nil, tempo: nil, note: nombre)
        }
        let p = Prescription(scheme: .emom, modality: .functional,
                             sets: [estacion("Remo"), estacion("SkiErg"), estacion("Cinta")],
                             rounds: 12, workS: 60, restS: nil, totalS: nil,
                             target: nil, note: nil, start: nil, increment: nil)
        XCTAssertNil(PrescriptionRenderer.repetitionCount(p))
        XCTAssertEqual(PrescriptionRenderer.summaryLine(p).headline, "15 cal")
    }

    /// La cabecera de formato la conocen TODOS los esquemas con reloj, no solo
    /// amrap/emom/for_time: un circuito llegaba a la previa sin cabecera y aparecía
    /// con ella al arrancar, porque había dos formateadores distintos.
    func test_wodHeader_coversEveryClockScheme() throws {
        func rx(_ scheme: PrescriptionScheme, rounds: Int? = nil, workS: Int? = nil,
                restS: Int? = nil, totalS: Int? = nil, start: Int? = nil, increment: Int? = nil) -> Prescription {
            Prescription(scheme: scheme, modality: nil, sets: nil, rounds: rounds, workS: workS,
                         restS: restS, totalS: totalS, target: nil, note: nil,
                         start: start, increment: increment)
        }
        XCTAssertEqual(PrescriptionRenderer.wodHeader(rx(.rounds, rounds: 5, restS: 60)),
                       "5 rondas · descanso 1:00")
        XCTAssertEqual(PrescriptionRenderer.wodHeader(rx(.tabata, rounds: 8, workS: 20, restS: 10)),
                       "Tabata · 20/10 · 8 rondas")
        XCTAssertEqual(PrescriptionRenderer.wodHeader(rx(.deathBy, start: 1, increment: 1)),
                       "Death By · desde 1 · +1 por ronda")
        XCTAssertEqual(PrescriptionRenderer.wodHeader(rx(.hyroxSim, rounds: 8, totalS: 5400)),
                       "HYROX Sim · 8 rondas · cap 1:30:00")
        XCTAssertEqual(PrescriptionRenderer.wodHeader(rx(.steady, totalS: 2400)), "Continuo · 40:00")
        // Fuerza / calentamiento / vuelta a la calma no son formatos con reloj.
        XCTAssertNil(PrescriptionRenderer.wodHeader(rx(.sets)))
        XCTAssertNil(PrescriptionRenderer.wodHeader(rx(.warmup)))
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
        XCTAssertEqual(line.pace, "@ 1:55/500m")
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

    // MARK: - Conditioning block fold (FASE 2 · PASO 3 — per-format timers)

    func test_multiMovementAmrap_foldsIntoOneSegment_withRoundList() throws {
        // AMRAP 20 "Cindy" (3 movements): the block folds into ONE block-level
        // segment whose `sets[]` is the round shown at once; the window drives the
        // count-down. Mirrors the alternating-EMOM fold.
        let json = """
        {
          "assignment": { "id": "asg_amrap", "athlete_id": "ath_a", "scheduled_for": "2026-06-25", "status": "scheduled" },
          "workout": { "name": "Cindy", "blocks": [ { "uid": "b", "title": "Metcon — AMRAP 20", "format": "amrap", "block_position": 1, "items": [
            { "uid": "i1", "exercise_id": "e1", "exercise_name": "Pull-ups", "exercise_slug": "pull-ups", "exercise_category": "functional",
              "exercise_video_url": null, "cues": null, "params_json": { "reps": 5 },
              "prescription_json": { "scheme": "amrap", "total_s": 1200, "sets": [ { "measure": { "kind": "reps", "value": 5 } } ] }, "notes": null },
            { "uid": "i2", "exercise_id": "e2", "exercise_name": "Push-ups", "exercise_slug": "push-ups", "exercise_category": "functional",
              "exercise_video_url": null, "cues": null, "params_json": { "reps": 10 },
              "prescription_json": { "scheme": "amrap", "total_s": 1200, "sets": [ { "measure": { "kind": "reps", "value": 10 } } ] }, "notes": null },
            { "uid": "i3", "exercise_id": "e3", "exercise_name": "Air Squats", "exercise_slug": "air-squats", "exercise_category": "functional",
              "exercise_video_url": null, "cues": null, "params_json": { "reps": 15 },
              "prescription_json": { "scheme": "amrap", "total_s": 1200, "sets": [ { "measure": { "kind": "reps", "value": 15 } } ] }, "notes": null }
          ] } ] } }
        """
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: try decode(json)))
        XCTAssertEqual(plan.segments.count, 1, "A multi-movement AMRAP folds into ONE block-level segment.")
        XCTAssertEqual(plan.format, .amrap)
        let seg = try XCTUnwrap(plan.segments.first)
        XCTAssertEqual(seg.formatScheme, .amrap)
        XCTAssertTrue(seg.isConditioningTimer)
        XCTAssertFalse(seg.isEMOM)
        XCTAssertEqual(seg.formatTotalSeconds, 1200, "The AMRAP window drives the count-down.")
        XCTAssertEqual(seg.components.count, 3, "The round is the three movements, shown at once.")
        XCTAssertEqual(seg.components[0].name, "Pull-ups")
        XCTAssertEqual(seg.components[0].work, "5 reps")
        XCTAssertEqual(seg.components[2].work, "15 reps")
    }

    func test_multiMovementForTime_foldsIntoOneSegment_timeScored() throws {
        // For Time "Fran"-style with a cap: folds to ONE segment, time-scored, cap
        // carried so the HUD can flip to count-down in the final minute.
        let json = """
        {
          "assignment": { "id": "asg_ft", "athlete_id": "ath_f", "scheduled_for": "2026-06-25", "status": "scheduled" },
          "workout": { "name": "Fran", "blocks": [ { "uid": "b", "title": "For Time", "format": "for_time", "block_position": 1, "items": [
            { "uid": "i1", "exercise_id": "e1", "exercise_name": "Thrusters", "exercise_slug": "thruster", "exercise_category": "strength",
              "exercise_video_url": null, "cues": null, "params_json": { "reps": 21 },
              "prescription_json": { "scheme": "for_time", "rounds": 3, "total_s": 480, "sets": [ { "measure": { "kind": "reps", "value": 21 } } ] }, "notes": null },
            { "uid": "i2", "exercise_id": "e2", "exercise_name": "Pull-ups", "exercise_slug": "pull-ups", "exercise_category": "functional",
              "exercise_video_url": null, "cues": null, "params_json": { "reps": 21 },
              "prescription_json": { "scheme": "for_time", "rounds": 3, "total_s": 480, "sets": [ { "measure": { "kind": "reps", "value": 21 } } ] }, "notes": null }
          ] } ] } }
        """
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: try decode(json)))
        XCTAssertEqual(plan.segments.count, 1)
        XCTAssertEqual(plan.format, .forTime)
        let seg = try XCTUnwrap(plan.segments.first)
        XCTAssertEqual(seg.formatScheme, .forTime)
        XCTAssertEqual(seg.formatTotalSeconds, 480, "The cap is carried for the last-minute flip.")
        XCTAssertEqual(seg.formatRounds, 3)
        XCTAssertEqual(seg.components.count, 2)
    }

    func test_singleMovementConditioning_isNotFolded_butRoutesByScheme() throws {
        // A single-movement Steady run stays a natural one-item segment (no fold)
        // yet still routes to its conditioning timer by scheme, with its window +
        // scalar pace targets intact for the pace HUD.
        let json = """
        {
          "assignment": { "id": "asg_st", "athlete_id": "ath_st", "scheduled_for": "2026-06-25", "status": "scheduled" },
          "workout": { "name": "Rodaje Z2", "blocks": [ { "uid": "b", "title": "Principal", "format": "steady", "block_position": 1, "items": [
            { "uid": "i", "exercise_id": "e", "exercise_name": "Carrera", "exercise_slug": "run", "exercise_category": "running",
              "exercise_video_url": null, "cues": null, "params_json": { "duration_seconds": 2400, "pace_sec_per_km": 300, "hr_zone": 2 },
              "prescription_json": { "scheme": "steady", "total_s": 2400, "target": { "kind": "hr_zone", "value": 2 } }, "notes": null }
          ] } ] } }
        """
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: try decode(json)))
        XCTAssertEqual(plan.segments.count, 1)
        let seg = try XCTUnwrap(plan.segments.first)
        XCTAssertEqual(seg.formatScheme, .steady)
        XCTAssertTrue(seg.isConditioningTimer)
        XCTAssertEqual(seg.formatTotalSeconds, 2400)
        XCTAssertEqual(seg.targetPaceSecondsPerKm, 300, "Single-movement steady keeps its scalar pace target.")
        XCTAssertEqual(seg.targetZone, HRZone(rawValue: 2))
    }

    func test_warmupBlock_neverFolds_evenAuthoredAsRounds() throws {
        // Un calentamiento montado como "rondas" (un activation flow real: 3
        // rondas de 9 movimientos) satisface el mismo `runsConditioningTimer`
        // que un AMRAP — antes se plegaba en UN tramo opaco con el título
        // concatenando los nombres de los ejercicios, y "hecho" saltaba
        // directo al siguiente bloque sin pasar por ninguno (Alex, 7-ago).
        // El contrato es "calentamiento y vuelta a la calma NUNCA se pliegan",
        // sea cual sea su formato — `StructuralBlockChecklist` necesita un
        // tramo POR MOVIMIENTO para pintar la checklist.
        let json = """
        {
          "assignment": { "id": "asg_wu", "athlete_id": "ath_wu", "scheduled_for": "2026-06-25", "status": "scheduled" },
          "workout": { "name": "Sesión", "blocks": [ { "uid": "b", "title": "Calentamiento - Activación general", "format": "rounds", "block_position": 0, "items": [
            { "uid": "i1", "exercise_id": "e1", "exercise_name": "Assault Bike", "exercise_slug": "assault-bike", "exercise_category": "cardio",
              "exercise_video_url": null, "cues": null, "params_json": { "duration_seconds": 120 },
              "prescription_json": { "scheme": "rounds", "rounds": 3, "sets": [ { "measure": { "kind": "duration", "value": 120 } } ] }, "notes": null },
            { "uid": "i2", "exercise_id": "e2", "exercise_name": "Foam roll lower body", "exercise_slug": "foam-roll", "exercise_category": "mobility",
              "exercise_video_url": null, "cues": null, "params_json": { "duration_seconds": 120 },
              "prescription_json": { "scheme": "rounds", "rounds": 3, "sets": [ { "measure": { "kind": "duration", "value": 120 } } ] }, "notes": null }
          ] } ] } }
        """
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: try decode(json)))
        XCTAssertEqual(plan.segments.count, 2, "Un tramo POR MOVIMIENTO — el calentamiento no se pliega aunque su formato lo permita.")
        XCTAssertEqual(plan.segments[0].title, "Assault Bike", "El título de cada tramo es el del ejercicio, nunca una concatenación.")
        XCTAssertEqual(plan.segments[1].title, "Foam roll lower body")
        XCTAssertTrue(plan.segments.allSatisfy { $0.blockPhase == .warmup })
    }

    /// Un día prescrito con calentamiento + series + vuelta a la calma
    /// tiene que abrir brief/live. El 200 del detail no basta si `from`
    /// devuelve nil y el contenedor se queda en `.loading`.
    func test_prescribedDay_warmupIntervalsCooldown_isReadyLaunch() throws {
        let json = """
        {
          "assignment": {
            "id": "asg_day",
            "athlete_id": "ath",
            "scheduled_for": "2026-08-25",
            "status": "scheduled",
            "station_assignment": null,
            "my_role": null
          },
          "workout": {
            "name": "Tempo",
            "blocks": [
              {
                "uid": "w",
                "title": "Calentamiento",
                "format": "circuit",
                "block_position": 0,
                "items": [
                  {
                    "uid": "w1",
                    "exercise_id": "1",
                    "exercise_name": "Movilidad",
                    "exercise_slug": "mobility",
                    "exercise_category": "mobility",
                    "exercise_video_url": null,
                    "cues": null,
                    "params_json": { "duration_seconds": 60 },
                    "notes": null
                  }
                ]
              },
              {
                "uid": "i",
                "title": "Series de carrera",
                "format": "intervals",
                "block_position": 1,
                "items": [
                  {
                    "uid": "i1",
                    "exercise_id": "2",
                    "exercise_name": "Run",
                    "exercise_slug": "run",
                    "exercise_category": "running",
                    "exercise_video_url": null,
                    "cues": null,
                    "params_json": { "duration_seconds": 300 },
                    "prescription_json": {
                      "scheme": "rounds",
                      "rounds": 3,
                      "sets": [{ "measure": { "kind": "duration", "value": 300 } }]
                    },
                    "notes": null
                  }
                ]
              },
              {
                "uid": "c",
                "title": "Vuelta a la calma",
                "format": "circuit",
                "block_position": 2,
                "items": [
                  {
                    "uid": "c1",
                    "exercise_id": "3",
                    "exercise_name": "Bike",
                    "exercise_slug": "bike",
                    "exercise_category": "cardio",
                    "exercise_video_url": null,
                    "cues": null,
                    "params_json": { "duration_seconds": 120 },
                    "notes": null
                  }
                ]
              }
            ]
          }
        }
        """
        let detail = try decode(json)
        switch WorkoutLaunchBody.from(detail: detail) {
        case .ready(let plan, _):
            XCTAssertEqual(plan.name, "Tempo")
            XCTAssertFalse(plan.segments.isEmpty)
        default:
            XCTFail("un día con bloques prescritos tiene que ser ready, no unusable")
        }
    }

    func test_emptyWorkout_isUnusableLaunch() throws {
        let json = """
        {
          "assignment": { "id": "1", "athlete_id": "1", "scheduled_for": "2026-08-25", "status": "scheduled" },
          "workout": { "name": "X", "blocks": [] }
        }
        """
        if case .unusable = WorkoutLaunchBody.from(detail: try decode(json)) {
            return
        }
        XCTFail("sin bloques el launch es unusable — failed, no spinner")
    }

    // MARK: - Executed-session detail (`execution` block)
    //
    // Powers ExecutedWorkoutView (tap a DONE session → read-only what-you-logged).
    // The `execution` block was added with the post-workout loop; these pin its
    // decode so a finished session's detail can never silently fail to load.

    // A done COACH workout: aggregate only (duration + RPE + source), no segments.
    func test_decode_doneCoachWorkout_executionAggregate() throws {
        let json = """
        {
          "assignment": { "id": "587", "athlete_id": "70", "scheduled_for": "2026-06-29", "status": "completed" },
          "workout": null,
          "execution": {
            "execution_id": "115", "total_duration_seconds": null, "perceived_exertion": 7,
            "score_label": null, "notes": null, "ended_at": "2026-06-30 15:59:17+00",
            "source": "manual", "completeness": "completed", "segments": []
          }
        }
        """
        let detail = try decode(json)
        let exec = try XCTUnwrap(detail.execution)
        XCTAssertEqual(exec.completeness, "completed")
        XCTAssertFalse(exec.isPartial)
        XCTAssertEqual(exec.perceivedExertion, 7)
        XCTAssertEqual(exec.source, "manual")
        XCTAssertTrue(exec.segments.isEmpty)
    }

    // A PARTIAL free workout with one logged segment (real erg piece) decodes with
    // its per-segment actuals intact.
    func test_decode_partialWorkout_withSegmentActual() throws {
        let json = """
        {
          "assignment": { "id": "645", "athlete_id": "70", "scheduled_for": "2026-06-30", "status": "partial" },
          "workout": null,
          "execution": {
            "execution_id": "116", "total_duration_seconds": 31, "perceived_exertion": 7,
            "score_label": null, "notes": null, "ended_at": "2026-06-30 15:55:35+00",
            "source": "manual", "completeness": "partial",
            "segments": [
              { "position": 1, "item_uid": null, "modality": "row", "duration_seconds": 30,
                "reps_completed": null, "weight_used_kg": null, "distance_meters": 100.19,
                "avg_pace_s_per_500m": 119.88, "avg_pace_s_per_km": null, "avg_power_w": 217.3,
                "stroke_rate_spm": 28, "avg_hr": 151, "max_hr": 155, "calories": 4 }
            ]
          }
        }
        """
        let detail = try decode(json)
        let exec = try XCTUnwrap(detail.execution)
        XCTAssertTrue(exec.isPartial)
        XCTAssertEqual(exec.segments.count, 1)
        let seg = try XCTUnwrap(exec.segments.first)
        XCTAssertEqual(seg.modality, "row")
        XCTAssertEqual(seg.distanceMeters, 100.19)
        XCTAssertEqual(seg.avgPaceSPer500m, 119.88)
        XCTAssertEqual(seg.avgHr, 151)
    }

    // #62 — a run segment carries AVERAGE incline / cadence; a segment WITHOUT them
    // (older snapshot / non-treadmill run) decodes with nil (never a fabricated 0).
    func test_decode_segmentActual_inclineAndCadence() throws {
        let json = """
        {
          "assignment": { "id": "646", "athlete_id": "70", "scheduled_for": "2026-06-30", "status": "completed" },
          "workout": null,
          "execution": {
            "execution_id": "117", "total_duration_seconds": 1800, "perceived_exertion": 6,
            "score_label": null, "notes": null, "ended_at": "2026-06-30 16:30:00+00",
            "source": "manual", "completeness": "completed",
            "segments": [
              { "position": 1, "item_uid": "segment-10", "modality": "run", "duration_seconds": 900,
                "reps_completed": null, "weight_used_kg": null, "distance_meters": 3000,
                "avg_pace_s_per_500m": null, "avg_pace_s_per_km": 300, "avg_power_w": null,
                "stroke_rate_spm": null, "avg_hr": 158, "max_hr": 168, "calories": 210,
                "incline_pct": 2.5, "run_cadence_spm": 178 },
              { "position": 2, "item_uid": "segment-11", "modality": "run", "duration_seconds": 600,
                "reps_completed": null, "weight_used_kg": null, "distance_meters": 2000,
                "avg_pace_s_per_500m": null, "avg_pace_s_per_km": 300, "avg_power_w": null,
                "stroke_rate_spm": null, "avg_hr": 150, "max_hr": 160, "calories": 140 }
            ]
          }
        }
        """
        let detail = try decode(json)
        let segs = try XCTUnwrap(detail.execution?.segments)
        XCTAssertEqual(segs[0].inclinePct, 2.5)
        XCTAssertEqual(segs[0].runCadenceSpm, 178)
        XCTAssertNil(segs[1].inclinePct)        // omitted → nil, not 0
        XCTAssertNil(segs[1].runCadenceSpm)
    }

    // DEFENSIVE: a leaner / older `execution` payload that OMITS `completeness`
    // and `segments` must still decode — never throw `keyNotFound` and collapse the
    // whole detail into "No pudimos cargar". Completeness defaults to "completed",
    // segments to []. (Regression guard for the read-fail this fixes.)
    func test_decode_execution_missingOptionalKeys_decodesGracefully() throws {
        let json = """
        {
          "assignment": { "id": "999", "athlete_id": "70", "scheduled_for": "2026-06-30", "status": "completed" },
          "workout": null,
          "execution": {
            "execution_id": "500", "total_duration_seconds": 1200, "perceived_exertion": 8,
            "ended_at": "2026-06-30 10:00:00+00", "source": "manual"
          }
        }
        """
        let detail = try decode(json)
        let exec = try XCTUnwrap(detail.execution, "A lean execution payload must still decode.")
        XCTAssertEqual(exec.completeness, "completed", "Absent completeness defaults to completed.")
        XCTAssertFalse(exec.isPartial)
        XCTAssertTrue(exec.segments.isEmpty, "Absent segments defaults to [].")
        XCTAssertEqual(exec.totalDurationSeconds, 1200)
    }

    func test_deathBy_foldParams_startAndIncrement() throws {
        // Death By Burpees folds with its start/increment so the rising target is
        // start + increment × roundsCompleted. (Single item → natural segment.)
        let json = """
        {
          "assignment": { "id": "asg_db", "athlete_id": "ath_db", "scheduled_for": "2026-06-25", "status": "scheduled" },
          "workout": { "name": "Death By", "blocks": [ { "uid": "b", "title": "Death By Burpees", "format": "death_by", "block_position": 1, "items": [
            { "uid": "i", "exercise_id": "e", "exercise_name": "Burpees", "exercise_slug": "burpees", "exercise_category": "functional",
              "exercise_video_url": null, "cues": null, "params_json": { "reps": 1 },
              "prescription_json": { "scheme": "death_by", "work_s": 60, "start": 1, "increment": 1 }, "notes": null }
          ] } ] } }
        """
        let plan = try XCTUnwrap(WorkoutPlan.from(detail: try decode(json)))
        let seg = try XCTUnwrap(plan.segments.first)
        XCTAssertEqual(seg.formatScheme, .deathBy)
        XCTAssertEqual(seg.deathByStart, 1)
        XCTAssertEqual(seg.deathByIncrement, 1)
        XCTAssertEqual(seg.formatWorkSeconds, 60)
    }

    func test_decode_resolvedReferences_phraseWithoutRecalculating() throws {
        let json = """
        {
          "assignment": { "id": "asg_rel", "athlete_id": "ath_rel", "scheduled_for": "2026-08-24", "status": "scheduled" },
          "workout": { "name": "Sled", "blocks": [ { "uid": "b", "title": "Sled", "format": "straight_sets", "block_position": 1, "items": [
            { "uid": "i", "exercise_id": "e", "exercise_name": "Sled Push", "exercise_slug": "hyrox-sled-push", "exercise_category": "functional",
              "exercise_video_url": null, "cues": null, "params_json": { "load_kg": 152 },
              "prescription_json": { "scheme": "sets", "modality": "functional", "target": { "kind": "kg", "value": 152 } },
              "resolved_references": [
                { "phrase": "a peso de competición", "target": { "kind": "kg", "value": 152 }, "source": "competition_load:hyrox-sled-push", "estimated": false }
              ],
              "notes": null }
          ] } ] } }
        """
        let item = try XCTUnwrap(try decode(json).workout?.blocks.first?.items.first)
        XCTAssertEqual(item.paramsJson.loadKg, 152)
        XCTAssertEqual(item.resolvedReferences?.count, 1)
        XCTAssertEqual(item.resolvedReferences?.first?.phrase, "a peso de competición")
        if case .kg(let value, _, _, _) = item.prescription?.target {
            XCTAssertEqual(value, 152)
        } else {
            XCTFail("El número tiene que viajar en el target de siempre, no en un kind relative.")
        }
    }

    // MARK: - Free workout WITH content (regression: "No pudimos cargar")
    //
    // VERBATIM bodies captured from the live demo endpoint
    // (GET /api/athlete/assignments/{id}/detail, athlete 70) for the athlete-CREATED
    // free workouts that surfaced the "No pudimos cargar tu entreno" report:
    //   665 "Correr · 12×400m" (run, partial), 645 "Remo · 5×500m" (row, partial),
    //   644 "Remo 5×500 libre" (row, completed).
    // Unlike the OLD seed case (0 blocks → workout:null) these carry REAL content:
    // a non-null `workout` with ONE block + ONE prescribed item AND an `execution`.
    // These pins prove the read-only executed detail can ALWAYS load a free workout
    // with content — every required-non-lossy field present, the structured
    // `prescription_json` (pace/distance/intervals) decoded, the execution intact —
    // so this class of failure can never silently regress.

    // 665 — Correr · 12×400m (run intervals, partial), captured verbatim from prod.
    func test_decode_freeWorkout_run12x400_partial_loadsContentAndExecution() throws {
        let json = """
        {"assignment":{"id":"665","athlete_id":"70","scheduled_for":"2026-06-30","status":"partial","slot":null,"template_id":"651","template_version":1,"completed_at":"2026-06-30 12:09:45+00","perceived_exertion":7,"partner_visibility":"shared"},"workout":{"name":"Correr · 12×400m","focus":null,"coach_note":null,"estimated_duration_minutes":null,"blocks":[{"uid":"block-1","title":"Correr · 12×400m","format":"intervals","block_position":1,"coach_note":null,"config_json":{},"items":[{"uid":"segment-3320","template_segment_id":3320,"exercise_id":"3479","exercise_name":"Run","exercise_slug":"run","exercise_category":"running","exercise_video_url":"https://www.youtube.com/watch?v=brFHyOtTwH4","cues":null,"params_json":{"sets":1,"rest_seconds":90,"distance_meters":400,"distance_km":0.4,"pace_sec_per_km":285},"prescription_json":{"scheme":"intervals","modality":"run","sets":[{"measure":{"kind":"distance","meters":400},"target":{"kind":"pace","unit":"per_km","value_s":285},"rest_s":90}],"rounds":12,"rest_s":90,"target":{"kind":"pace","unit":"per_km","value_s":285}},"resolved_intensity":null,"resolved_load":null,"notes":null}]}]},"execution":{"execution_id":"137","total_duration_seconds":1891,"perceived_exertion":7,"score_label":null,"notes":null,"ended_at":"2026-06-30 12:09:45+00","source":"healthkit","completeness":"partial","segments":[{"position":1,"item_uid":null,"modality":"run","duration_seconds":3,"reps_completed":null,"weight_used_kg":null,"distance_meters":null,"avg_pace_s_per_500m":null,"avg_pace_s_per_km":null,"avg_power_w":null,"stroke_rate_spm":null,"avg_hr":null,"max_hr":null,"calories":null}]}}
        """
        let detail = try decode(json)
        // Content loads — NOT a rest/empty shell, NOT a throw.
        let workout = try XCTUnwrap(detail.workout, "Free workout with content must decode a non-null workout.")
        XCTAssertEqual(workout.name, "Correr · 12×400m")
        XCTAssertEqual(workout.blocks.count, 1)
        let item = try XCTUnwrap(workout.blocks.first?.items.first, "The one prescribed item must survive decode.")
        XCTAssertEqual(item.exerciseSlug, "run")
        XCTAssertEqual(item.exerciseCategory, "running")
        XCTAssertEqual(item.paramsJson.distanceMeters, 400)
        XCTAssertEqual(item.paramsJson.paceSecPerKm, 285)
        // Structured prescription decoded (run intervals @ pace).
        let p = try XCTUnwrap(item.prescription)
        XCTAssertEqual(p.scheme, .intervals)
        XCTAssertEqual(p.modality, .run)
        XCTAssertEqual(p.rounds, 12)
        // The executed block loads → ExecutedWorkoutView renders, never "No pudimos cargar".
        let exec = try XCTUnwrap(detail.execution)
        XCTAssertTrue(exec.isPartial)
        // A runnable plan also builds from this same detail (the active/brief path).
        XCTAssertNotNil(WorkoutPlan.from(detail: detail))
    }

    // 645 — Remo · 5×500m (row intervals, partial), captured verbatim from prod.
    func test_decode_freeWorkout_row5x500_partial_loadsContentAndExecution() throws {
        let json = """
        {"assignment":{"id":"645","athlete_id":"70","scheduled_for":"2026-06-30","status":"partial","slot":null,"template_id":"646","template_version":1,"completed_at":"2026-06-30 11:23:43+00","perceived_exertion":7,"partner_visibility":"shared"},"workout":{"name":"Remo · 5×500m","focus":null,"coach_note":null,"estimated_duration_minutes":null,"blocks":[{"uid":"block-1","title":"Remo · 5×500m","format":"intervals","block_position":1,"coach_note":null,"config_json":{},"items":[{"uid":"segment-3309","template_segment_id":3309,"exercise_id":"3481","exercise_name":"Rowing","exercise_slug":"row","exercise_category":"rowing","exercise_video_url":"https://www.youtube.com/watch?v=QPvYrfyGHi8","cues":null,"params_json":{"sets":1,"rest_seconds":90,"distance_meters":500,"distance_km":0.5,"pace_sec_per_km":224},"prescription_json":{"scheme":"intervals","modality":"row","sets":[{"measure":{"kind":"distance","meters":500},"target":{"kind":"pace","unit":"per_500m","value_s":112},"rest_s":90}],"rounds":5,"rest_s":90,"target":{"kind":"pace","unit":"per_500m","value_s":112}},"resolved_intensity":null,"resolved_load":null,"notes":null}]}]},"execution":{"execution_id":"116","total_duration_seconds":3579,"perceived_exertion":7,"score_label":null,"notes":null,"ended_at":"2026-06-30 11:23:43+00","source":"healthkit","completeness":"partial","segments":[{"position":1,"item_uid":null,"modality":"row","duration_seconds":30,"reps_completed":null,"weight_used_kg":null,"distance_meters":100.19,"avg_pace_s_per_500m":119.88,"avg_pace_s_per_km":null,"avg_power_w":217.3,"stroke_rate_spm":28,"avg_hr":151,"max_hr":155,"calories":4}]}}
        """
        let detail = try decode(json)
        let workout = try XCTUnwrap(detail.workout)
        XCTAssertEqual(workout.blocks.count, 1)
        let item = try XCTUnwrap(workout.blocks.first?.items.first)
        XCTAssertEqual(item.exerciseSlug, "row")
        let p = try XCTUnwrap(item.prescription)
        XCTAssertEqual(p.scheme, .intervals)
        XCTAssertEqual(p.modality, .row)
        let exec = try XCTUnwrap(detail.execution)
        XCTAssertTrue(exec.isPartial)
        // The erg /500m split (capital-M coding-key edge) decodes.
        XCTAssertEqual(exec.segments.first?.avgPaceSPer500m, 119.88)
    }

    // 644 — Remo 5×500 libre (row intervals, COMPLETED, no per-segment log),
    // captured verbatim from prod.
    func test_decode_freeWorkout_row_completed_noSegments_loadsContent() throws {
        let json = """
        {"assignment":{"id":"644","athlete_id":"70","scheduled_for":"2026-06-30","status":"completed","slot":null,"template_id":"645","template_version":1,"completed_at":"2026-06-30 10:07:20+00","perceived_exertion":8,"partner_visibility":"shared"},"workout":{"name":"Remo 5×500 libre","focus":null,"coach_note":null,"estimated_duration_minutes":null,"blocks":[{"uid":"block-1","title":"Remo 5×500 libre","format":"intervals","block_position":1,"coach_note":null,"config_json":{},"items":[{"uid":"segment-3308","template_segment_id":3308,"exercise_id":"3481","exercise_name":"Rowing","exercise_slug":"row","exercise_category":"rowing","exercise_video_url":"https://www.youtube.com/watch?v=QPvYrfyGHi8","cues":null,"params_json":{"sets":1,"rest_seconds":90,"distance_meters":500,"distance_km":0.5,"pace_sec_per_km":224},"prescription_json":{"scheme":"intervals","modality":"row","sets":[{"measure":{"kind":"distance","meters":500},"target":{"kind":"pace","unit":"per_500m","value_s":112},"rest_s":90}],"rounds":5,"rest_s":90,"target":{"kind":"pace","unit":"per_500m","value_s":112}},"resolved_intensity":null,"resolved_load":null,"notes":null}]}]},"execution":{"execution_id":"114","total_duration_seconds":1630,"perceived_exertion":8,"score_label":null,"notes":"entreno libre de prueba","ended_at":"2026-06-30 10:07:20+00","source":"healthkit","completeness":"completed","segments":[]}}
        """
        let detail = try decode(json)
        let workout = try XCTUnwrap(detail.workout)
        XCTAssertEqual(workout.name, "Remo 5×500 libre")
        XCTAssertEqual(workout.blocks.first?.items.count, 1)
        let exec = try XCTUnwrap(detail.execution)
        XCTAssertFalse(exec.isPartial)
        XCTAssertEqual(exec.completeness, "completed")
        XCTAssertTrue(exec.segments.isEmpty, "Aggregate-only completion → no per-segment log, still loads.")
        XCTAssertEqual(exec.notes, "entreno libre de prueba")
    }

    func test_jumpTest_withoutBlocks_isJumpVideo_notARunnablePlan() throws {
        let json = """
        {
          "assignment": {
            "id": "477",
            "athlete_id": "64",
            "scheduled_for": "2026-08-13",
            "status": "scheduled",
            "slot": null,
            "template_id": "1",
            "template_version": 1,
            "completed_at": null,
            "perceived_exertion": null,
            "station_assignment": null,
            "my_role": null,
            "store_results": [
              {"slug":"cmj","label":"CMJ","measure":"height","unit":"cm","derives":"none","modality":null,"optional":false},
              {"slug":"cmj_loaded","label":"CMJ con carga","measure":"height","unit":"cm","derives":"none","modality":null,"optional":true}
            ]
          },
          "workout": {"name":"Perfil de salto (CMJ)","focus":null,"coach_note":null,"estimated_duration_minutes":null,"blocks":[]}
        }
        """
        let detail = try decode(json)
        XCTAssertTrue(detail.isJumpVideo)
        XCTAssertNil(WorkoutPlan.from(detail: detail), "Un salto no es un entreno con bloques.")
    }
}

// MARK: - El localizador del vídeo de técnica

/// `exercise_video_url` (y su gemelo de estación `technique_video_url`) tiene DOS
/// formas válidas y ninguna más: un enlace de YouTube o el vídeo propio del
/// entrenador, alojado en Cloudflare Stream y servido como HLS. Aquí se pinta esa
/// frontera, porque de ella depende que un vídeo perfectamente válido se vea o se
/// quede invisible.
final class VideoDeTecnicaTests: XCTestCase {
    /// Un par (code, uid) con la forma EXACTA que emite Cloudflare, copiado de una
    /// subida real: el code es el subdominio de la cuenta y el uid, 32 hexadecimales.
    private static let code = "y1njxqklp26mzz8v"
    private static let uid = "64d93f4fa041b608bff0de740f7ad28d"
    private static var hls: String {
        "https://customer-\(code).cloudflarestream.com/\(uid)/manifest/video.m3u8"
    }

    // MARK: Nada

    func test_sinLocalizador_noHayVideo() {
        XCTAssertNil(VideoDeTecnica(nil))
        XCTAssertNil(VideoDeTecnica(""))
        XCTAssertNil(VideoDeTecnica("   \n "))
        XCTAssertFalse(VideoDeTecnica.hay(en: nil))
    }

    func test_localizadorQueNoEsNingunaDeLasDosFormas_noHayVideo() {
        // Ni un enlace a otro sitio, ni texto suelto, ni un fichero absoluto ajeno.
        XCTAssertNil(VideoDeTecnica("https://vimeo.com/123456789"))
        XCTAssertNil(VideoDeTecnica("https://cdn.ajeno.com/tecnica.mp4"))
        XCTAssertNil(VideoDeTecnica("sentadilla frontal"))
        XCTAssertNil(VideoDeTecnica("https://www.youtube.com/watch?v=corto"))
    }

    // MARK: YouTube

    func test_youtube_todasLasGrafias() {
        // Las dos que vienen de prod (fixtures de arriba) + las formas restantes.
        let casos: [(String, String)] = [
            ("https://www.youtube.com/watch?v=brFHyOtTwH4", "brFHyOtTwH4"),
            ("https://www.youtube.com/watch?v=QPvYrfyGHi8", "QPvYrfyGHi8"),
            ("https://youtu.be/brFHyOtTwH4", "brFHyOtTwH4"),
            ("https://www.youtube.com/embed/brFHyOtTwH4", "brFHyOtTwH4"),
            ("youtube.com/watch?v=brFHyOtTwH4", "brFHyOtTwH4"),
        ]
        for (url, id) in casos {
            guard case .youtube(let video)? = VideoDeTecnica(url) else {
                return XCTFail("\(url) tenía que clasificarse como YouTube")
            }
            XCTAssertEqual(video.id, id)
            XCTAssertEqual(video.orientation, .landscape, "\(url) es apaisado")
        }
    }

    func test_youtubeShort_seSabeQueEsVertical() {
        guard case .youtube(let video)? = VideoDeTecnica("https://www.youtube.com/shorts/brFHyOtTwH4") else {
            return XCTFail("Un Short es un vídeo de YouTube")
        }
        XCTAssertEqual(video.orientation, .portrait)
        XCTAssertEqual(video.orientation.ratio, 9.0 / 16.0)
    }

    // MARK: Vídeo propio del entrenador

    func test_manifiestoDeStream_esElVideoPropio() {
        guard case .stream(let url)? = VideoDeTecnica(Self.hls) else {
            return XCTFail("El manifiesto HLS es el vídeo que sube el entrenador")
        }
        XCTAssertEqual(url.absoluteString, Self.hls)
        XCTAssertTrue(VideoDeTecnica.hay(en: Self.hls))
    }

    /// Cloudflare reparte varias direcciones del MISMO vídeo y del panel se copia la
    /// del reproductor o la de «watch». Todas tienen que acabar en el manifiesto, que
    /// es lo único que AVPlayer sabe reproducir sin ayuda.
    func test_lasOtrasDireccionesDelMismoVideo_acabanEnElManifiesto() {
        let base = "https://customer-\(Self.code).cloudflarestream.com/\(Self.uid)"
        for variante in ["\(base)/iframe", "\(base)/watch", "\(base)/manifest/video.mpd"] {
            guard case .stream(let url)? = VideoDeTecnica(variante) else {
                return XCTFail("\(variante) es el mismo vídeo")
            }
            XCTAssertEqual(url.absoluteString, Self.hls)
        }
    }

    /// La frontera que impide que la app del atleta le pida bytes a un dominio ajeno
    /// porque alguien escribió lo que quiso en la columna.
    func test_loQueSoloSePareceAStream_noEsVideo() {
        let casos = [
            // El host tiene que TERMINAR en el dominio de Cloudflare, no contenerlo.
            "https://customer-\(Self.code).cloudflarestream.com.ajeno.tld/\(Self.uid)/manifest/video.m3u8",
            // Sin cifrar.
            "http://customer-\(Self.code).cloudflarestream.com/\(Self.uid)/manifest/video.m3u8",
            // Un id que no son 32 hexadecimales.
            "https://customer-\(Self.code).cloudflarestream.com/abc123/manifest/video.m3u8",
            // Un camino que no es el vídeo.
            "https://customer-\(Self.code).cloudflarestream.com/\(Self.uid)/thumbnails/thumbnail.jpg",
        ]
        for caso in casos {
            XCTAssertNil(VideoDeTecnica(caso), "\(caso) no puede pasar por vídeo")
        }
    }

    /// El fichero alojado por nosotros y servido tras autenticación fue la segunda
    /// forma durante unas horas del 11-ago y se retiró el mismo día: Stream lo
    /// sustituye entero. Que siga sin colar es lo que impide que reaparezca un segundo
    /// camino para lo mismo.
    func test_rutaRelativaNuestra_yaNoEsVideo() {
        XCTAssertNil(VideoDeTecnica("/api/exercises/video/abc123"))
        XCTAssertFalse(VideoDeTecnica.hay(en: "/api/exercises/video/ejercicios/60/2026/08/x.mp4"))
    }

    func test_espaciosAlrededor_noRompenLaClasificacion() {
        XCTAssertTrue(VideoDeTecnica.hay(en: "  \(Self.hls)  "))
        XCTAssertTrue(VideoDeTecnica.hay(en: " https://youtu.be/brFHyOtTwH4\n"))
    }
}
