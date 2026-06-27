import Foundation

// Race calendar DTOs — the "Buscar carrera" (target-race picker) contract.
//
// The athlete browses the official race calendar (GET /api/races/calendar),
// picks an event, chooses the orthogonal race attributes (format · division ·
// gender) + an optional goal time, and fixes it as their TARGET race
// (POST /api/athlete/races/target). The target drives the home countdown
// (AthleteNextRace, reused from PlanService).
//
// DECODING: APIClient decodes with `.convertFromSnakeCase` and encodes with
// `.convertToSnakeCase`, so every DTO here uses camelCase property names and NO
// custom CodingKeys — the wire's snake_case (`event_id`, `is_tentative`,
// `division_options`, `gender_category`, `start_date`) maps automatically.

// MARK: - Calendar

/// One event from the race calendar. `id == eventId` so it's list-identifiable
/// and usable as a `navigationDestination(item:)` value.
struct RaceCalendarEvent: Decodable, Identifiable, Hashable {
    let eventId: String
    let slug: String
    let name: String
    /// Series family, e.g. "hyrox" | "deka". Optional — drives the SERIE chip.
    let series: String?
    /// Event type, e.g. "hyrox". Optional.
    let type: String?
    /// City, e.g. "Barcelona". Optional.
    let location: String?
    /// ISO-2 country code, e.g. "ES". Optional — drives the PAÍS chip + flag.
    let country: String?
    /// Macro region, e.g. "EU". Optional.
    let region: String?
    /// Start date "YYYY-MM-DD". Optional — undated events bucket separately.
    let startDate: String?
    /// End date "YYYY-MM-DD" for multi-day events. Optional.
    let endDate: String?
    /// True when the date is not yet official → render "Fecha por confirmar".
    let isTentative: Bool?
    /// Informational list of what the event offers, e.g. ["Pro","Open",
    /// "Doubles","Mixed Doubles","Relay"]. A HINT only — never the selector
    /// source for format/division/gender. Optional.
    let divisionOptions: [String]?

    var id: String { eventId }

    /// Whether the date is unconfirmed (defaults false when the field is absent).
    var tentative: Bool { isTentative ?? false }

    /// "YYYY-MM" group/sort key, or nil when there's no parseable date.
    var monthKey: String? {
        guard let raw = startDate, let p = RaceDate.parse(raw) else { return nil }
        return String(format: "%04d-%02d", p.year, p.month)
    }

    /// "14 nov 2026" (or a range for multi-day). Callers decide whether to show
    /// this or "Fecha por confirmar" based on `tentative`.
    var dateText: String {
        guard let raw = startDate, let p = RaceDate.parse(raw) else { return "Fecha por confirmar" }
        let start = "\(p.day) \(RaceDate.monthAbbr(p.month)) \(p.year)"
        if let rawEnd = endDate, rawEnd != startDate, let e = RaceDate.parse(rawEnd) {
            if e.year == p.year && e.month == p.month {
                return "\(p.day)–\(e.day) \(RaceDate.monthAbbr(p.month)) \(p.year)"
            }
            return "\(p.day) \(RaceDate.monthAbbr(p.month)) – \(e.day) \(RaceDate.monthAbbr(e.month)) \(e.year)"
        }
        return start
    }

    /// "Barcelona · 14 nov 2026" — city + date, honest about a tentative date.
    var cityDateLine: String {
        let date = tentative ? "Fecha por confirmar" : dateText
        if let city = location, !city.isEmpty { return "\(city) · \(date)" }
        return date
    }

    /// Uppercased series label for the row badge, e.g. "HYROX". Nil when absent.
    var seriesLabel: String? {
        guard let s = series, !s.isEmpty else { return nil }
        return s.uppercased()
    }

    /// "Pro · Open · Doubles · …" informational line; nil when no options.
    var divisionOptionsLine: String? {
        guard let opts = divisionOptions, !opts.isEmpty else { return nil }
        return opts.joined(separator: " · ")
    }
}

/// `GET /api/races/calendar` envelope. `currentTargetEventId` badges the row the
/// athlete has already chosen; nil when they have no target yet.
struct RaceCalendarResponse: Decodable {
    let events: [RaceCalendarEvent]
    let currentTargetEventId: String?
}

// MARK: - Set target

/// `POST /api/athlete/races/target` body. `eventId` is the NUMERIC event id (the
/// calendar's `eventId` is a string → convert before building this). camelCase
/// keys encode to `event_id` / `gender_category` / `goal_time_seconds` etc. A
/// nil `goalTimeSeconds` is omitted from the JSON (the server treats it as none).
struct SetTargetRaceBody: Encodable {
    let eventId: Int
    let format: String          // "singles" | "doubles" | "relay"
    let division: String        // "open" | "pro" | "elite"
    let genderCategory: String  // "men" | "women" | "mixed"
    let goalTimeSeconds: Int?
}

/// `POST /api/athlete/races/target` response. `targetRace` is the SAME shape the
/// home countdown consumes (AthleteNextRace). `raceId` is the new `races.id`
/// (string) — the id the DELETE endpoint expects.
struct SetTargetRaceResponse: Decodable {
    let targetRace: AthleteNextRace?
    let raceId: String
}

// MARK: - Date filter chip

/// The FECHA chip. Translates to a `from`/`to` window on the calendar query.
enum RaceDateFilter: String, CaseIterable, Identifiable {
    case any
    case threeMonths
    case sixMonths

    var id: String { rawValue }

    var label: String {
        switch self {
        case .any:         return "Cualquiera"
        case .threeMonths: return "3 meses"
        case .sixMonths:   return "6 meses"
        }
    }

    /// Months ahead for the `to` bound; nil = no date window.
    var monthsAhead: Int? {
        switch self {
        case .any:         return nil
        case .threeMonths: return 3
        case .sixMonths:   return 6
        }
    }
}

// MARK: - Date helpers
//
// Manual YYYY-MM-DD parsing (no DateFormatter locale traps) + Spanish month
// names for the month-section headers and the row date. One source of truth for
// how a calendar date reads in this feature.
enum RaceDate {
    struct Parts { let year: Int; let month: Int; let day: Int }

    static func parse(_ iso: String) -> Parts? {
        let parts = iso.split(separator: "-")
        guard parts.count >= 3,
              let y = Int(parts[0]),
              let m = Int(parts[1]),
              let d = Int(parts[2].prefix(2)),
              m >= 1, m <= 12 else {
            return nil
        }
        return Parts(year: y, month: m, day: d)
    }

    private static let abbr = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
    private static let full = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]

    static func monthAbbr(_ m: Int) -> String { (m >= 1 && m <= 12) ? abbr[m - 1] : "" }
    static func monthFull(_ m: Int) -> String { (m >= 1 && m <= 12) ? full[m - 1] : "" }

    /// "NOVIEMBRE 2026" header from a "YYYY-MM" key.
    static func monthHeader(forKey key: String) -> String {
        let parts = key.split(separator: "-")
        guard parts.count == 2, let y = Int(parts[0]), let m = Int(parts[1]) else { return key }
        return "\(monthFull(m).uppercased()) \(y)"
    }

    /// Today as "YYYY-MM-DD" (athlete local) — the `from` bound of a date window.
    static func todayISO() -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Today + N months as "YYYY-MM-DD" — the `to` bound of a date window.
    static func isoMonthsAhead(_ n: Int) -> String {
        let cal = Calendar.current
        let date = cal.date(byAdding: .month, value: n, to: Date()) ?? Date()
        let c = cal.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

/// Regional-indicator flag emoji from an ISO-2 code ("ES" → 🇪🇸); nil for a
/// malformed code. Derived purely from the code — never a hardcoded list.
func raceCountryFlag(_ iso2: String?) -> String? {
    guard let iso2, iso2.count == 2 else { return nil }
    let base: UInt32 = 0x1F1E6
    var result = ""
    for ch in iso2.uppercased().unicodeScalars {
        guard ch.value >= 65, ch.value <= 90 else { return nil }
        if let scalar = Unicode.Scalar(base + (ch.value - 65)) {
            result.unicodeScalars.append(scalar)
        }
    }
    return result.isEmpty ? nil : result
}
