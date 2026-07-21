import XCTest
@testable import FAHYBRIK

// Wire-contract + domain coverage for the athlete injury self-report (#16).
//
// Decode: the app uses a GLOBAL `.convertFromSnakeCase` (APIClient.makeJSONDecoder)
// which rewrites `onset_date` → `onsetDate`, `registered_by` → `registeredBy`, etc.
// BEFORE CodingKey lookup — so the DTOs pin NO snake_case CodingKeys. These tests
// lock: (1) that mapping, (2) enum decode (tobillo_pie / en_recuperacion), (3) that
// date/timestamp fields stay raw String (decoding a bare YYYY-MM-DD as Date under the
// client's ISO strategy would take the whole payload down), (4) @LossyArray tolerance.
//
// Encode: bodies encode under `.convertToSnakeCase` to the exact keys the server's
// zod schema expects, omit nils (encodeIfPresent), and NEVER send `type`.
//
// State machine: InjuryStatus mirrors the canonical taxonomy TRANSITIONS + isOpen.
final class InjuryServiceTests: XCTestCase {

    // MARK: - Helpers

    private func decodeInjuries(_ json: String) throws -> [AthleteInjury] {
        try APIClient.makeJSONDecoder()
            .decode(InjuriesResponse.self, from: Data(json.utf8))
            .injuries
    }

    /// Encodes with the SAME strategy the APIClient encoder uses, then reads the
    /// produced JSON back as a dictionary so we can assert the real wire keys.
    private func wireDict<T: Encodable>(_ value: T) throws -> [String: Any] {
        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        let data = try enc.encode(value)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    // MARK: - Decode

    func test_decode_mapsSnakeCase_enums_andKeepsDatesAsRawString() throws {
        let json = """
        {
          "injuries": [
            {
              "id": "12",
              "zone": "tobillo_pie",
              "type": null,
              "severity": "moderada",
              "status": "en_recuperacion",
              "onset_date": "2026-07-01",
              "resolved_date": null,
              "expected_return": "2026-07-25",
              "registered_by": "athlete",
              "note": "Me tuerzo al correr",
              "pause_id": null,
              "updated_at": "2026-07-10T09:00:00.000Z",
              "updates": [
                { "id": "3", "status": null, "note": "Sigue igual", "recorded_by": "athlete", "recorded_at": "2026-07-05T08:00:00.000Z" },
                { "id": "4", "status": "en_recuperacion", "note": "Empezamos readaptación", "recorded_by": "coach", "recorded_at": "2026-07-10T09:00:00.000Z" }
              ]
            },
            {
              "id": "9",
              "zone": "rodilla",
              "type": "tendinitis",
              "severity": "leve",
              "status": "resuelta",
              "onset_date": "2026-05-01",
              "resolved_date": "2026-06-01",
              "expected_return": null,
              "registered_by": "coach",
              "note": null,
              "pause_id": null,
              "updated_at": "2026-06-01T09:00:00Z",
              "updates": []
            }
          ]
        }
        """
        let injuries = try decodeInjuries(json)
        XCTAssertEqual(injuries.count, 2)

        let first = injuries[0]
        XCTAssertEqual(first.id, "12")
        XCTAssertEqual(first.zone, .tobilloPie)            // value "tobillo_pie" is NOT key-converted
        XCTAssertEqual(first.severity, .moderada)
        XCTAssertEqual(first.status, .enRecuperacion)
        XCTAssertEqual(first.onsetDate, "2026-07-01")      // onset_date → onsetDate
        XCTAssertNil(first.resolvedDate)
        XCTAssertEqual(first.expectedReturn, "2026-07-25") // expected_return → expectedReturn
        XCTAssertEqual(first.registeredBy, "athlete")
        XCTAssertFalse(first.registeredByCoach)
        XCTAssertEqual(first.note, "Me tuerzo al correr")
        XCTAssertTrue(first.isOpen)
        // Timestamp is passed through verbatim (NOT parsed to Date), so a
        // fractional-second value round-trips untouched.
        XCTAssertEqual(first.updatedAt, "2026-07-10T09:00:00.000Z")

        XCTAssertEqual(first.updates.count, 2)
        XCTAssertNil(first.updates[0].status)              // note-only update
        XCTAssertEqual(first.updates[0].recordedBy, "athlete")
        XCTAssertEqual(first.updates[1].status, .enRecuperacion)
        XCTAssertTrue(first.updates[1].recordedByCoach)    // coach entry surfaces in the timeline
        XCTAssertEqual(first.updates[1].recordedAt, "2026-07-10T09:00:00.000Z")

        let second = injuries[1]
        XCTAssertEqual(second.status, .resuelta)
        XCTAssertEqual(second.resolvedDate, "2026-06-01")
        XCTAssertEqual(second.type, "tendinitis")
        XCTAssertTrue(second.registeredByCoach)
        XCTAssertFalse(second.isOpen)
        XCTAssertTrue(second.updates.isEmpty)
    }

    func test_decode_singleInjuryEnvelope() throws {
        let json = """
        { "injury": {
            "id": "1", "zone": "lumbar", "type": null, "severity": "severa",
            "status": "activa", "onset_date": "2026-07-20", "resolved_date": null,
            "expected_return": null, "registered_by": "athlete", "note": null,
            "pause_id": null, "updated_at": "2026-07-20T10:00:00Z", "updates": []
        } }
        """
        let resp = try APIClient.makeJSONDecoder().decode(InjuryResponse.self, from: Data(json.utf8))
        XCTAssertEqual(resp.injury.zone, .lumbar)
        XCTAssertEqual(resp.injury.severity, .severa)
        XCTAssertEqual(resp.injury.status, .activa)
    }

    /// A single malformed injury (unknown enum value) is dropped by @LossyArray;
    /// the valid rows still decode — one bad row never blanks the screen.
    func test_decode_lossyArray_dropsMalformedInjury_keepsRest() throws {
        let json = """
        {
          "injuries": [
            { "id": "1", "zone": "rodilla", "type": null, "severity": "leve", "status": "activa",
              "onset_date": "2026-07-01", "resolved_date": null, "expected_return": null,
              "registered_by": "athlete", "note": null, "pause_id": null,
              "updated_at": "2026-07-01T00:00:00Z", "updates": [] },
            { "id": "2", "zone": "cerebro", "type": null, "severity": "leve", "status": "activa",
              "onset_date": "2026-07-01", "resolved_date": null, "expected_return": null,
              "registered_by": "athlete", "note": null, "pause_id": null,
              "updated_at": "2026-07-01T00:00:00Z", "updates": [] },
            { "id": "3", "zone": "cuello", "type": null, "severity": "severa", "status": "resuelta",
              "onset_date": "2026-06-01", "resolved_date": "2026-06-20", "expected_return": null,
              "registered_by": "coach", "note": null, "pause_id": null,
              "updated_at": "2026-06-20T00:00:00Z", "updates": [] }
          ]
        }
        """
        let injuries = try decodeInjuries(json)
        XCTAssertEqual(injuries.map(\.id), ["1", "3"])     // "2" (zone "cerebro") dropped
    }

    /// A malformed evolution entry is dropped without losing the injury or its
    /// other entries.
    func test_decode_lossyUpdates_dropMalformedEntry() throws {
        let json = """
        { "injuries": [
            { "id": "1", "zone": "hombro", "type": null, "severity": "leve", "status": "activa",
              "onset_date": "2026-07-01", "resolved_date": null, "expected_return": null,
              "registered_by": "athlete", "note": null, "pause_id": null,
              "updated_at": "2026-07-01T00:00:00Z",
              "updates": [
                { "id": "10", "status": "telepatica", "note": "raro", "recorded_by": "athlete", "recorded_at": "2026-07-02T00:00:00Z" },
                { "id": "11", "status": null, "note": "ok", "recorded_by": "athlete", "recorded_at": "2026-07-03T00:00:00Z" }
              ] }
        ] }
        """
        let injuries = try decodeInjuries(json)
        XCTAssertEqual(injuries.count, 1)
        XCTAssertEqual(injuries[0].updates.map(\.id), ["11"]) // "10" (bad status) dropped
    }

    // MARK: - Encode

    func test_encode_createBody_usesSnakeCase_omitsNil_andNeverSendsType() throws {
        let d = try wireDict(InjuryCreateBody(
            zone: .tobilloPie,
            severity: .moderada,
            onsetDate: "2026-07-10",
            note: "me duele al saltar"
        ))
        XCTAssertEqual(d["zone"] as? String, "tobillo_pie")
        XCTAssertEqual(d["severity"] as? String, "moderada")
        XCTAssertEqual(d["onset_date"] as? String, "2026-07-10")   // camel onsetDate → onset_date
        XCTAssertEqual(d["note"] as? String, "me duele al saltar")
        XCTAssertNil(d["type"])                                     // athlete never sends `type`

        let noNote = try wireDict(InjuryCreateBody(
            zone: .rodilla, severity: .leve, onsetDate: "2026-07-10", note: nil
        ))
        XCTAssertNil(noNote["note"])                               // nil omitted
        XCTAssertEqual(Set(noNote.keys), ["zone", "severity", "onset_date"])
    }

    func test_encode_updateBody_statusAndNote_omitNils() throws {
        let both = try wireDict(InjuryUpdateBody(status: .resuelta, note: "ya está"))
        XCTAssertEqual(both["status"] as? String, "resuelta")
        XCTAssertEqual(both["note"] as? String, "ya está")

        let noteOnly = try wireDict(InjuryUpdateBody(status: nil, note: "solo una nota"))
        XCTAssertEqual(Set(noteOnly.keys), ["note"])              // status omitted → refine still satisfied by note
        XCTAssertNil(noteOnly["status"])

        let statusOnly = try wireDict(InjuryUpdateBody(status: .enRecuperacion, note: nil))
        XCTAssertEqual(statusOnly["status"] as? String, "en_recuperacion")
        XCTAssertNil(statusOnly["note"])
    }

    // MARK: - State machine (mirrors shared/domain/coach/injury-taxonomy.ts)

    func test_stateMachine_allowedTransitions() {
        XCTAssertEqual(InjuryStatus.activa.allowedTransitions, [.enRecuperacion, .resuelta])
        XCTAssertEqual(InjuryStatus.enRecuperacion.allowedTransitions, [.activa, .resuelta])
        XCTAssertEqual(InjuryStatus.resuelta.allowedTransitions, [])   // terminal for this episode
    }

    func test_stateMachine_canTransition_matrix() {
        // activa
        XCTAssertTrue(InjuryStatus.activa.canTransition(to: .enRecuperacion))
        XCTAssertTrue(InjuryStatus.activa.canTransition(to: .resuelta))
        XCTAssertFalse(InjuryStatus.activa.canTransition(to: .activa))     // self-transition rejected
        // en recuperación (can flare back to activa)
        XCTAssertTrue(InjuryStatus.enRecuperacion.canTransition(to: .activa))
        XCTAssertTrue(InjuryStatus.enRecuperacion.canTransition(to: .resuelta))
        XCTAssertFalse(InjuryStatus.enRecuperacion.canTransition(to: .enRecuperacion))
        // resuelta is terminal — a relapse is a NEW episode, never a transition
        XCTAssertFalse(InjuryStatus.resuelta.canTransition(to: .activa))
        XCTAssertFalse(InjuryStatus.resuelta.canTransition(to: .enRecuperacion))
        XCTAssertFalse(InjuryStatus.resuelta.canTransition(to: .resuelta))
    }

    func test_stateMachine_isOpen() {
        XCTAssertTrue(InjuryStatus.activa.isOpen)
        XCTAssertTrue(InjuryStatus.enRecuperacion.isOpen)
        XCTAssertFalse(InjuryStatus.resuelta.isOpen)
    }

    // MARK: - Taxonomy wire values

    func test_zones_wireValues_and_canonicalOrder() {
        XCTAssertEqual(
            InjuryZone.allCases.map(\.rawValue),
            ["rodilla", "tobillo_pie", "lumbar", "cadera", "hombro",
             "muneca", "codo", "isquios", "gemelo", "cuello", "otra"]
        )
        XCTAssertEqual(InjuryZone.allCases.count, 11)
        XCTAssertEqual(InjuryZone.tobilloPie.label, "Tobillo / pie")
        XCTAssertEqual(InjuryZone.muneca.label, "Muñeca")
    }

    func test_severity_and_status_wireValues() {
        XCTAssertEqual(InjurySeverity.allCases.map(\.rawValue), ["leve", "moderada", "severa"])
        XCTAssertEqual(InjuryStatus.allCases.map(\.rawValue), ["activa", "en_recuperacion", "resuelta"])
        XCTAssertEqual(InjuryStatus.enRecuperacion.label, "En recuperación")
    }
}
