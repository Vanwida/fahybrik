import XCTest
@testable import FAHYBRIK

// Encode-shape coverage for the entreno-libre (no prescrito) free-save path.
//
// The live POST uses APIClient's encoder (`.convertToSnakeCase` + `.iso8601`),
// so a built `Prescription` must encode to the canonical snake_case wire shape
// the backend expects. These tests pin an encoder configured identically and
// assert the row-5×500 example matches the FROZEN contract byte-for-byte (keys +
// nesting), and that the FreeWorkoutPayload carries title/modality/source/metrics.
final class FreeWorkoutEncodeTests: XCTestCase {

    // Mirrors APIClient.shared encoder configuration so the test exercises the
    // exact wire-encoding behaviour of the runtime path.
    private func makeEncoder() -> JSONEncoder {
        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        enc.dateEncodingStrategy = .iso8601
        return enc
    }

    private func draftRow5x500() -> FreeWorkoutDraft {
        let d = FreeWorkoutDraft()
        d.selectModality(.row)
        d.format = .series
        d.rounds = 5
        d.measureKind = .distance
        d.distanceMeters = 500
        d.restSeconds = 90
        d.targetKind = .pace
        d.paceSeconds = 112
        return d
    }

    // The CANONICAL wire shape the contract pins:
    // {"scheme":"intervals","modality":"row","rounds":5,"rest_s":90,
    //  "target":{"kind":"pace","unit":"per_500m","value_s":112},
    //  "sets":[{"measure":{"kind":"distance","meters":500},
    //           "target":{"kind":"pace","unit":"per_500m","value_s":112},"rest_s":90}]}
    func testRow5x500EncodesToCanonicalWireShape() throws {
        let prescription = try XCTUnwrap(draftRow5x500().buildPrescription())
        let data = try makeEncoder().encode(prescription)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["scheme"] as? String, "intervals")
        XCTAssertEqual(json["modality"] as? String, "row")
        XCTAssertEqual(json["rounds"] as? Int, 5)
        XCTAssertEqual(json["rest_s"] as? Int, 90)
        // Nil optionals must be OMITTED (not encoded as null).
        XCTAssertNil(json["work_s"])
        XCTAssertNil(json["total_s"])
        XCTAssertNil(json["note"])
        XCTAssertNil(json["start"])
        XCTAssertNil(json["increment"])

        let target = try XCTUnwrap(json["target"] as? [String: Any])
        XCTAssertEqual(target["kind"] as? String, "pace")
        XCTAssertEqual(target["unit"] as? String, "per_500m")
        XCTAssertEqual(target["value_s"] as? Int, 112)

        let sets = try XCTUnwrap(json["sets"] as? [[String: Any]])
        XCTAssertEqual(sets.count, 1)
        let s0 = sets[0]
        XCTAssertEqual(s0["rest_s"] as? Int, 90)
        XCTAssertEqual(s0["modality"] as? String, "row")  // FH-61: set keeps the machine

        let measure = try XCTUnwrap(s0["measure"] as? [String: Any])
        XCTAssertEqual(measure["kind"] as? String, "distance")
        XCTAssertEqual((measure["meters"] as? NSNumber)?.doubleValue, 500)

        let setTarget = try XCTUnwrap(s0["target"] as? [String: Any])
        XCTAssertEqual(setTarget["kind"] as? String, "pace")
        XCTAssertEqual(setTarget["unit"] as? String, "per_500m")
        XCTAssertEqual(setTarget["value_s"] as? Int, 112)
    }

    // A round-trip back through the production decoder reproduces the model.
    func testRow5x500RoundTrips() throws {
        let prescription = try XCTUnwrap(draftRow5x500().buildPrescription())
        let data = try makeEncoder().encode(prescription)
        let decoded = try APIClient.makeJSONDecoder().decode(Prescription.self, from: data)
        XCTAssertEqual(decoded, prescription)
    }

    // The free payload carries the three free-only fields + the shared metrics and
    // encodes them under the frozen snake_case keys.
    func testFreePayloadCarriesFreeFieldsAndMetrics() throws {
        let ctx = try XCTUnwrap(draftRow5x500().buildContext())
        let payload = FreeWorkoutPayload(
            title: ctx.title, modality: ctx.modalityWire, prescription: ctx.prescription, items: ctx.items,
            perceived_exertion: 8, total_duration_seconds: 581, notes: nil, source: "manual",
            score_time_s: 581, score_rounds: nil, score_reps: nil, completeness: "full",
            started_at: "2026-06-30T10:00:00Z", ended_at: "2026-06-30T10:09:41Z", segments: nil
        )
        let data = try makeEncoder().encode(payload)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["modality"] as? String, "row")
        XCTAssertEqual(json["source"] as? String, "manual")
        XCTAssertEqual(json["perceived_exertion"] as? Int, 8)
        XCTAssertEqual(json["total_duration_seconds"] as? Int, 581)
        XCTAssertEqual(json["score_time_s"] as? Int, 581)
        XCTAssertEqual(json["completeness"] as? String, "full")
        XCTAssertEqual(json["title"] as? String, "Remo · 5×500m")
        let nested = try XCTUnwrap(json["prescription"] as? [String: Any])
        XCTAssertEqual(nested["scheme"] as? String, "intervals")
        // Measured path carries a top-level prescription, NEVER items.
        XCTAssertNil(json["items"])
    }

    // MARK: - Fuerza (strength) — items[] with per-set scheme "sets"

    private func strengthExercise() -> FreeExercise {
        FreeExercise(id: 42, name: "Sentadilla trasera", slug: "back-squat", category: "strength", modality: nil)
    }

    // A 4×5 back squat @ 20 kg → items[0] with scheme "sets", 4 sets, each a reps
    // measure + kg target + rest, and the wire key `exercise_id` (snake_case).
    func testStrengthBuildsItemsWithSetsScheme() throws {
        let d = FreeStrengthDraft()
        d.add(strengthExercise())
        var item = d.items[0]
        item.series = 4
        item.measure = .reps
        item.reps = 5
        item.loadKind = .kg
        item.kgUnits = 8            // 8 × 2.5 = 20 kg
        item.restSeconds = 90
        d.items[0] = item

        let ctx = try XCTUnwrap(d.buildContext())
        XCTAssertEqual(ctx.modalityWire, "strength")
        XCTAssertNil(ctx.prescription)      // strength omits the top-level prescription
        let items = try XCTUnwrap(ctx.items)
        XCTAssertEqual(items.count, 1)

        let payload = FreeWorkoutPayload(
            title: ctx.title, modality: ctx.modalityWire, prescription: ctx.prescription, items: ctx.items,
            perceived_exertion: 7, total_duration_seconds: 600, notes: nil, source: "manual",
            score_time_s: nil, score_rounds: nil, score_reps: nil, completeness: "full",
            started_at: "2026-06-30T10:00:00Z", ended_at: "2026-06-30T10:10:00Z", segments: nil
        )
        let data = try makeEncoder().encode(payload)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["modality"] as? String, "strength")
        XCTAssertNil(json["prescription"])                       // omitted for strength
        let wireItems = try XCTUnwrap(json["items"] as? [[String: Any]])
        XCTAssertEqual(wireItems.count, 1)
        XCTAssertEqual(wireItems[0]["exercise_id"] as? Int, 42)  // snake_case key
        let p = try XCTUnwrap(wireItems[0]["prescription"] as? [String: Any])
        XCTAssertEqual(p["scheme"] as? String, "sets")
        XCTAssertEqual(p["modality"] as? String, "strength")
        let sets = try XCTUnwrap(p["sets"] as? [[String: Any]])
        XCTAssertEqual(sets.count, 4)
        let s0 = sets[0]
        XCTAssertEqual(s0["rest_s"] as? Int, 90)
        let measure = try XCTUnwrap(s0["measure"] as? [String: Any])
        XCTAssertEqual(measure["kind"] as? String, "reps")
        XCTAssertEqual((measure["value"] as? NSNumber)?.intValue, 5)
        let target = try XCTUnwrap(s0["target"] as? [String: Any])
        XCTAssertEqual(target["kind"] as? String, "kg")
        XCTAssertEqual((target["value"] as? NSNumber)?.doubleValue, 20)
    }

    // Bodyweight timed hold: measure "duration", target "bodyweight" (no kg).
    func testStrengthBodyweightDurationEncodes() throws {
        let d = FreeStrengthDraft()
        d.add(FreeExercise(id: 7, name: "Plancha", slug: "plank", category: "core", modality: nil))
        var item = d.items[0]
        item.series = 3
        item.measure = .time
        item.seconds = 30
        item.loadKind = .bodyweight
        d.items[0] = item

        let items = try XCTUnwrap(d.buildItems())
        let data = try makeEncoder().encode(items)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [[String: Any]])
        let p = try XCTUnwrap(json[0]["prescription"] as? [String: Any])
        let sets = try XCTUnwrap(p["sets"] as? [[String: Any]])
        XCTAssertEqual(sets.count, 3)
        let measure = try XCTUnwrap(sets[0]["measure"] as? [String: Any])
        XCTAssertEqual(measure["kind"] as? String, "duration")
        XCTAssertEqual((measure["seconds"] as? NSNumber)?.intValue, 30)
        let target = try XCTUnwrap(sets[0]["target"] as? [String: Any])
        XCTAssertEqual(target["kind"] as? String, "bodyweight")
    }

    // MARK: - Funcional (WOD) — shared scheme + identical block params on every item

    // AMRAP 10:00 of thrusters + pull-ups → 2 items sharing scheme "amrap" and the
    // SAME total_s on every item, each with one set carrying the movement dose.
    func testFunctionalAmrapSharesSchemeAndBlockParams() throws {
        let d = FreeFunctionalDraft()
        d.selectFormat(.amrap)
        d.windowSeconds = 600
        d.add(FreeExercise(id: 11, name: "Thruster", slug: "thruster", category: "functional", modality: nil))
        d.add(FreeExercise(id: 12, name: "Dominadas", slug: "pull-up", category: "functional", modality: nil))
        var m0 = d.movements[0]; m0.dose = .reps; m0.reps = 15; d.movements[0] = m0
        var m1 = d.movements[1]; m1.dose = .reps; m1.reps = 12; d.movements[1] = m1

        let ctx = try XCTUnwrap(d.buildContext())
        XCTAssertEqual(ctx.modalityWire, "functional")
        XCTAssertNil(ctx.prescription)
        // The runnable plan folds into ONE conditioning segment (score by scheme).
        XCTAssertEqual(ctx.plan.segments.count, 1)
        XCTAssertEqual(ctx.plan.format, .amrap)

        let items = try XCTUnwrap(ctx.items)
        let data = try makeEncoder().encode(items)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [[String: Any]])
        XCTAssertEqual(json.count, 2)
        XCTAssertEqual(json[0]["exercise_id"] as? Int, 11)
        XCTAssertEqual(json[1]["exercise_id"] as? Int, 12)
        for entry in json {
            let p = try XCTUnwrap(entry["prescription"] as? [String: Any])
            XCTAssertEqual(p["scheme"] as? String, "amrap")
            XCTAssertEqual(p["total_s"] as? Int, 600)      // identical block param
            XCTAssertNil(p["rounds"])
            let sets = try XCTUnwrap(p["sets"] as? [[String: Any]])
            XCTAssertEqual(sets.count, 1)                   // one dose per movement
        }
        let firstDose = try XCTUnwrap(((json[0]["prescription"] as? [String: Any])?["sets"] as? [[String: Any]])?[0]["measure"] as? [String: Any])
        XCTAssertEqual(firstDose["kind"] as? String, "reps")
        XCTAssertEqual((firstDose["value"] as? NSNumber)?.intValue, 15)
    }

    // For Time rounds → every item carries the same rounds and the chosen scheme;
    // the folded plan is time-scored (drives the summary's "Tiempo final").
    func testFunctionalForTimeStructuralConsistency() throws {
        let d = FreeFunctionalDraft()
        d.selectFormat(.forTime)
        d.rounds = 3
        d.capSeconds = 0                 // sin límite → total_s omitted
        d.add(FreeExercise(id: 21, name: "Burpees", slug: "burpee", category: "functional", modality: nil))
        d.add(FreeExercise(id: 22, name: "Box jumps", slug: "box-jump", category: "functional", modality: nil))

        let ctx = try XCTUnwrap(d.buildContext())
        XCTAssertEqual(ctx.plan.format, .forTime)
        let items = try XCTUnwrap(ctx.items)
        let data = try makeEncoder().encode(items)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [[String: Any]])
        for entry in json {
            let p = try XCTUnwrap(entry["prescription"] as? [String: Any])
            XCTAssertEqual(p["scheme"] as? String, "for_time")
            XCTAssertEqual(p["rounds"] as? Int, 3)
            XCTAssertNil(p["total_s"])   // no cap → omitted
        }
    }

    // EMOM + steady build runnable, valid prescriptions (engine routing inputs).
    func testEmomAndSteadyBuild() throws {
        let emom = FreeWorkoutDraft()
        emom.selectModality(.bike)
        emom.format = .emom
        emom.rounds = 12
        emom.cadenceSeconds = 60
        emom.measureKind = .calories
        emom.calories = 15
        let ep = try XCTUnwrap(emom.buildPrescription())
        XCTAssertEqual(ep.scheme, .emom)
        XCTAssertEqual(ep.rounds, 12)
        XCTAssertEqual(ep.workS, 60)
        XCTAssertEqual(ep.sets?.count, 1)

        // CORRER YA NO SE ESCRIBE CON EL FORMULARIO DE BOUT (9-ago): un entreno de
        // correr se monta con su propia gramática (`FreeRunPlan`), porque ni una
        // recuperación con medida y zona propias ni una pirámide caben en «N ×
        // la misma dosis». El esquema plano lo deduce el plan y sigue viajando
        // por el cable — un solo tramo es un rodaje; varios, una serie.
        let rodaje = FreeWorkoutDraft()
        rodaje.selectModality(.run)
        rodaje.runPlan = FreeRunPlan(
            calentamiento: nil,
            grupos: [FreeRunGrupo(pasos: [
                FreeRunPaso(rol: .trabajo, medida: .tiempo, segundos: 1200, objetivo: .zona, zona: 2),
            ])],
            vuelta: nil
        )
        let sp = try XCTUnwrap(rodaje.buildPrescription())
        XCTAssertEqual(sp.scheme, .steady)
        XCTAssertEqual(sp.totalS, 1200)
        XCTAssertNotNil(sp.structure, "la verdad completa viaja en la gramática")
        if case let .hrZone(v, _, _) = sp.target { XCTAssertEqual(v, 2) } else { XCTFail("expected hr_zone target") }

        // El ritmo de correr viaja en /km (la convención del cable).
        let runPace = FreeWorkoutDraft()
        runPace.selectModality(.run)
        runPace.runPlan = FreeRunPlan(
            calentamiento: nil,
            grupos: [FreeRunGrupo(repeticiones: 4, pasos: [
                FreeRunPaso(rol: .trabajo, medida: .distancia, metros: 1000,
                            objetivo: .ritmo, ritmoSegPorKm: 300),
                FreeRunPaso(rol: .recuperacion, medida: .tiempo, segundos: 90, modo: .trote),
            ])],
            vuelta: nil
        )
        let rp = try XCTUnwrap(runPace.buildPrescription())
        XCTAssertEqual(rp.scheme, .intervals)
        XCTAssertEqual(rp.rounds, 4)
        if case let .pace(unit, v, _, _) = rp.target {
            XCTAssertEqual(unit, .perKm)
            XCTAssertEqual(v, 300)
        } else { XCTFail("expected pace target") }
    }

    // MARK: - FH-61 libre encode keeps machines and station scheme

    /// hyrox_station Ski/Row/Run are machines (classify.ts); wall balls stay functional.
    func testHyroxStationCatalogExposesMachines() {
        XCTAssertEqual(
            FreeExercise(id: 1, name: "HYROX SkiErg", slug: "hyrox-skierg",
                         category: "hyrox_station", modality: nil).prescriptionModality, .ski)
        XCTAssertEqual(
            FreeExercise(id: 2, name: "HYROX Rowing", slug: "hyrox-rowing",
                         category: "hyrox_station", modality: nil).prescriptionModality, .row)
        XCTAssertEqual(
            FreeExercise(id: 3, name: "HYROX Run", slug: "hyrox-run",
                         category: "hyrox_station", modality: nil).prescriptionModality, .run)
        XCTAssertEqual(
            FreeExercise(id: 4, name: "HYROX Wall Balls", slug: "wall-balls",
                         category: "hyrox_station", modality: nil).prescriptionModality, .functional)
    }

    /// Plan cloned as libre: Run / Ski / Row / Run / Ski. One pass (rounds = 1)
    /// stays chipper. Connect sees cinta + both PM5s. Live advances one station
    /// per strike — markRoundDone does not eat Ski+Row at once.
    func testLibreRunSkiRowChipperKeepsMachinesAndStations() throws {
        let d = FreeFunctionalDraft()
        d.selectFormat(.forTime)
        d.rounds = 1
        d.add(FreeExercise(id: 1, name: "HYROX Run", slug: "hyrox-run",
                           category: "hyrox_station", modality: nil))
        d.add(FreeExercise(id: 2, name: "HYROX SkiErg", slug: "hyrox-ski-erg",
                           category: "hyrox_station", modality: nil))
        d.add(FreeExercise(id: 3, name: "HYROX Rowing", slug: "hyrox-rowing",
                           category: "hyrox_station", modality: nil))
        d.add(FreeExercise(id: 1, name: "HYROX Run", slug: "hyrox-run",
                           category: "hyrox_station", modality: nil))
        d.add(FreeExercise(id: 2, name: "HYROX SkiErg", slug: "hyrox-ski-erg",
                           category: "hyrox_station", modality: nil))
        for i in d.movements.indices {
            var m = d.movements[i]
            m.dose = .meters
            m.meters = 1000
            d.movements[i] = m
        }

        let ctx = try XCTUnwrap(d.buildContext())
        let seg = try XCTUnwrap(ctx.plan.segments.first)
        XCTAssertTrue(seg.involvesErg)
        XCTAssertTrue(seg.involvesRun)
        XCTAssertEqual(seg.prescription?.sets?.compactMap(\.modality),
                       [.run, .ski, .row, .run, .ski])
        XCTAssertNil(seg.prescription?.rounds, "chipper stays chipper, not rondas")
        XCTAssertTrue(seg.fixedListIsStations)

        let chips = PreWorkoutDeviceEligibility.devices(for: ctx.plan.segments)
        XCTAssertTrue(chips.contains(.treadmill), "cinta for the run stations")
        XCTAssertTrue(chips.contains(.erg(.ski)))
        XCTAssertTrue(chips.contains(.erg(.row)))

        let s = WorkoutSession(plan: ctx.plan)
        s.start(); s.beginBlock(); s.stop()
        if s.condCountInRemaining > 0 { s.primaryAdvance() }
        XCTAssertEqual(s.currentTramo.modality, .run)
        s.markRoundDone()
        XCTAssertEqual(s.currentTramo.modality, .ski,
                       "one strike advances one station; Ski is not eaten with Row")
        s.markRoundDone()
        XCTAssertEqual(s.currentTramo.modality, .row)
        XCTAssertFalse(s.isFinished)
    }

    /// Control: assignment fold (plan path, no libre) still declares stations + machines.
    func testPlanAssignmentFoldUntouchedByLibreEncode() {
        func rx(_ meters: Double, _ mod: PrescriptionModality, _ name: String) -> Prescription {
            Prescription(scheme: .forTime, modality: mod,
                         sets: [PrescriptionSet(measure: .distance(meters: meters), target: nil,
                                                modality: mod, restS: nil, tempo: nil, note: name)],
                         rounds: nil, workS: nil, restS: nil, totalS: nil,
                         target: nil, note: nil, start: nil, increment: nil)
        }
        let emptyParams = WorkoutItemParams(
            sets: nil, reps: nil, loadKg: nil, loadPct: nil, rpe: nil, restSeconds: nil,
            durationSeconds: nil, distanceKm: nil, distanceMeters: nil, paceSecPerKm: nil,
            cadenceSpm: nil, calories: nil, caloriesPerMin: nil, hrZone: nil, watts: nil
        )
        func item(_ uid: String, name: String, category: String, prescription: Prescription) -> WorkoutItem {
            WorkoutItem(uid: uid, templateSegmentId: nil, exerciseId: uid, exerciseName: name,
                        exerciseSlug: uid, exerciseCategory: category,
                        exerciseVideoUrl: nil, cues: nil, exerciseDescription: nil,
                        paramsJson: emptyParams, prescription: prescription,
                        resolvedIntensity: nil, resolvedLoad: nil, notes: nil)
        }
        let run = item("run", name: "Run", category: "running", prescription: rx(1000, .run, "Run"))
        let ski = item("ski", name: "SkiErg", category: "ski_erg", prescription: rx(1000, .ski, "SkiErg"))
        let row = item("row", name: "Rowing", category: "rowing", prescription: rx(1000, .row, "Rowing"))
        let blk = WorkoutBlock(uid: "b1", title: "Principal", format: "for_time", blockPosition: 1,
                               coachNote: nil, configJson: nil, items: [run, ski, row, run, ski])
        let folded = blk.conditioningFold
        XCTAssertEqual(folded?.scheme, .forTime)
        XCTAssertNil(folded?.rounds)
        XCTAssertEqual(folded?.sets?.compactMap(\.modality), [.run, .ski, .row, .run, .ski])
        let seg = WorkoutSegment(order: 1, title: "Run · SkiErg · Rowing · Run · SkiErg",
                                 kind: .reps, blockTitle: "Principal", blockPosition: 1,
                                 prescription: folded)
        XCTAssertTrue(seg.fixedListIsStations)
        XCTAssertTrue(seg.involvesErg)
        XCTAssertTrue(seg.involvesRun)
    }

}
