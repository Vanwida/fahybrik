import XCTest
@testable import FAHYBRIK

// The availability day→role map round-trips the wire contract exactly:
//   - GET decodes { availability: {mon..sun}, training_days_per_week } through the
//     SHARED snake_case decoder (so training_days_per_week → trainingDaysPerWeek is
//     exercised for real), tolerating missing / null / unknown day values.
//   - PATCH encodes the whole map back to { mon.."sun": "program"|"other_activity"|
//     "rest" } — the enum rawValues survive convertToSnakeCase verbatim.
//   - programDayCount is the "Ahora entrenas N días" number (count of "Entreno"),
//     matching the server's deriveTrainingDaysPerWeek rule.
final class AvailabilityServiceTests: XCTestCase {
    // Production wire coders: decode mirrors APIClient (convertFromSnakeCase);
    // encode mirrors APIClient's request encoder (convertToSnakeCase).
    private let decoder = APIClient.makeJSONDecoder()
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }()

    private func decode(_ json: String) throws -> AvailabilityResponse {
        try decoder.decode(AvailabilityResponse.self, from: Data(json.utf8))
    }

    // MARK: - GET decode

    func testDecodesFullMapAndDerivedCount() throws {
        let resp = try decode(#"""
        {
          "availability": {
            "mon": "program", "tue": "program", "wed": "rest", "thu": "program",
            "fri": "other_activity", "sat": "rest", "sun": "program"
          },
          "training_days_per_week": 4
        }
        """#)
        // index 0 = Monday … 6 = Sunday
        XCTAssertEqual(resp.availability.days, [
            .program, .program, .rest, .program, .otherActivity, .rest, .program,
        ])
        XCTAssertEqual(resp.trainingDaysPerWeek, 4)
        // "N días de entreno" = count of program days (mon, tue, thu, sun).
        XCTAssertEqual(resp.availability.programDayCount, 4)
    }

    func testTrainingDaysNullWhenNoProgramDays() throws {
        let resp = try decode(#"""
        {
          "availability": {
            "mon": "rest", "tue": "rest", "wed": "rest", "thu": "rest",
            "fri": "rest", "sat": "rest", "sun": "rest"
          },
          "training_days_per_week": null
        }
        """#)
        XCTAssertNil(resp.trainingDaysPerWeek)
        XCTAssertEqual(resp.availability.programDayCount, 0)
    }

    func testTolerantDecodeMissingNullAndUnknownDegradeToRest() throws {
        // fri = null, sat = unknown token, sun = absent → all must read .rest and
        // never throw the payload. Only mon is a real program day.
        let resp = try decode(#"""
        {
          "availability": {
            "mon": "program", "tue": "rest", "wed": "rest", "thu": "rest",
            "fri": null, "sat": "garbage"
          },
          "training_days_per_week": 1
        }
        """#)
        XCTAssertEqual(resp.availability.days, [
            .program, .rest, .rest, .rest, .rest, .rest, .rest,
        ])
        XCTAssertEqual(resp.availability.programDayCount, 1)
    }

    // MARK: - PATCH encode

    func testEncodesWholeMapWithSnakeCaseValues() throws {
        let map = AvailabilityMap(days: [
            .program, .otherActivity, .rest, .program, .rest, .rest, .rest,
        ])
        let data = try encoder.encode(map)
        let obj = try JSONDecoder().decode([String: String].self, from: data)

        // All 7 days sent (the PATCH is a whole-map merge), correct keys + values.
        XCTAssertEqual(obj.count, 7)
        XCTAssertEqual(obj["mon"], "program")
        XCTAssertEqual(obj["tue"], "other_activity")  // rawValue survives snake_case
        XCTAssertEqual(obj["wed"], "rest")
        XCTAssertEqual(obj["thu"], "program")
        XCTAssertEqual(obj["sun"], "rest")
    }

    func testEncodeWrappedInAvailabilityKey() throws {
        // Mirrors AvailabilityService.save's body: { "availability": { … } }.
        struct Body: Encodable { let availability: AvailabilityMap }
        let body = Body(availability: AvailabilityMap(days: [
            .program, .rest, .rest, .rest, .rest, .rest, .rest,
        ]))
        let data = try encoder.encode(body)
        let root = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let inner = root?["availability"] as? [String: String]
        XCTAssertEqual(inner?["mon"], "program")
        XCTAssertEqual(inner?.count, 7)
    }

    // MARK: - Round-trip

    func testEncodeDecodeRoundTripPreservesMap() throws {
        let original = AvailabilityMap(days: [
            .program, .rest, .otherActivity, .program, .program, .rest, .otherActivity,
        ])
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(AvailabilityMap.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    // MARK: - programDayCount ("N días de entreno") + normalization

    func testProgramDayCountAcrossMaps() {
        XCTAssertEqual(AvailabilityMap.restAll.programDayCount, 0)
        XCTAssertEqual(
            AvailabilityMap(days: [.program, .program, .program, .rest, .otherActivity, .rest, .rest]).programDayCount,
            3
        )
        XCTAssertEqual(
            AvailabilityMap(days: Array(repeating: .program, count: 7)).programDayCount,
            7
        )
    }

    func testInitNormalizesToSevenDays() {
        // Too few → padded with .rest; too many → truncated to 7.
        let short = AvailabilityMap(days: [.program])
        XCTAssertEqual(short.days.count, 7)
        XCTAssertEqual(short.days[0], .program)
        XCTAssertEqual(Array(short.days[1...]), Array(repeating: .rest, count: 6))

        let long = AvailabilityMap(days: Array(repeating: .program, count: 10))
        XCTAssertEqual(long.days.count, 7)
    }
}
