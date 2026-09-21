import Foundation

// FH-97 / FH-56 — pure lifecycle policy for the one Watch PRIMARY owner.
// Mecanismo = código; tested here because watchOS has no unit-test target.
//
// FH-56: the link to the phone is Apple's, not ours. `Link` is written ONLY by
// `startMirroringToCompanionDevice` (ok / throw), by
// `workoutSession(_:didDisconnectFromRemoteDeviceWithError:)` and by the first
// packet received from the phone. No watchdog, no «connection lost» timer.

enum WatchPrimaryLifecycle {

    enum Phase: Equatable, Sendable {
        case idle
        case recording
        case ending
    }

    /// `.orphan` is gone (FH-56): a recovered PRIMARY is a `.mirror` that
    /// re-mirrors to the phone; whether the phone is there is `Link`, not a role.
    enum Role: Equatable, Sendable {
        case mirror
        case solo
    }

    /// Apple's answer to «is the phone attached to this PRIMARY?».
    enum Link: Equatable, Sendable {
        case mirroring
        /// Not mirroring. The payload is Apple's error description when there is
        /// one (`startMirroringToCompanionDevice` threw, or the remote device
        /// disconnected with an error); nil when Apple gave no reason.
        case unlinked(String?)
    }

    /// What `handle(_:)` / solo start must do with the PRIMARY it finds.
    enum StartAction: Equatable, Sendable {
        /// Clean idle — create the PRIMARY.
        case begin
        /// Compatible PRIMARY already recording for the phone — mirror it again;
        /// never ignore, never end. (States A/B of the FH-56 plan.)
        case remirror
        /// Incompatible recording (other activity / location) or a solo yielding
        /// to the phone — finish SAVING and queue the incoming start.
        case finishThenQueue
        /// Teardown in flight (UI `.ending` or the HK handle still `finishing`)
        /// — queue; fires when Apple reports `.ended`.
        case queue
        /// A solo start cannot preempt a live PRIMARY.
        case decline
    }

    /// Hard UI deadline: athlete ALWAYS leaves recording chrome within this window.
    /// FH-56: this releases the UI only — the HK handle is kept until `.ended`.
    static let teardownDeadlineSeconds: TimeInterval = 5

    /// FH-100 — one idle: no HK session handle and not mid-teardown.
    static func isCleanIdle(phase: Phase, hasSession: Bool) -> Bool {
        phase == .idle && !hasSession
    }

    /// One decision for every incoming start (phone `handle(_:)` or wrist solo).
    static func startAction(
        phase: Phase,
        hasSession: Bool,
        isFinishing: Bool,
        currentRole: Role?,
        incomingRole: Role,
        compatible: Bool
    ) -> StartAction {
        switch phase {
        case .ending:
            return .queue
        case .idle:
            return isFinishing ? .queue : .begin
        case .recording:
            guard hasSession else { return .begin }
            switch incomingRole {
            case .solo:
                return .decline
            case .mirror:
                switch currentRole {
                case .solo: return .finishThenQueue
                case .mirror: return compatible ? .remirror : .finishThenQueue
                case nil: return .begin
                }
            }
        }
    }

    /// End only from live recording — `.ending` is owned by teardown until idle.
    static func acceptsEnd(current: Phase) -> Bool {
        current == .recording
    }

    /// Stuck `.ending` without any handle (live or finishing) — force idle so the
    /// next `startWatchApp` can land.
    static func shouldForceIdleFromStuckEnding(phase: Phase, hasSession: Bool) -> Bool {
        phase == .ending && !hasSession
    }

    /// Mirror HUD vs solo live flow.
    static func showsMirrorHUD(role: Role?) -> Bool {
        role == .mirror
    }

    /// «Sin conexión con el iPhone» — only from Apple's link, only while mirroring.
    static func phoneUnlinked(role: Role?, link: Link) -> Bool {
        role == .mirror && link != .mirroring
    }

    /// A queued start fires only when there is no handle left, live or finishing.
    static func canFirePendingStart(phase: Phase, hasSession: Bool, isFinishing: Bool) -> Bool {
        isCleanIdle(phase: phase, hasSession: hasSession) && !isFinishing
    }
}
