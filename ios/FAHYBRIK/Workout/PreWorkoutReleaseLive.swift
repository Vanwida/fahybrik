import SwiftUI

// FH-95 / FH-96 — the ONE pre-live ▶ EMPEZAR action. Called only from
// PreWorkoutBriefView in readyToStart mode (after Devices hub).
// Apple: one workout intent → one PRIMARY → one mirror channel. Only `release`
// calls `PhoneLiveSession.begin` / `startWatchApp`. `prepWatchRecording` is
// UI-only (watch card spinner) — a second `begin` on ▶ EMPEZAR must never re-mint.

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
        PhoneLiveSession.shared.begin(session: staging, activityKind: activityKind)
        return staging
    }

    /// Optional early watch prep — stamps run env for release, drives the watch
    /// card UI, does NOT call `begin` / `startWatchApp` (FH-96).
    @MainActor
    static func prepWatchRecording(
        staging: WorkoutSession,
        answers: SessionStartAnswers,
        activityKind: String,
        stampSession: ((WorkoutSession) -> Void)?
    ) {
        staging.runEnvironment = answers.runEnvironment
        stampSession?(staging)
        PhoneLiveSession.shared.noteWatchPrepIntent()
    }
}
