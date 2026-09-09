import Foundation

// FH-99 — Create ≠ Start. Saving or scheduling another workout never ends the
// live one. Only launching a second LIVE session while one is already up needs
// an explicit athlete choice.

enum LiveLaunchPolicy {

    /// True when the athlete is trying to START live while another live owner exists.
    static func blocksStartingLive(hasLiveCoverOrTracked: Bool) -> Bool {
        hasLiveCoverOrTracked
    }

    /// Create / save / schedule — never gated by a paused snapshot or soft-leave.
    static func blocksCreatingPlan(hasLiveCoverOrTracked: Bool) -> Bool {
        _ = hasLiveCoverOrTracked
        return false
    }
}
