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
//   GET  /api/stripe/subscription → SubscriptionInfo (DB-mirrored snapshot)
//   POST /api/stripe/portal       → { url } (Stripe Customer Portal session)
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

    /// `GET /api/stripe/subscription`. Returns the athlete's current
    /// subscription snapshot. Never throws on "no subscription" — the backend
    /// responds 200 with `subscribed: false` in that case.
    static func fetchSubscription(bearer: String?) async throws -> SubscriptionInfo {
        try await APIClient.shared.get(
            path: "/api/stripe/subscription",
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

/// Athlete subscription snapshot. Mirrors the web `GET /api/stripe/subscription`
/// response (snake_case → camelCase via APIClient). All fields optional/safe
/// for the "no subscription" envelope where the backend sends nulls.
struct SubscriptionInfo: Decodable, Equatable {
    let subscribed: Bool
    /// Raw Stripe status: active | trialing | past_due | unpaid | canceled |
    /// incomplete | incomplete_expired | paused. Nil when no subscription.
    let status: String?
    /// Backend-supplied marketing label. NOTE: the web app currently embeds a
    /// price in this string ("HYROX Athlete · €89/mes"). We MUST NOT render it
    /// verbatim — `modalityLabel` derives a price-free label instead.
    let planLabel: String?
    /// ISO-8601 timestamp of the next renewal (or access cutoff when the plan
    /// is set to cancel at period end). Decoded as String — we format it
    /// ourselves with an es_ES calendar.
    let currentPeriodEnd: String?
    let cancelAtPeriodEnd: Bool

    private enum CodingKeys: String, CodingKey {
        case subscribed, status
        case planLabel, currentPeriodEnd, cancelAtPeriodEnd
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        subscribed = (try? c.decode(Bool.self, forKey: .subscribed)) ?? false
        status = try? c.decodeIfPresent(String.self, forKey: .status)
        planLabel = try? c.decodeIfPresent(String.self, forKey: .planLabel)
        currentPeriodEnd = try? c.decodeIfPresent(String.self, forKey: .currentPeriodEnd)
        cancelAtPeriodEnd = (try? c.decode(Bool.self, forKey: .cancelAtPeriodEnd)) ?? false
    }

    // Memberwise init for previews/tests.
    init(
        subscribed: Bool,
        status: String?,
        planLabel: String?,
        currentPeriodEnd: String?,
        cancelAtPeriodEnd: Bool
    ) {
        self.subscribed = subscribed
        self.status = status
        self.planLabel = planLabel
        self.currentPeriodEnd = currentPeriodEnd
        self.cancelAtPeriodEnd = cancelAtPeriodEnd
    }
}

extension SubscriptionInfo {
    /// True when the athlete currently has paid access. Trialing counts as
    /// active access. Everything else (past_due, canceled, incomplete, paused,
    /// or no subscription) is gated.
    var isActiveAccess: Bool {
        guard let status else { return false }
        return status == "active" || status == "trialing"
    }

    /// Human label for the plan, with ANY price stripped out (Apple
    /// compliance — no prices in-app). The backend ships e.g.
    /// "HYROX Athlete · €89/mes"; we keep only the part before the first " · "
    /// separator and discard the rest if it looks like a price.
    var modalityLabel: String {
        guard let raw = planLabel, !raw.isEmpty else { return "HYROX Athlete" }
        // Split on the middle-dot separator the backend uses.
        let head = raw
            .components(separatedBy: " · ")
            .first?
            .trimmingCharacters(in: .whitespaces) ?? raw
        return head.isEmpty ? "HYROX Athlete" : head
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
