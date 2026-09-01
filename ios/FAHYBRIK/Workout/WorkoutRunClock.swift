import Foundation

/// One clock for the live run — Apple's `HKWorkoutSession.startDate` plus the
/// pause holds of THAT session, plus a disk offset when iOS 18 had to open a
/// new session after process death (there is no `recoverActiveWorkoutSession`
/// on 18).
///
/// Not a homemade Timer. Not `HKWorkoutBuilder.elapsedTime` vs
/// `HKLiveWorkoutBuilder.elapsedTime`. Same formula on every OS we ship.
enum WorkoutRunClock {
    static func elapsed(
        diskOffset: TimeInterval,
        sessionStart: Date?,
        pauseBeganAt: Date?,
        pausedAccumulated: TimeInterval,
        now: Date
    ) -> TimeInterval {
        guard let start = sessionStart else { return max(0, diskOffset) }
        let end = pauseBeganAt ?? now
        let wall = max(0, end.timeIntervalSince(start))
        return max(0, diskOffset + wall - pausedAccumulated)
    }
}
