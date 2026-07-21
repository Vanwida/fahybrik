import XCTest
@testable import FAHYBRIK

// Wire-contract coverage for the athlete subscription snapshot
// (`GET /api/stripe/subscription`). The app decodes with a GLOBAL
// `.convertFromSnakeCase` (APIClient.makeJSONDecoder), which rewrites the wire
// key `plan_type` → `planType` BEFORE CodingKey lookup. A regression where the
// CodingKey pins the raw `plan_type` makes `planType` decode nil every time — a
// `pro_elite` athlete then shows "Individual" (ProfileView) and
// Dobles-without-partner is misclassified (Day1Model). These tests lock the fix.
final class SubscriptionInfoDecodeTests: XCTestCase {
    private func decode(_ json: String) throws -> SubscriptionInfo {
        try APIClient.makeJSONDecoder().decode(
            SubscriptionInfo.self,
            from: Data(json.utf8)
        )
    }

    /// The core fix: `plan_type` must bind `planType` under the app's global
    /// `.convertFromSnakeCase`. Elite athletes must NOT read as "Individual".
    func test_planType_proElite_decodesFromSnakeCaseWireKey() throws {
        let json = """
        {
          "subscribed": true,
          "status": "active",
          "plan_label": "HYROX Athlete · €149/mes",
          "plan_type": "pro_elite",
          "current_period_end": "2026-08-01T00:00:00.000Z",
          "cancel_at_period_end": false
        }
        """
        let info = try decode(json)
        XCTAssertEqual(info.planType, "pro_elite")
        XCTAssertEqual(info.displayPlanLabel, "Elite")
        XCTAssertTrue(info.isActiveAccess)
        // Price-bearing marketing label is never rendered verbatim.
        XCTAssertEqual(info.modalityLabel, "HYROX Athlete")
    }

    func test_planType_dobles_decodes() throws {
        let json = """
        {
          "subscribed": true,
          "status": "trialing",
          "plan_label": "HYROX Dobles",
          "plan_type": "dobles",
          "current_period_end": "2026-08-01T00:00:00Z",
          "cancel_at_period_end": false
        }
        """
        let info = try decode(json)
        XCTAssertEqual(info.planType, "dobles")
        XCTAssertEqual(info.displayPlanLabel, "Dobles")
    }

    func test_planType_individual_decodes() throws {
        let json = """
        {
          "subscribed": true,
          "status": "active",
          "plan_label": "HYROX Athlete",
          "plan_type": "individual",
          "current_period_end": "2026-08-01T00:00:00Z",
          "cancel_at_period_end": true
        }
        """
        let info = try decode(json)
        XCTAssertEqual(info.planType, "individual")
        XCTAssertEqual(info.displayPlanLabel, "Individual")
        XCTAssertTrue(info.cancelAtPeriodEnd)
    }

    /// The "no subscription" envelope (backend sends 200 with nulls) must decode
    /// safely — every field optional/defaulted, `planType` nil → falls back to
    /// the price-stripped modality label.
    func test_noSubscription_envelope_decodesSafely() throws {
        let json = """
        {
          "subscribed": false,
          "status": null,
          "plan_label": null,
          "plan_type": null,
          "current_period_end": null,
          "cancel_at_period_end": false
        }
        """
        let info = try decode(json)
        XCTAssertFalse(info.subscribed)
        XCTAssertNil(info.planType)
        XCTAssertFalse(info.isActiveAccess)
        XCTAssertEqual(info.displayPlanLabel, "HYROX Athlete")
    }
}
