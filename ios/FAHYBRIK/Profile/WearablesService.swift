import Foundation

// Athlete wearable integrations (currently Polar). Mirrors MeService: a thin enum
// over APIClient, snake_case wire fields decoded to camelCase by the shared decoder.
//
// Contract (bearer-authed):
//   GET  api/athlete/wearables
//        → { "providers": [ { "provider", "connected", "connected_at" } ] }
//   POST api/athlete/wearables/polar/connect-url
//        → 200 { "url": "https://…" }  ·  503 { "error": "polar_not_configured" }
//
// Decode is deliberately tolerant: the providers array may be empty, and unknown
// providers are ignored (callers filter to the one they care about). @LossyArray
// drops any malformed row instead of throwing the whole response.

/// One provider's connection state. `connected_at` is optional (absent until linked).
struct WearableProvider: Decodable, Equatable {
    let provider: String
    @DefaultFalse var connected: Bool
    let connectedAt: String?
}

struct WearablesResponse: Decodable {
    @LossyArray var providers: [WearableProvider]
}

/// The authorize URL the athlete opens to start the provider OAuth.
private struct WearableConnectURL: Decodable {
    let url: String
}

enum WearablesService {
    /// Provider key for Polar — single source of truth for the filter + the endpoint.
    static let polar = "polar"

    static func fetch(bearer: String) async throws -> [WearableProvider] {
        let resp: WearablesResponse = try await APIClient.shared.get(
            path: "api/athlete/wearables",
            bearer: bearer
        )
        return resp.providers
    }

    /// Starts the Polar OAuth: the backend returns the authorize URL to open in an
    /// in-app browser. When Polar isn't configured the backend returns 503, which
    /// surfaces here as `APIError.http(503, _)` for the caller to message.
    static func polarConnectURL(bearer: String) async throws -> URL {
        let resp: WearableConnectURL = try await APIClient.shared.post(
            path: "api/athlete/wearables/\(polar)/connect-url",
            body: Empty(),
            bearer: bearer
        )
        guard let url = URL(string: resp.url) else { throw APIError.invalidResponse }
        return url
    }
}
