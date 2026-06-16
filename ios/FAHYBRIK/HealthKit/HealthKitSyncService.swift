import Foundation
import HealthKit

// HealthKit observer + transform + batch upload pipeline.
//
// Strategy:
//   1. start() registers HKObserverQuery on workouts + HR + HRV + RHR + sleep
//      + bodyMass + VO2Max + activeEnergy.
//   2. Each fire pulls new samples since last anchor, transforms to DTO matching
//      shared/schema/biometrics.ts, and POSTs `/api/sync/healthkit`.
//   3. If POST fails, the batch is queued via RequestQueue and replayed later.
//   4. Anchor is persisted to UserDefaults per type.
//
// Backend `/api/sync/healthkit` is built by another agent later. Until then,
// every batch lands on the queue and replays on next reachability.
final class HealthKitSyncService {
    static let shared = HealthKitSyncService()
    static let endpointPath = "/api/sync/healthkit"

    private let store = HKHealthStore()
    private var observerQueries: [HKObserverQuery] = []
    private var bearer: String? = nil
    private var athleteId: String? = nil

    private static let anchorKeyPrefix = "fahybrik.hk.anchor."

    func configure(bearer: String?, athleteId: String?) {
        self.bearer = bearer
        self.athleteId = athleteId
    }

    func start() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        observeWorkouts()
        observeQuantity(.heartRate, metric: "heart_rate", unit: HKUnit(from: "count/min"))
        observeQuantity(.heartRateVariabilitySDNN, metric: "hrv_sdnn", unit: .secondUnit(with: .milli))
        observeQuantity(.restingHeartRate, metric: "resting_heart_rate", unit: HKUnit(from: "count/min"))
        observeQuantity(.vo2Max, metric: "vo2_max", unit: HKUnit(from: "ml/kg*min"))
        observeQuantity(.activeEnergyBurned, metric: "active_energy_kcal", unit: .kilocalorie())
        observeQuantity(.bodyMass, metric: "body_mass_kg", unit: .gramUnit(with: .kilo))
    }

    func stop() {
        observerQueries.forEach { store.stop($0) }
        observerQueries.removeAll()
    }

    // MARK: - Workouts

    private func observeWorkouts() {
        let workoutType = HKObjectType.workoutType()
        let query = HKObserverQuery(sampleType: workoutType, predicate: nil) { [weak self] _, completionHandler, error in
            defer { completionHandler() }
            guard error == nil, let self else { return }
            Task { await self.flushWorkouts() }
        }
        store.execute(query)
        observerQueries.append(query)
        store.enableBackgroundDelivery(for: workoutType, frequency: .immediate) { _, _ in }
    }

    private func flushWorkouts() async {
        let anchor = readAnchor(for: "workouts")
        let descriptor = HKAnchoredObjectQueryDescriptor(
            predicates: [.workout()],
            anchor: anchor,
            limit: HKObjectQueryNoLimit
        )

        do {
            let result = try await descriptor.result(for: store)
            let workouts = result.addedSamples
            guard !workouts.isEmpty else {
                writeAnchor(result.newAnchor, for: "workouts")
                return
            }
            let dtos = workouts.map { transform(workout: $0) }
            await sendBatch(workouts: dtos, samples: [])
            writeAnchor(result.newAnchor, for: "workouts")
        } catch {
            // Failure path — leave anchor unchanged so next observer fire re-tries.
        }
    }

    private func transform(workout: HKWorkout) -> HKWorkoutDTO {
        let iso = ISO8601DateFormatter()
        let lapEvents = workout.workoutEvents?.filter {
            $0.type == .lap || $0.type == .segment || $0.type == .marker
        } ?? []
        let laps = lapEvents.map { ev -> HKWorkoutLapDTO in
            let kind: String
            switch ev.type {
            case .lap: kind = "lap"
            case .segment: kind = "segment"
            default: kind = "marker"
            }
            let start = ev.dateInterval.start
            let end = ev.dateInterval.end
            return HKWorkoutLapDTO(
                started_at: iso.string(from: start),
                ended_at: iso.string(from: end),
                duration_seconds: end.timeIntervalSince(start),
                event_kind: kind
            )
        }

        // Apple ships these identifiers, so the lookups never fail in practice —
        // but a force-unwrap is a latent crash. Resolve once; if an identifier is
        // ever nil, the corresponding metric stays nil (DTO fields are optional)
        // instead of trapping.
        let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)
        let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate)
        let bpmUnit = HKUnit(from: "count/min")

        let energy = energyType.flatMap { workout.statistics(for: $0) }?
            .sumQuantity()?.doubleValue(for: .kilocalorie())
        let distance = workout.totalDistance?.doubleValue(for: .meter())
        let avgHR = heartRateType.flatMap { workout.statistics(for: $0) }?
            .averageQuantity()?.doubleValue(for: bpmUnit)
        let maxHR = heartRateType.flatMap { workout.statistics(for: $0) }?
            .maximumQuantity()?.doubleValue(for: bpmUnit)

        return HKWorkoutDTO(
            source_workout_id: workout.uuid.uuidString,
            workout_activity_type: Int(workout.workoutActivityType.rawValue),
            started_at: iso.string(from: workout.startDate),
            ended_at: iso.string(from: workout.endDate),
            duration_seconds: workout.duration,
            total_energy_burned_kcal: energy,
            total_distance_meters: distance,
            avg_heart_rate_bpm: avgHR,
            max_heart_rate_bpm: maxHR,
            lap_markers: laps,
            source: "healthkit"
        )
    }

    // MARK: - Quantity types

    private func observeQuantity(_ id: HKQuantityTypeIdentifier, metric: String, unit: HKUnit) {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return }
        let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
            defer { completionHandler() }
            guard error == nil, let self else { return }
            Task { await self.flushQuantity(type: type, metric: metric, unit: unit) }
        }
        store.execute(query)
        observerQueries.append(query)
        store.enableBackgroundDelivery(for: type, frequency: .immediate) { _, _ in }
    }

    private func flushQuantity(type: HKQuantityType, metric: String, unit: HKUnit) async {
        let key = metric
        let anchor = readAnchor(for: key)

        let descriptor = HKAnchoredObjectQueryDescriptor(
            predicates: [.quantitySample(type: type)],
            anchor: anchor,
            limit: 500
        )

        do {
            let result = try await descriptor.result(for: store)
            let samples = result.addedSamples
            let iso = ISO8601DateFormatter()
            let dtos: [HKBiometricSampleDTO] = samples.map { s in
                HKBiometricSampleDTO(
                    metric_type: metric,
                    recorded_at: iso.string(from: s.startDate),
                    value_numeric: s.quantity.doubleValue(for: unit),
                    unit: unitString(for: metric),
                    source: "healthkit",
                    source_workout_id: nil
                )
            }
            if !dtos.isEmpty {
                await sendBatch(workouts: [], samples: dtos)
            }
            writeAnchor(result.newAnchor, for: key)
        } catch {
            // Leave anchor for retry
        }
    }

    private func unitString(for metric: String) -> String {
        switch metric {
        case "heart_rate", "resting_heart_rate": return "bpm"
        case "hrv_sdnn": return "ms"
        case "vo2_max": return "ml/kg/min"
        case "active_energy_kcal": return "kcal"
        case "body_mass_kg": return "kg"
        default: return ""
        }
    }

    // MARK: - Send

    private func sendBatch(workouts: [HKWorkoutDTO], samples: [HKBiometricSampleDTO]) async {
        guard !workouts.isEmpty || !samples.isEmpty else { return }
        let batch = HKSyncBatch(
            athlete_id: athleteId,
            sent_at: ISO8601DateFormatter().string(from: Date()),
            workouts: workouts,
            samples: samples
        )

        struct Wrapper: Encodable {
            let batch: HKSyncBatch
        }
        let wrapper = Wrapper(batch: batch)

        do {
            try await APIClient.shared.postRaw(path: Self.endpointPath, body: wrapper, bearer: bearer)
        } catch {
            if let body = try? JSONEncoder().encode(wrapper) {
                await RequestQueue.shared.enqueue(
                    path: Self.endpointPath,
                    body: body,
                    bearer: bearer
                )
            }
        }
    }

    // MARK: - Anchor persistence

    private func readAnchor(for key: String) -> HKQueryAnchor? {
        guard let data = UserDefaults.standard.data(forKey: Self.anchorKeyPrefix + key) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }

    private func writeAnchor(_ anchor: HKQueryAnchor?, for key: String) {
        guard let anchor else { return }
        if let data = try? NSKeyedArchiver.archivedData(
            withRootObject: anchor,
            requiringSecureCoding: true
        ) {
            UserDefaults.standard.set(data, forKey: Self.anchorKeyPrefix + key)
        }
    }
}
