import Foundation
import HealthKit

// FH-97 — auth + solo facade. HK PRIMARY mint/recover/end lives on WatchPrimaryOwner.

@MainActor
final class LiveWorkoutSession: ObservableObject {
    var onHeartRate: ((Int) -> Void)?
    var onDistanceDelta: ((Double) -> Void)?

    private let store = HKHealthStore()

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

    func start(
        activityType: HKWorkoutActivityType,
        locationType: HKWorkoutSessionLocationType,
        reuseIfPresent: Bool = false
    ) {
        let config = HKWorkoutConfiguration()
        config.activityType = activityType
        config.locationType = locationType
        let owner = WatchPrimaryOwner.shared
        owner.onHeartRate = onHeartRate
        owner.onDistanceDelta = onDistanceDelta
        owner.startSolo(configuration: config, reuseIfPresent: reuseIfPresent)
    }

    func pause() {
        WatchPrimaryOwner.shared.pause()
    }

    func resume() {
        WatchPrimaryOwner.shared.resume()
    }

    func syncActivity(_ plan: WatchHKActivityPlan) {
        WatchPrimaryOwner.shared.syncSoloActivity(plan)
    }

    @discardableResult
    func end() async -> String? {
        await WatchPrimaryOwner.shared.endPrimary(save: true)
    }
}
