import Foundation
import HealthKit

// Minimal plan model on the watch side. The iPhone sends this via
// WatchConnectivity (WCSession applicationContext) and the watch renders
// the next workout. Snake_case keys mirror the iOS API shape so we can
// reuse the same JSON encoder/decoder on both ends.
struct WatchPlannedWorkout: Codable, Equatable {
    let id: String
    let title: String
    let focus: String?
    let duration_minutes: Int
    let intensity_label: String?
    let activity_kind: String  // "running" | "strength" | "hyrox" | "mixed"

    var durationLabel: String {
        let h = duration_minutes / 60
        let m = duration_minutes % 60
        if h > 0 { return "\(h)h \(m)m" }
        return "\(m) min"
    }

    var intensityLabel: String {
        intensity_label ?? "—"
    }

    var healthKitActivityType: HKWorkoutActivityType {
        switch activity_kind {
        case "running":  return .running
        case "strength": return .functionalStrengthTraining
        case "hyrox":    return .functionalStrengthTraining
        case "mixed":    return .mixedCardio
        default:         return .other
        }
    }
}

@MainActor
final class WatchPlanModel: ObservableObject {
    static let shared = WatchPlanModel()

    @Published private(set) var workoutForToday: WatchPlannedWorkout? = nil

    private let key = "fahybrik.watch.plan.today"

    private init() {
        load()
    }

    func update(from payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        if let decoded = try? JSONDecoder().decode(WatchPlannedWorkout.self, from: data) {
            workoutForToday = decoded
            persist(data)
        } else if payload.isEmpty {
            workoutForToday = nil
            UserDefaults.standard.removeObject(forKey: key)
        }
    }

    private func persist(_ data: Data) {
        UserDefaults.standard.set(data, forKey: key)
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: key) else { return }
        workoutForToday = try? JSONDecoder().decode(WatchPlannedWorkout.self, from: data)
    }
}
