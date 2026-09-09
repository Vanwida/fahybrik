import Foundation

// FH-97 — pure lifecycle policy for the one Watch PRIMARY owner.
// Mecanismo = código; tested here because watchOS has no unit-test target.

enum WatchPrimaryLifecycle {

    enum Phase: Equatable, Sendable {
        case idle
        case recording
        case ending
    }

    enum Role: Equatable, Sendable {
        case mirror
        case solo
        case orphan
    }

    /// Hard UI deadline: athlete ALWAYS leaves recording chrome within this window.
    static let teardownDeadlineSeconds: TimeInterval = 5

    /// Idempotent start: only `.idle` accepts a new PRIMARY.
    static func acceptsStart(current: Phase, standaloneActive: Bool, role: Role) -> Bool {
        guard current == .idle else { return false }
        if role == .mirror, standaloneActive { return false }
        return true
    }

    /// End is idempotent while already ending or idle-without-session.
    static func acceptsEnd(current: Phase, isTeardownRunning: Bool) -> Bool {
        guard current == .recording else { return false }
        return !isTeardownRunning
    }

    /// Mirror HUD vs solo live flow.
    static func showsMirrorHUD(role: Role?) -> Bool {
        role == .mirror || role == .orphan
    }

    /// Orphan PRIMARY should stop when the phone marked the day done.
    static func orphanShouldEnd(
        role: Role?,
        todayMarkedDone: Bool,
        standalonePhaseIdle: Bool
    ) -> Bool {
        guard role == .orphan, standalonePhaseIdle else { return false }
        return todayMarkedDone
    }
}
