import Foundation

// FH-97 / FH-56 — phone ↔ watch handoff decisions (pure, unit-tested on iOS).
// The phone is coach, not connector: it asks the wrist for the PRIMARY ONCE per
// intent (`startWatchApp`), adopts whatever Apple hands back, and never decides
// on its own that a recording is worthless.

enum PhoneLiveHandoffPolicy {

    /// What the phone does with a mirrored session Apple just handed over.
    enum AdoptAction: Equatable, Sendable {
        /// Live coach engine — frame it.
        case coach
        /// No engine in this process but a fresh coach plan on disk — reopen the
        /// SAME cover (`LiveWorkoutResume`), then `begin` links it.
        case reopenFromDisk
        /// No engine and nothing to reopen (or the engine already finished) —
        /// end the wrist recording SAVING. The recording is the athlete's;
        /// the phone never discards it on adopt (FH-56, Owner P0 #2).
        case endSaving
    }

    /// ONE `startWatchApp` per intent. No retry loop, no generation counter,
    /// no permanent latch: a second `begin` on the same session is a no-op,
    /// a bound channel means the wrist is already there.
    static func shouldRequestWatchPrimary(
        alreadyRequested: Bool,
        channelBound: Bool,
        hasEngine: Bool,
        runEnvironmentResolved: Bool,
        activityKindIsRunning: Bool
    ) -> Bool {
        guard hasEngine, !alreadyRequested, !channelBound else { return false }
        if activityKindIsRunning, !runEnvironmentResolved { return false }
        return true
    }

    /// Stage end when mirror channel is not up yet; flush on adopt.
    static func shouldStagePendingEnd(mirroredSessionPresent: Bool) -> Bool {
        !mirroredSessionPresent
    }

    /// Adopt links and does not judge — except to pick where the coach plan is.
    static func adoptAction(
        hasEngine: Bool,
        engineFinished: Bool,
        hasFreshSnapshot: Bool
    ) -> AdoptAction {
        if hasEngine { return engineFinished ? .endSaving : .coach }
        return hasFreshSnapshot ? .reopenFromDisk : .endSaving
    }

    /// Athlete ended on wrist — phone must not send a second MirrorEnd.
    static func phoneEndIsNoOp(wristFinishedByAthlete: Bool) -> Bool {
        wristFinishedByAthlete
    }
}
