import Foundation

// JSON wire shape from GET /api/events.
// Snake_case to match the rest of the iOS codebase + APIClient decoder.
struct EventListItemDTO: Codable, Identifiable, Hashable {
    let event_id: String
    let slug: String
    let name: String
    let type: String           // "hyrox" | "crossfit" | "other"
    let location: String?
    let country: String?
    let region: String?        // "EU" | "NA" | "APAC" | "LATAM" | "MEA"
    let start_date: String     // YYYY-MM-DD
    let end_date: String?
    let division: String?
    let division_options: [String]
    let source_url: String?
    let is_past: Bool
    let target_count: Int

    var id: String { event_id }
}

struct EventsListResponseDTO: Codable {
    let events: [EventListItemDTO]
    let scope: String
    let role: String
    let athlete_id: String?
}

// JSON wire shape from GET /api/athlete/target-events.
struct AthleteTargetItemDTO: Codable, Identifiable, Hashable {
    let target_id: String
    let event_id: String
    let priority: String        // "A" | "B" | "C"
    let division: String?
    let notes: String?
    let event_name: String
    let event_slug: String
    let event_start_date: String
    let event_location: String?
    let event_country: String?
    let event_type: String

    var id: String { target_id }
}

struct AthleteTargetsResponseDTO: Codable {
    let targets: [AthleteTargetItemDTO]
}

// POST /api/athlete/target-events
struct AthleteTargetUpsertDTO: Codable {
    let event_id: String
    let priority: String
    let division: String?
    let notes: String?
}

struct AthleteTargetUpsertResponseDTO: Codable {
    let target: AthleteTargetItemDTO
}

// MARK: - Display helpers

enum EventTargetPriority: String, CaseIterable, Identifiable {
    case A, B, C

    var id: String { rawValue }
    var label: String {
        switch self {
        case .A: return "A — race objetivo"
        case .B: return "B — checkpoint"
        case .C: return "C — práctica"
        }
    }
}

enum EventRegionFilter: String, CaseIterable, Identifiable {
    case all, EU, NA, APAC, LATAM, MEA
    var id: String { rawValue }
    var label: String {
        if self == .all { return "Todas" }
        return rawValue
    }
}

enum EventTypeFilter: String, CaseIterable, Identifiable {
    case all, hyrox, crossfit
    var id: String { rawValue }
    var label: String {
        switch self {
        case .all: return "Todo"
        case .hyrox: return "HYROX"
        case .crossfit: return "CrossFit"
        }
    }
}

// MARK: - Date formatting

private let _esMonths: [String] = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
]

private struct _ParsedDate {
    let year: Int
    let month: Int
    let day: Int
}

private func _parseISO(_ iso: String) -> _ParsedDate? {
    let parts = iso.split(separator: "-")
    guard parts.count == 3,
          let y = Int(parts[0]),
          let m = Int(parts[1]),
          let d = Int(parts[2]),
          m >= 1, m <= 12 else {
        return nil
    }
    return _ParsedDate(year: y, month: m, day: d)
}

func eventFormatDateRange(start: String, end: String?) -> String {
    guard let s = _parseISO(start) else { return start }
    let startStr = "\(s.day) \(_esMonths[s.month - 1])"
    guard let endStr = end, endStr != start, let e = _parseISO(endStr) else {
        return "\(startStr) \(s.year)"
    }
    if s.year == e.year && s.month == e.month {
        return "\(s.day)–\(e.day) \(_esMonths[s.month - 1]) \(s.year)"
    }
    return "\(startStr) – \(e.day) \(_esMonths[e.month - 1]) \(e.year)"
}

func eventDaysUntil(_ start: String) -> Int? {
    guard let p = _parseISO(start) else { return nil }
    var comps = DateComponents()
    comps.year = p.year
    comps.month = p.month
    comps.day = p.day
    let cal = Calendar.current
    guard let target = cal.date(from: comps) else { return nil }
    let now = cal.startOfDay(for: Date())
    let days = cal.dateComponents([.day], from: now, to: target).day
    return days
}
