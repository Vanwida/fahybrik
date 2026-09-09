import SwiftUI

// FH-95 — the ONE pre-live ▶ EMPEZAR action. Called only from PreWorkoutBriefView
// in readyToStart mode (after Devices hub). Mirror/HK `begin` runs ON tap — the
// wrist joins asynchronously per Apple (startWatchApp → mirrored session); it
// must NEVER grey out Empezar waiting for wristJoined first.

enum PreWorkoutReleaseLive {

    /// Stamps run env, starts phone mirror (non-blocking), returns the live session.
    @MainActor
    static func release(
        staging: WorkoutSession,
        answers: SessionStartAnswers,
        activityKind: String,
        stampSession: ((WorkoutSession) -> Void)?
    ) -> WorkoutSession {
        staging.runEnvironment = answers.runEnvironment
        stampSession?(staging)
        staging.ensurePhoneWorkoutRun()
        PhoneMirrorService.shared.begin(session: staging, activityKind: activityKind)
        return staging
    }

    /// Optional early watch prep — same HK path, does not start the live engine.
    @MainActor
    static func prepWatchRecording(
        staging: WorkoutSession,
        answers: SessionStartAnswers,
        activityKind: String,
        stampSession: ((WorkoutSession) -> Void)?
    ) {
        staging.runEnvironment = answers.runEnvironment
        stampSession?(staging)
        PhoneMirrorService.shared.begin(session: staging, activityKind: activityKind)
    }
}
