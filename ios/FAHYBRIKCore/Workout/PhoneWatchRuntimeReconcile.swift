import Foundation

// Phone ↔ Watch runtime asymmetry — pure decision logic (unit-tested).
//
// Symptom: wrist holds an HK PRIMARY mirrored to this phone while the iPhone
// has no live cover / tracked session → stable split. Recovery: reopen from a
// fresh WorkoutStateStore snapshot OR end the wrist session SAVING — never
// leave both sides disagreeing indefinitely, never throw the athlete's
// recording away (FH-56).

enum PhoneWatchRuntimeReconcile {

    enum Action: Equatable, Sendable {
        case none
        /// Fresh disk snapshot exists — reopen the same WorkoutContainer cover.
        case reopenFromSnapshot
        /// No honest phone state to restore — tell the wrist to stop recording (saving).
        case endWristCleanly
    }

    /// Foreground / launch reconcile on the iPhone. `wristClaimsActive` is the
    /// mirrored HK session Apple handed us (`PhoneLiveSession.hasMirroredHKSession`).
    static func phoneAction(
        hasLiveCoverOrTracked: Bool,
        wristClaimsActive: Bool,
        hasFreshSnapshot: Bool
    ) -> Action {
        guard !hasLiveCoverOrTracked else { return .none }
        guard wristClaimsActive else { return .none }
        if hasFreshSnapshot { return .reopenFromSnapshot }
        return .endWristCleanly
    }
}
