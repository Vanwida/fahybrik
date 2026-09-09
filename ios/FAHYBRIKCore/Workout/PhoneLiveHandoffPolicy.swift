import Foundation

// FH-97 — phone ↔ watch handoff decisions (pure, unit-tested on iOS).

enum PhoneLiveHandoffPolicy {

    /// One `startWatchApp` loop per phone session begin.
    static func shouldLaunchWatch(
        didLaunch: Bool,
        wristJoined: Bool,
        hasSession: Bool,
        runEnvironmentResolved: Bool,
        activityKindIsRunning: Bool
    ) -> Bool {
        guard hasSession else { return false }
        if activityKindIsRunning, !runEnvironmentResolved { return false }
        return !didLaunch && !wristJoined
    }

    /// Stage end when mirror channel is not up yet; flush on adopt.
    static func shouldStagePendingEnd(mirroredSessionPresent: Bool) -> Bool {
        !mirroredSessionPresent
    }

    /// Late adopt after phone already finished — discard wrist recording immediately.
    static func adoptShouldDiscardImmediately(
        pendingEndSave: Bool?,
        sessionFinished: Bool,
        hasLiveEngine: Bool
    ) -> Bool {
        if pendingEndSave != nil { return false }
        if !hasLiveEngine { return true }
        return sessionFinished
    }

    /// Athlete ended on wrist — phone must not send a second MirrorEnd.
    static func phoneEndIsNoOp(wristFinishedByAthlete: Bool) -> Bool {
        wristFinishedByAthlete
    }
}
