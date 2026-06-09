import Foundation

// RGPD endpoints for the authenticated athlete.
//
//   GET    /api/athlete/export-data    → JSON file with the athlete's data.
//                                        Returned with Content-Disposition:
//                                        attachment; filename="…".
//   DELETE /api/athlete/account        body: { reason?, confirmation }
//                                        Server triggers the 30-day deletion
//                                        flow and cancels the subscription
//                                        at end-of-period.
//
// Both endpoints are blocking legal requirements (RGPD / GDPR Art. 15 + 17).
// The iOS UI lives in ProfileView → "Privacidad y datos".
enum AccountService {
    // Confirmation string the server expects on the delete request body.
    // Mirrors the visible copy the user types in DeleteAccountConfirmView so
    // there is a single source of truth here on the client.
    static let deleteConfirmationPhrase = "DELETE MY ACCOUNT"
    /// Localised copy the athlete actually types into the confirmation field.
    static let deleteConfirmationPhraseEs = "ELIMINAR MI CUENTA"

    /// Downloads the athlete's data export. Returns raw bytes + filename so
    /// the caller can write to a temp file and present a Share Sheet.
    static func exportData(bearer: String) async throws -> (data: Data, filename: String) {
        let (data, filename, _) = try await APIClient.shared.getData(
            path: "api/athlete/export-data",
            bearer: bearer
        )
        return (data, filename)
    }

    /// Triggers permanent account deletion. The server is the source of truth
    /// for the 30-day soft-delete window — the client just forwards the
    /// confirmation + optional reason.
    static func deleteAccount(reason: String?, bearer: String) async throws {
        struct Body: Encodable {
            let reason: String?
            // Sent on the wire as `confirmation` — APIClient applies
            // convertToSnakeCase, which leaves single-word keys untouched.
            let confirmation: String
        }
        let _: Empty = try await APIClient.shared.delete(
            path: "api/athlete/account",
            body: Body(reason: reason, confirmation: Self.deleteConfirmationPhrase),
            bearer: bearer
        )
    }

    /// Wipes every client-side cache that contains athlete data. Called after
    /// a successful deletion so the next launch lands on Apple Sign In with a
    /// clean slate. Keeps the deletion flow self-contained — caller doesn't
    /// have to know about every cache key in the app.
    static func wipeLocalState() {
        let defaults = UserDefaults.standard
        // Drop only fahybrik-namespaced keys to avoid touching system prefs.
        for key in defaults.dictionaryRepresentation().keys
        where key.hasPrefix("fahybrik.") {
            defaults.removeObject(forKey: key)
        }

        // URL caches (image / response).
        URLCache.shared.removeAllCachedResponses()

        // HTTP cookies (web auth flows, if any).
        if let cookies = HTTPCookieStorage.shared.cookies {
            for c in cookies { HTTPCookieStorage.shared.deleteCookie(c) }
        }

        // App-scoped Caches/ directory — best-effort.
        let fm = FileManager.default
        if let caches = try? fm.url(
            for: .cachesDirectory, in: .userDomainMask,
            appropriateFor: nil, create: false
        ),
           let contents = try? fm.contentsOfDirectory(at: caches, includingPropertiesForKeys: nil) {
            for url in contents {
                try? fm.removeItem(at: url)
            }
        }
    }
}
