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

    /// Email y código para vincular la app del reloj Garmin, para enseñárselos al
    /// atleta en pantalla.
    ///
    /// Es el MISMO código que el login por correo y lo consume el mismo endpoint;
    /// aquí solo se entrega por un canal que ya está autenticado, en vez de por
    /// email. Eso ahorra el ida y vuelta de ir al reloj a pedirlo y esperar la
    /// bandeja de entrada.
    ///
    /// El email NO se manda: lo pone el servidor desde la sesión. Y cada llamada
    /// invalida el código anterior, así que solo se pide cuando el atleta lo va a
    /// usar de verdad.
    static func garminPairCode(bearer: String) async throws -> GarminPairCode {
        try await APIClient.shared.post(
            path: "api/athlete/wearables/garmin/pair-code",
            body: Empty(),
            bearer: bearer
        )
    }
}

/// Lo que el atleta tiene que copiar en los ajustes de Garmin Connect.
struct GarminPairCode: Decodable, Equatable {
    let email: String
    let code: String
    /// ISO-8601. El código caduca; la pantalla lo dice para que no lo guarde.
    let expiresAt: String
}
