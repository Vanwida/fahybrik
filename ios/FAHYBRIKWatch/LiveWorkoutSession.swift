import Foundation
import HealthKit

// HKWorkoutSession + HKLiveWorkoutBuilder wrapper. Owns the HR / kcal /
// distance live stream that LiveWorkoutView renders. On end() we save the
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
    @Published private(set) var elapsedSeconds: TimeInterval = 0

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var startDate: Date?
    private var tickTimer: Timer?

    // MARK: - Start / pause / resume / end

    func start(activityType: HKWorkoutActivityType) {
        guard !isActive else { return }
        let config = HKWorkoutConfiguration()
        config.activityType = activityType
        config.locationType = .unknown

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
                    self?.startDate = start
                    self?.startTickTimer()
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

    func end() {
        session?.end()
    }

    // MARK: - Tick loop for elapsed time

    private func startTickTimer() {
        tickTimer?.invalidate()
        let t = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let start = self.startDate, !self.isPaused else { return }
                self.elapsedSeconds = Date().timeIntervalSince(start)
            }
        }
        RunLoop.main.add(t, forMode: .common)
        tickTimer = t
    }

    // MARK: - Display formatters

    var formattedElapsed: String {
        let total = Int(elapsedSeconds)
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, s) }
        return String(format: "%d:%02d", m, s)
    }

    var formattedDistance: String {
        if distanceMeters >= 1000 {
            return String(format: "%.2f km", distanceMeters / 1000)
        }
        return "\(Int(distanceMeters)) m"
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
            guard let self, toState == .ended, let builder = self.builder else { return }
            do {
                try await builder.endCollection(at: endDate)
                _ = try await builder.finishWorkout()
            } catch {
                // Best-effort: even if the save fails the local timer should
                // stop so the UI returns to the brief screen.
            }
            self.reset()
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didFailWithError error: Error
    ) {
        Task { @MainActor [weak self] in
            self?.reset()
        }
    }

    @MainActor
    private func reset() {
        tickTimer?.invalidate()
        tickTimer = nil
        session = nil
        builder = nil
        startDate = nil
        isActive = false
        isPaused = false
        heartRate = 0
        activeKcal = 0
        distanceMeters = 0
        elapsedSeconds = 0
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
            }
        case HKQuantityType(.activeEnergyBurned):
            if let q = stats.sumQuantity() {
                activeKcal = q.doubleValue(for: .kilocalorie())
            }
        case HKQuantityType(.distanceWalkingRunning):
            if let q = stats.sumQuantity() {
                distanceMeters = q.doubleValue(for: .meter())
            }
        default:
            break
        }
    }
}
