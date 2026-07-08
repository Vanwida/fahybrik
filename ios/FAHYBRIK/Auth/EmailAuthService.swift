import Foundation

// Passwordless EMAIL-CODE login for the athlete app — the universal path that
// works even when the athlete's Apple ID doesn't match the email they were
// enrolled under. Two steps against the FAHYBRID backend:
//   1. request(email)          → POST /api/auth/email/request  (always 200; a code
//                                 is emailed only if a member account exists —
//                                 enumeration-safe, so we always advance to step 2)
//   2. verify(email, code)     → POST /api/auth/email/verify   → the SAME session
//                                 bearer shape as Sign in with Apple (AppleAuthResponse)
enum EmailAuthService {
    static let requestPath = "/api/auth/email/request"
    static let verifyPath = "/api/auth/email/verify"

    /// Ask the backend to email a 6-digit code. Returns on any 2xx; the response
    /// is deliberately generic (never reveals whether the email is a member), so
    /// the UI advances to the code step regardless.
    static func requestCode(email: String) async throws {
        struct Body: Encodable { let email: String }
        try await APIClient.shared.postRaw(path: requestPath, body: Body(email: email))
    }

    /// Submit the code. On success the backend mints an athlete session and
    /// returns the same shape the Apple path decodes, so the caller seats it via
    /// the existing `onAuthenticated` → `AuthState.acceptAppleResponse`.
    static func verifyCode(email: String, code: String) async throws -> AppleAuthResponse {
        struct Body: Encodable {
            let email: String
            let code: String
        }
        return try await APIClient.shared.post(path: verifyPath, body: Body(email: email, code: code))
    }
}
