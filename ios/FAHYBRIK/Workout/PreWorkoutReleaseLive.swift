import SwiftUI

// FH-95 / FH-96 — the ONE pre-live ▶ EMPEZAR action. Called only from
// PreWorkoutBriefView in readyToStart mode (after Devices hub).
// Apple: one workout intent → one PRIMARY → one mirror channel. Only `release`
// calls `PhoneLiveSession.begin` / `startWatchApp`, and it does so ALWAYS: the
// watch opens by itself when the athlete taps ▶ EMPEZAR, with nothing to ask.
// (The old «Preparar grabación en el reloj» button connected nothing: it only
// drew a spinner, and is gone. See docs/DECISIONS.md 2026-09-29.)

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
        // FH-56 — the coach-plan hang-off id is stamped here, once; the iPhone
        // mints no HK session (the wrist is PRIMARY, adopted via the handler).
        if staging.hkSessionUUID == nil { staging.hkSessionUUID = UUID() }
        PhoneLiveSession.shared.begin(session: staging, activityKind: activityKind)
        return staging
    }
}
