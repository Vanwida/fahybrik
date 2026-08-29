import Foundation
import HealthKit

// HKWorkoutSession + HKLiveWorkoutBuilder wrapper. Owns the HR / kcal /
// distance live stream, piped into the WorkoutSession engine by the coordinator
// (onHeartRate / onDistanceDelta). On end() we save the
// workout to HealthKit so the iPhone HealthKitSyncService picks it up via
// the existing HKObserverQuery and forwards to the FAHYBRIK backend — no
// duplicate transport path from the watch.
@MainActor
final class LiveWorkoutSession: NSObject, ObservableObject {
    @Published private(set) var isActive: Bool = false
    @Published private(set) var isPaused: Bool = false
    @Published private(set) var heartRate: Double = 0
    @Published private(set) var activeKcal: Double = 0
    @Published private(set) var distanceMeters: Double = 0

    /// LO QUE LLEVA GRABADO ESTA SESIÓN, SEGÚN APPLE.
    ///
    /// No es un `@Published` movido por un timer nuestro, y ahí estaba el fallo:
    /// había un `Timer` de 1 Hz calculando `Date() - startDate` para publicar este
    /// número. Un segundo reloj, con su propia idea de la pausa (miraba
    /// `isPaused`, que es nuestro, no el de la sesión de HealthKit) y sin un solo
    /// lector — las vistas leen el crono del motor, que es el que sabe de tramos,
    /// descansos y auto-pausa.
    ///
    /// `HKLiveWorkoutBuilder.elapsedTime` (watchOS 5) es lo que Apple deriva del
    /// contenido del builder: la misma cifra que verá el HKWorkout guardado. El
    /// crono que LEE el atleta sigue siendo el del motor; esto es la duración de
    /// la GRABACIÓN, y sólo hay un sitio de donde sacarla.
    var elapsedSeconds: TimeInterval { builder?.elapsedTime ?? 0 }

    // Live-metric hooks. The workout coordinator sets these to pipe the HealthKit
    // stream straight into the WorkoutSession engine: each new HR reading and each
    // incremental distance delta as they arrive. Kept as closures (no Combine) so
    // the coordinator owns the wiring and this stays a thin HK wrapper.
    var onHeartRate: ((Int) -> Void)?
    var onDistanceDelta: ((Double) -> Void)?
    /// Cumulative distance last reported to `onDistanceDelta`, so we emit only the
    /// in-window increment (HK distance is cumulative across the workout).
    private var lastReportedDistance: Double = 0

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    /// Resumed once the HKWorkout is saved (or the save fails), so `end()` can hand
    /// the finished workout's UUID back to the coordinator for the execution's
    /// `source_workout_ref`. The save happens on the session-state delegate, off the
    /// call that ended the session — a continuation bridges that gap.
    private var endContinuation: CheckedContinuation<String?, Never>?
    /// HK session being dropped so the phone can own. Its `.ended` must not save.
    private var abandonedSession: HKWorkoutSession?

    // MARK: - Authorization

    /// The HealthKit types the live recording reads and shares — single source so
    /// the standalone and mirror paths request identical permissions (mirror mode
    /// reuses this via `requestWorkoutAuthorization(store:)`, never a second copy).
    static let workoutDataTypes: Set<HKSampleType> = [
        HKObjectType.workoutType(),
        HKQuantityType(.heartRate),
        HKQuantityType(.activeEnergyBurned),
        HKQuantityType(.distanceWalkingRunning)
    ]

    /// Request the permissions a live/mirror recording needs on the given store.
    /// Safe to call repeatedly. Shared entry point for both wrist recording paths.
    static func requestWorkoutAuthorization(store: HKHealthStore) async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        try? await store.requestAuthorization(toShare: workoutDataTypes, read: workoutDataTypes)
    }

    /// Request the HealthKit permissions the live session needs BEFORE the first
    /// start (the engine never asks). Read+share HR / active energy / distance and
    /// share the workout itself so the saved HKWorkout carries them and the iPhone
    /// HealthKitSyncService can forward it. Safe to call repeatedly.
    func requestAuthorization() async {
        await Self.requestWorkoutAuthorization(store: store)
    }

    // MARK: - Start / pause / resume / end

    /// `locationType` VIENE DECLARADO, no se supone. Es la pista con la que watchOS
    /// decide si la distancia la MIDE con el GPS del reloj o la ESTIMA con el
    /// acelerómetro, así que dejarlo en `.unknown` —como estaba— era entregar a una
    /// heurística la diferencia entre un ritmo medido y uno inventado. Lo resuelve
    /// `WorkoutLocationType`, la misma regla que usa el espejo desde el teléfono.
    func start(activityType: HKWorkoutActivityType, locationType: HKWorkoutSessionLocationType) {
        guard !isActive else { return }
        let config = HKWorkoutConfiguration()
        config.activityType = activityType
        config.locationType = locationType

        do {
            let session = try HKWorkoutSession(healthStore: store, configuration: config)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            session.delegate = self
            builder.delegate = self
            self.session = session
            self.builder = builder

            let start = Date()
            session.startActivity(with: start)
            builder.beginCollection(withStart: start) { [weak self] _, _ in
                Task { @MainActor in
                    self?.isActive = true
                }
            }
        } catch {
            // No surface to user yet — log only. Real handling can show an
            // alert overlay once we have one.
        }
    }

    func pause() {
        session?.pause()
        isPaused = true
    }

    func resume() {
        session?.resume()
        isPaused = false
    }

    /// Drop the HK session without writing a workout. The phone is now the
    /// engine: a leftover HKWorkout would be a second owner in Salud.
    func abandon() {
        let ending = session
        abandonedSession = ending
        ending?.end()
        reset()
    }

    /// End the HK session and return the saved HKWorkout's UUID string (nil when
    /// there was no live session, or the save failed). Awaits the actual
    /// `finishWorkout` on the session-state delegate so the id is real before the
    /// coordinator tags + relays the execution with it.
    @discardableResult
    func end() async -> String? {
        guard session != nil else { return nil }
        return await withCheckedContinuation { continuation in
            endContinuation = continuation
            session?.end()
        }
    }

}

// MARK: - HKWorkoutSessionDelegate

extension LiveWorkoutSession: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        let endDate = date
        Task { @MainActor [weak self] in
            guard let self, toState == .ended else { return }
            if workoutSession === self.abandonedSession {
                self.abandonedSession = nil
                self.finishEnd(returning: nil)
                return
            }
            guard let builder = self.builder else { return }
            var savedWorkoutId: String? = nil
            do {
                try await builder.endCollection(at: endDate)
                let workout = try await builder.finishWorkout()
                savedWorkoutId = workout?.uuid.uuidString
            } catch {
                // Best-effort: even if the save fails the local timer should
                // stop so the UI returns to the brief screen.
            }
            self.finishEnd(returning: savedWorkoutId)
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didFailWithError error: Error
    ) {
        Task { @MainActor [weak self] in
            // A mid-session failure ends it with no saved workout; still resume any
            // `end()` await so the coordinator's finalize can't hang.
            self?.finishEnd(returning: nil)
        }
    }

    /// Reset local state and resume a pending `end()` await with the saved id.
    @MainActor
    private func finishEnd(returning savedWorkoutId: String?) {
        let continuation = endContinuation
        endContinuation = nil
        reset()
        continuation?.resume(returning: savedWorkoutId)
    }

    @MainActor
    private func reset() {
        session = nil
        builder = nil
        isActive = false
        isPaused = false
        heartRate = 0
        activeKcal = 0
        distanceMeters = 0
        lastReportedDistance = 0
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension LiveWorkoutSession: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        for type in collectedTypes {
            guard let qType = type as? HKQuantityType else { continue }
            let stats = workoutBuilder.statistics(for: qType)
            Task { @MainActor [weak self] in
                self?.apply(stats: stats, type: qType)
            }
        }
    }

    @MainActor
    private func apply(stats: HKStatistics?, type: HKQuantityType) {
        guard let stats else { return }
        switch type {
        case HKQuantityType(.heartRate):
            if let q = stats.mostRecentQuantity() {
                heartRate = q.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
                if heartRate > 0 { onHeartRate?(Int(heartRate.rounded())) }
            }
        case HKQuantityType(.activeEnergyBurned):
            if let q = stats.sumQuantity() {
                activeKcal = q.doubleValue(for: .kilocalorie())
            }
        case HKQuantityType(.distanceWalkingRunning):
            if let q = stats.sumQuantity() {
                distanceMeters = q.doubleValue(for: .meter())
                let delta = distanceMeters - lastReportedDistance
                if delta > 0 {
                    lastReportedDistance = distanceMeters
                    onDistanceDelta?(delta)
                }
            }
        default:
            break
        }
    }
}
