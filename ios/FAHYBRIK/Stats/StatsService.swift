import Foundation
import SwiftUI

// Athlete analytics from GET /api/athlete/analytics (athlete Bearer auth).
//
// APIClient's decoder uses `convertFromSnakeCase`, so snake_case wire fields
// (distance_meters, avg_pace_s_per_km, …) map to these camelCase properties
// automatically. We decode `date` as a raw String and parse it ourselves
// (see RecentExecution.parsedDate) because the backend sends a `YYYY-MM-DD`
// session date, which the APIClient's strict ISO-8601 date strategy rejects —
// letting Codable parse it as `Date` would take the whole payload down.

// MARK: - Wire models

/// One modality's lifetime / window totals (run, row, ski, bike, …).
struct ModalityTotals: Decodable, Identifiable {
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
struct WeeklyVolume: Decodable, Identifiable {
    var id: String { "\(weekStart)·\(modality)" }
    let weekStart: String          // "YYYY-MM-DD" (Monday)
    let modality: String
    let distanceMeters: Double
    let durationSeconds: Double
    let sessions: Int
}

/// A logged workout execution + its per-segment breakdown.
struct RecentExecution: Decodable, Identifiable {
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
struct ExecutionSegment: Decodable, Identifiable {
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
struct AthleteAnalytics: Decodable {
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

// MARK: - Modality classification
//
// The backend's `modality` strings (running / rowing / ski_erg / bike_erg, and
// any future values) map to a small closed set of display traits: a short
// chip label, a brand-consistent color, an SF Symbol, and — crucially — which
// pace convention applies (per-km for running, per-500m for ergometers). This
// is the single source of truth so chips, cards, and charts stay coherent.

// Raw values mirror the backend's canonical modality vocabulary emitted by
// `buildModalityAnalytics` / `normalizeModality` (run | row | ski | bike |
// strength | other). `init(raw:)` also tolerates the long-form aliases
// (running / rowing / ski_erg / bike_erg) so a future server change can't
// silently dump everything into `.other`.
enum AnalyticsModality: String {
    case run
    case row
    case ski
    case bike
    case strength
    case other

    init(raw: String) {
        switch raw.trimmingCharacters(in: .whitespaces).lowercased() {
        case "run", "running":                     self = .run
        case "row", "rowing", "rowerg", "row_erg": self = .row
        case "ski", "skierg", "ski_erg":           self = .ski
        case "bike", "bikeerg", "bike_erg", "cycling": self = .bike
        case "strength", "lift", "weights":        self = .strength
        default:                                   self = .other
        }
    }

    /// Short uppercase chip label (RUN / ROW / SKI / BIKE / FUERZA).
    var shortLabel: String {
        switch self {
        case .run:      return "RUN"
        case .row:      return "ROW"
        case .ski:      return "SKI"
        case .bike:     return "BIKE"
        case .strength: return "FUERZA"
        case .other:    return "OTRO"
        }
    }

    /// Full Spanish name for VoiceOver and card titles.
    var fullName: String {
        switch self {
        case .run:      return "Carrera"
        case .row:      return "Remo"
        case .ski:      return "SkiErg"
        case .bike:     return "BikeErg"
        case .strength: return "Fuerza"
        case .other:    return "Otro"
        }
    }

    var symbol: String {
        switch self {
        case .run:      return "figure.run"
        case .row:      return "figure.rower"
        case .ski:      return "figure.skiing.crosscountry"
        case .bike:     return "figure.indoor.cycle"
        case .strength: return "dumbbell.fill"
        case .other:    return "circle.dotted"
        }
    }

    /// Brand-consistent accent. Orange is reserved for the global accent, so
    /// running owns it (the dominant HYROX modality) and ergs borrow zone hues
    /// to stay distinguishable without inventing new palette entries.
    var color: Color {
        switch self {
        case .run:      return Theme.Color.accent
        case .row:      return HRZone.z2.color   // blue
        case .ski:      return HRZone.z3.color   // green
        case .bike:     return HRZone.z4.color   // amber
        case .strength: return HRZone.z5.color   // red
        case .other:    return Theme.Color.muted
        }
    }

    /// Pace convention for this modality: distance-running shows min/km,
    /// ergometers show the /500 m split. Strength / other have no pace.
    enum PaceKind { case perKm, per500m, none }
    var paceKind: PaceKind {
        switch self {
        case .run:                  return .perKm
        case .row, .ski, .bike:     return .per500m
        case .strength, .other:     return .none
        }
    }
}

// MARK: - Formatting
//
// Centralised so every surface (cards, segment rows, charts, VoiceOver) speaks
// the same units. Pace is m:ss, distance is km (≥1 km) or m, duration is
// h:mm / m:ss depending on magnitude.

enum StatsFormat {
    /// Distance in metres → "32.4 km" (≥1000 m) or "850 m".
    static func distance(_ meters: Double) -> String {
        if meters >= 1000 {
            let km = meters / 1000
            // Drop the decimal for round-ish big values, keep one otherwise.
            if km >= 100 || km.truncatingRemainder(dividingBy: 1) == 0 {
                return "\(Int(km.rounded())) km"
            }
            return String(format: "%.1f km", km)
        }
        return "\(Int(meters.rounded())) m"
    }

    /// Distance split into a big value + small unit, for hero-style cells.
    static func distanceParts(_ meters: Double) -> (value: String, unit: String) {
        if meters >= 1000 {
            let km = meters / 1000
            let v = (km >= 100 || km.truncatingRemainder(dividingBy: 1) == 0)
                ? "\(Int(km.rounded()))"
                : String(format: "%.1f", km)
            return (v, "km")
        }
        return ("\(Int(meters.rounded()))", "m")
    }

    /// Duration → "1:24:30" (h:mm:ss) when ≥1 h, else "42:10" (m:ss).
    static func duration(_ seconds: Double) -> String {
        let total = Int(seconds.rounded())
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, s) }
        return String(format: "%d:%02d", m, s)
    }

    /// Compact duration for dense cells → "5h 12m" / "42m" / "30s".
    static func durationCompact(_ seconds: Double) -> String {
        let total = Int(seconds.rounded())
        let h = total / 3600
        let m = (total % 3600) / 60
        if h > 0 { return m > 0 ? "\(h)h \(m)m" : "\(h)h" }
        if m > 0 { return "\(m)m" }
        return "\(total)s"
    }

    /// Pace seconds-per-unit → "4:35". Unit suffix is supplied by the caller.
    static func pace(_ secondsPerUnit: Double) -> String {
        let total = Int(secondsPerUnit.rounded())
        let m = total / 60
        let s = total % 60
        return String(format: "%d:%02d", m, s)
    }

    /// Pace with its unit suffix for the given modality ("4:35 /km",
    /// "1:52 /500m"). Nil when there is no applicable pace value.
    static func pace(forModality modality: AnalyticsModality,
                     perKm: Double?,
                     per500m: Double?) -> String? {
        switch modality.paceKind {
        case .perKm:
            guard let v = perKm, v > 0 else { return nil }
            return "\(pace(v)) /km"
        case .per500m:
            guard let v = per500m, v > 0 else { return nil }
            return "\(pace(v)) /500m"
        case .none:
            return nil
        }
    }

    /// Whole integer with a unit ("182 W", "28 spm", "412 kcal").
    static func intUnit(_ value: Double, _ unit: String) -> String {
        "\(Int(value.rounded())) \(unit)"
    }

    static func weight(_ kg: Double) -> String {
        if kg.truncatingRemainder(dividingBy: 1) == 0 { return "\(Int(kg)) kg" }
        return String(format: "%.1f kg", kg)
    }

    static func rpe(_ value: Double) -> String {
        if value.truncatingRemainder(dividingBy: 1) == 0 { return "\(Int(value))" }
        return String(format: "%.1f", value)
    }
}

// MARK: - Date parsing
//
// Analytics dates arrive as "YYYY-MM-DD" (session/week dates have no clock
// time). We parse with a fixed POSIX formatter and fall back to full ISO-8601
// so a future timestamped value still resolves. Never guesses on failure.

enum StatsDateParser {
    private static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func parse(_ raw: String) -> Date? {
        if let d = ymd.date(from: raw) { return d }
        return ISO8601DateFormatters.parse(raw)
    }

    /// "lun 2 jun" — short weekday + day + month, Spanish.
    static func shortLabel(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "EEE d MMM"
        return f.string(from: date)
    }

    /// "2 jun" — day + month, for tight chart axes / week labels.
    static func dayMonth(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "d MMM"
        return f.string(from: date)
    }
}
