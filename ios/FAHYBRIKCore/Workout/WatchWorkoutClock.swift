import Foundation

/// Apple `HKLiveWorkoutBuilder.elapsedTime` on wrist PRIMARY.
///
/// iOS reads `PhoneWorkoutRun.elapsedTime` inside `WorkoutSession.tick()` so session
/// time matches HealthKit. The watch uses this hook the same way — wired from
/// `WatchWorkoutCoordinator`, read only on watchOS.
enum WatchWorkoutClock {
    static var appleElapsed: (() -> TimeInterval?)?
}
