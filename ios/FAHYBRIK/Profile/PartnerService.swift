import Foundation

// Wraps the Dobles partner endpoints provided by the backend-dobles agent:
//   GET  /api/athlete/partner
//   POST /api/athlete/partner/invite   body: { email }
//   POST /api/athlete/partner/redeem   body: { token, apple_identity_token }
//
// All snake_case JSON is decoded into camelCase Swift via APIClient's
// `convertFromSnakeCase` strategy.

struct InvitationResult: Codable, Equatable {
    let invitationId: String
    let inviteeEmail: String?
    let expiresAt: String
    /// True when this call re-sent a previously-issued invitation (same
    /// email + still pending) instead of creating a new one. Mirrors the
    /// backend's `resend` boolean.
    let resend: Bool?
    let sent: Bool
    let emailSkippedReason: String?
}

struct PartnerRedeemResponse: Codable, Equatable {
    let userId: String?
    let athleteId: String
    let partnerUserId: String?
    let sessionToken: String
    let expiresAt: String?
    let email: String?
    let isPrivateEmail: Bool?
    let onboardedAt: String?
    /// Wire `has_coach` (additive) — false = athlete without coach (tier FREE).
    /// Nil on older payloads → treated as coached by AuthState.
    let hasCoach: Bool?

    var bearer: String { sessionToken }
    var onboarding_complete: Bool { onboardedAt != nil }
}

enum PartnerService {
    /// `GET /api/athlete/partner` → `{ partner, athlete_modality? }`.
    /// Returns the decoded envelope so callers can read modality alongside
    /// the partner snapshot.
    ///
    /// Note: backend returns HTTP 404 with `{ partner: null }` when the
    /// athlete is unpaired. We catch that specific case and surface it as a
    /// valid empty envelope rather than throwing — letting the UI render the
    /// invite state without an error path.
    static func fetchEnvelope(bearer: String) async throws -> PartnerEnvelope {
        do {
            return try await APIClient.shared.get(path: "api/athlete/partner", bearer: bearer)
        } catch let APIError.http(404, data) {
            // Try to decode the envelope from the 404 body (backend ships
            // `{ partner: null }`). Fall back to a synthetic empty envelope
            // when the body is unparseable.
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            if let env = try? decoder.decode(PartnerEnvelope.self, from: data) {
                return env
            }
            return PartnerEnvelope(source: nil, partner: nil, athleteModality: nil, sentInvitation: nil)
        }
    }

    /// Convenience wrapper for callers that only need the partner snapshot.
    static func fetchPartner(bearer: String) async throws -> PartnerInfo? {
        try await fetchEnvelope(bearer: bearer).partner
    }

    /// `POST /api/athlete/partner/invite` body `{ email }`.
    static func invitePartner(email: String, bearer: String) async throws -> InvitationResult {
        struct Body: Encodable { let email: String }
        return try await APIClient.shared.post(
            path: "api/athlete/partner/invite",
            body: Body(email: email),
            bearer: bearer
        )
    }

    /// `POST /api/athlete/partner/redeem` body `{ token, apple_identity_token }`.
    /// Called from the deep-link redemption flow on the *invitee* device after
    /// they sign in with Apple. Returns a session bearer the invitee can use
    /// immediately — they still go through their own onboarding (NOT cloned
    /// from the inviter).
    static func redeem(token: String, appleIdentityToken: String) async throws -> PartnerRedeemResponse {
        struct Body: Encodable {
            let token: String
            let appleIdentityToken: String  // → apple_identity_token via convertToSnakeCase
        }
        return try await APIClient.shared.post(
            path: "api/athlete/partner/redeem",
            body: Body(token: token, appleIdentityToken: appleIdentityToken)
        )
    }

    /// `POST /api/athlete/partner/redeem` for an ALREADY-authenticated athlete
    /// (existing account accepting a partner invite). The caller is identified by
    /// their bearer — no Apple re-auth. Backend links `users.partner_id` both ways
    /// and auto-creates the training pair when both share a coach.
    static func redeemAuthenticated(token: String, bearer: String) async throws -> PartnerRedeemResponse {
        struct Body: Encodable { let token: String }
        return try await APIClient.shared.post(
            path: "api/athlete/partner/redeem",
            body: Body(token: token),
            bearer: bearer
        )
    }

    /// `POST /api/athlete/partner/unlink` — the athlete un-pairs themselves. The
    /// backend dissolves the active training pair AND clears both account axes
    /// (users.partner_id + subscriptions.partner_user_id); past joint executions
    /// are conserved. Forward-looking pair surfaces then hide the partner.
    @discardableResult
    static func unlink(bearer: String) async throws -> PartnerUnlinkResponse {
        struct Empty: Encodable {}
        return try await APIClient.shared.post(
            path: "api/athlete/partner/unlink",
            body: Empty(),
            bearer: bearer
        )
    }

    /// `POST /api/athlete/partner/invite/cancel` — the INVITER withdraws their
    /// pending invitation. Idempotent: `cancelled == false` when there was
    /// nothing pending to cancel.
    @discardableResult
    static func cancelInvite(bearer: String) async throws -> CancelInviteResult {
        struct Empty: Encodable {}
        return try await APIClient.shared.post(
            path: "api/athlete/partner/invite/cancel",
            body: Empty(),
            bearer: bearer
        )
    }

    /// `POST /api/athlete/partner/decline` — the INVITEE rejects the invitation by
    /// its token (no session; the token is the authorization). Throws
    /// `APIError.http` on a terminal/invalid token so the caller can map the
    /// backend `error.code`.
    static func declineInvite(token: String) async throws {
        struct Body: Encodable { let token: String }
        try await APIClient.shared.postRaw(
            path: "api/athlete/partner/decline",
            body: Body(token: token)
        )
    }

    /// Extracts the backend `{ error: { code, message } }` code (e.g.
    /// "inviter_already_paired") from an `APIError.http` body. nil when the body
    /// is not that shape. Plain decoder — the keys are not snake_case.
    static func errorCode(from data: Data) -> String? {
        struct Envelope: Decodable {
            struct E: Decodable { let code: String }
            let error: E
        }
        return (try? JSONDecoder().decode(Envelope.self, from: data))?.error.code
    }
}

/// Result of `POST /api/athlete/partner/invite/cancel`.
struct CancelInviteResult: Codable, Equatable {
    let cancelled: Bool
    let inviteeEmail: String?
}

/// Minimal decode of the unlink response (all fields optional — we only need to
/// know the call succeeded).
struct PartnerUnlinkResponse: Codable, Equatable {
    let dissolvedPairId: Int?
    let clearedPartner: Bool?
}
