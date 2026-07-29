import Foundation

// Fase 3 — el camino al objetivo (gap board) y predicho vs real.
//
// Two live reads that close the loop between the athlete's training and the
// race clock:
//   • GET /api/athlete/goal-gap            → GoalGap        (Pantalla B)
//   • GET /api/athlete/prediction-review   → PredictionReview (Pantalla C)
//
// Both degrade HONESTLY: enum-ish wire fields (availability / tier / kind /
// budget_source) are decoded as plain strings and interpreted tolerantly, so a
// tier or kind the app has never seen renders as a neutral row instead of taking
// the whole payload down. The segment/row arrays decode element-wise-lossily and
// key-optionally (a malformed segment is dropped, a missing array → []), matching
// the LossyArray resilience the plan detail already relies on.
//
// Property names are camelCase to match the APIClient's `.convertFromSnakeCase`
// decode (wire `label_es` → `labelEs`, `predicted_total_s` → `predictedTotalS`,
// …), exactly like UpcomingRace — so no CodingKeys are needed.

// MARK: - Goal gap (Pantalla B)

/// The objective the board measures against: its label ("Sub-60"), the total
/// budget in seconds (nil for a no-clock "acabarla" goal), and the race it's
/// pinned to.
struct GoalGapGoal: Codable, Hashable {
    let label: String
    let totalS: Int?
    let raceName: String?
    let raceDate: String?
}

/// One row of the gap board: a run leg, a work station, or the roxzone. `budgetS`
/// is what the objective asks of this segment; `predictedS` is where the
/// athlete's training says they'd land today; `deltaS` is the signed gap
/// (predicted − budget). `tier` is the evidence level; `kind` drives the row
/// treatment (roxzone renders muted so the totals still close).
struct GoalGapSegment: Codable, Hashable, Identifiable {
    let slug: String
    let labelEs: String
    let kind: String        // 'run' | 'station' | 'roxzone' (tolerant)
    let budgetS: Int?
    let predictedS: Int?
    let tier: String        // 'observado' | 'estimado' | 'sin_datos' (tolerant)
    let deltaS: Int?

    var id: String { slug }

    var isRoxzone: Bool { kind.lowercased() == "roxzone" }
    var isSinDatos: Bool { tier.lowercased() == "sin_datos" }

    /// Evidence-tier chip label. Unknown tiers show NO chip rather than echoing a
    /// raw token — honest degradation for a value the app hasn't shipped copy for.
    var tierLabel: String? {
        switch tier.lowercased() {
        case "observado": return "observado"
        case "estimado":  return "estimado"
        default:          return nil
        }
    }

    /// True when the prediction exceeds the budget — the "falta" state (orange bar
    /// + positive delta). Nil budget/prediction → not over (nothing to compare).
    var isOver: Bool {
        guard let budgetS, let predictedS else { return false }
        return predictedS > budgetS
    }
}

/// `GET /api/athlete/goal-gap`. `availability` gates the whole screen:
/// ok | no_goal | no_target_race | no_data. Segments decode resiliently.
struct GoalGap: Codable, Hashable {
    let availability: String
    let goal: GoalGapGoal?
    let predictedTotalS: Int?
    let gapS: Int?
    let budgetSource: String?   // 'cohorte' | 'tu_carrera' | nil
    let segments: [GoalGapSegment]
    let updatedAt: String?

    var isOK: Bool { availability.lowercased() == "ok" }

    enum CodingKeys: String, CodingKey {
        case availability, goal, predictedTotalS, gapS, budgetSource, segments, updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        availability = (try? c.decode(String.self, forKey: .availability)) ?? "no_data"
        goal = try? c.decodeIfPresent(GoalGapGoal.self, forKey: .goal)
        predictedTotalS = try? c.decodeIfPresent(Int.self, forKey: .predictedTotalS)
        gapS = try? c.decodeIfPresent(Int.self, forKey: .gapS)
        budgetSource = try? c.decodeIfPresent(String.self, forKey: .budgetSource)
        updatedAt = try? c.decodeIfPresent(String.self, forKey: .updatedAt)
        // Element-wise lossy + key-optional: a malformed segment is dropped, a
        // missing `segments` key → [] (honest empty), never a decode failure.
        segments = (try? c.decodeIfPresent(LossyArray<GoalGapSegment>.self, forKey: .segments))?
            .wrappedValue ?? []
    }
}

// MARK: - Predicho vs real (Pantalla C)

/// One station line in the prediction-vs-actual table: what we predicted, what
/// the athlete actually did, and the signed delta (actual − predicted).
struct PredictionReviewRow: Codable, Hashable, Identifiable {
    let slug: String
    let labelEs: String
    let predictedS: Int?
    let actualS: Int?
    let deltaS: Int?

    var id: String { slug }
}

/// `GET /api/athlete/prediction-review?race_id=…` (or `?execution_id=…`). Only
/// rendered when `availability == "ok"` AND a prior prediction snapshot existed —
/// otherwise there is nothing to compare and the card stays hidden (no empty
/// state here, by design).
struct PredictionReview: Codable, Hashable {
    let availability: String
    let predictedTotalS: Int?
    let actualTotalS: Int?
    let accuracyPct: Double?
    let accuracyLabelEs: String?
    let segments: [PredictionReviewRow]
    let insightEs: String?
    let raceName: String?
    let raceDate: String?

    var isOK: Bool { availability.lowercased() == "ok" }

    enum CodingKeys: String, CodingKey {
        case availability, predictedTotalS, actualTotalS, accuracyPct
        case accuracyLabelEs, segments, insightEs, raceName, raceDate
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        availability = (try? c.decode(String.self, forKey: .availability)) ?? "no_snapshot"
        predictedTotalS = try? c.decodeIfPresent(Int.self, forKey: .predictedTotalS)
        actualTotalS = try? c.decodeIfPresent(Int.self, forKey: .actualTotalS)
        accuracyPct = try? c.decodeIfPresent(Double.self, forKey: .accuracyPct)
        accuracyLabelEs = try? c.decodeIfPresent(String.self, forKey: .accuracyLabelEs)
        insightEs = try? c.decodeIfPresent(String.self, forKey: .insightEs)
        raceName = try? c.decodeIfPresent(String.self, forKey: .raceName)
        raceDate = try? c.decodeIfPresent(String.self, forKey: .raceDate)
        segments = (try? c.decodeIfPresent(LossyArray<PredictionReviewRow>.self, forKey: .segments))?
            .wrappedValue ?? []
    }
}

// MARK: - Service

enum GoalGapService {
    /// Load the gap board. Returns nil on no-bearer / request failure / decode
    /// failure so the view renders an honest error-retry state (and, crucially,
    /// so a not-yet-shipped endpoint degrades to that state instead of crashing).
    static func fetchGoalGap(bearer: String?) async -> GoalGap? {
        guard let bearer else { return nil }
        return try? await APIClient.shared.get(path: "api/athlete/goal-gap", bearer: bearer)
    }

    /// Load the predicho-vs-real review for one race (or simulation execution).
    /// Returns nil on no-bearer / failure — the card self-hides, so a missing
    /// snapshot or a not-yet-shipped endpoint simply shows nothing.
    static func fetchPredictionReview(raceId: String, bearer: String?) async -> PredictionReview? {
        guard let bearer else { return nil }
        let encoded = raceId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? raceId
        return try? await APIClient.shared.get(
            path: "api/athlete/prediction-review?race_id=\(encoded)",
            bearer: bearer
        )
    }
}

// MARK: - Formatting (shared across B + C)

/// Numeric formatters shared by the gap board and the prediction review, so a
/// signed delta or a precision percent reads identically on both surfaces.
enum GoalGapFormat {
    /// Signed m:ss / h:mm:ss delta — "+0:24" ahead-of-budget, "−0:18" under. Uses
    /// the real minus (U+2212), matching the app's other signed deltas. A zero
    /// delta reads "±0:00".
    static func signedDuration(_ seconds: Int) -> String {
        let magnitude = Formato.clock(Double(abs(seconds)))
        if seconds > 0 { return "+\(magnitude)" }
        if seconds < 0 { return "\u{2212}\(magnitude)" }
        return "±\(magnitude)"
    }

    /// Race-clock total in RUNNING MINUTES — 3825 → "63:45", never "1:03:45".
    /// The whole goal frame speaks in minutes ("sub-60", "sub-90"), so the board's
    /// totals read on that same scale (matches the approved mockup).
    static func raceClock(_ seconds: Int) -> String {
        let m = abs(seconds) / 60
        let s = abs(seconds) % 60
        return String(format: "%d:%02d", m, s)
    }

    /// Precision percent with a Spanish decimal comma and one fraction digit —
    /// 0.7 → "0,7%". Non-negative magnitude (the sign of the error isn't shown).
    static func precisionPercent(_ value: Double) -> String {
        let one = String(format: "%.1f", abs(value)).replacingOccurrences(of: ".", with: ",")
        return "\(one)%"
    }
}
