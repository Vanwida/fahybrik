import Foundation

// Athlete strength maxes from GET /api/athlete/benchmarks and POST
// /api/athlete/strength-test (athlete Bearer auth). Mirrors ZonesService:
// the server is AUTHORITATIVE — it resolves the 1RM (the coach may use a
// formula other than Epley) and stores a new versioned max, so a re-fetch
// reflects a submission immediately. The Epley preview below is ONLY an
// instant client-side hint while the athlete types; it is never persisted
// and never shown as the stored value.
//
// APIClient's decoder uses `convertFromSnakeCase`, so snake_case wire fields
// (`exercise_slug`, `one_rm_kg`, `recorded_at`, `test_weight_kg`, …) map to
// these camelCase properties automatically. `recordedAt` is decoded as a raw
// String and parsed defensively (reuses ZoneDateParser): the value is an ISO
// timestamp, but decoding it as `Date` would, on any unexpected shape, take
// the whole payload down — a String never does.

struct AthleteBenchmarksResponse: Decodable {
    /// AUDIT-B3 — a malformed lift is dropped, not the whole list.
    @LossyArray var maxes: [StrengthMaxProfile]
}

/// One lift's CURRENT (highest-version) 1RM plus its prior versions, for the
/// evolution view. Identified by `exerciseSlug` so SwiftUI can diff rows.
struct StrengthMaxProfile: Codable, Identifiable {
    var id: String { exerciseSlug }
    let exerciseSlug: String
    let exerciseLabel: String
    let oneRmKg: Double
    let unit: String
    let source: String
    let version: Int?
    let recordedAt: String?       // ISO timestamp; parsed defensively below.
    /// The test that produced this max (weight × reps). Nil when the max was
    /// not entered as a rep test (e.g. a coach override or onboarding seed).
    let testWeightKg: Double?
    let testReps: Int?
    /// Prior + current versions as the backend returns them, for the trend.
    /// AUDIT-B3 — a malformed point is dropped, not the whole lift.
    @LossyArray var history: [StrengthMaxPoint]

    /// Human "20 jun 2026" from `recordedAt`. Nil when absent/unparseable —
    /// never guessed. Reuses ZoneDateParser (shared module-internal parser).
    var recordedDateLabel: String? {
        guard let recordedAt, let date = ZoneDateParser.parse(recordedAt) else { return nil }
        return ZoneDateParser.display(date)
    }

    /// "117 kg" — the stored 1RM rounded to whole kg for display.
    var oneRmLabel: String { "\(Int(oneRmKg.rounded())) kg" }
}

/// One past 1RM datapoint for the evolution view (a single version).
struct StrengthMaxPoint: Codable, Identifiable {
    var id: Int { version }
    let oneRmKg: Double
    let version: Int
    let recordedAt: String
    let source: String
}

enum StrengthService {
    static func fetch(bearer: String) async throws -> [StrengthMaxProfile] {
        let resp: AthleteBenchmarksResponse = try await APIClient.shared.get(
            path: "api/athlete/benchmarks",
            bearer: bearer
        )
        return resp.maxes
    }

    /// Self-enter a strength test (lift + weight × reps) → POST
    /// /api/athlete/strength-test. The backend computes the 1RM and stores a
    /// new versioned max (source='athlete_test'), returning it; we surface the
    /// new `version` so callers can confirm/refresh. A re-fetch reflects it
    /// immediately.
    @discardableResult
    static func submitTest(
        exerciseSlug: String,
        weightKg: Double,
        reps: Int,
        bearer: String
    ) async throws -> Int {
        // camelCase Body → convertToSnakeCase emits exercise_slug / weight_kg /
        // reps, matching the backend zod schema.
        struct Body: Encodable {
            let exerciseSlug: String
            let weightKg: Double
            let reps: Int
        }
        struct Resp: Decodable {
            struct Max: Decodable { let version: Int }
            let max: Max
        }
        let resp: Resp = try await APIClient.shared.post(
            path: "api/athlete/strength-test",
            body: Body(exerciseSlug: exerciseSlug, weightKg: weightKg, reps: reps),
            bearer: bearer
        )
        return resp.max.version
    }

    // MARK: - Lift catalog
    //
    // Mirrors the shared TS strength-lift domain (iOS can't import TypeScript).
    // Order is the canonical display order; `abbrev` is the short code for
    // dense contexts.
    struct StrengthLift: Identifiable {
        var id: String { slug }
        let slug: String
        let label: String
        let abbrev: String
    }

    static let STRENGTH_LIFTS: [StrengthLift] = [
        StrengthLift(slug: "back_squat_1rm",  label: "Sentadilla",    abbrev: "SQ"),
        StrengthLift(slug: "deadlift_1rm",    label: "Peso muerto",   abbrev: "DL"),
        StrengthLift(slug: "bench_press_1rm", label: "Press banca",   abbrev: "BP"),
        StrengthLift(slug: "ohp_1rm",         label: "Press militar", abbrev: "OHP"),
        StrengthLift(slug: "clean_1rm",       label: "Cargada",       abbrev: "CL"),
        StrengthLift(slug: "snatch_1rm",      label: "Arrancada",     abbrev: "SN"),
    ]

    /// Client-side Epley estimate for an INSTANT preview as the athlete types.
    /// The authoritative 1RM is always the server's response (the coach may use
    /// a different formula); this is never persisted. reps ≤ 1 ⇒ the weight is
    /// already a 1RM. Rounded to 1 decimal.
    static func estimatedOneRm(weightKg: Double, reps: Int) -> Double {
        guard reps > 1 else { return (weightKg * 10).rounded() / 10 }
        let est = weightKg * (1 + Double(reps) / 30)
        return (est * 10).rounded() / 10
    }
}
