import Foundation

struct DailyReadinessPayload: Codable {
    let score: Int
    let recordedFor: String
    let delta7d: Int?
    /// What fed the score — the inputs the coach engine used. Present since the
    /// endpoint always returns a `breakdown`; optional for forward/backward
    /// compatibility and for cached payloads from before this field shipped.
    /// Mirrors shared/domain/coach/athlete-daily-readiness.ts `ReadinessBreakdown`.
    let breakdown: ReadinessBreakdown?
}

/// The readiness inputs and their normalized component scores (0–100), so Inicio
/// can show an honest "what's feeding your score" mini-breakdown. Each is null
/// when that signal isn't available (no check-in / no wearable). Snake_case wire
/// fields (`sub_score`, `hrv_component`, `sleep_hours`, …) map automatically via
/// APIClient's convertFromSnakeCase decoder.
struct ReadinessBreakdown: Codable {
    /// Morning check-in subjective score (0–100). Drives the score when no
    /// wearable signal exists.
    let subScore: Double?
    let subScoreWeight: Double?
    /// Normalized HRV component (0–100) vs the athlete's baseline. Nil with no
    /// recent HRV.
    let hrvComponent: Double?
    /// Raw sleep duration in hours (real value, not a component) — displayable.
    let sleepHours: Double?
    let sleepComponent: Double?
    /// Normalized resting-HR component (0–100). Nil with no recent resting HR.
    let rhrComponent: Double?
    let recoveryComponent: Double?
    let compliance7d: Double?

    /// Whether the morning check-in contributed (the primary signal for athletes
    /// without a connected wearable).
    var hasCheckin: Bool { subScore != nil }
    var hasHRV: Bool { hrvComponent != nil }
    var hasSleep: Bool { sleepHours != nil }
    var hasRestingHR: Bool { rhrComponent != nil }
}

struct DailyReadinessResponse: Decodable {
    // Null when the athlete has no real readiness signal yet (no check-in and no
    // wearable data). The backend never invents a score — Today shows an honest
    // empty state in that case.
    let readiness: DailyReadinessPayload?
}

enum ReadinessService {
    /// Returns nil when there is no readiness data yet (honest empty state).
    static func fetchToday(bearer: String) async throws -> DailyReadinessPayload? {
        let resp: DailyReadinessResponse = try await APIClient.shared.get(
            path: "api/athlete/readiness/today",
            bearer: bearer
        )
        return resp.readiness
    }
}

// MARK: - Biometric trend (Biometría screen)
//
// The athlete's most relevant biometric trend over recent weeks — the "proof
// you're advancing" signal. NOT loaded by Inicio (which is built around
// running-analysis): a screen that shows the trend loads this slice itself. The
// backend (GET /api/athlete/biometrics/trend)
// returns whichever metrics actually have recent real history (HRV / VO₂max /
// resting HR / sleep), in priority order; `metrics` is empty when there's no
// recent data. The view picks the first metric present and hides the element
// when there are none — never a fabricated number.

struct BioTrendPoint: Codable {
    let isoDate: String
    let value: Double
}

struct BiometricMetricSeries: Codable, Identifiable {
    var id: String { key }
    let key: String            // hrv | vo2max | resting_hr | sleep
    let label: String          // ES label, e.g. "VO₂ máx"
    let unit: String           // "ms" | "" | "ppm" | "h"
    let higherIsBetter: Bool
    let points: [BioTrendPoint] // chronological, only days with a reading
    let latest: Double
    let baseline: Double?
    let direction: String       // up | down | flat

    /// Whether the latest move is an IMPROVEMENT (direction aligned with the
    /// metric's "better" axis). Flat → false (no improvement claim).
    var isImproving: Bool {
        switch direction {
        case "up":   return higherIsBetter
        case "down": return !higherIsBetter
        default:     return false
        }
    }
    /// Whether the trend is meaningfully moving at all (not flat).
    var isMoving: Bool { direction == "up" || direction == "down" }
}

struct BiometricTrend: Codable {
    let days: Int
    let metrics: [BiometricMetricSeries]

    /// The metric to surface — the first (highest-priority) one with data.
    var primary: BiometricMetricSeries? { metrics.first }
}

struct BiometricTrendResponse: Decodable {
    let trend: BiometricTrend?
}

enum BiometricTrendService {
    /// Returns nil only on an empty envelope; an athlete with no recent data
    /// yields a `BiometricTrend` with an empty `metrics` array (honest empty).
    static func fetch(bearer: String) async throws -> BiometricTrend? {
        let resp: BiometricTrendResponse = try await APIClient.shared.get(
            path: "api/athlete/biometrics/trend",
            bearer: bearer
        )
        return resp.trend
    }
}
