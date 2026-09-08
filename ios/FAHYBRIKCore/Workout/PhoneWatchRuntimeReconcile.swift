import Foundation

// Phone ↔ Watch runtime asymmetry — pure decision logic (unit-tested).
//
// Symptom: wrist holds HK PRIMARY (or mirror recording) while the iPhone has no
// live cover / tracked session → stable split. Recovery: reopen from a fresh
// WorkoutStateStore snapshot OR end the wrist session cleanly — never leave both
// sides disagreeing indefinitely.

enum PhoneWatchRuntimeReconcile {

    enum Action: Equatable, Sendable {
        case none
        /// Fresh disk snapshot exists — reopen the same WorkoutContainer cover.
        case reopenFromSnapshot
        /// No honest phone state to restore — tell the wrist to stop recording.
        case endWristCleanly
    }

    /// Whether the phone side still claims an active wrist/mirror/HK hang-off
    /// without a live UI owner (`LiveWorkoutResume` cover or tracked engine).
    static func wristClaimsActiveSession(
        mirrorJoined: Bool,
        hasMirroredHKSession: Bool,
        phoneRunSessionActive: Bool
    ) -> Bool {
        mirrorJoined || hasMirroredHKSession || phoneRunSessionActive
    }

    /// Foreground / launch reconcile on the iPhone.
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

    /// Watch orphan PRIMARY with no phone coach frames — end when the day is
    /// already marked done on the pushed payload (phone finished elsewhere).
    static func watchOrphanShouldEnd(
        modeIsOrphan: Bool,
        todayMarkedDone: Bool,
        standalonePhaseIdle: Bool
    ) -> Bool {
        guard modeIsOrphan, standalonePhaseIdle else { return false }
        return todayMarkedDone
    }
}
