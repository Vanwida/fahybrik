import Foundation
import WatchConnectivity

// iPhone-side bridge that pushes the day's planned workout to the watch
// via WCSession.updateApplicationContext. Application context overwrites
// itself, which is the right semantics for "current day's workout" — we
// don't want a stale queue building up on the watch.
//
// Activated from AppRoot on every authenticated launch; refreshes on
// every PlanService.fetchWeek success via push(plan:). When the watch is
// not paired or the iPhone is offline, calls are no-ops — the watch
// shows the empty state until we successfully push.
final class WatchConnectivityiOSService: NSObject, WCSessionDelegate {
    static let shared = WatchConnectivityiOSService()

    private override init() { super.init() }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        if session.delegate == nil { session.delegate = self }
        if session.activationState != .activated {
            session.activate()
        }
    }

    /// Push the day's workout to the watch. Pass nil to clear.
    func pushWorkoutForToday(_ workout: WatchWorkoutPayload?) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        guard session.isPaired, session.isWatchAppInstalled else { return }

        do {
            let payload: [String: Any]
            if let workout {
                let data = try JSONEncoder().encode(workout)
                payload = try (JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
            } else {
                payload = [:]
            }
            try session.updateApplicationContext(payload)
        } catch {
            // Silent; watch will keep last known good context.
        }
    }

    // MARK: - WCSessionDelegate (stubs — iPhone is the producer here)

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        // Re-activate so we keep receiving paired-state changes between watches.
        WCSession.default.activate()
    }
}

// Watch-side WatchPlannedWorkout mirror, snake_case Codable so the same
// JSON shape is decoded on both ends. Keep this in sync with the watch
// target's WatchPlannedWorkout.
struct WatchWorkoutPayload: Codable, Equatable {
    let id: String
    let title: String
    let focus: String?
    let duration_minutes: Int
    let intensity_label: String?
    let activity_kind: String
}
