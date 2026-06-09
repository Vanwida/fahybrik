import Foundation
import HealthKit

enum HealthKitPermissions {
    static let readTypes: Set<HKObjectType> = {
        var s: Set<HKObjectType> = []
        s.insert(HKObjectType.workoutType())
        if let t = HKObjectType.quantityType(forIdentifier: .heartRate) { s.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) { s.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .restingHeartRate) { s.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .vo2Max) { s.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { s.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .bodyMass) { s.insert(t) }
        if let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { s.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .runningPower) { s.insert(t) }
        return s
    }()

    static let shareTypes: Set<HKSampleType> = {
        var s: Set<HKSampleType> = []
        s.insert(HKObjectType.workoutType())
        if let t = HKObjectType.quantityType(forIdentifier: .heartRate) { s.insert(t) }
        return s
    }()

    /// HealthKit's privacy model NEVER tells the app whether the user granted
    /// READ access — `requestAuthorization` succeeds even if every read type is
    /// denied. So a successful return means only "the permission sheet was
    /// presented (or already answered)", which we treat as connected. We throw
    /// only when authorization genuinely fails: HealthKit unavailable on the
    /// device, or `requestAuthorization` itself errors (e.g. missing the
    /// `com.apple.developer.healthkit` entitlement / unprovisioned App ID).
    enum AuthError: Error {
        case unavailable
    }

    static func request() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw AuthError.unavailable }
        let store = HKHealthStore()
        try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
    }
}
