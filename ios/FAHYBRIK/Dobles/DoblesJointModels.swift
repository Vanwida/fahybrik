import Foundation

// #28 — the JOINT dobles surfaces: the post-workout side-by-side card (GET
// dobles/joint-summary) and the pair-rhythm streak (the additive `streak` block on
// GET dobles/plan). Wire models + the PURE presentation/gating so the honest-null
// rules (no partner yet, no strength load, no PR) are unit-tested, not eyeballed.
//
// Wire is snake_case; APIClient's convertFromSnakeCase maps it to camelCase here
// (total_time_s → totalTimeS, joint_this_month → jointThisMonth …). `self` is a
// reserved word, so the DTO aliases it to `selfSide` via CodingKeys.

// MARK: - Joint summary (wire)

/// One athlete's side of the joint summary. Honest-null throughout: a field the
/// athlete didn't record stays nil and the UI hides it (never a fabricated 0).
struct JointSummarySide: Decodable, Equatable {
    let name: String?
    let totalTimeS: Int?
    let rpe: Int?
    let prCount: Int
    /// kg moved (Σ load×reps); nil when the session logged no strength load → the
    /// stat hides.
    let tonnageKg: Double?
}

struct JointSummaryDTO: Decodable, Equatable {
    let selfSide: JointSummarySide
    /// nil until the partner has logged their own side (honest-null).
    let partner: JointSummarySide?
    let jointThisMonth: Int
    let weeksStreak: Int

    enum CodingKeys: String, CodingKey {
        case selfSide = "self"       // convertFromSnakeCase leaves "self" as-is
        case partner
        case jointThisMonth          // ← joint_this_month
        case weeksStreak             // ← weeks_streak
    }
}

// MARK: - Streak block (additive on GET dobles/plan)

struct DoblesStreakBlock: Codable, Hashable {
    let jointThisMonth: Int
    let weeksStreak: Int
    let lastJoint: DoblesLastJoint?

    /// True when the pair has ANY joint history — otherwise the whole section hides
    /// (a fresh pair shows nothing rather than a sad "0 este mes").
    var hasHistory: Bool { jointThisMonth > 0 || weeksStreak > 0 || lastJoint != nil }
}

struct DoblesLastJoint: Codable, Hashable {
    let date: String            // YYYY-MM-DD (Madrid)
    let title: String
    let selfTimeS: Int?
    let partnerTimeS: Int?
}

// MARK: - Joint share data (pure)

/// The honest snapshot the joint card renders (on-screen + the shared PNG). Built
/// only when the partner has logged their side; each field is real or omitted.
struct JointShareData: Equatable {
    struct Side: Equatable {
        let name: String
        let timeText: String        // "47:12" — "—" when no time recorded
        let rpe: Int?               // nil → the RPE stat hides
        let tonnageText: String?    // "500 kg" — nil when no load logged
        let prCount: Int
        var hasPR: Bool { prCount >= 1 }
    }

    let title: String
    let dateText: String
    let selfSide: Side
    let partnerSide: Side
    /// "3ª sesión juntos este mes".
    let footerText: String

    /// Build from the summary DTO. Nil when `partner` is null (no side-by-side yet).
    /// `partnerFallback` names the partner when the wire side has none (it does carry
    /// the name, but the plan view already knows it too).
    static func from(dto: JointSummaryDTO, title: String, date: Date, partnerFallback: String?) -> JointShareData? {
        guard let partner = dto.partner else { return nil }
        return JointShareData(
            title: title,
            dateText: DoblesJointFormat.shortDate(date),
            selfSide: side(dto.selfSide, fallback: "Tú"),
            partnerSide: side(partner, fallback: DoblesJointFormat.trimmed(partnerFallback) ?? "Compañero"),
            footerText: "\(dto.jointThisMonth)ª sesión juntos este mes"
        )
    }

    private static func side(_ s: JointSummarySide, fallback: String) -> Side {
        Side(
            name: DoblesJointFormat.trimmed(s.name) ?? fallback,
            timeText: s.totalTimeS.map { Formato.clock($0) } ?? "—",
            rpe: s.rpe,
            tonnageText: s.tonnageKg.map { "\(Int($0.rounded())) kg" },
            prCount: s.prCount
        )
    }
}

// MARK: - Formatting

enum DoblesJointFormat {
    /// "13 jul 2026" from a Date, box-local.
    static func shortDate(_ date: Date) -> String {
        let c = HistoryCalendar.boxComponents(date)
        guard let d = c.day, let m = c.month, let y = c.year, (1...12).contains(m) else { return "" }
        return "\(d) \(HistoryCalendar.monthAbbrevEs[m - 1]) \(y)"
    }

    /// "15 jul" from a YYYY-MM-DD ISO string (the last-joint date).
    static func isoDayMonth(_ iso: String) -> String {
        guard let p = HistoryCalendar.parseISO(iso) else { return iso }
        return "\(p.day) \(HistoryCalendar.monthAbbrevEs[p.month - 1])"
    }

    static func trimmed(_ s: String?) -> String? {
        let t = s?.trimmingCharacters(in: .whitespaces)
        return (t?.isEmpty == false) ? t : nil
    }
}

// MARK: - Reader

/// GET /api/athlete/dobles/joint-summary?assignment_id=N. Nil on any non-partner
/// outcome (404 no_partner / not_joint, net error) → the summary shows no joint card.
enum JointSummaryService {
    static func fetch(assignmentId: String, bearer: String?) async -> JointSummaryDTO? {
        guard Int(assignmentId) != nil else { return nil }
        do {
            return try await APIClient.shared.get(
                path: "api/athlete/dobles/joint-summary?assignment_id=\(assignmentId)",
                bearer: bearer
            )
        } catch {
            return nil
        }
    }
}
