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
        XCTAssertNil(s0["modality"])   // set modality omitted; top-level carries it

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
            title: ctx.title, modality: ctx.modalityWire, prescription: ctx.prescription,
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

        let steady = FreeWorkoutDraft()
        steady.selectModality(.run)
        steady.format = .continuo
        steady.measureKind = .time
        steady.workSeconds = 1200
        steady.targetKind = .hrZone
        steady.hrZone = 2
        let sp = try XCTUnwrap(steady.buildPrescription())
        XCTAssertEqual(sp.scheme, .steady)
        XCTAssertEqual(sp.totalS, 1200)
        if case let .hrZone(v, _, _) = sp.target { XCTAssertEqual(v, 2) } else { XCTFail("expected hr_zone target") }
        // Run target pace unit would be per_km (verify the convention is honoured).
        let runPace = FreeWorkoutDraft()
        runPace.selectModality(.run)
        runPace.format = .series
        runPace.targetKind = .pace
        runPace.paceSeconds = 300
        let rp = try XCTUnwrap(runPace.buildPrescription())
        if case let .pace(unit, v, _, _) = rp.target {
            XCTAssertEqual(unit, .perKm)
            XCTAssertEqual(v, 300)
        } else { XCTFail("expected pace target") }
    }
}
