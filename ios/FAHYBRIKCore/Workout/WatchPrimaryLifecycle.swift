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

    /// FH-100 — one idle: no HK session handle and not mid-teardown.
    static func isCleanIdle(phase: Phase, hasSession: Bool) -> Bool {
        phase == .idle && !hasSession
    }

    /// Idempotent start: only clean idle accepts a new PRIMARY.
    static func acceptsStart(current: Phase, hasSession: Bool, standaloneActive: Bool, role: Role) -> Bool {
        guard isCleanIdle(phase: current, hasSession: hasSession) else { return false }
        if role == .mirror, standaloneActive { return false }
        return true
    }

    /// End only from live recording — `.ending` is owned by teardown until idle.
    static func acceptsEnd(current: Phase) -> Bool {
        current == .recording
    }

    /// Stuck `.ending` without progress — force idle so the next `startWatchApp` can land.
    static func shouldForceIdleFromStuckEnding(phase: Phase, hasSession: Bool) -> Bool {
        phase == .ending && !hasSession
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
