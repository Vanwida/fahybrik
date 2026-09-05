import Foundation

// Athlete wearable integrations (Polar + COROS MCP). Thin enum over APIClient.
//
// Contract (bearer-authed):
//   GET  api/athlete/wearables
//        → { "providers": [...], "pending_links": [...] }
//   POST api/athlete/wearables/{polar|coros}/connect-url
//        → 200 { "url": "https://…" }  ·  503 { "error": "*_not_configured" }
//   POST api/athlete/wearables/coros/sync
//   POST api/athlete/wearables/coros/disconnect
//   POST api/athlete/wearables/coros/confirm  { confirmation_id, answer }

/// One provider's connection state. `connected_at` is optional (absent until linked).
struct WearableProvider: Decodable, Equatable {
    let provider: String
    @DefaultFalse var connected: Bool
    let connectedAt: String?
}

struct WearablePendingLink: Decodable, Equatable {
    let confirmationId: String
    let provider: String
    let sourceWorkoutRef: String
    let startedAt: String?
}

struct WearablesResponse: Decodable {
    @LossyArray var providers: [WearableProvider]
    @LossyArray var pendingLinks: [WearablePendingLink]
}

/// The authorize URL the athlete opens to start the provider OAuth.
private struct WearableConnectURL: Decodable {
    let url: String
}

private struct CorosConfirmBody: Encodable {
    let confirmationId: String
    let answer: String
}

enum WearablesService {
    static let polar = "polar"
    static let coros = "coros"

    static func fetch(bearer: String) async throws -> WearablesResponse {
        try await APIClient.shared.get(
            path: "api/athlete/wearables",
            bearer: bearer
        )
    }

    static func polarConnectURL(bearer: String) async throws -> URL {
        try await connectURL(provider: polar, bearer: bearer)
    }

    static func corosConnectURL(bearer: String) async throws -> URL {
        try await connectURL(provider: coros, bearer: bearer)
    }

    static func corosSync(bearer: String) async throws -> WearablesResponse {
        try await APIClient.shared.post(
            path: "api/athlete/wearables/\(coros)/sync",
            body: Empty(),
            bearer: bearer
        )
    }

    static func corosDisconnect(bearer: String) async throws {
        try await APIClient.shared.postRaw(
            path: "api/athlete/wearables/\(coros)/disconnect",
            body: Empty(),
            bearer: bearer
        )
    }

    static func corosConfirm(bearer: String, confirmationId: String, yes: Bool) async throws {
        try await APIClient.shared.postRaw(
            path: "api/athlete/wearables/\(coros)/confirm",
            body: CorosConfirmBody(confirmationId: confirmationId, answer: yes ? "yes" : "no"),
            bearer: bearer
        )
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

    private static func connectURL(provider: String, bearer: String) async throws -> URL {
        let resp: WearableConnectURL = try await APIClient.shared.post(
            path: "api/athlete/wearables/\(provider)/connect-url",
            body: Empty(),
            bearer: bearer
        )
        guard let url = URL(string: resp.url) else { throw APIError.invalidResponse }
        return url
    }
}

/// Lo que el atleta tiene que copiar en los ajustes de Garmin Connect.
struct GarminPairCode: Decodable, Equatable {
    let email: String
    let code: String
    /// ISO-8601. El código caduca; la pantalla lo dice para que no lo guarde.
    let expiresAt: String
}
