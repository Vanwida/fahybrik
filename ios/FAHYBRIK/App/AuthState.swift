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

    private static let bearerKey = "fahybrik.bearer"
    private static let athleteKey = "fahybrik.athleteId"
    private static let stageKey = "fahybrik.stage"

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
        persist()
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
