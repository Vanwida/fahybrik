import Foundation

// Athlete identity from GET /api/auth/me. This is the canonical source for
// the athlete's name, body metrics and training context — the screens that
// used to render the hardcoded "Marc Vidal" persona now hydrate from here.
//
// APIClient's decoder uses `convertFromSnakeCase`, so the snake_case wire
// fields map to these camelCase properties automatically.

struct AthleteIdentity: Codable {
    let id: String
    let fullName: String
    let dob: String?
    let sex: String?
    let heightCm: Double?
    let weightKg: Double?
    let bodyFatPct: Double?
    let trainingExperienceYears: Double?
    let primaryDiscipline: String?
    let trainingDaysPerWeek: Int?
    let onboardedAt: String?
    // Profile-edit fields — optional so existing /me responses decode cleanly
    // before the backend includes these keys.
    let goalType: String?
    let goalOtherText: String?
    let preferredLanguage: String?

    var initials: String {
        let parts = fullName
            .split(separator: " ")
            .prefix(2)
            .compactMap { $0.first }
            .map(String.init)
        let joined = parts.joined().uppercased()
        return joined.isEmpty ? "—" : joined
    }

    /// Whole-years age derived from `dob` (YYYY-MM-DD). Nil when dob is absent
    /// or unparseable — we never guess.
    var age: Int? {
        guard let dob else { return nil }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.dateFormat = "yyyy-MM-dd"
        guard let date = fmt.date(from: dob) else { return nil }
        let comps = Calendar.current.dateComponents([.year], from: date, to: Date())
        return comps.year
    }
}

struct MeResponse: Decodable {
    let athlete: AthleteIdentity
}

enum MeService {
    static func fetch(bearer: String) async throws -> AthleteIdentity {
        let resp: MeResponse = try await APIClient.shared.get(path: "api/auth/me", bearer: bearer)
        return resp.athlete
    }
}

// MARK: - Profile update

// Request body for PATCH api/athlete/profile. Keys are camelCase here; the
// APIClient encoder converts them to snake_case automatically. Nil fields are
// omitted from the JSON body (Swift's default JSONEncoder behaviour), which is
// the intended wire contract — omit to leave/clear.
struct ProfileUpdate: Encodable {
    var fullName: String
    var dob: String?
    var sex: String?
    var heightCm: Double?
    var weightKg: Double?
    var trainingExperienceYears: Double?
    var goalType: String?
    var goalOtherText: String?
    var preferredLanguage: String?
}

enum ProfileService {
    static func update(bearer: String, body: ProfileUpdate) async throws -> AthleteIdentity {
        let resp: MeResponse = try await APIClient.shared.patch(
            path: "api/athlete/profile",
            body: body,
            bearer: bearer
        )
        return resp.athlete
    }
}
