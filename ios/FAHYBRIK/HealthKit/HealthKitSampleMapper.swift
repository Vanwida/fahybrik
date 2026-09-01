import Foundation
import HealthKit

// DE MUESTRA DE HEALTHKIT A DTO DE LA API, EN UN SOLO SITIO.
//
// Lo usan los dos caminos que leen Salud: la sincronización viva
// (`HealthKitSyncService`, anclada, hacia delante) y el barrido del histórico
// (`HealthKitHistoryWindowReader`, por ventanas de fecha, hacia atrás). Si cada uno
// construyera su DTO, el pasado y el presente del mismo atleta podrían llegar con
// unidades o agrupaciones distintas y nadie se enteraría hasta ver una gráfica rara.
enum HealthKitSampleMapper {

    // MARK: - Entrenos

    static func workout(_ workout: HKWorkout) -> HKWorkoutDTO {
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

    // MARK: - Métricas de cantidad

    /// Never re-ingest what WE wrote. `HealthKitWorkoutWriter` stamps the energy /
    /// distance / heart-rate samples it attaches to a phone-recorded workout; without
    /// this filter each of them would come straight back through the observer as if a
    /// device had measured it, and the athlete's active energy would be counted twice.
    /// Samples from the watch app (a different writer) carry no stamp and flow normally.
    static func measuredOnly(_ samples: [HKQuantitySample]) -> [HKQuantitySample] {
        samples.filter { $0.metadata?[HealthKitWorkoutWriter.writtenHereKey] == nil }
    }

    static func quantitySamples(
        _ samples: [HKQuantitySample],
        metric: String,
        unit: HKUnit
    ) -> [HKBiometricSampleDTO] {
        let iso = ISO8601DateFormatter()
        return samples.map { s in
            HKBiometricSampleDTO(
                metric_type: metric,
                recorded_at: iso.string(from: s.startDate),
                value_numeric: s.quantity.doubleValue(for: unit),
                unit: unitString(for: metric),
                source: "healthkit",
                source_workout_id: nil
            )
        }
    }

    static func unitString(for metric: String) -> String {
        switch metric {
        case "heart_rate", "resting_heart_rate": return "bpm"
        case "hrv_sdnn": return "ms"
        case "vo2_max": return "ml/kg/min"
        case "active_energy_kcal": return "kcal"
        case "body_mass_kg": return "kg"
        case "step_count": return "count"
        default: return ""
        }
    }

    // MARK: - Sueño

    /// Groups asleep segments by night (keyed on the local day the athlete woke —
    /// the sample's end date), merges overlapping intervals per night so concurrent
    /// samples from multiple sources are never double-counted, and emits one nightly
    /// `sleep_duration` DTO. Value = asleep seconds (the unit the backend expects —
    /// see ingest-garmin.ts + biometric-trend.ts, which divides by 3600 for hours).
    static func sleepNights(from samples: [HKCategorySample]) -> [HKBiometricSampleDTO] {
        let asleep = asleepCategoryValues
        let calendar = Calendar.current
        var nights: [Date: [(start: Date, end: Date)]] = [:]
        for s in samples where asleep.contains(s.value) {
            let nightDay = calendar.startOfDay(for: s.endDate)
            nights[nightDay, default: []].append((s.startDate, s.endDate))
        }

        let iso = ISO8601DateFormatter()
        return nights.compactMap { nightDay, intervals -> HKBiometricSampleDTO? in
            let seconds = mergedDurationSeconds(intervals)
            guard seconds > 0 else { return nil }
            return HKBiometricSampleDTO(
                metric_type: "sleep_duration",
                recorded_at: iso.string(from: nightDay),
                value_numeric: seconds,
                unit: "seconds",
                source: "healthkit",
                source_workout_id: nil
            )
        }
    }

    /// Total covered time (seconds) of a set of intervals with overlaps merged.
    static func mergedDurationSeconds(_ intervals: [(start: Date, end: Date)]) -> Double {
        let sorted = intervals.sorted { $0.start < $1.start }
        var total: Double = 0
        var current: (start: Date, end: Date)? = nil
        for iv in sorted where iv.end > iv.start {
            if var cur = current, iv.start <= cur.end {
                if iv.end > cur.end { cur.end = iv.end }
                current = cur
            } else {
                if let cur = current { total += cur.end.timeIntervalSince(cur.start) }
                current = iv
            }
        }
        if let cur = current { total += cur.end.timeIntervalSince(cur.start) }
        return total
    }

    /// Category values that count as "asleep" (excludes inBed and awake).
    /// Deployment target is iOS 18, so the granular iOS 16 stages are always
    /// available; `.asleepUnspecified` is the same raw value the pre-iOS-16
    /// `.asleep` used, so legacy samples are covered too.
    static let asleepCategoryValues: Set<Int> = [
        HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
        HKCategoryValueSleepAnalysis.asleepCore.rawValue,
        HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
        HKCategoryValueSleepAnalysis.asleepREM.rawValue,
    ]
}
