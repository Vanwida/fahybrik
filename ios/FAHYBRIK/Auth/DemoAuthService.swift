import Foundation

// DemoAuthService — gated, ADDITIVE demo athlete sign-in.
//
// Lets a colleague tour the app as a seeded demo athlete WITHOUT a real Apple
// ID. It mints the SAME kind of athlete Bearer JWT every real sign-in uses
// (lib/auth/session, athlete audience, DB-backed + revocable), so the session
// state is identical — no parallel auth. The real Sign in with Apple flow is
// untouched.
//
// Backend contract (commit b09d2ff — do NOT modify):
//   POST /api/demo/athlete-bearer  body: { slot: 1 | 2 }
//     → 200 { slot, athlete_id, athlete_email, full_name, bearer, expires_at }
//     → 404 when DEMO_ACCESS != '1' (flag off) or the athlete isn't seeded
//     → 400 unknown slot
//
// The endpoint is gated server-side by the DEMO_ACCESS env flag, so it is dead
// on production. When it 404s we surface a clean "demo no disponible" state and
// never crash.
//
// snake_case JSON ⇄ camelCase Swift handled by APIClient's
// convertFromSnakeCase / convertToSnakeCase strategies.
//
// DEBUG-ONLY: the entire demo auth path is stripped from Release builds so the
// App Store binary never carries a demo sign-in path (Release has no DEBUG
// compilation condition — see project.yml). Every reference to this symbol is
// likewise `#if DEBUG`-gated.
#if DEBUG
enum DemoAuthService {
    static let path = "/api/demo/athlete-bearer"

    /// The two seeded demo athletes, keyed by the stable slot the UI picks.
    /// MUST match the backend's DEMO_COACHES (lib/auth/demo-access.ts).
    enum Slot: Int, CaseIterable, Identifiable {
        case one = 1
        case two = 2

        var id: Int { rawValue }
        var label: String {
            switch self {
            case .one: return "Atleta Demo 1"
            case .two: return "Atleta Demo 2"
            }
        }
    }

    /// `{ athlete_id, bearer, ... }` — only the fields the app needs to seat a
    /// session. `athlete_id` is a JSON number; we decode it as Int and stringify
    /// it on the way out so it matches the String `athleteId` the rest of the
    /// app (and `AuthState`) persists.
    struct Response: Decodable {
        let slot: Int
        let athleteId: Int
        let athleteEmail: String
        let fullName: String?
        let bearer: String
    }

    enum DemoError: Error {
        /// Flag off (404) or athlete not seeded — the demo path is unavailable.
        case unavailable
    }

    /// `POST /api/demo/athlete-bearer { slot }`. Returns the demo athlete's
    /// session. Maps the gated 404 to `.unavailable`; every other HTTP error
    /// bubbles up as `APIError.http` so the caller can show it.
    static func requestBearer(slot: Slot) async throws -> Response {
        struct Body: Encodable { let slot: Int }
        do {
            return try await APIClient.shared.post(
                path: path,
                body: Body(slot: slot.rawValue)
            )
        } catch APIError.http(404, _) {
            throw DemoError.unavailable
        }
    }
}
#endif
