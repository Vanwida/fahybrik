import Foundation
import Observation

@Observable
final class AuthState {
    enum Stage {
        case unauthenticated
        case onboarding
        case authenticated
    }

    var stage: Stage = .unauthenticated
    var bearer: String? = nil
    var athleteId: String? = nil

    /// Invite-only access gate. `nil` = not yet checked (show a loader, never
    /// the app); `true` = no active access → show the invite-only gate;
    /// `false` = active access → let the athlete into the app. We do NOT
    /// persist this — it is re-derived from the subscription endpoint on every
    /// launch / sign-in so a lapsed athlete gets gated again.
    var accessGated: Bool? = nil

    private static let bearerKey = "fahybrik.bearer"
    private static let athleteKey = "fahybrik.athleteId"
    private static let stageKey = "fahybrik.stage"

    /// Persisted athleteId for callers that don't hold the AuthState instance
    /// (e.g. ProfileView, which only receives the bearer). Single source of
    /// truth for the storage key so the value never drifts from `bootstrap()`.
    static func persistedAthleteId() -> String? {
        UserDefaults.standard.string(forKey: athleteKey)
    }

    func bootstrap() {
        let d = UserDefaults.standard
        bearer = d.string(forKey: Self.bearerKey)
        athleteId = d.string(forKey: Self.athleteKey)
        if let raw = d.string(forKey: Self.stageKey) {
            switch raw {
            case "authenticated": stage = .authenticated
            case "onboarding": stage = .onboarding
            default: stage = .unauthenticated
            }
        }
    }

    func acceptAppleResponse(_ resp: AppleAuthResponse) {
        bearer = resp.bearer
        athleteId = resp.athlete_id
        stage = (resp.onboarding_complete == true) ? .authenticated : .onboarding
        // Access must be (re)checked for the freshly-authenticated session.
        accessGated = nil
        persist()
    }

    func finishOnboarding() {
        stage = .authenticated
        persist()
    }

    func signOut() {
        bearer = nil
        athleteId = nil
        stage = .unauthenticated
        accessGated = nil
        persist()
    }

    /// Shortcut for paths that grant access by construction (invite redemption):
    /// skips the round-trip to the subscription endpoint so the gate never
    /// flashes.
    func markAccessActive() {
        accessGated = false
    }

    /// Re-derive the invite-only access gate from the subscription endpoint.
    /// Active / trialing access ⇒ ungated; everything else ⇒ gated. On a
    /// network error we fail OPEN (ungated) so a transient outage doesn't lock
    /// a legitimately-paid athlete out of the app.
    @MainActor
    func refreshAccess() async {
        guard let bearer else { accessGated = true; return }
        do {
            let info = try await SubscriptionService.fetchSubscription(bearer: bearer)
            accessGated = !info.isActiveAccess
        } catch {
            accessGated = false
        }
    }

    private func persist() {
        let d = UserDefaults.standard
        if let bearer { d.set(bearer, forKey: Self.bearerKey) }
        else { d.removeObject(forKey: Self.bearerKey) }
        if let athleteId { d.set(athleteId, forKey: Self.athleteKey) }
        else { d.removeObject(forKey: Self.athleteKey) }
        let raw: String = {
            switch stage {
            case .unauthenticated: return "unauthenticated"
            case .onboarding: return "onboarding"
            case .authenticated: return "authenticated"
            }
        }()
        d.set(raw, forKey: Self.stageKey)
    }
}
