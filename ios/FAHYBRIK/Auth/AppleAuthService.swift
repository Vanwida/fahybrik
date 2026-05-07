import Foundation
import AuthenticationServices

// Posts the Apple credential to the FAHYBRIK backend (built in parallel by
// the `backend-auth` agent). The backend exchanges the identity token for a
// session bearer; we cache that bearer in the keychain.
struct AppleAuthRequest: Encodable {
    let identity_token: String
    let authorization_code: String?
    let user_id: String
    let email: String?
    let full_name: String?
}

struct AppleAuthResponse: Decodable {
    let bearer: String
    let athlete_id: String
    let onboarding_complete: Bool?
}

enum AppleAuthService {
    static let path = "/api/auth/apple"

    static func exchange(_ credential: ASAuthorizationAppleIDCredential) async throws -> AppleAuthResponse {
        guard let tokenData = credential.identityToken,
              let identity = String(data: tokenData, encoding: .utf8) else {
            throw APIError.invalidResponse
        }
        let codeStr: String? = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
        let fullName: String? = {
            guard let n = credential.fullName else { return nil }
            return [n.givenName, n.familyName].compactMap { $0 }.joined(separator: " ")
                .trimmingCharacters(in: .whitespaces)
                .nilIfEmpty
        }()

        let req = AppleAuthRequest(
            identity_token: identity,
            authorization_code: codeStr,
            user_id: credential.user,
            email: credential.email,
            full_name: fullName
        )

        // The wrapper avoids snake_case key conversion on already-snake fields.
        struct Wrapper: Encodable {
            let identity_token: String
            let authorization_code: String?
            let user_id: String
            let email: String?
            let full_name: String?
        }
        let w = Wrapper(
            identity_token: req.identity_token,
            authorization_code: req.authorization_code,
            user_id: req.user_id,
            email: req.email,
            full_name: req.full_name
        )

        return try await APIClient.shared.post(path: path, body: w)
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
