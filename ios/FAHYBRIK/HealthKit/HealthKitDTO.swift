import Foundation

// Wire-format DTO matching shared/schema/biometrics.ts BiometricStream + workout summary.
// snake_case explicit so the API body is stable regardless of encoder strategy.
struct HKBiometricSampleDTO: Codable {
    let metric_type: String
    let recorded_at: String   // ISO8601
    let value_numeric: Double
    let unit: String
    let source: String        // "healthkit"
    let source_workout_id: String?
}

struct HKWorkoutDTO: Codable {
    let source_workout_id: String         // HKWorkout.uuid.uuidString
    let workout_activity_type: Int        // HKWorkoutActivityType raw
    let started_at: String                // ISO8601
    let ended_at: String                  // ISO8601
    let duration_seconds: Double
    let total_energy_burned_kcal: Double?
    let total_distance_meters: Double?
    let avg_heart_rate_bpm: Double?
    let max_heart_rate_bpm: Double?
    let lap_markers: [HKWorkoutLapDTO]
    let source: String                    // "healthkit"
}

struct HKWorkoutLapDTO: Codable {
    let started_at: String
    let ended_at: String
    let duration_seconds: Double
    let event_kind: String                // "lap" | "segment" | "marker"
}

struct HKSyncBatch: Codable {
    let athlete_id: String?
    let sent_at: String
    let workouts: [HKWorkoutDTO]
    let samples: [HKBiometricSampleDTO]
}
