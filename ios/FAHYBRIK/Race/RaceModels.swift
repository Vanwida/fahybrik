import Foundation

// DTOs that mirror /shared/schema/race-plan.ts and the columns in
// /infra/migrations/0008_race_plans.sql. snake_case property names match
// the API payload (APIClient uses convertFromSnakeCase too — both work,
// explicit names mean the file survives any encoder strategy change).

enum HyroxStation {
    static let count = 16
    static let runIndices: [Int] = [1, 3, 5, 7, 9, 11, 13, 15]

    static let labels: [Int: String] = [
        1: "Run 1km",
        2: "SkiErg 1km",
        3: "Run 1km",
        4: "Sled push",
        5: "Run 1km",
        6: "Sled pull",
        7: "Run 1km",
        8: "Burpee broad jump 80m",
        9: "Run 1km",
        10: "Row 1km",
        11: "Run 1km",
        12: "Farmer carry 200m",
        13: "Run 1km",
        14: "Sandbag lunge 200m",
        15: "Run 1km",
        16: "Wall ball 100"
    ]
}

// MARK: - Race plan

enum RacePlanStatus: String, Codable {
    case draft
    case approved
    case locked
}

struct RacePlanStationPacing: Codable, Identifiable, Equatable {
    var station_index: Int
    var label: String
    var target_pace: String?
    var note: String?
    var id: Int { station_index }
}

struct RacePlanNutrition: Codable, Equatable {
    var pre_3h: String?
    var pre_45m: String?
    var intra: String?
    var post: String?

    static let empty = RacePlanNutrition(pre_3h: nil, pre_45m: nil, intra: nil, post: nil)
}

struct RacePlanKitItem: Codable, Identifiable, Equatable {
    var item: String
    var checked: Bool
    var notes: String?
    var id: String { item }
}

struct RacePlanMentalCue: Codable, Identifiable, Equatable {
    var station_index: Int?
    var cue: String
    var id: String { "\(station_index ?? 0)·\(cue)" }
}

struct RacePlanContingency: Codable, Identifiable, Equatable {
    var trigger: String
    var action: String
    var id: String { "\(trigger)→\(action)" }
}

struct RacePlan: Codable, Equatable {
    let id: String
    let athlete_id: String
    let target_event_id: String
    let time_goal_seconds: Int?
    var station_pacing: [RacePlanStationPacing]
    var nutrition: RacePlanNutrition
    var kit: [RacePlanKitItem]
    var mental_cues: [RacePlanMentalCue]
    var contingency: [RacePlanContingency]
    var coach_note: String?
    let status: RacePlanStatus
    let approved_by_coach_id: String?
    let approved_at: String?
    let version: Int
    let parent_race_plan_id: String?
    let created_at: String
    let updated_at: String
}

// MARK: - Race result + debrief

struct RacePlanStationActual: Codable, Identifiable, Equatable {
    var station_index: Int
    var duration_seconds: Int
    var notes: String?
    var id: Int { station_index }
}

struct RaceResult: Codable, Equatable {
    let id: String
    let race_plan_id: String
    let athlete_id: String
    let finish_time_seconds: Int
    let finish_position: Int?
    let division: String?
    let station_actuals: [RacePlanStationActual]
    let recorded_at: String
    let created_at: String
    let updated_at: String
}

enum RacePaceRealism: String, Codable, CaseIterable, Identifiable {
    case realistic
    case too_ambitious
    case too_conservative

    var id: String { rawValue }
    var label: String {
        switch self {
        case .realistic: return "Realista"
        case .too_ambitious: return "Muy ambicioso"
        case .too_conservative: return "Poco ambicioso"
        }
    }
}

struct RaceDebrief: Codable, Equatable {
    let id: String
    let race_result_id: String
    let athlete_id: String
    let soreness_post: Int
    let energy_during: Int
    let had_crisis: Bool
    let crisis_at_station: Int?
    let crisis_notes: String?
    let what_worked: String?
    let what_to_improve: String?
    let pace_realism: RacePaceRealism
    let lessons_text: String?
    let created_at: String
    let updated_at: String
}

// MARK: - Submission DTOs (athlete posts these from iOS)

struct RaceResultSubmit: Codable {
    let race_plan_id: String
    let finish_time_seconds: Int
    let finish_position: Int?
    let division: String?
    let station_actuals: [RacePlanStationActual]
}

struct RaceDebriefSubmit: Codable {
    let race_result_id: String
    let soreness_post: Int
    let energy_during: Int
    let had_crisis: Bool
    let crisis_at_station: Int?
    let crisis_notes: String?
    let what_worked: String?
    let what_to_improve: String?
    let pace_realism: RacePaceRealism
    let lessons_text: String?
}

// MARK: - Aggregate fetched from API for the athlete-facing surfaces

struct RaceContext: Codable, Equatable {
    let event_name: String
    let event_iso_date: String
    let start_local_time: String?     // "10:42" optional
    let race_plan: RacePlan?
    let race_result: RaceResult?
    let race_debrief: RaceDebrief?
}

// MARK: - Helpers

enum RaceFormat {
    /// "1:05:00" / "52:18".
    static func time(_ seconds: Int) -> String {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        let s = seconds % 60
        if h > 0 {
            return String(format: "%d:%02d:%02d", h, m, s)
        }
        return String(format: "%d:%02d", m, s)
    }

    /// Average pace (min/km) over 8 km of running.
    static func pacePerKm(timeGoalSeconds seconds: Int) -> String {
        let perKm = Double(seconds) / 8.0
        let m = Int(perKm) / 60
        let s = Int(perKm.rounded()) % 60
        return String(format: "%d:%02d/km", m, s)
    }

    /// Days from `now` to a YYYY-MM-DD string at start of day local.
    static func daysUntil(_ isoDate: String, now: Date = Date()) -> Int? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        guard let target = f.date(from: isoDate) else { return nil }
        let cal = Calendar.current
        let today = cal.startOfDay(for: now)
        let dest = cal.startOfDay(for: target)
        return cal.dateComponents([.day], from: today, to: dest).day
    }
}
