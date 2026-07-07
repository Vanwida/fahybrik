import SwiftUI

struct DailyReadinessPayload: Codable {
    let score: Int
    let recordedFor: String
    let delta7d: Int?
    /// What fed the score — the inputs the coach engine used. Present since the
    /// endpoint always returns a `breakdown`; optional for forward/backward
    /// compatibility and for cached payloads from before this field shipped.
    /// Mirrors shared/domain/coach/athlete-daily-readiness.ts `ReadinessBreakdown`.
    let breakdown: ReadinessBreakdown?
    /// Ascending (oldest→today) 0–100 score series for the detail sheet's mini
    /// chart. Nil on payloads from before this shipped (and on the coach reader);
    /// the sheet hides the trend section when it has fewer than two points.
    let trend: [ReadinessTrendPoint]?

    // The app decodes with a GLOBAL `.convertFromSnakeCase`, which maps the wire
    // key `delta_7d` → `delta7D` (a letter right after a digit gets capitalized).
    // The synthesized `delta7d` key never matched that, so the 7-day delta silently
    // dropped (and the Inicio card's "N en 7 días" pill went quiet). We KEEP the
    // API field `delta_7d` and pin this coding key to the strategy's converted
    // spelling; the rest already equal their converted form.
    private enum CodingKeys: String, CodingKey {
        case score
        case recordedFor
        case delta7d = "delta7D"
        case breakdown
        case trend
    }
}

/// One day of the readiness trend — the persisted score for a calendar day.
/// Snake_case wire (`recorded_for`) maps via APIClient's convertFromSnakeCase.
struct ReadinessTrendPoint: Codable {
    let recordedFor: String   // yyyy-MM-dd, athlete-local
    let score: Int
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

    // Raw inputs the detail sheet renders as "value vs reference". Optional: nil
    // from snapshots/payloads that predate them, so the sheet hides what's absent.
    // These are surfaced from the compute, not recomputed — and there is
    // deliberately NO personal RHR baseline nor sleep media in the model, so the
    // RHR row shows a value without a reference and sleep's reference is the target.
    /// The day's mean HRV in ms (the "value" next to `hrvBaselineMs`).
    let hrvMs: Double?
    /// The athlete's 14–60d HRV baseline in ms (the "reference").
    let hrvBaselineMs: Double?
    /// The resting-HR reading in bpm (the "value"; no personal baseline exists).
    let rhrBpm: Double?
    /// The sleep hours that score a full component — the sleep "reference".
    let sleepTargetH: Double?

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

// MARK: - Readiness zone (single source of the athlete-side thresholds)
//
// The recovery bucket for a 0–100 readiness score — the ONE place the athlete
// surfaces derive their thresholds, ring color and plain-language read, so the
// Inicio card and the detail sheet can never drift. Buckets MIRROR
// web/lib/dashboard/constants/readiness.ts (ok ≥ 67 · caution 45–66 · low < 45),
// matching the coach's own bucketing.
enum ReadinessZone {
    case high, medium, low

    /// Lower bound of the "recovered" bucket (mirrors READINESS_OK_MIN).
    static let okMin = 67
    /// Lower bound of the "partial" bucket (mirrors READINESS_CAUTION_MIN).
    static let cautionMin = 45

    static func of(score: Int) -> ReadinessZone {
        if score >= okMin { return .high }
        if score >= cautionMin { return .medium }
        return .low
    }

    /// Ring / accent color for the score (green · amber · red).
    var color: Color {
        switch self {
        case .high:   return Theme.Color.ok
        case .medium: return Theme.Color.warning
        case .low:    return Theme.Color.danger
        }
    }

    /// One-line body-STATE read (never a training prescription).
    var interpretation: String {
        switch self {
        case .high:   return "Recuperado y listo"
        case .medium: return "Recuperación parcial"
        case .low:    return "Cuerpo cargado"
        }
    }

    /// Deterministic guidance under the ring — zone × whether the athlete has a
    /// session scheduled today. Natural Barcelona Spanish; never prescribes beyond
    /// "apretar / controlado / aflojar".
    func guidance(hasSessionToday: Bool) -> String {
        switch (self, hasSessionToday) {
        case (.high, true):
            return "Buen día para apretar — llega fuerte a la sesión de hoy."
        case (.high, false):
            return "Estás fresco. Si te apetece moverte, hoy es buen día."
        case (.medium, true):
            return "Puedes con la sesión de hoy — hazla a ritmo controlado y deja el extra para mañana."
        case (.medium, false):
            return "Día de mantener: muévete suave y prioriza dormir esta noche."
        case (.low, true):
            return "Hoy toca aflojar: recorta volumen o baja el ritmo. Tu cuerpo pide recuperar."
        case (.low, false):
            return "Día de recuperar: descansa, hidrátate y duerme."
        }
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
