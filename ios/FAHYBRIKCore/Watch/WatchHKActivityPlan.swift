import HealthKit

/// What HealthKit must be doing for THIS piece — not for the day.
///
/// `HKWorkoutSession.locationType` is immutable on the session that opened the
/// day. A mixed / HYROX day therefore starts indoor (`WorkoutLocationType.resolve`
/// on the day kind). A run piece inside that day needs a running activity with
/// its own location (`beginNewActivity`), or Apple never emits
/// `distanceWalkingRunning` outdoors.
struct WatchHKActivityPlan: Equatable {
    var isRunPiece: Bool
    var activityType: HKWorkoutActivityType
    var locationType: HKWorkoutSessionLocationType
    /// Outdoor running only. Indoor never turns `CLLocationManager` on.
    var wantsGPS: Bool
    /// Collect `distanceWalkingRunning` for any run piece (street or dumb treadmill).
    var collectDistance: Bool

    var configuration: HKWorkoutConfiguration {
        let config = HKWorkoutConfiguration()
        config.activityType = activityType
        config.locationType = locationType
        return config
    }

    static let distanceType = HKQuantityType(.distanceWalkingRunning)

    static func make(
        pieceIsRun: Bool,
        dayActivityKind: String?,
        environment: RunEnvironment?
    ) -> WatchHKActivityPlan {
        let location = WorkoutLocationType.resolve(
            pieceIsRun: pieceIsRun,
            dayActivityKind: dayActivityKind,
            environment: environment
        )
        let activity: HKWorkoutActivityType = pieceIsRun
            ? .running
            : WorkoutLocationType.activityType(for: dayActivityKind)
        return WatchHKActivityPlan(
            isRunPiece: pieceIsRun,
            activityType: activity,
            locationType: location,
            wantsGPS: pieceIsRun && location == .outdoor,
            collectDistance: pieceIsRun
        )
    }

    // Apple: HKLiveWorkoutDataSource is watchOS 5 / iOS 26. This file compiles
    // into the iPhone target via FAHYBRIKCore (deploy 18.0). The helper is the
    // Watch API that already compiles in FAHYBRIKWatch; the Plan itself stays
    // on both targets. Not an 18/26 split of who owns the Primary session.
#if os(watchOS)
    static func enableDistanceCollection(on dataSource: HKLiveWorkoutDataSource) {
        dataSource.enableCollection(for: distanceType, predicate: nil)
    }
#endif

    /// Incremental meters from a cumulative `distanceWalkingRunning` sum.
    /// Nil when Apple has not moved — never a 0 to paint as a reading.
    static func distanceDelta(fromCumulative current: Double, lastReported: Double) -> Double? {
        let delta = current - lastReported
        return delta > 0 ? delta : nil
    }
}
