import Foundation

/// Apple `HKLiveWorkoutBuilder.elapsedTime` on wrist PRIMARY.
///
/// The watch reads it inside `WorkoutSession.tick()` so session time matches
/// HealthKit — wired from `WatchWorkoutCoordinator`, read only on watchOS. The
/// iPhone has no HK session of its own (FH-56): its clock is the engine's.
enum WatchWorkoutClock {
    static var appleElapsed: (() -> TimeInterval?)?
}
