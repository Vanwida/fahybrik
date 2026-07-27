import Foundation

// `GET /api/athlete/free-plan` — the computed portrait behind the FREE Plan tab.
//
// Mirrors shared/domain/free-plan/types.ts. The server decides MEANING (what a
// doubles race proves about one athlete, which sessions can be personalised);
// this file only carries the numbers across and the views render them. That
// split is deliberate: the last time race maths was reimplemented in Swift the
// two sides drifted and nothing compared them.
//
// Decoded with `.convertFromSnakeCase`, so every property here is the camelCase
// twin of the wire's snake_case and no CodingKeys are needed. Every field is
// optional or nullable on purpose — a section with nothing behind it arrives as
// nil and simply is not painted.

enum FreePlanService {
    static func fetch(bearer: String?) async throws -> FreePlanPayload {
        try await APIClient.shared.get(path: "/api/athlete/free-plan", bearer: bearer)
    }
}

struct FreePlanPayload: Decodable {
    let raceEvidence: FreeRaceEvidence?
    let goalCheck: FreeGoalCheck?
    let week: FreePlannedWeek?
}

// MARK: - What his races prove

/// Enough to name a race on screen.
struct FreeRaceRef: Decodable, Hashable {
    let raceId: Int
    let name: String
    let location: String?
    let raceDate: String?
    /// "singles" | "doubles" | "relay".
    let format: String
    let division: String?
    let genderCategory: String?

    /// True when the numbers on this race belong to two athletes, not one.
    var isTeam: Bool { format == "doubles" || format == "relay" }
}

struct FreeFinishEvidence: Decodable {
    let race: FreeRaceRef
    let totalSeconds: Int
    /// The official time was the TEAM's. Never shown without naming the format.
    let teamResult: Bool
}

struct FreeRunEvidence: Decodable {
    let race: FreeRaceRef
    let totalSeconds: Int
    let paceSPerKm: Double
    /// In a team race both run every kilometre, but they run TOGETHER — so this
    /// is a floor on his own running, not a measurement of it.
    let partnerBounded: Bool
}

struct FreeRoxzoneEvidence: Decodable {
    let race: FreeRaceRef
    let seconds: Int
}

struct FreeRunTrend: Decodable {
    /// "mejora" | "empeora" | "estable".
    let direction: String
    let deltaSPerKm: Double
    let racesCounted: Int
}

struct FreeRaceEvidence: Decodable {
    let racesCounted: Int
    let bestFinish: FreeFinishEvidence?
    let bestRun: FreeRunEvidence?
    let latestRun: FreeRunEvidence?
    let bestRoxzone: FreeRoxzoneEvidence?
    /// Only ever non-nil for solo races — a team run trend is partner noise.
    let runTrend: FreeRunTrend?
}

// MARK: - His goal against his own reality

struct FreeGoalCheck: Decodable {
    let target: FreeRaceRef
    let goalSeconds: Int
    let comparableBest: FreeFinishEvidence?
    /// "sin_carreras" | "formato_distinto". Set exactly when there is no comparison.
    let notComparableReason: String?
    /// goal − best. Positive = the goal is slower than what he has already run.
    let deltaSeconds: Int?
}

// MARK: - The proposed week

struct FreeStationWork: Decodable, Hashable {
    /// "wall_balls" | "burpee_broad_jump".
    let station: String
    let reps: Int
}

struct FreeRunPrescription: Decodable {
    /// "intervals" | "continuous" | "hybrid_rounds".
    let shape: String
    let reps: Int
    let distanceM: Int?
    let durationS: Int?
    let targetPaceSPerKm: Int
    let restS: Int?
    let stations: [FreeStationWork]
}

struct FreeErgPrescription: Decodable {
    /// "ski" | "row".
    let erg: String
    let reps: Int
    let distanceM: Int
    /// Seconds per 500 m. The wire says `target_pace_s_per_500` (not `…_500m`):
    /// `.convertFromSnakeCase` capitalises each component and a component that
    /// starts with a digit cannot be capitalised, so a trailing `m` would break
    /// the mapping silently. Same reason for `percentOfOneRm` below.
    let targetPaceSPer500: Int
    let restS: Int
}

struct FreeStrengthPrescription: Decodable {
    let exerciseSlug: String
    let oneRmKg: Double
    let percentOfOneRm: Double
    let sets: Int
    let reps: Int
    let loadKg: Double
    let rir: Int
    let restS: Int
    let tempo: String
}

struct FreeSessionBasis: Decodable {
    /// The shared evidence vocabulary: "marca" | "carrera" | "vo2max" | …
    let source: String
    let race: FreeRaceRef?
    let markSlug: String?
}

struct FreePlannedSession: Decodable, Identifiable {
    /// "run_quality" | "strength" | "erg" | "hybrid" | "long_run".
    let kind: String
    /// Monday = 0 … Sunday = 6.
    let weekday: Int
    let run: FreeRunPrescription?
    let erg: FreeErgPrescription?
    let strength: FreeStrengthPrescription?
    let basis: FreeSessionBasis

    var id: String { "\(kind)-\(weekday)" }
}

struct FreePlannedWeek: Decodable {
    let sessions: [FreePlannedSession]
    /// How many render unblurred. The rest are real sessions, shown blurred.
    let visibleCount: Int
}
