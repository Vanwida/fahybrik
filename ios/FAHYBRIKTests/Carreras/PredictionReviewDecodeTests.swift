import XCTest
@testable import FAHYBRIK

// Wire-contract coverage for GET /api/athlete/prediction-review. The app decodes
// with `.convertFromSnakeCase` (APIClient.makeJSONDecoder), so this pins the EXACT
// server shape the endpoint ships: the per-segment table binds the `segments`
// array (NOT `rows`), and the precision tag + card subtitle bind `accuracy_label_es`
// / `race_name` / `race_date`. A regression on any of these silently blanks the
// predicho-vs-real card (empty table, or a missing subtitle/tag).
final class PredictionReviewDecodeTests: XCTestCase {
    private func decode(_ json: String) throws -> PredictionReview {
        try APIClient.makeJSONDecoder().decode(PredictionReview.self, from: Data(json.utf8))
    }

    // The server contract: `segments` (not `rows`), plus the label + event context.
    func test_serverShape_decodesSegmentsLabelAndEventContext() throws {
        let json = """
        {
          "availability": "ok",
          "predicted_total_s": 3680,
          "actual_total_s": 3600,
          "accuracy_pct": 98.0,
          "accuracy_label_es": "clavado",
          "race_name": "HYROX Barcelona",
          "race_date": "2026-05-24",
          "segments": [
            { "slug": "run", "label_es": "Carrera a pie", "predicted_s": 1800, "actual_s": 1800, "delta_s": 0 },
            { "slug": "hyrox-sled-push", "label_es": "Sled push", "predicted_s": 130, "actual_s": 150, "delta_s": 20 }
          ],
          "insight_es": "El Sled push perdió 0:20 más de lo previsto."
        }
        """
        let r = try decode(json)
        XCTAssertTrue(r.isOK)
        // The bug this fixes: the table binds `segments`, so it is NOT empty.
        XCTAssertEqual(r.segments.count, 2)
        XCTAssertEqual(r.segments.first?.slug, "run")
        XCTAssertEqual(r.segments.last?.labelEs, "Sled push")
        XCTAssertEqual(r.segments.last?.deltaS, 20)
        // The precision tag + card subtitle bind these three new fields.
        XCTAssertEqual(r.accuracyLabelEs, "clavado")
        XCTAssertEqual(r.raceName, "HYROX Barcelona")
        XCTAssertEqual(r.raceDate, "2026-05-24")
        XCTAssertEqual(r.predictedTotalS, 3680)
        XCTAssertEqual(r.actualTotalS, 3600)
    }

    // Regression pin: the table must bind `segments`, not the old `rows` key — a
    // payload keyed `rows` leaves the table honestly empty (no fabricated rows).
    func test_legacyRowsKey_doesNotPopulateSegments() throws {
        let json = """
        {
          "availability": "ok",
          "predicted_total_s": 3680,
          "actual_total_s": 3600,
          "accuracy_pct": 98.0,
          "rows": [
            { "slug": "run", "label_es": "Carrera a pie", "predicted_s": 1800, "actual_s": 1800, "delta_s": 0 }
          ]
        }
        """
        let r = try decode(json)
        XCTAssertTrue(r.segments.isEmpty)
    }

    // Honest degradation: a missing `segments` key → [] and nil optionals, never a
    // decode failure (the card self-hides on a non-ok / snapshot-less read).
    func test_missingOptionalFields_decodeToEmptyAndNil() throws {
        let r = try decode(#"{ "availability": "no_snapshot" }"#)
        XCTAssertFalse(r.isOK)
        XCTAssertTrue(r.segments.isEmpty)
        XCTAssertNil(r.accuracyLabelEs)
        XCTAssertNil(r.raceName)
        XCTAssertNil(r.raceDate)
    }
}
