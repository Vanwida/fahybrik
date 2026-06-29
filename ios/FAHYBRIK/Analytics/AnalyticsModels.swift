import SwiftUI

// ANALYTICS — wire models (the iOS Codable mirror of
// web/lib/athlete/analytics/core.ts). Two design patterns run through every
// section: a PERIOD SELECTOR (7d/mes/año/custom = the `where` window) and
// DRILL-DOWN (every aggregate opens its REAL source sessions). No number is ever
// fabricated: an unmeasurable metric is null with an honest `availability` tag.
//
// Codable convention (matches CarrerasService / RunningAnalysis): the APIClient
// decoder uses `.convertFromSnakeCase`, which rewrites each wire key to camelCase
// BEFORE matching the CodingKey. So multi-word snake_case properties carry an
// explicit CodingKey mapped to the post-conversion (camelCase) form — which ALSO
// keeps the on-disk round-trip (AppDataStore's plain camelCase coder) consistent.
// Single-word keys match as-is.

// MARK: - Honesty model (the doc's 5-tag legend)

enum Availability: String, Codable, Hashable {
    case real
    case needs_logging
    case needs_wearable
    case field
    case gate

    // `.convertFromSnakeCase` only rewrites KEYS, never VALUES, so the wire string
    // "needs_logging" arrives verbatim and matches the rawValue. Decode
    // defensively: an unforeseen tag degrades to the honest "more logging" reading
    // rather than throwing and taking the whole section down.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Availability(rawValue: raw) ?? .needs_logging
    }

    /// Short ES chip label.
    var label: String {
        switch self {
        case .real:           return "Real"
        case .needs_logging:  return "Más registro"
        case .needs_wearable: return "Wearable"
        case .field:          return "Datos del campo"
        case .gate:           return "Puerta"
        }
    }

    /// Chip tint role.
    var color: Color {
        switch self {
        case .real:           return Theme.Color.ok
        case .needs_logging:  return Theme.Color.warning
        case .needs_wearable: return Theme.Color.info
        case .field:          return Theme.Color.modalityStrength
        case .gate:           return Theme.Color.neutral
        }
    }
}

// MARK: - Section + period keys

enum AnalyticsSectionKey: String, Codable, CaseIterable, Identifiable, Hashable {
    case running, ergo, strength, hyrox, recovery
    var id: String { rawValue }

    /// Section-nav pill label (Carrera first/biggest, then the rest).
    var navLabel: String {
        switch self {
        case .running:  return "Carrera"
        case .ergo:     return "Ergo"
        case .strength: return "Fuerza"
        case .hyrox:    return "HYROX"
        case .recovery: return "Recup."
        }
    }
}

enum AnalyticsPeriodKey: String, Codable, CaseIterable, Hashable {
    case sevenD = "7d"
    case month
    case year
    case custom

    /// Segmented-control label.
    var label: String {
        switch self {
        case .sevenD: return "7 días"
        case .month:  return "Mes"
        case .year:   return "Año"
        case .custom: return "Custom"
        }
    }
}

/// The resolved window the section + its drill-downs share. `from`/`to` only set
/// for a custom range. Hashable so it keys the in-memory section cache.
struct AnalyticsPeriod: Hashable, Codable {
    var key: AnalyticsPeriodKey
    var from: String? = nil   // YYYY-MM-DD (custom only)
    var to: String? = nil     // YYYY-MM-DD (custom only)

    static let `default` = AnalyticsPeriod(key: .month)

    /// Stable cache discriminator (custom ranges cache per from/to).
    var cacheSuffix: String { "\(key.rawValue):\(from ?? "")-\(to ?? "")" }

    /// Query fragment appended to the section / drilldown requests.
    var query: String {
        var q = "period=\(key.rawValue)"
        if key == .custom, let from, let to {
            q += "&from=\(from)&to=\(to)"
        }
        return q
    }
}

// MARK: - Resolved period (echoed by the API)

struct ResolvedPeriod: Codable, Hashable {
    let key: String
    let start_iso: String
    let end_iso: String
    let label_es: String
    let days: Int

    enum CodingKeys: String, CodingKey {
        case key
        case start_iso = "startIso"
        case end_iso = "endIso"
        case label_es = "labelEs"
        case days
    }
}

// MARK: - Drill reference (a tappable aggregate's link to its real source rows)

struct DrillRef: Codable, Hashable {
    let kind: String
    /// Whitelisted params (type/zone/distance/modality/slug/race_id/metric). NOTE:
    /// the snake-case-converting decoder may camelCase a multi-word param KEY
    /// (`race_id` → `raceId`); we snake-case the keys back when re-sending, so the
    /// endpoint's snake_case whitelist always matches (see AnalyticsService).
    let params: [String: String]
    /// The REAL number of source rows behind the number (never padded).
    let count: Int
    let label_es: String

    enum CodingKeys: String, CodingKey {
        case kind, params, count
        case label_es = "labelEs"
    }
}

// MARK: - Card pieces

struct CardRow: Codable, Hashable, Identifiable {
    let id: String
    let label: String
    let value: String?
    let sub: String?
    let accent: Bool
    let drill: DrillRef?
}

struct CardSeriesPoint: Codable, Hashable, Identifiable {
    let id: String
    /// Normalised 0..1 bar height (taller = bigger magnitude).
    let height: Double
    let display: String?
    /// The most-recent / current point, accented in the UI.
    let current: Bool
    let label: String?
}

struct CardZone: Codable, Hashable, Identifiable {
    let code: String
    let label: String
    /// Hex (e.g. "#34c46a") or token name; resolved by AnalyticsColor.zone(...).
    let color: String
    let value: String?
    /// Share of the period 0..100, null when not a distribution.
    let pct: Double?
    let drill: DrillRef?

    var id: String { code }
}

struct CardPrimary: Codable, Hashable {
    let value: String?
    let unit: String?
    let side: CardSide?
}

struct CardSide: Codable, Hashable {
    let value: String
    let label: String
}

struct AnalyticsCard: Codable, Hashable, Identifiable {
    let id: String
    let title_es: String
    let availability: Availability
    let availability_note: String?
    let primary: CardPrimary?
    let rows: [CardRow]
    let series: [CardSeriesPoint]
    let zones: [CardZone]
    let meaning_es: String?
    let drill: DrillRef?

    enum CodingKeys: String, CodingKey {
        case id
        case title_es = "titleEs"
        case availability
        case availability_note = "availabilityNote"
        case primary, rows, series, zones
        case meaning_es = "meaningEs"
        case drill
    }
}

struct AnalyticsSection: Codable, Hashable {
    let section: AnalyticsSectionKey
    let title_es: String
    let availability: Availability
    let period: ResolvedPeriod
    let cards: [AnalyticsCard]

    enum CodingKeys: String, CodingKey {
        case section
        case title_es = "titleEs"
        case availability, period, cards
    }
}

// MARK: - Drill-down result

struct SourceSession: Codable, Hashable, Identifiable {
    let id: String
    /// YYYY-MM-DD of the session/test/race. Null only for an undated import.
    let date: String?
    let title_es: String
    let detail_es: String?
    let value: String?
    let value_label: String?

    enum CodingKeys: String, CodingKey {
        case id, date
        case title_es = "titleEs"
        case detail_es = "detailEs"
        case value
        case value_label = "valueLabel"
    }
}

struct DrillSummary: Codable, Hashable, Identifiable {
    let id: String
    let value: String
    let label: String
    let accent: Bool
}

struct DrillDownResult: Codable, Hashable {
    let kind: String
    let title_es: String
    let subtitle_es: String?
    let summary: [DrillSummary]
    let sessions: [SourceSession]
    /// The real table the rows came from — shown in the sheet footer.
    let source_table: String
    let period: ResolvedPeriod

    enum CodingKeys: String, CodingKey {
        case kind
        case title_es = "titleEs"
        case subtitle_es = "subtitleEs"
        case summary, sessions
        case source_table = "sourceTable"
        case period
    }
}

// MARK: - Color resolution (zone hex → SwiftUI Color, fallback by code)

enum AnalyticsColor {
    /// Resolve a zone's wire color: an `#rrggbb` hex when present, else a stable
    /// fallback keyed off the zone code (z1..z5), else the brand accent. Mirrors
    /// the doc's z1=green … z5=deep-red ramp.
    static func zone(_ raw: String, code: String) -> Color {
        if let c = hex(raw) { return c }
        switch code.lowercased() {
        case "z1": return Theme.Color.ok
        case "z2": return Theme.Color.info
        case "z3": return Theme.Color.warning
        case "z4": return Theme.Color.danger
        case "z5": return Theme.Color.modalityHyrox
        default:   return Theme.Color.accent
        }
    }

    /// Parse `#rgb` / `#rrggbb`. Nil for token names or malformed strings.
    static func hex(_ raw: String) -> Color? {
        var s = raw.trimmingCharacters(in: .whitespaces)
        guard s.hasPrefix("#") else { return nil }
        s.removeFirst()
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        return Color(
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255
        )
    }
}
