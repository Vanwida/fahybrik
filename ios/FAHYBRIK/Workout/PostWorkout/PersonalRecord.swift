import Foundation

// MARK: - Personal records (#65) — the running-mark domain
//
// The post-workout sync response reports any RUNNING personal record the athlete
// set in this session. The value is ALWAYS the running mark for a fixed distance —
// never a test result — so every athlete-facing string here says "corriendo".
//
// Wire contract (frozen, snake_case; decoded with the shared convertFromSnakeCase
// decoder so `new_value_s` → `newValueS`):
//   prs: [{ kind: "run_1k"|"run_3k"|"run_5k",
//           new_value_s: number,          // run_1k = ritmo s/km; 3k/5k = tiempo total s
//           prev_value_s: number | null }] // null = primera marca de esa distancia
//
// Pure Foundation (no SwiftUI): the celebration view + the share card read this,
// and the decode/format is unit-tested without a UI.

/// The three running distances the backend tracks a personal record for. Decoded
/// permissively (unknown kinds are dropped, never crash) via `init?(rawValue:)`.
enum PRKind: String, Equatable, CaseIterable {
    case run1k = "run_1k"   // value = ritmo s/km (== tiempo del kilómetro)
    case run3k = "run_3k"   // value = tiempo total (s)
    case run5k = "run_5k"   // value = tiempo total (s)

    /// Athlete-facing distance label ("1 km" / "3 km" / "5 km").
    var distanceLabel: String {
        switch self {
        case .run1k: return "1 km"
        case .run3k: return "3 km"
        case .run5k: return "5 km"
        }
    }
}

/// One running personal record, resolved to a known distance. `newValueS` is the
/// new mark in seconds (a /km pace for 1k, a total time for 3k/5k); `prevValueS`
/// is the previous best, or nil for the athlete's FIRST mark of that distance.
struct PersonalRecord: Equatable {
    let kind: PRKind
    let newValueS: Double
    let prevValueS: Double?

    /// True when this is the athlete's first-ever mark of the distance — a
    /// milestone, but NOT an improvement over a prior best.
    var isFirstMark: Bool { prevValueS == nil }

    /// Seconds shaved off the previous best (≥ 0). Nil for a first mark. A record
    /// that didn't actually improve (0 s) collapses to nil so no "0 s" is shown.
    var improvementSeconds: Double? {
        guard let prev = prevValueS else { return nil }
        let delta = prev - newValueS
        return delta > 0 ? delta : nil
    }

    /// The new mark as a clock string ("21:48"), reusing the session's formatter so
    /// the value reads exactly like the rest of the app.
    var formattedValue: String { Formato.clock(newValueS) }

    /// Unambiguous headline for the celebration: it is the athlete's fastest RUN of
    /// this distance (a genuine PR) or their first mark of it — never a test.
    var headline: String {
        isFirstMark
            ? "Tu primera marca de \(kind.distanceLabel) corriendo"
            : "Tu \(kind.distanceLabel) más rápido corriendo"
    }

    /// Secondary line under the new value: how much faster than the previous best,
    /// or a first-mark note. Nil when there is nothing honest to add.
    var deltaLine: String? {
        if isFirstMark { return "Primera vez que lo corres — a partir de aquí, a mejorarla." }
        guard let improvement = improvementSeconds else { return nil }
        return "\(PersonalRecord.formatDelta(improvement)) más rápido que tu marca anterior"
    }

    /// Format a positive seconds delta as "14 s" (< 60 s) or "1:12" (≥ 60 s).
    static func formatDelta(_ seconds: Double) -> String {
        let total = Int(seconds.rounded())
        if total < 60 { return "\(total) s" }
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

// MARK: - Wire decode
//
// Decoded from the sync response. Strict types (numbers as numbers): a malformed
// entry fails the whole decode → the caller treats it as "no records" (no
// celebration, no crash). `prs` is optional so a response that omits the key is
// tolerated as an empty list.

private struct PRWire: Decodable {
    let kind: String
    let newValueS: Double
    let prevValueS: Double?
}

/// The subset of the /workout-execution (and dobles /log) response the client
/// reads: the list of records set. Extra response keys are ignored.
struct WorkoutExecutionResponse: Decodable {
    private let prs: [PRWire]?

    /// The records set this session, resolved to KNOWN distances (unknown `kind`
    /// values are skipped, never fatal). Empty when the athlete set none.
    var personalRecords: [PersonalRecord] {
        (prs ?? []).compactMap { wire in
            guard let kind = PRKind(rawValue: wire.kind) else { return nil }
            return PersonalRecord(kind: kind, newValueS: wire.newValueS, prevValueS: wire.prevValueS)
        }
    }
}

// MARK: - #58 · Structured session feedback (to the coach)
//
// Optional feedback the athlete adds on the post-workout summary. It travels in
// the SAME execution POST (solo / dobles) — the wire values are frozen snake_case
// strings. Only offered for a PRESCRIBED session (there is a coach prescription to
// judge "fácil/duro" against); the athlete's own free workout doesn't collect it.

/// How the session felt versus what the coach prescribed. Wire: perceived_difficulty.
enum PerceivedDifficulty: String, CaseIterable, Identifiable, Equatable {
    case tooEasy = "too_easy"
    case asExpected = "as_expected"
    case tooHard = "too_hard"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .tooEasy:    return "Fácil de más"
        case .asExpected: return "Como debía"
        case .tooHard:    return "Duro de más"
        }
    }
}

/// Body area of any physical niggle. Wire: pain_area (the rawValue itself).
enum PainArea: String, CaseIterable, Identifiable, Equatable {
    case rodilla, tobillo, cadera, espalda, hombro, otra

    var id: String { rawValue }

    /// Capitalised ES label (the wire value is the lowercased rawValue).
    var label: String {
        switch self {
        case .rodilla: return "Rodilla"
        case .tobillo: return "Tobillo"
        case .cadera:  return "Cadera"
        case .espalda: return "Espalda"
        case .hombro:  return "Hombro"
        case .otra:    return "Otra"
        }
    }

    /// Max length the backend accepts for the free note that accompanies an area.
    static let maxNoteLength = 500
}

// MARK: - #59 · App Store review gating (pure)
//
// Whether to ask for an App Store review NOW. Pure: given the persisted state it
// returns a yes/no, with no side effects — the caller records the request and
// fires SKStoreReviewController only on a `true`. Apple's own throttling is a
// second layer on top of this; these thresholds keep US from asking at bad times.
enum ReviewGate {
    /// Tenure path: at least this many days since first use…
    static let minDaysSinceFirstUse = 21
    /// …AND at least this many saved workouts.
    static let minWorkoutsForReview = 6
    /// Never ask more often than this (well inside Apple's 3-per-365-days limit).
    static let minDaysBetweenRequests = 180
    /// Never ask within this window after the athlete reported "Algo falla" — a
    /// review prompt right after a bug report reads as tone-deaf.
    static let bugReportCooldownHours = 24

    private static let secondsPerDay: Double = 86_400
    private static let secondsPerHour: Double = 3_600

    /// Decide whether to request a review.
    /// - Parameters:
    ///   - afterGenuinePR: true only right after a REAL personal record (a beaten
    ///     mark, not a first mark) celebration was dismissed — a standalone good
    ///     moment that bypasses the tenure/volume threshold.
    static func shouldRequest(
        now: Date,
        firstUseAt: Date?,
        workoutsSaved: Int,
        lastRequestedAt: Date?,
        lastBugReportAt: Date?,
        afterGenuinePR: Bool
    ) -> Bool {
        // 1) Never within 24h of a bug report.
        if let bug = lastBugReportAt,
           now.timeIntervalSince(bug) < Double(bugReportCooldownHours) * secondsPerHour {
            return false
        }
        // 2) Respect the minimum interval between requests.
        if let last = lastRequestedAt,
           now.timeIntervalSince(last) < Double(minDaysBetweenRequests) * secondsPerDay {
            return false
        }
        // 3) A genuine PR is itself a sufficient good moment.
        if afterGenuinePR { return true }
        // 4) Otherwise require tenure AND volume.
        guard let first = firstUseAt else { return false }
        let days = now.timeIntervalSince(first) / secondsPerDay
        return days >= Double(minDaysSinceFirstUse) && workoutsSaved >= minWorkoutsForReview
    }
}
