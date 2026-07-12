import Foundation

// #27 — reads GET /api/athlete/history?month=YYYY-MM. Returns nil on any failure
// (offline / auth / 4xx) so the calendar shows its honest empty state rather than an
// error surface — the same "never a fake list" posture as the analytics drill-down.
enum HistoryService {
    static func fetch(month: YearMonth, bearer: String?) async -> AthleteHistoryMonth? {
        do {
            return try await APIClient.shared.get(
                path: "api/athlete/history?month=\(month.iso)",
                bearer: bearer
            )
        } catch {
            return nil
        }
    }
}
