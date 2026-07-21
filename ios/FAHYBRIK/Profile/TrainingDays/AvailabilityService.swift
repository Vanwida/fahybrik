import Foundation

// Athlete weekly availability — the day→role map that DRIVES el reparto.
//
// Contract (bearer-authed, GET / PATCH /api/athlete/availability):
//   GET   → { "availability": { "mon".."sun": "program"|"other_activity"|"rest" },
//            "training_days_per_week": number|null }
//   PATCH   body { "availability": { "mon"?.."sun"?: <value> } }  (each day optional,
//           .strict(), MERGED server-side) → returns the same shape as GET.
//
// Wire values map 1:1 to the existing `DayPlanStatus` (onboarding), so we reuse it
// as the single source of truth for the three roles — no parallel enum:
//   .program        → "program"        → "Entreno"
//   .otherActivity  → "other_activity" → "Otra actividad"
//   .rest           → "rest"           → "Descanso"
//
// REFLECTION (#47): the change is read FRESH by the materializer on every future
// week, so a saved edit applies to weeks materialized AFTER it — never a re-layout
// of the current (already-scheduled) week. See the route header + TrainingDaysView.
//
// APIClient's decoder uses `.convertFromSnakeCase`, so `training_days_per_week`
// decodes to `trainingDaysPerWeek` with no pinned CodingKeys; the `mon..sun` keys
// are single words and pass through unchanged (encode + decode).

/// The 7-day role map, index 0 = Monday … 6 = Sunday (mirrors the onboarding's
/// `availabilityByDay`). Codable to/from the `{mon..sun -> value}` wire object.
/// Decode is deliberately TOLERANT: a missing day or an unknown/typed-wrong role
/// degrades to `.rest` (never a fabricated training day, never a thrown payload) —
/// the same defensive posture the rest of the app's wire models take.
struct AvailabilityMap: Codable, Equatable {
    /// Exactly 7 entries, index 0 = Monday. Public for the view's per-row binding.
    var days: [DayPlanStatus]

    /// Normalizes to exactly 7 entries (pad with `.rest` / truncate) so indexing
    /// and the `mon..sun` encode are always safe regardless of the input length.
    init(days: [DayPlanStatus]) {
        var d = Array(days.prefix(7))
        while d.count < 7 { d.append(.rest) }
        self.days = d
    }

    /// All-rest baseline (7 days) — the pre-load placeholder.
    static let restAll = AvailabilityMap(days: Array(repeating: .rest, count: 7))

    /// Days marked for the plan ("Entreno"): the reparto driver AND the number
    /// surfaced as "Ahora entrenas N días". Single source of truth for the count,
    /// matching the server's `deriveTrainingDaysPerWeek` (count of `program`).
    var programDayCount: Int { days.filter { $0 == .program }.count }

    // mon..sun — the wire keys, in weekday order (index 0 = mon).
    private enum CodingKeys: String, CodingKey { case mon, tue, wed, thu, fri, sat, sun }
    private static let orderedKeys: [CodingKeys] = [.mon, .tue, .wed, .thu, .fri, .sat, .sun]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.days = Self.orderedKeys.map { Self.role(c, $0) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        for (i, key) in Self.orderedKeys.enumerated() {
            try c.encode(days[i], forKey: key)
        }
    }

    /// Tolerant per-day decode: read the role as a raw String and map it through
    /// `DayPlanStatus(rawValue:)`. Absent / null / non-string / unknown value all
    /// fall back to `.rest` so one bad key never takes the whole payload down.
    private static func role(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> DayPlanStatus {
        guard let raw = try? c.decodeIfPresent(String.self, forKey: key) else { return .rest }
        return DayPlanStatus(rawValue: raw) ?? .rest
    }
}

/// GET / PATCH response envelope. `trainingDaysPerWeek` is the SERVER-derived count
/// (null when zero); the UI drives its live "N días" note off `availability`'s
/// `programDayCount` so it updates as the athlete toggles before saving — the two
/// use the identical rule (count of `program`), so they can't disagree once saved.
struct AvailabilityResponse: Decodable {
    let availability: AvailabilityMap
    let trainingDaysPerWeek: Int?
}

/// Thin service over APIClient — mirrors WearablesService / ZonesService.
enum AvailabilityService {
    private static let path = "api/athlete/availability"

    /// Current weekly availability + the server-derived training-days count.
    static func fetch(bearer: String) async throws -> AvailabilityResponse {
        try await APIClient.shared.get(path: path, bearer: bearer)
    }

    /// Persist the day→role map. Sends the WHOLE map (all 7 days) under
    /// `availability`; the server merges + re-sanitizes and returns the canonical
    /// state. The caller then triggers a plan refresh so future-week
    /// materialization reflects the new days.
    static func save(_ map: AvailabilityMap, bearer: String) async throws -> AvailabilityResponse {
        struct Body: Encodable { let availability: AvailabilityMap }
        return try await APIClient.shared.patch(path: path, body: Body(availability: map), bearer: bearer)
    }
}
