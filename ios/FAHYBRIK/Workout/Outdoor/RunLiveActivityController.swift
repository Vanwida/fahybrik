import Foundation
import ActivityKit

// Owns the outdoor run's Live Activity (#64): start when the run screen opens,
// update from the HUD model on a throttle, end when it closes. SILENTLY degrades
// when Live Activities are unavailable or the athlete disabled them (the run is
// never affected) — every entry point is guarded and swallows failures. Updates are
// rate-limited (ActivityKit budgets pushes): a routine pace/distance refresh waits
// out `minPushInterval`, but a state change (pause, leg) forces an immediate push.

final class RunLiveActivityController {
    private var activity: Activity<RunActivityAttributes>?
    private var lastPushedAt: TimeInterval = 0

    /// Minimum seconds between throttled content pushes. State changes bypass it.
    private static let minPushInterval: TimeInterval = 2

    /// Begin the activity. No-op if one is live, if Live Activities are disabled, or
    /// if the request fails — all degrade silently.
    func start(title: String, initial: RunActivityAttributes.ContentState) {
        guard activity == nil, ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        do {
            activity = try Activity.request(
                attributes: RunActivityAttributes(title: title),
                content: .init(state: initial, staleDate: nil)
            )
        } catch {
            activity = nil
        }
    }

    /// Push a new content state. Throttled unless `force` (a pause/resume or leg
    /// change, which must show at once).
    func update(_ state: RunActivityAttributes.ContentState, force: Bool, now: TimeInterval) {
        guard let activity else { return }
        if !force, now - lastPushedAt < Self.minPushInterval { return }
        lastPushedAt = now
        Task { await activity.update(.init(state: state, staleDate: nil)) }
    }

    /// End + dismiss the activity immediately (run closed).
    func end() {
        guard let activity else { return }
        let finalState = activity.content.state
        Task { await activity.end(.init(state: finalState, staleDate: nil), dismissalPolicy: .immediate) }
        self.activity = nil
    }
}
