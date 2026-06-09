import Foundation

// InviteService — coach → athlete invite redemption.
//
// Model: invite-only, NO in-app commerce (Apple Guideline 3.1.3(b) — the
// athlete's access is provisioned by the coach via an invite; the app never
// sells anything). The coach sends the athlete a link
//   https://fahybrid.com/invite/<token>      (Universal Link, future)
//   fahybrid://invite?token=<token>          (custom scheme, v1)
// The athlete opens it, signs in with Apple, and we bind their Apple ID to the
// invite's pre-provisioned account here.
//
// Backend contract (owned by the backend agent — do NOT modify):
//   POST /api/athlete/invite/redeem  body: { identity_token, invite_token }
//     → 200 session envelope (same shape as POST /api/auth/apple)
//     → 410 invite expired
//     → 409 invite already claimed
//     → 404 invite not found / invalid
//
// snake_case JSON ⇄ camelCase Swift handled by APIClient's
// convertFromSnakeCase / convertToSnakeCase strategies.
enum InviteService {
    static let redeemPath = "/api/athlete/invite/redeem"

    /// `POST /api/athlete/invite/redeem` body `{ identity_token, invite_token }`.
    /// Returns a session envelope identical in shape to the normal Apple
    /// sign-in (`AppleAuthResponse`) so callers can feed it straight into
    /// `AuthState.acceptAppleResponse`.
    ///
    /// Throws `APIError.http(status, body)` on the documented error codes
    /// (410 / 409 / 404 / 401 / 403) — the landing view maps these to copy.
    static func redeemInvite(
        identityToken: String,
        inviteToken: String
    ) async throws -> AppleAuthResponse {
        // `convertToSnakeCase` turns `identityToken` → `identity_token` and
        // `inviteToken` → `invite_token`, matching the backend contract.
        struct Body: Encodable {
            let identityToken: String
            let inviteToken: String
        }
        return try await APIClient.shared.post(
            path: redeemPath,
            body: Body(identityToken: identityToken, inviteToken: inviteToken)
        )
    }
}
