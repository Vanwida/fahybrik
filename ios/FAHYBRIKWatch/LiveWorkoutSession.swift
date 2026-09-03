import Foundation
import HealthKit

// Auth + facade. Does not mint `HKWorkoutSession`. The Watch PRIMARY owner is
// `MirrorSessionController` (create / adopt / recover / end).
@MainActor
final class LiveWorkoutSession: ObservableObject {
    var onHeartRate: ((Int) -> Void)?
    var onDistanceDelta: ((Double) -> Void)?

    private let store = HKHealthStore()

    /// The HealthKit types the live recording reads and shares — single source so
    /// solo and mirror request identical permissions.
    static let workoutDataTypes: Set<HKSampleType> = [
        HKObjectType.workoutType(),
        HKQuantityType(.heartRate),
        HKQuantityType(.activeEnergyBurned),
        HKQuantityType(.distanceWalkingRunning)
    ]

    static func requestWorkoutAuthorization(store: HKHealthStore) async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        try? await store.requestAuthorization(toShare: workoutDataTypes, read: workoutDataTypes)
    }

    func requestAuthorization() async {
        await Self.requestWorkoutAuthorization(store: store)
    }

    /// Asks the one PRIMARY owner. Does not call `HKWorkoutSession(...)`.
    func start(
        activityType: HKWorkoutActivityType,
        locationType: HKWorkoutSessionLocationType,
        reuseIfPresent: Bool = false
    ) {
        let config = HKWorkoutConfiguration()
        config.activityType = activityType
        config.locationType = locationType
        let owner = MirrorSessionController.shared
        owner.onHeartRate = onHeartRate
        owner.onDistanceDelta = onDistanceDelta
        owner.startSolo(configuration: config, reuseIfPresent: reuseIfPresent)
    }

    func pause() {
        MirrorSessionController.shared.pausePrimary()
    }

    func resume() {
        MirrorSessionController.shared.resumePrimary()
    }

    func syncActivity(_ plan: WatchHKActivityPlan) {
        MirrorSessionController.shared.syncSoloActivity(plan)
    }

    @discardableResult
    func end() async -> String? {
        await MirrorSessionController.shared.endPrimary(save: true)
    }
}
