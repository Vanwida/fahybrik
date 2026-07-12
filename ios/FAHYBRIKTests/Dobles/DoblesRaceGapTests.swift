import XCTest
@testable import FAHYBRIK

// Wire-contract + math coverage for the Dobles race-gap (predicho conjunto de
// carrera) and its reparto editor.
//
//   • decode: pins the EXACT snake_case shape of GET /api/athlete/dobles/race-gap
//     (APIClient.makeJSONDecoder → `.convertFromSnakeCase`), and — the important
//     part — pins that the NUMBERS are typed as numbers: a segundo/índice que
//     llega como string HACE FALLAR el decode (hubo un bug real por un número
//     string), en vez de colarse con un fallback silencioso.
//   • math: el recomputo del reparto en vivo (media ponderada + redondeo) y el
//     carrier derivado del share, ambos en DoblesRepartoMath (puro).
//   • encode: el body del PUT de una sola estación editada encoda a la forma
//     snake_case que espera el backend (station_index / carrier / self_share),
//     con `note` omitido cuando es nil.
final class DoblesRaceGapTests: XCTestCase {

    // MARK: - Helpers

    private func decode(_ json: String) throws -> DoblesRaceGap {
        try APIClient.makeJSONDecoder().decode(DoblesRaceGap.self, from: Data(json.utf8))
    }

    // Mirrors APIClient.shared encoder configuration so the encode test exercises
    // the exact wire-encoding behaviour of the runtime PUT path.
    private func makeEncoder() -> JSONEncoder {
        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        enc.dateEncodingStrategy = .iso8601
        return enc
    }

    private let validPayload = """
    {
      "availability": "ok",
      "race_name": "HYROX Barcelona Dobles",
      "race_date": "2026-10-12",
      "partner_name": "Guillem",
      "goal_s": 3900,
      "goal_label": "Sub-65",
      "predicted_total_s": 4020,
      "segments": [
        { "key": "run-1", "label_es": "Carrera · 1 km", "kind": "run", "station_index": null, "carrier": "together", "self_share": null, "budget_s": 240, "pair_predicted_s": 250, "self_solo_s": null, "partner_solo_s": null, "tier": "observado" },
        { "key": "ski", "label_es": "SkiErg", "kind": "station", "station_index": 1, "carrier": "split", "self_share": 0.6, "budget_s": 240, "pair_predicted_s": 232, "self_solo_s": 220, "partner_solo_s": 250, "tier": "estimado" },
        { "key": "sled_push", "label_es": "Sled Push", "kind": "station", "station_index": 2, "carrier": "self", "self_share": 1.0, "budget_s": 150, "pair_predicted_s": 174, "self_solo_s": 174, "partner_solo_s": 190, "tier": "observado" },
        { "key": "roxzone", "label_es": "RoxZone", "kind": "roxzone", "station_index": null, "carrier": "together", "self_share": null, "budget_s": 360, "pair_predicted_s": 372, "self_solo_s": null, "partner_solo_s": null, "tier": "estimado" }
      ],
      "coach_tips": ["Salid conservadores el primer km.", "Guillem lidera trineos."],
      "strategy_last_edited_by": "Guillem"
    }
    """

    // MARK: - Decode (types pinned as numbers)

    func test_serverShape_decodesWithNumericTypes() throws {
        let g = try decode(validPayload)

        XCTAssertEqual(g.availability, "ok")
        XCTAssertTrue(g.isOK)
        XCTAssertEqual(g.raceName, "HYROX Barcelona Dobles")
        XCTAssertEqual(g.partnerName, "Guillem")
        // Números como NÚMEROS (no strings) — el bug que este test blinda.
        XCTAssertEqual(g.goalS, 3900)
        XCTAssertEqual(g.goalLabel, "Sub-65")
        XCTAssertEqual(g.predictedTotalS, 4020)
        XCTAssertEqual(g.strategyLastEditedBy, "Guillem")
        XCTAssertEqual(g.coachTips.count, 2)

        XCTAssertEqual(g.segments.count, 4)

        let ski = try XCTUnwrap(g.segments.first { $0.key == "ski" })
        XCTAssertEqual(ski.kind, "station")
        XCTAssertEqual(ski.stationIndex, 1)
        XCTAssertEqual(ski.carrier, "split")
        XCTAssertEqual(ski.selfShare, 0.6)       // Double
        XCTAssertEqual(ski.budgetS, 240)         // Int
        XCTAssertEqual(ski.pairPredictedS, 232)  // Int
        XCTAssertEqual(ski.selfSoloS, 220)       // Int
        XCTAssertEqual(ski.partnerSoloS, 250)    // Int
        XCTAssertEqual(ski.tier, "estimado")
        XCTAssertTrue(ski.isEditable)            // station + reparto + índice
        XCTAssertEqual(ski.deltaS, 232 - 240)    // -8, dentro del objetivo

        let run = try XCTUnwrap(g.segments.first { $0.key == "run-1" })
        XCTAssertNil(run.stationIndex)
        XCTAssertNil(run.selfShare)
        XCTAssertNil(run.selfSoloS)
        XCTAssertTrue(run.isTogether)
        XCTAssertFalse(run.isEditable)           // together → no editable

        let roxzone = try XCTUnwrap(g.segments.first { $0.key == "roxzone" })
        XCTAssertTrue(roxzone.isRoxzone)
        XCTAssertFalse(roxzone.isEditable)
    }

    // A segundo que llega como STRING debe LANZAR (sin fallback silencioso).
    func test_stringNumber_throws_pairPredicted() {
        let bad = validPayload.replacingOccurrences(
            of: "\"pair_predicted_s\": 232",
            with: "\"pair_predicted_s\": \"232\""
        )
        XCTAssertThrowsError(try decode(bad))
    }

    // Lo mismo para un budget_s string — cualquier número del wire es estricto.
    func test_stringNumber_throws_budget() {
        let bad = validPayload.replacingOccurrences(
            of: "\"budget_s\": 240, \"pair_predicted_s\": 232",
            with: "\"budget_s\": \"240\", \"pair_predicted_s\": 232"
        )
        XCTAssertThrowsError(try decode(bad))
    }

    // Estados honestos: no_pair decodifica con segmentos vacíos + números nil,
    // nunca un fallo de decode.
    func test_noPair_decodesEmptyState() throws {
        let g = try decode(#"{ "availability": "no_pair", "race_name": "HYROX BCN" }"#)
        XCTAssertFalse(g.hasPair)
        XCTAssertFalse(g.hasPrediction)
        XCTAssertTrue(g.segments.isEmpty)
        XCTAssertTrue(g.coachTips.isEmpty)
        XCTAssertNil(g.predictedTotalS)
        XCTAssertNil(g.goalS)
    }

    // MARK: - Carrier chip semantics

    func test_carrierChipText() throws {
        let g = try decode(validPayload)
        let ski = try XCTUnwrap(g.segments.first { $0.key == "ski" })
        XCTAssertEqual(ski.carrierChipText(partnerName: "Guillem"), "TÚ 60%")
        let sled = try XCTUnwrap(g.segments.first { $0.key == "sled_push" })
        XCTAssertEqual(sled.carrierChipText(partnerName: "Guillem"), "TÚ")
        let run = try XCTUnwrap(g.segments.first { $0.key == "run-1" })
        XCTAssertEqual(run.carrierChipText(partnerName: "Guillem"), "JUNTOS")
    }

    // MARK: - Reparto math (live recompute + rounding)

    func test_stationPairPredicted_weightedAverage() {
        // 0.6·300 + 0.4·360 = 180 + 144 = 324
        XCTAssertEqual(DoblesRepartoMath.stationPairPredicted(selfShare: 0.6, selfSoloS: 300, partnerSoloS: 360), 324)
        // 50/50 → media exacta
        XCTAssertEqual(DoblesRepartoMath.stationPairPredicted(selfShare: 0.5, selfSoloS: 300, partnerSoloS: 360), 330)
    }

    func test_stationPairPredicted_rounds() {
        // 0.55·301 + 0.45·360 = 165.55 + 162 = 327.55 → 328
        XCTAssertEqual(DoblesRepartoMath.stationPairPredicted(selfShare: 0.55, selfSoloS: 301, partnerSoloS: 360), 328)
        // Extremos = el tiempo individual puro
        XCTAssertEqual(DoblesRepartoMath.stationPairPredicted(selfShare: 1.0, selfSoloS: 220, partnerSoloS: 250), 220)
        XCTAssertEqual(DoblesRepartoMath.stationPairPredicted(selfShare: 0.0, selfSoloS: 220, partnerSoloS: 250), 250)
    }

    func test_carrierForShare() {
        XCTAssertEqual(DoblesRepartoMath.carrier(forShare: 1.0), "self")
        XCTAssertEqual(DoblesRepartoMath.carrier(forShare: 0.0), "partner")
        XCTAssertEqual(DoblesRepartoMath.carrier(forShare: 0.5), "split")
        XCTAssertEqual(DoblesRepartoMath.carrier(forShare: 0.05), "split")
        XCTAssertEqual(DoblesRepartoMath.carrier(forShare: 0.95), "split")
    }

    // El total nuevo que muestra el editor: total − viejo + nuevo (swap del tramo).
    func test_editorTotalRecompute() throws {
        let g = try decode(validPayload)
        let ski = try XCTUnwrap(g.segments.first { $0.key == "ski" })
        // Reparto 0.6 → 0.5: nuevo tramo = 0.5·220 + 0.5·250 = 235.
        let newStation = DoblesRepartoMath.stationPairPredicted(selfShare: 0.5, selfSoloS: 220, partnerSoloS: 250)
        XCTAssertEqual(newStation, 235)
        let newTotal = (g.predictedTotalS ?? 0) - ski.pairPredictedS + newStation
        XCTAssertEqual(newTotal, 4020 - 232 + 235) // 4023
    }

    // MARK: - Encode (PUT de una sola estación editada)

    func test_editBody_encodesSingleStation_snakeCase() throws {
        let body = DoblesSimulationEditBody(stationSplits: [
            DoblesSimulationEditBody.Station(stationIndex: 3, carrier: "split", selfShare: 0.6, note: nil)
        ])
        let data = try makeEncoder().encode(body)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        let stations = try XCTUnwrap(json["station_splits"] as? [[String: Any]])
        XCTAssertEqual(stations.count, 1)
        let s0 = stations[0]
        XCTAssertEqual(s0["station_index"] as? Int, 3)         // snake_case key
        XCTAssertEqual(s0["carrier"] as? String, "split")
        XCTAssertEqual((s0["self_share"] as? NSNumber)?.doubleValue, 0.6)
        XCTAssertNil(s0["note"])                                // nil → omitido
    }

    func test_editBody_encodesNoteWhenPresent() throws {
        let body = DoblesSimulationEditBody(stationSplits: [
            DoblesSimulationEditBody.Station(stationIndex: 5, carrier: "self", selfShare: 1.0, note: "alterna 250m")
        ])
        let data = try makeEncoder().encode(body)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let s0 = try XCTUnwrap((json["station_splits"] as? [[String: Any]])?.first)
        XCTAssertEqual(s0["note"] as? String, "alterna 250m")
    }

    // MARK: - Simulation coach_tips (decodeIfPresent, default [])

    func test_simulation_coachTips_defaultsEmpty() throws {
        let none = try APIClient.makeJSONDecoder().decode(
            DoblesSimulation.self, from: Data(#"{ "station_splits": [] }"#.utf8)
        )
        XCTAssertEqual(none.coachTipsList, [])

        let some = try APIClient.makeJSONDecoder().decode(
            DoblesSimulation.self, from: Data(#"{ "station_splits": [], "coach_tips": ["a", "b"] }"#.utf8)
        )
        XCTAssertEqual(some.coachTipsList, ["a", "b"])
    }
}
