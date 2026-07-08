import Foundation
import Observation

// Data for the day-1 orientation (#17). Everything shown is ECHOED from what the
// funnel already captured — the athlete is NEVER asked anything here. Loads the
// name + goal (from /me), the modality + partner (to decide the Dobles beat).
@Observable
final class Day1Model {
    var firstName: String = ""
    var goalLine: String = "Tu plan con Pablo"
    var daysPerWeek: Int? = nil
    var isDobles: Bool = false
    var partnerName: String? = nil
    var loaded: Bool = false

    func load(bearer: String?) async {
        guard let bearer else { loaded = true; return }
        async let meTask = try? MeService.fetch(bearer: bearer)
        async let subTask = try? SubscriptionService.fetchSubscription(bearer: bearer)
        async let envTask = try? PartnerService.fetchEnvelope(bearer: bearer)
        let identity = await meTask
        let subscription = await subTask
        let envelope = await envTask

        if let identity {
            firstName = Self.firstName(identity.fullName)
            goalLine = Self.goalLine(identity.goalType)
            daysPerWeek = identity.trainingDaysPerWeek
        }
        let partner = envelope?.partner
        isDobles = subscription?.planType == "dobles" || partner != nil
        partnerName = partner?.firstName
        loaded = true
    }

    private static func firstName(_ full: String) -> String {
        let trimmed = full.trimmingCharacters(in: .whitespaces)
        return trimmed.split(separator: " ").first.map(String.init) ?? trimmed
    }

    // goal_type (onboarding_goal_type) → an athlete-facing echo line.
    private static func goalLine(_ code: String?) -> String {
        switch code {
        case "first_hyrox": return "Completar tu primer HYROX"
        case "improve_hyrox_mark": return "Mejorar tu marca en HYROX"
        case "improve_running": return "Mejorar tu carrera"
        case "complete_fun": return "Entrenar y disfrutar del proceso"
        default: return "Tu plan con Pablo"
        }
    }
}
