import Foundation
import HealthKit

// MARK: - HealthKit connection flag (single source of truth)
//
// Whether the athlete has connected Apple Health. HealthKit never reveals READ
// authorization status (only share/write), so we persist this best-effort flag
// when a request() returns successfully — see HealthKitPermissions' note and the
// connect flow in ProfileView. Centralised here so every surface that needs to
// know "is Health connected" reads ONE key, never a duplicated literal.
enum HealthKitConnection {
    static let connectedKey = "healthkit_connected"

    /// Best-effort: true once the athlete granted (or was presented) the Health
    /// permission sheet via the in-app connect flow. Never a guarantee that a
    /// specific READ type was allowed — HealthKit doesn't expose that.
    static var isConnected: Bool {
        UserDefaults.standard.bool(forKey: connectedKey)
    }

    /// Flips the connected flag AND starts the same sync pipeline AppRoot uses.
    /// The two must happen together: the flag alone gates AppRoot's relaunch sync,
    /// so setting it without calling connect() leaves the athlete "connected" and
    /// uploading nothing until the next cold launch — which is exactly the bug the
    /// onboarding step had. Single source for the sequence so the three surfaces
    /// that offer the connect (Perfil, día-1, onboarding) can never drift again.
    ///
    /// `connect()` (not `start()`) resets anchors and re-pulls the recent window, so
    /// an athlete who widens their Health permissions later recovers the history.
    /// Pass `bearer` when the caller holds it; the onboarding surfaces don't, so
    /// they fall back to the Keychain session token (same one AuthState reads).
    static func markConnectedAndSync(bearer: String? = nil) async throws {
        HealthKitSyncService.shared.configure(
            bearer: bearer ?? KeychainTokenStore.shared.read(),
            athleteId: AuthState.persistedAthleteId()
        )
        try await HealthKitSyncService.shared.connect()
        UserDefaults.standard.set(true, forKey: connectedKey)
    }
}

// MARK: - Today's step count (display-local read)
//
// Reads TODAY's cumulative step count from HealthKit for DISPLAY only — no
// upload, no observers, no anchors (that pipeline is HealthKitSyncService's job).
// Steps are an all-day movement signal surfaced on Inicio beyond training.
//
// HealthKit's privacy model never reveals READ authorization, so we don't try to
// infer it: the result is simply "how many steps HealthKit will give us today".
// The caller pairs `.noData` with `HealthKitConnection.isConnected` to choose
// between an honest connect-prompt and a muted no-data state — never a fake
// number. On the Simulator `isHealthDataAvailable()` is false → `.unavailable`.
enum HealthKitStepsReader {
    enum Reading: Equatable {
        case steps(Int)   // HealthKit returned a same-day cumulative sum > 0
        case noData       // available + query succeeded, but no samples today
        case unavailable  // HealthKit not available (e.g. Simulator / iPad)
    }

    /// Sum of `.stepCount` from the start of the local day to now. Async wrapper
    /// over HKStatisticsQuery so the caller can `await` it from a SwiftUI `.task`.
    static func todaySteps() async -> Reading {
        guard HKHealthStore.isHealthDataAvailable(),
              let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
            return .unavailable
        }

        let store = HKHealthStore()
        let startOfDay = Calendar.current.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(
            withStart: startOfDay,
            end: Date(),
            options: .strictStartDate
        )

        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: stepType,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum
            ) { _, statistics, _ in
                guard let sum = statistics?.sumQuantity() else {
                    // No samples today (no data, denied read, or Simulator).
                    continuation.resume(returning: .noData)
                    return
                }
                let steps = Int(sum.doubleValue(for: .count()).rounded())
                continuation.resume(returning: steps > 0 ? .steps(steps) : .noData)
            }
            store.execute(query)
        }
    }
}
