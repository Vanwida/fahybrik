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

    static func request() async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else { return false }
        let store = HKHealthStore()
        do {
            try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
            return true
        } catch {
            return false
        }
    }
}
