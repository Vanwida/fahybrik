import Foundation

// Athlete analytics summary from GET /api/athlete/analytics (athlete Bearer auth).
// Relocated here from the deleted Stats/ tab: this envelope still feeds the
// AppDataStore `analytics` slice that Carreras' Rendimiento surfaces, so the model
// + service keep their original names (StatsService.fetchAnalytics, AthleteAnalytics)
// and every caller is untouched. The richer per-section ANALÍTICAS tab lives
// separately under Analytics/ (AnalyticsSection & friends).
//
// APIClient's decoder uses `convertFromSnakeCase`, so snake_case wire fields
// (distance_meters, avg_pace_s_per_km, …) map to these camelCase properties
// automatically. We decode `date` as a raw String and parse it ourselves
// (see RecentExecution.parsedDate) because the backend sends a `YYYY-MM-DD`
// session date, which the APIClient's strict ISO-8601 date strategy rejects —
// letting Codable parse it as `Date` would take the whole payload down.
//
// These are `Codable` (not just `Decodable`) so the analytics slice persists to
// disk via AppDataStore's plain coder: every property is already camelCase, so
// the synthesized encode emits the same keys the plain decode reads back — an
// exact round-trip (the wire's snake_case conversion only applies to the network
// decode through APIClient, never to the on-disk snapshot).

// MARK: - Wire models

/// One modality's lifetime / window totals (run, row, ski, bike, …).
struct ModalityTotals: Codable, Identifiable {
    var id: String { modality }
    let modality: String
    let distanceMeters: Double
    let durationSeconds: Double
    let sessions: Int
    /// Average running pace, seconds per km. Null for non-distance work.
    let avgPaceSPerKm: Double?
    /// Average ergometer split, seconds per 500 m. Null for running.
    let avgPaceSPer500m: Double?
}

/// One (week, modality) volume bucket for the weekly trend.
struct WeeklyVolume: Codable, Identifiable {
    var id: String { "\(weekStart)·\(modality)" }
    let weekStart: String          // "YYYY-MM-DD" (Monday)
    let modality: String
    let distanceMeters: Double
    let durationSeconds: Double
    let sessions: Int
}

/// A logged workout execution + its per-segment breakdown.
struct RecentExecution: Codable, Identifiable {
    var id: String { executionId }
    let executionId: String
    let date: String               // session date, "YYYY-MM-DD"
    let totalDurationSeconds: Double?
    /// RPE 1–10 if the athlete logged it.
    let perceivedExertion: Double?
    let segments: [ExecutionSegment]

    /// Parsed calendar date. Backend sends "YYYY-MM-DD"; we also accept a full
    /// ISO-8601 timestamp defensively. Nil → never guessed, the row just shows
    /// the raw string.
    var parsedDate: Date? {
        StatsDateParser.parse(date)
    }
}

/// One segment of an execution — a single modality effort within a session
/// (e.g. the 1 km run, then the 500 m row). Almost every metric is optional
/// because what's measured depends on the modality and on what the device /
/// athlete actually captured.
struct ExecutionSegment: Codable, Identifiable {
    var id: String { "\(position)·\(modality)" }
    let position: Int
    let modality: String
    let distanceMeters: Double?
    let durationSeconds: Double?
    let avgPaceSPer500m: Double?
    let avgPaceSPerKm: Double?
    let avgPowerW: Double?
    let strokeRateSpm: Double?
    let avgHr: Double?
    let maxHr: Double?
    let calories: Double?
    let repsCompleted: Int?
    let weightUsedKg: Double?
}

/// Top-level analytics envelope.
struct AthleteAnalytics: Codable {
    let byModalityTotals: [ModalityTotals]
    let weekly: [WeeklyVolume]
    let recentExecutions: [RecentExecution]

    /// True when there is genuinely nothing to show — drives the empty state.
    var isEmpty: Bool {
        byModalityTotals.isEmpty && weekly.isEmpty && recentExecutions.isEmpty
    }
}

// MARK: - Service

enum StatsService {
    static func fetchAnalytics(bearer: String) async throws -> AthleteAnalytics {
        try await APIClient.shared.get(path: "api/athlete/analytics", bearer: bearer)
    }
}
