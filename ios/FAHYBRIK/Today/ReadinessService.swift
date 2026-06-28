import Foundation

struct DailyReadinessPayload: Codable {
    let score: Int
    let recordedFor: String
    let delta7d: Int?
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
