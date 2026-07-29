import Foundation

// #27 — ATHLETE HISTORY by month: the wire models for GET /api/athlete/history plus
// the PURE month-grid derivation the calendar renders. The grid math (Monday-first
// offsets, days→cells, navigation bounds, day-state from the payload) is isolated here,
// with no SwiftUI/I/O, so it is unit-tested exhaustively — a calendar that misplaces a
// day is a silent, ugly bug.
//
// Wire is snake_case; APIClient's convertFromSnakeCase maps it to camelCase here
// (is_rest → isRest, assignment_id → assignmentId, score_time_s → scoreTimeS …). The
// server returns ONLY days with content (completed/partial sessions or scheduled rest);
// empty days are omitted and the calendar paints them blank.

// MARK: - Wire

struct AthleteHistoryMonth: Decodable, Equatable {
    let month: String            // echoes YYYY-MM
    let days: [AthleteHistoryDay]
}

struct AthleteHistoryDay: Decodable, Equatable {
    let date: String             // YYYY-MM-DD, box-local
    let isRest: Bool             // a scheduled rest day (no sessions)
    let sessions: [AthleteHistorySession]
}

struct AthleteHistorySession: Decodable, Equatable, Identifiable {
    let assignmentId: String     // opens the existing ExecutedWorkoutView
    let title: String
    let totalDurationSeconds: Int?
    let scoreTimeS: Int?         // For Time / RFT / HYROX-sim final time; else null
    let rpe: Double?             // perceived exertion 1–10; null when not logged
    let withPartner: Bool        // logged as a JOINT dobles session
    let hasRoute: Bool           // an outdoor GPS route exists

    var id: String { assignmentId }

    /// The headline time: the scored final time when present (HYROX/For Time), else the
    /// session duration, else nil (never fabricated). Formatted M:SS / H:MM:SS.
    var headlineTime: String? {
        if let s = scoreTimeS, s > 0 { return Formato.clock(s) }
        if let d = totalDurationSeconds, d > 0 { return Formato.clock(d) }
        return nil
    }
    /// Label under the time: "resultado" for a scored session (the time IS the score),
    /// "duración" for a plain timed session, nil when neither.
    var headlineLabel: String? {
        if let s = scoreTimeS, s > 0 { return "resultado" }
        if let d = totalDurationSeconds, d > 0 { return "duración" }
        return nil
    }
    /// "RPE 7" when the athlete logged it.
    var rpeLabel: String? { DoblesLiveFormat.rpe(rpe).map { "RPE \($0)" } }
}

// MARK: - Year-month value

/// A calendar month, orderable so navigation bounds are a simple comparison.
struct YearMonth: Equatable, Comparable {
    let year: Int
    let month: Int               // 1…12

    static func < (a: YearMonth, b: YearMonth) -> Bool {
        (a.year, a.month) < (b.year, b.month)
    }

    func previous() -> YearMonth {
        month == 1 ? YearMonth(year: year - 1, month: 12) : YearMonth(year: year, month: month - 1)
    }
    func next() -> YearMonth {
        month == 12 ? YearMonth(year: year + 1, month: 1) : YearMonth(year: year, month: month + 1)
    }

    /// The `?month=YYYY-MM` query value.
    var iso: String { String(format: "%04d-%02d", year, month) }

    /// "julio 2026" — the header label (Spanish month names).
    var displayLabel: String { "\(HistoryCalendar.monthNameEs(month)) \(year)" }

    /// The month containing `reference` in the box timezone (Europe/Madrid), so the
    /// "today" marker and the forward-navigation cap match the server's day convention.
    static func current(reference: Date = Date()) -> YearMonth {
        let c = HistoryCalendar.boxComponents(reference)
        return YearMonth(year: c.year ?? 2026, month: c.month ?? 1)
    }
}

// MARK: - Calendar grid (pure)

/// One cell of the Monday-first month grid: a blank pad or a real day-of-month.
enum CalendarGridCell: Equatable {
    case blank
    case day(Int)
}

/// A day's rendered state, derived from the month payload.
enum CalendarDayState: Equatable {
    case empty                          // no content that day → blank
    case rest                           // a scheduled rest day → dash
    case trained(withPartner: Bool)     // ≥1 completed session → dot (+ ring if joint)
}

enum HistoryCalendar {
    /// A Gregorian calendar pinned to the box timezone — deterministic, so the grid math
    /// and the "today" resolution never drift with the device zone.
    static let boxCalendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Madrid") ?? .current
        c.firstWeekday = 2   // Monday (documentary; the grid math is explicit below)
        return c
    }()

    static func boxComponents(_ date: Date) -> DateComponents {
        boxCalendar.dateComponents([.year, .month, .day], from: date)
    }

    /// Today's day-of-month IF today falls inside `ym`, else nil (drives the marker).
    static func todayDay(in ym: YearMonth, reference: Date = Date()) -> Int? {
        let c = boxComponents(reference)
        guard c.year == ym.year, c.month == ym.month else { return nil }
        return c.day
    }

    /// The month grid, Monday-first: leading blanks to the weekday of day 1, then days
    /// 1…N, then trailing blanks so the count is a whole number of weeks (rows × 7).
    static func grid(_ ym: YearMonth) -> [CalendarGridCell] {
        guard let first = boxCalendar.date(from: DateComponents(year: ym.year, month: ym.month, day: 1)),
              let range = boxCalendar.range(of: .day, in: .month, for: first)
        else { return [] }
        let n = range.count
        // weekday: 1=Sun … 7=Sat → Monday-first index 0=Mon … 6=Sun.
        let weekday = boxCalendar.component(.weekday, from: first)
        let leading = (weekday + 5) % 7

        var cells = [CalendarGridCell](repeating: .blank, count: leading)
        cells.append(contentsOf: (1...n).map { .day($0) })
        while cells.count % 7 != 0 { cells.append(.blank) }
        return cells
    }

    /// Map the month's payload to a day-of-month → state dictionary. Days outside `ym`
    /// (a straddling week edge) are ignored; a day not present stays `.empty` implicitly.
    static func dayStates(_ days: [AthleteHistoryDay], in ym: YearMonth) -> [Int: CalendarDayState] {
        var out: [Int: CalendarDayState] = [:]
        for d in days {
            guard let parsed = parseISO(d.date), parsed.year == ym.year, parsed.month == ym.month else { continue }
            if d.isRest {
                out[parsed.day] = .rest
            } else if !d.sessions.isEmpty {
                out[parsed.day] = .trained(withPartner: d.sessions.contains { $0.withPartner })
            }
        }
        return out
    }

    /// Forward navigation is capped at the current month (no future); back is free.
    static func canGoForward(from viewed: YearMonth, today: YearMonth = .current()) -> Bool {
        viewed < today
    }

    /// Parse "YYYY-MM-DD" → components. Nil for a malformed string (never crashes).
    static func parseISO(_ s: String) -> (year: Int, month: Int, day: Int)? {
        let parts = s.split(separator: "-")
        guard parts.count == 3,
              let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]),
              (1...12).contains(m), (1...31).contains(d) else { return nil }
        return (y, m, d)
    }

    static let weekdayHeadersEs = ["L", "M", "X", "J", "V", "S", "D"]

    private static let monthNamesEs = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ]
    static func monthNameEs(_ month: Int) -> String {
        guard (1...12).contains(month) else { return "" }
        return monthNamesEs[month - 1]
    }

    static let monthAbbrevEs = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    static let dowAbbrevEs = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]

    /// DOW abbreviation for a YYYY-MM-DD ("lun".."dom"), Monday-first. "" when malformed.
    static func dowAbbrev(_ iso: String) -> String {
        guard let p = parseISO(iso),
              let date = boxCalendar.date(from: DateComponents(year: p.year, month: p.month, day: p.day))
        else { return "" }
        let weekday = boxCalendar.component(.weekday, from: date)
        return dowAbbrevEs[(weekday + 5) % 7]
    }
}

// MARK: - Month list (flattened, newest-first)

/// One row of the month list: a session with its date, for the browse list under the
/// calendar. Newest-first (market standard for an activity feed).
struct HistoryListRow: Identifiable, Equatable {
    let date: String                 // YYYY-MM-DD
    let session: AthleteHistorySession
    var id: String { "\(date)#\(session.assignmentId)" }

    /// Flatten a month's days into rows, most recent DAY first; within a two-a-day the
    /// server's session order is preserved (a stable tiebreak, since Swift's sort is not
    /// itself stable). Rest days contribute no rows.
    static func rows(from month: AthleteHistoryMonth) -> [HistoryListRow] {
        let flat = month.days.flatMap { day in
            day.sessions.map { HistoryListRow(date: day.date, session: $0) }
        }
        return flat.enumerated()
            .sorted { a, b in
                a.element.date != b.element.date ? a.element.date > b.element.date : a.offset < b.offset
            }
            .map(\.element)
    }
}
