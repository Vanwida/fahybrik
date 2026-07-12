import XCTest
@testable import FAHYBRIK

// #27 — the PURE history calendar derivation: the Monday-first month grid, month
// navigation + its forward cap, the day-state mapping from the payload, and the
// session row formatting. A calendar that misplaces a day is a silent, ugly bug, so
// the grid math is pinned to concrete, hand-verified months.
final class HistoryCalendarTests: XCTestCase {

    private func session(
        id: String = "1", dur: Int? = nil, score: Int? = nil,
        rpe: Double? = nil, partner: Bool = false, route: Bool = false
    ) -> AthleteHistorySession {
        AthleteHistorySession(assignmentId: id, title: "Sesión", totalDurationSeconds: dur,
                              scoreTimeS: score, rpe: rpe, withPartner: partner, hasRoute: route)
    }
    private func day(_ date: String, rest: Bool = false, sessions: [AthleteHistorySession] = []) -> AthleteHistoryDay {
        AthleteHistoryDay(date: date, isRest: rest, sessions: sessions)
    }

    // MARK: - Grid: Monday-first leading offset (verified weekdays)

    func testGridJuly2026StartsWednesday() {
        // 2026-07-01 is a Wednesday → Monday-index 2 → two leading blanks; 31 days.
        let cells = HistoryCalendar.grid(YearMonth(year: 2026, month: 7))
        XCTAssertEqual(cells.count % 7, 0)
        XCTAssertEqual(cells.count, 35)
        XCTAssertEqual(cells[0], .blank)
        XCTAssertEqual(cells[1], .blank)
        XCTAssertEqual(cells[2], .day(1))
        XCTAssertEqual(cells[32], .day(31))
        XCTAssertEqual(cells[33], .blank)
        XCTAssertEqual(cells.filter { if case .day = $0 { return true } else { return false } }.count, 31)
    }

    func testGridJune2026StartsMonday() {
        // 2026-06-01 is a Monday → zero leading blanks; 30 days.
        let cells = HistoryCalendar.grid(YearMonth(year: 2026, month: 6))
        XCTAssertEqual(cells[0], .day(1))
        XCTAssertEqual(cells.count, 35)
        XCTAssertEqual(cells.filter { if case .day = $0 { return true } else { return false } }.count, 30)
    }

    func testGridFeb2026StartsSundaySixBlanks() {
        // 2026-02-01 is a Sunday → Monday-index 6 → six leading blanks; 28 days (no leap).
        let cells = HistoryCalendar.grid(YearMonth(year: 2026, month: 2))
        XCTAssertEqual(cells.prefix(6), [.blank, .blank, .blank, .blank, .blank, .blank])
        XCTAssertEqual(cells[6], .day(1))
        XCTAssertEqual(cells.filter { if case .day = $0 { return true } else { return false } }.count, 28)
    }

    // MARK: - YearMonth navigation

    func testYearMonthRollover() {
        XCTAssertEqual(YearMonth(year: 2026, month: 1).previous(), YearMonth(year: 2025, month: 12))
        XCTAssertEqual(YearMonth(year: 2026, month: 12).next(), YearMonth(year: 2027, month: 1))
        XCTAssertEqual(YearMonth(year: 2026, month: 7).iso, "2026-07")
        XCTAssertTrue(YearMonth(year: 2026, month: 6) < YearMonth(year: 2026, month: 7))
        XCTAssertTrue(YearMonth(year: 2025, month: 12) < YearMonth(year: 2026, month: 1))
    }

    func testForwardCapAtCurrentMonth() {
        let today = YearMonth(year: 2026, month: 7)
        XCTAssertTrue(HistoryCalendar.canGoForward(from: YearMonth(year: 2026, month: 6), today: today))
        XCTAssertFalse(HistoryCalendar.canGoForward(from: today, today: today))          // no future
        XCTAssertFalse(HistoryCalendar.canGoForward(from: YearMonth(year: 2026, month: 8), today: today))
    }

    // MARK: - Day-state mapping

    func testDayStatesFromPayload() {
        let days = [
            day("2026-07-08", sessions: [session(partner: true)]),   // joint → ring
            day("2026-07-10", sessions: [session()]),               // plain done
            day("2026-07-09", rest: true),                          // rest → dash
            day("2026-06-30", sessions: [session()]),               // other month → ignored
        ]
        let states = HistoryCalendar.dayStates(days, in: YearMonth(year: 2026, month: 7))
        XCTAssertEqual(states[8], .trained(withPartner: true))
        XCTAssertEqual(states[10], .trained(withPartner: false))
        XCTAssertEqual(states[9], .rest)
        XCTAssertNil(states[30])          // June day not mapped into July
        XCTAssertNil(states[1])           // a day with no content stays empty
    }

    // MARK: - Today marker

    func testTodayDayInAndOutOfMonth() throws {
        let ref = try XCTUnwrap(HistoryCalendar.boxCalendar.date(
            from: DateComponents(year: 2026, month: 7, day: 15)))
        XCTAssertEqual(HistoryCalendar.todayDay(in: YearMonth(year: 2026, month: 7), reference: ref), 15)
        XCTAssertNil(HistoryCalendar.todayDay(in: YearMonth(year: 2026, month: 8), reference: ref))
    }

    // MARK: - parseISO

    func testParseISO() {
        XCTAssertEqual(HistoryCalendar.parseISO("2026-07-08")?.day, 8)
        XCTAssertNil(HistoryCalendar.parseISO("2026-13-01"))   // month out of range
        XCTAssertNil(HistoryCalendar.parseISO("garbage"))
    }

    // MARK: - Session headline (score vs duration vs neither)

    func testHeadlineTimePrefersScoreThenDuration() {
        XCTAssertEqual(session(dur: 3600, score: 2832).headlineTime, "47:12")   // score wins
        XCTAssertEqual(session(dur: 3600, score: 2832).headlineLabel, "resultado")
        XCTAssertEqual(session(dur: 3600).headlineTime, "1:00:00")              // no score → duration
        XCTAssertEqual(session(dur: 3600).headlineLabel, "duración")
        XCTAssertNil(session().headlineTime)                                    // neither → nil, no fabrication
        XCTAssertNil(session().headlineLabel)
    }

    func testRpeLabel() {
        XCTAssertEqual(session(rpe: 7).rpeLabel, "RPE 7")
        XCTAssertEqual(session(rpe: 7.5).rpeLabel, "RPE 7.5")
        XCTAssertNil(session().rpeLabel)
    }

    // MARK: - Month list flatten (newest day first, stable within a day)

    func testMonthListNewestFirstStableWithinDay() {
        let month = AthleteHistoryMonth(month: "2026-07", days: [
            day("2026-07-08", sessions: [session(id: "A")]),
            day("2026-07-10", sessions: [session(id: "B"), session(id: "C")]),
            day("2026-07-09", rest: true),          // contributes no rows
        ])
        let rows = HistoryListRow.rows(from: month)
        XCTAssertEqual(rows.map(\.session.assignmentId), ["B", "C", "A"])   // 10 (B,C in order) then 08
    }
}
