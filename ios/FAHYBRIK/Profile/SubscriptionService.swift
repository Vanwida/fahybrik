import Foundation

// SubscriptionService — read-only subscription state + a link out to the
// Stripe-hosted Customer Portal.
//
// COMPLIANCE (Apple Guideline 3.1.3(b) "Multiplatform Services"):
// The athlete subscribes on the WEB (Stripe Checkout, hosted) BEFORE
// installing the app — the iOS app never sells anything in-app. So this
// service deliberately exposes NO checkout call: it only reads the current
// subscription and opens the Customer Portal where the athlete manages /
// cancels their plan on Stripe's own UI. We must never render prices or a
// "Subscribe / Upgrade / Buy" affordance inside the app.
//
// Backend contract (do not modify — owned by the web app):
//   GET  /api/athlete/subscription → SubscriptionInfo (DB-mirrored snapshot + tier)
//   POST /api/stripe/portal        → { url } (Stripe Customer Portal session)
//
// `tier` is the PRODUCT scope, derived server-side from the coach link:
// 'coached' = a coach runs this athlete's plan and payment truth stays in the
// Stripe mirror; 'free' = the self-serve tier, which has NO subscriptions row
// BY DESIGN — nothing to pay, so `subscribed:false` alone must never gate a
// free athlete out (see `isActiveAccess`).
//
// snake_case JSON ⇄ camelCase Swift handled by APIClient's
// convertFromSnakeCase / convertToSnakeCase strategies.
enum SubscriptionService {
    /// Public-facing web host where the athlete manages billing / account when
    /// they have no Stripe customer yet (never went through checkout) or their
    /// subscription is inactive. Single source of truth for the domain string.
    static let accountWebHost = "fahybrid.com"

    /// Full URL the gated / inactive states open in an SFSafariViewController.
    /// We point at the account page, NOT a checkout — the app must never open
    /// an in-app purchase flow (Apple Guideline 3.1.3(b)).
    static let accountWebURL = URL(string: "https://\(accountWebHost)/account")!

    /// `GET /api/athlete/subscription`. Returns the athlete's current
    /// subscription snapshot + product tier. Never throws on "no subscription"
    /// — the backend responds 200 with `subscribed: false` in that case.
    static func fetchSubscription(bearer: String?) async throws -> SubscriptionInfo {
        try await APIClient.shared.get(
            path: "/api/athlete/subscription",
            bearer: bearer
        )
    }

    /// `POST /api/stripe/portal` → returns the Stripe Customer Portal URL.
    /// The caller opens it in an SFSafariViewController; the athlete cancels /
    /// changes / updates payment method THERE, never inside the app.
    ///
    /// Throws `APIError.http(404, …)` when the athlete has no Stripe customer
    /// yet (never went through web checkout) — callers should treat that as
    /// "nothing to manage" rather than a hard error.
    static func openManagePortal(bearer: String?) async throws -> URL {
        let resp: StripePortalResponse = try await APIClient.shared.post(
            path: "/api/stripe/portal",
            body: EmptyBody(),
            bearer: bearer
        )
        guard let url = URL(string: resp.url) else {
            throw APIError.invalidResponse
        }
        return url
    }
}

private struct EmptyBody: Encodable {}

private struct StripePortalResponse: Decodable {
    let url: String
}

// MARK: - Model

/// Athlete subscription snapshot. Mirrors the web `GET /api/athlete/subscription`
/// response (snake_case → camelCase via APIClient). All fields optional/safe
/// for the "no subscription" envelope where the backend sends nulls.
struct SubscriptionInfo: Codable, Equatable {
    let subscribed: Bool
    /// Raw Stripe status: active | trialing | past_due | unpaid | canceled |
    /// incomplete | incomplete_expired | paused. Nil when no subscription.
    let status: String?
    /// Stable plan identifier from the backend: "individual" | "dobles" |
    /// "pro_elite". This is the authoritative source for the plan name. Nil
    /// when no subscription. See `displayPlanLabel`.
    let planType: String?
    /// Product tier derived from the coach link: "coached" | "free". A free
    /// athlete legitimately has NO subscription — their access never depends
    /// on Stripe. Nil tolerated (older cached snapshots) → treated as coached.
    let tier: String?
    /// ISO-8601 timestamp of the next renewal (or access cutoff when the plan
    /// is set to cancel at period end). Decoded as String — we format it
    /// ourselves with an es_ES calendar.
    let currentPeriodEnd: String?
    let cancelAtPeriodEnd: Bool

    // The app decodes with a GLOBAL `.convertFromSnakeCase` (APIClient.makeJSONDecoder),
    // which rewrites wire keys (`plan_type` → `planType`) BEFORE CodingKey lookup —
    // so every CodingKey below must be the CONVERTED camelCase spelling, never the
    // raw snake_case one (pinning `planType = "plan_type"` made it decode nil).
    private enum CodingKeys: String, CodingKey {
        case subscribed, status, tier
        case planType, currentPeriodEnd, cancelAtPeriodEnd
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        subscribed = (try? c.decode(Bool.self, forKey: .subscribed)) ?? false
        status = try? c.decodeIfPresent(String.self, forKey: .status)
        planType = try? c.decodeIfPresent(String.self, forKey: .planType)
        tier = try? c.decodeIfPresent(String.self, forKey: .tier)
        currentPeriodEnd = try? c.decodeIfPresent(String.self, forKey: .currentPeriodEnd)
        cancelAtPeriodEnd = (try? c.decode(Bool.self, forKey: .cancelAtPeriodEnd)) ?? false
    }

    // Memberwise init for previews/tests.
    init(
        subscribed: Bool,
        status: String?,
        planType: String? = nil,
        tier: String? = nil,
        currentPeriodEnd: String?,
        cancelAtPeriodEnd: Bool
    ) {
        self.subscribed = subscribed
        self.status = status
        self.planType = planType
        self.tier = tier
        self.currentPeriodEnd = currentPeriodEnd
        self.cancelAtPeriodEnd = cancelAtPeriodEnd
    }
}

extension SubscriptionInfo {
    /// True when this snapshot belongs to the self-serve FREE tier (no coach).
    var isFreeTier: Bool { tier == "free" }

    /// True when the athlete currently has access to the app.
    ///
    ///   • FREE tier → always true. There is nothing to pay; the absence of a
    ///     subscription is a legitimate state, never a lapsed one.
    ///   • COACHED (or unknown tier, e.g. an old cached snapshot) → paid access:
    ///     active / trialing counts, everything else (past_due, canceled,
    ///     incomplete, paused, or no subscription) is gated.
    var isActiveAccess: Bool {
        if isFreeTier { return true }
        guard let status else { return false }
        return status == "active" || status == "trialing"
    }

    /// Authoritative, price-free plan name shown in the UI. Maps the stable
    /// `plan_type` identifier to its display name. ("pro_elite" → "Elite":
    /// the product renamed Pro → Elite.)
    var displayPlanLabel: String {
        switch planType {
        case "individual": return "Individual"
        case "dobles":     return "Dobles"
        case "pro_elite":  return "Elite"
        default:           return "HYROX Athlete"
        }
    }

    /// Formatted next-renewal / access-cutoff date (dd/MM/yyyy, es_ES), or nil.
    var formattedPeriodEnd: String? {
        guard let iso = currentPeriodEnd else { return nil }
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = withFractional.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let d = date else { return nil }
        let out = DateFormatter()
        out.locale = Locale(identifier: "es_ES")
        out.dateFormat = "dd/MM/yyyy"
        return out.string(from: d)
    }
}
