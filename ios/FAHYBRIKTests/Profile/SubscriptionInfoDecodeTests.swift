import XCTest
@testable import FAHYBRIK

// Wire-contract coverage for the athlete subscription snapshot
// (`GET /api/athlete/subscription`). The app decodes with a GLOBAL
// `.convertFromSnakeCase` (APIClient.makeJSONDecoder), which rewrites wire keys
// (`plan_type` → `planType`) BEFORE CodingKey lookup. A regression where a
// CodingKey pins the raw snake_case spelling makes that field decode nil every
// time — a `pro_elite` athlete then shows "Individual" (ProfileView) and
// Dobles-without-partner is misclassified (Day1Model). These tests lock the
// decode AND the access gate (tier free ⇒ access without any Stripe row).
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
          "plan_type": "pro_elite",
          "tier": "coached",
          "current_period_end": "2026-08-01T00:00:00.000Z",
          "cancel_at_period_end": false
        }
        """
        let info = try decode(json)
        XCTAssertEqual(info.planType, "pro_elite")
        XCTAssertEqual(info.displayPlanLabel, "Elite")
        XCTAssertEqual(info.tier, "coached")
        XCTAssertTrue(info.isActiveAccess)
    }

    func test_planType_dobles_decodes() throws {
        let json = """
        {
          "subscribed": true,
          "status": "trialing",
          "plan_type": "dobles",
          "tier": "coached",
          "current_period_end": "2026-08-01T00:00:00Z",
          "cancel_at_period_end": false
        }
        """
        let info = try decode(json)
        XCTAssertEqual(info.planType, "dobles")
        XCTAssertEqual(info.displayPlanLabel, "Dobles")
        XCTAssertTrue(info.isActiveAccess)
    }

    func test_planType_individual_decodes() throws {
        let json = """
        {
          "subscribed": true,
          "status": "active",
          "plan_type": "individual",
          "tier": "coached",
          "current_period_end": "2026-08-01T00:00:00Z",
          "cancel_at_period_end": true
        }
        """
        let info = try decode(json)
        XCTAssertEqual(info.planType, "individual")
        XCTAssertEqual(info.displayPlanLabel, "Individual")
        XCTAssertTrue(info.cancelAtPeriodEnd)
    }

    /// FREE tier: no subscription row exists BY DESIGN. `subscribed:false` must
    /// NOT gate the athlete — `tier:"free"` alone grants access.
    func test_freeTier_noSubscription_hasAccess() throws {
        let json = """
        {
          "subscribed": false,
          "status": null,
          "plan_type": null,
          "tier": "free",
          "current_period_end": null,
          "cancel_at_period_end": false
        }
        """
        let info = try decode(json)
        XCTAssertTrue(info.isFreeTier)
        XCTAssertTrue(info.isActiveAccess)
        XCTAssertFalse(info.subscribed)
    }

    /// COACHED athlete with a lapsed subscription stays gated — the free tier
    /// must never widen the gate for coached accounts.
    func test_coachedTier_lapsed_isGated() throws {
        let json = """
        {
          "subscribed": false,
          "status": "canceled",
          "plan_type": "individual",
          "tier": "coached",
          "current_period_end": null,
          "cancel_at_period_end": false
        }
        """
        let info = try decode(json)
        XCTAssertFalse(info.isFreeTier)
        XCTAssertFalse(info.isActiveAccess)
    }

    /// The "no subscription" envelope WITHOUT a tier (older cached snapshot)
    /// must decode safely and stay status-driven — identical to today's gate.
    func test_noSubscription_envelope_withoutTier_decodesSafely() throws {
        let json = """
        {
          "subscribed": false,
          "status": null,
          "plan_type": null,
          "current_period_end": null,
          "cancel_at_period_end": false
        }
        """
        let info = try decode(json)
        XCTAssertFalse(info.subscribed)
        XCTAssertNil(info.planType)
        XCTAssertNil(info.tier)
        XCTAssertFalse(info.isFreeTier)
        XCTAssertFalse(info.isActiveAccess)
        XCTAssertEqual(info.displayPlanLabel, "HYROX Athlete")
    }
}
