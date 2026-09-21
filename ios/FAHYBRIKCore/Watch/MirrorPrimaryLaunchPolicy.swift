import Foundation
import HealthKit

// FH-96 / FH-56 — one workout intent → one PRIMARY. What is left here is the
// only HealthKit-typed question the watch asks about an incoming `handle(_:)`:
// is it the same workout the PRIMARY is already recording? The decision itself
// lives in `WatchPrimaryLifecycle.startAction` (pure, tested). The old
// `shouldIgnoreRedundantStart` / `shouldFinishBeforeRestart` decided with a
// homemade «mirror alive» watchdog; Apple's link replaced it (FH-56).

enum MirrorPrimaryLaunchPolicy {

    static func configurationsCompatible(
        _ current: HKWorkoutConfiguration,
        _ incoming: HKWorkoutConfiguration
    ) -> Bool {
        current.activityType == incoming.activityType
            && current.locationType == incoming.locationType
    }
}
