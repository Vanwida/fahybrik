import Foundation

// «LOS ATLETAS SIGUEN DENTRO» (fase 1; DECISIONS 2026-09-24 «El atleta sigue dentro»).
//
// Hasta hoy la sesión moría 30 días después de entrar, se usara la app o no
// (auditoría E3). Ahora, con el token todavía válido, la app pide uno nuevo a lo
// sumo una vez al día (`/api/auth/refresh`) y ese dura 180 días desde ese momento.
// El viejo no se revoca: caduca en su fecha, así que nada en vuelo se queda con un 401.
//
// Un fallo al renovar NO cierra nada: el token vigente sigue valiendo. Solo un 401
// de ESE token (el vigente) significa que la sesión está muerta.

extension AuthState {
    static let renewedAtKey = "fahybrik.session_renewed_at"
    /// A lo sumo una renovación al día: el plazo es de 180, sobra margen.
    static let renewEvery: TimeInterval = 24 * 3600

    private struct RefreshResponse: Decodable {
        let sessionToken: String
        let expiresAt: String
    }

    /// Pide un token nuevo si toca. Devuelve el nuevo SIN adoptarlo: quien llama
    /// primero se lo pasa a lo que guarda copia (el almacén de datos, que tiene su
    /// caché atada al token) y luego llama `adoptRenewedToken` — en ese orden, para
    /// que el cambio de token no parezca el de otra persona y vacíe la caché.
    @MainActor
    func renewedTokenIfDue(now: Date = Date()) async -> String? {
        guard stage != .unauthenticated, let current = bearer else { return nil }
        if let last = UserDefaults.standard.object(forKey: Self.renewedAtKey) as? Date,
           now.timeIntervalSince(last) < Self.renewEvery {
            return nil
        }
        do {
            let resp: RefreshResponse = try await APIClient.shared.post(
                path: "/api/auth/refresh", body: Empty(), bearer: current
            )
            // Mientras tanto nadie cerró sesión ni entró otra persona.
            guard bearer == current else { return nil }
            DiagnosticsLog.shared.record(.lifecycle, .sessionRenewed, outcome: .ok)
            return resp.sessionToken
        } catch {
            DiagnosticsLog.shared.record(.lifecycle, .sessionRenewed, error: error)
            if case APIError.http(401, _) = error { handleUnauthorized(usedToken: current) }
            return nil
        }
    }

    /// Adopta el token renovado: Keychain (la fuente que leen los que suben en
    /// segundo plano) y el estado que ven las pantallas.
    @MainActor
    func adoptRenewedToken(_ token: String, now: Date = Date()) {
        guard stage != .unauthenticated else { return }
        KeychainTokenStore.shared.save(token)
        bearer = token
        UserDefaults.standard.set(now, forKey: Self.renewedAtKey)
    }
}
