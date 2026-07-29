import XCTest
import SwiftUI
@testable import FAHYBRIK

// Coverage for the post-workout premium pass:
//   #65  — strict decode of the `prs` records + unambiguous PR copy + share render
//   #58  — encode of the execution POST with the new feedback fields (and without)
//   #59  — pure App Store review gating
final class PostWorkoutFeedbackTests: XCTestCase {

    // The production decoder (snake_case → camelCase, lenient ISO dates).
    private func decoder() -> JSONDecoder { APIClient.makeJSONDecoder() }

    // Mirrors APIClient.shared's encoder so the encode tests exercise the exact
    // wire behaviour.
    private func encoder() -> JSONEncoder {
        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        enc.dateEncodingStrategy = .iso8601
        return enc
    }

    private func decodeResponse(_ json: String) throws -> WorkoutExecutionResponse {
        try decoder().decode(WorkoutExecutionResponse.self, from: Data(json.utf8))
    }

    // MARK: - #65 · prs decode (strict types)

    func testDecodesGenuineRecord() throws {
        let resp = try decodeResponse(#"{"prs":[{"kind":"run_5k","new_value_s":1308,"prev_value_s":1322}]}"#)
        let records = resp.personalRecords
        XCTAssertEqual(records.count, 1)
        let pr = records[0]
        XCTAssertEqual(pr.kind, .run5k)
        XCTAssertEqual(pr.newValueS, 1308)
        XCTAssertEqual(pr.prevValueS, 1322)
        XCTAssertFalse(pr.isFirstMark)
        XCTAssertEqual(pr.improvementSeconds, 14)
    }

    func testDecodesFirstMark() throws {
        let resp = try decodeResponse(#"{"prs":[{"kind":"run_1k","new_value_s":215,"prev_value_s":null}]}"#)
        let pr = try XCTUnwrap(resp.personalRecords.first)
        XCTAssertTrue(pr.isFirstMark)
        XCTAssertNil(pr.improvementSeconds)
    }

    func testEmptyAndAbsentPrsBothYieldNoRecords() throws {
        XCTAssertTrue(try decodeResponse(#"{"prs":[]}"#).personalRecords.isEmpty)
        // A response that omits `prs` entirely is tolerated as "no records".
        XCTAssertTrue(try decodeResponse(#"{"saved":true,"id":"x"}"#).personalRecords.isEmpty)
    }

    func testUnknownKindIsDroppedNotFatal() throws {
        let resp = try decodeResponse(#"{"prs":[{"kind":"run_10k","new_value_s":2400,"prev_value_s":null},{"kind":"run_3k","new_value_s":720,"prev_value_s":null}]}"#)
        // Only the known distance survives; the unknown one is skipped silently.
        XCTAssertEqual(resp.personalRecords.map(\.kind), [.run3k])
    }

    func testNumbersDecodeAsNumbers() throws {
        // Integer and decimal seconds both decode to Double (no string coercion).
        let resp = try decodeResponse(#"{"prs":[{"kind":"run_3k","new_value_s":727.5,"prev_value_s":740}]}"#)
        let pr = try XCTUnwrap(resp.personalRecords.first)
        XCTAssertEqual(pr.newValueS, 727.5, accuracy: 0.001)
    }

    func testMalformedNumberFailsDecodeSoCallerSkipsCelebration() {
        // A value the contract pins as a number arriving as a string must FAIL the
        // decode (→ APIError.decoding → nil → no celebration, no crash).
        XCTAssertThrowsError(
            try decodeResponse(#"{"prs":[{"kind":"run_5k","new_value_s":"fast","prev_value_s":null}]}"#)
        )
    }

    func testExtraKeysIgnored() throws {
        let resp = try decodeResponse(#"{"prs":[{"kind":"run_1k","new_value_s":215,"prev_value_s":230,"extra":true}],"saved":true}"#)
        XCTAssertEqual(resp.personalRecords.count, 1)
    }

    // MARK: - #65 · PR copy is unambiguous (it's the RUN, never the test)

    func testGenuineRecordCopySaysCorriendoAndDelta() {
        let pr = PersonalRecord(kind: .run5k, newValueS: 1308, prevValueS: 1322)
        XCTAssertEqual(pr.headline, "Tu 5 km más rápido corriendo")
        XCTAssertEqual(pr.formattedValue, "21:48")
        XCTAssertEqual(pr.deltaLine, "14s más rápido que tu marca anterior")
    }

    func testFirstMarkCopySaysCorriendo() {
        let pr = PersonalRecord(kind: .run5k, newValueS: 1308, prevValueS: nil)
        XCTAssertEqual(pr.headline, "Tu primera marca de 5 km corriendo")
    }

    func testDeltaFormatsMinutesForBigGaps() {
        XCTAssertEqual(PersonalRecord.formatDelta(45), "45s")
        XCTAssertEqual(PersonalRecord.formatDelta(72), "1:12")
    }

    // MARK: - #58 · execution POST carries the feedback fields

    private func payload(
        difficulty: String? = nil, painArea: String? = nil, painNote: String? = nil
    ) -> WorkoutExecutionPayload {
        WorkoutExecutionPayload(
            assignment_id: "a1", perceived_exertion: 8, total_duration_seconds: 600,
            notes: nil, source: nil, score_time_s: nil, score_rounds: nil, score_reps: nil,
            completeness: "full", started_at: "2026-07-12T10:00:00Z",
            ended_at: "2026-07-12T10:10:00Z", segments: nil,
            perceived_difficulty: difficulty, pain_area: painArea, pain_note: painNote
        )
    }

    private func encodeJSON(_ p: WorkoutExecutionPayload) throws -> [String: Any] {
        let data = try encoder().encode(p)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func testPayloadEncodesFeedbackFields() throws {
        let json = try encodeJSON(payload(
            difficulty: "too_hard", painArea: "rodilla", painNote: "molesta al bajar"
        ))
        XCTAssertEqual(json["perceived_difficulty"] as? String, "too_hard")
        XCTAssertEqual(json["pain_area"] as? String, "rodilla")
        XCTAssertEqual(json["pain_note"] as? String, "molesta al bajar")
    }

    func testPayloadOmitsFeedbackWhenAbsent() throws {
        let json = try encodeJSON(payload())
        XCTAssertNil(json["perceived_difficulty"])
        XCTAssertNil(json["pain_area"])
        XCTAssertNil(json["pain_note"])
        // The rest of the contract is untouched.
        XCTAssertEqual(json["assignment_id"] as? String, "a1")
        XCTAssertEqual(json["perceived_exertion"] as? Int, 8)
    }

    // The frozen wire values match the enums that produce them.
    func testFeedbackEnumWireValues() {
        XCTAssertEqual(PerceivedDifficulty.tooEasy.rawValue, "too_easy")
        XCTAssertEqual(PerceivedDifficulty.asExpected.rawValue, "as_expected")
        XCTAssertEqual(PerceivedDifficulty.tooHard.rawValue, "too_hard")
        XCTAssertEqual(PainArea.allCases.map(\.rawValue),
                       ["rodilla", "tobillo", "cadera", "espalda", "hombro", "otra"])
    }

    // MARK: - #59 · review gating (pure)

    private func days(_ n: Double) -> Date { Date().addingTimeInterval(-n * 86_400) }
    private func hours(_ n: Double) -> Date { Date().addingTimeInterval(-n * 3_600) }

    func testFreshUserNoPRNoTenure() {
        XCTAssertFalse(ReviewGate.shouldRequest(
            now: Date(), firstUseAt: days(1), workoutsSaved: 1,
            lastRequestedAt: nil, lastBugReportAt: nil, afterGenuinePR: false))
    }

    func testGenuinePRTriggers() {
        XCTAssertTrue(ReviewGate.shouldRequest(
            now: Date(), firstUseAt: days(1), workoutsSaved: 1,
            lastRequestedAt: nil, lastBugReportAt: nil, afterGenuinePR: true))
    }

    func testFirstMarkAloneDoesNotTrigger() {
        // afterGenuinePR is FALSE for a first mark → the tenure path must decide,
        // and a brand-new user fails it.
        XCTAssertFalse(ReviewGate.shouldRequest(
            now: Date(), firstUseAt: days(1), workoutsSaved: 1,
            lastRequestedAt: nil, lastBugReportAt: nil, afterGenuinePR: false))
    }

    func testTenureAndVolumeTriggers() {
        XCTAssertTrue(ReviewGate.shouldRequest(
            now: Date(), firstUseAt: days(22), workoutsSaved: 6,
            lastRequestedAt: nil, lastBugReportAt: nil, afterGenuinePR: false))
    }

    func testTenureMetButTooFewWorkouts() {
        XCTAssertFalse(ReviewGate.shouldRequest(
            now: Date(), firstUseAt: days(22), workoutsSaved: 5,
            lastRequestedAt: nil, lastBugReportAt: nil, afterGenuinePR: false))
    }

    func testEnoughWorkoutsButTooYoung() {
        XCTAssertFalse(ReviewGate.shouldRequest(
            now: Date(), firstUseAt: days(20), workoutsSaved: 8,
            lastRequestedAt: nil, lastBugReportAt: nil, afterGenuinePR: false))
    }

    func testBetweenRequestsCooldownBlocksEvenAPR() {
        XCTAssertFalse(ReviewGate.shouldRequest(
            now: Date(), firstUseAt: days(300), workoutsSaved: 30,
            lastRequestedAt: days(90), lastBugReportAt: nil, afterGenuinePR: true))
    }

    func testAfterCooldownRequestsAgain() {
        XCTAssertTrue(ReviewGate.shouldRequest(
            now: Date(), firstUseAt: days(300), workoutsSaved: 30,
            lastRequestedAt: days(200), lastBugReportAt: nil, afterGenuinePR: false))
    }

    func testBugReportBlocksReviewFor24h() {
        XCTAssertFalse(ReviewGate.shouldRequest(
            now: Date(), firstUseAt: days(300), workoutsSaved: 30,
            lastRequestedAt: nil, lastBugReportAt: hours(5), afterGenuinePR: true))
    }

    func testReviewAllowedOnceBugCooldownPasses() {
        XCTAssertTrue(ReviewGate.shouldRequest(
            now: Date(), firstUseAt: days(300), workoutsSaved: 30,
            lastRequestedAt: nil, lastBugReportAt: hours(25), afterGenuinePR: true))
    }

    // MARK: - #65 · share card render smoke

    @MainActor
    func testShareCardRendersWithFullData() throws {
        let data = WorkoutShareData(
            title: "HYROX Sim · Estación 4",
            timeText: "47:23",
            paceText: "4:35/km",
            dominantZone: .init(label: "Z4", pct: 62),
            rpe: 8,
            prDistanceLabel: "5 km"
        )
        let url = try XCTUnwrap(WorkoutShareRenderer.pngURL(for: data))
        let bytes = try Data(contentsOf: url)
        XCTAssertGreaterThan(bytes.count, 0)
        try? FileManager.default.removeItem(at: url)
    }

    @MainActor
    func testShareCardRendersWithMinimalData() throws {
        // No pace / zone / RPE / PR — the card must still render honestly.
        let data = WorkoutShareData(
            title: "Sesión libre", timeText: "12:00",
            paceText: nil, dominantZone: nil, rpe: nil, prDistanceLabel: nil
        )
        XCTAssertNotNil(WorkoutShareRenderer.pngURL(for: data))
    }
}
