import Foundation
import SwiftUI

// Dobles partner snapshot returned by `GET /api/athlete/partner`.
//
// Backend contract (see /Users/alexsolecarretero/Public/projects/FAHYBRIK/
// infra/migrations/0021_dobles_weekly_plans.sql + the parallel backend-dobles
// agent): partner is the *other* user paired via `users.partner_id`. Returns
// `null` when the athlete is unpaired or is on an individual subscription.
//
// `athlete_modality` is an optional envelope-level hint about the *requesting*
// athlete's modality ("individual" | "dobles" | "pro_elite"). The Profile UI
// uses it to decide whether to show the partner card at all — see
// `ProfileView.partnerSection`. Optional so the backend can ship without it
// and the client falls back to showing the card only when a partner exists.
struct PartnerInfo: Codable, Equatable {
    /// Present for a billing/social pair (`users.partner_id`); absent for a
    /// coach-created `doubles_pair` (which is keyed on athletes, not users).
    /// Optional so BOTH envelope sources decode through one model.
    let userId: String?
    let athleteId: String?
    let fullName: String
    let email: String?
    let modality: String?
    let onboardedAt: String?

    // MARK: - Training snapshot (the Hoy "Tu pareja" panel)
    //
    // Populated for a `doubles_pair` source: the partner's TODAY session
    // (done / pending), THIS week's shared-session progress, and the most
    // recent finished sessions. For a `billing_partner` source `today` is
    // null, `week` is 0/0 and `recent` is empty (no training relationship).
    // `var … = nil` (not `let`) so the synthesized Decodable still decodes them
    // while the memberwise init keeps a default for non-snapshot call sites.
    var today: PartnerTodayWorkout? = nil
    var week: PartnerWeekProgress? = nil
    var recent: [PartnerRecentSession]? = nil
}

/// The partner's session scheduled for today, or null when none / private.
/// `status` mirrors the backend `assignment_status`: scheduled | completed |
/// missed | skipped.
struct PartnerTodayWorkout: Codable, Equatable {
    let assignmentId: Int?
    let workoutName: String?
    let status: String

    var isDone: Bool { status.lowercased() == "completed" }
}

/// This week's shared-session progress (Mon–Sun, box tz).
struct PartnerWeekProgress: Codable, Equatable {
    let completed: Int
    let total: Int

    /// 0…1 fill for the progress bar; 0 when the week has no sessions.
    var fraction: Double {
        total > 0 ? min(1, max(0, Double(completed) / Double(total))) : 0
    }
}

/// One of the partner's most recent finished sessions (newest first).
struct PartnerRecentSession: Codable, Equatable, Identifiable {
    let assignmentId: Int?
    let date: String            // "YYYY-MM-DD"
    let workoutName: String?
    let status: String          // completed | missed | skipped
    let durationSeconds: Int?
    let perceivedExertion: Double?
    // Result of the session. In HYROX the TIME is the headline result; strength/
    // metcon report rounds+reps. All optional (a session may carry none).
    let scoreTimeS: Int?
    let scoreRounds: Int?
    let scoreReps: Int?
    /// True when this session was logged as a JOINT "train together" with the
    /// viewing athlete (backend reads workout_executions.partner_athlete_id).
    let trainedTogether: Bool?

    var id: Int { assignmentId ?? date.hashValue }

    /// Whether the two trained this session together (nil-safe).
    var isJoint: Bool { trainedTogether == true }

    /// Pre-formatted headline result: "H:MM:SS" / "M:SS" for a timed HYROX
    /// result, else "N rondas +M" for an AMRAP, else nil (show duration/RPE).
    var scoreText: String? {
        if let s = scoreTimeS, s > 0 {
            let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
            return h > 0
                ? String(format: "%d:%02d:%02d", h, m, sec)
                : String(format: "%d:%02d", m, sec)
        }
        if let r = scoreRounds, r > 0 {
            let reps = (scoreReps ?? 0) > 0 ? " +\(scoreReps!)" : ""
            return "\(r) rondas\(reps)"
        }
        return nil
    }
}

struct PartnerEnvelope: Codable, Equatable {
    /// "doubles_pair" (training pair → snapshot) | "billing_partner" (profile
    /// only) | nil (no partner). The Hoy panel only shows for "doubles_pair".
    let source: String?
    let partner: PartnerInfo?
    /// Optional envelope-level hint. Backend (W4) does NOT currently expose
    /// self-modality on this endpoint — kept as a forward-compat field so a
    /// future backend version can populate it without an iOS change.
    let athleteModality: String?

    /// True when the envelope carries a coach-created training pair — the only
    /// case the Hoy "Tu pareja" panel renders for.
    var isDoublesPair: Bool { source == "doubles_pair" && partner != nil }
}

extension PartnerInfo {
    /// First name used in the PlanView "Con [X]" badge. Falls back to the
    /// full name when there is no whitespace to split on.
    var firstName: String {
        let trimmed = fullName.trimmingCharacters(in: .whitespaces)
        if let space = trimmed.firstIndex(of: " ") {
            return String(trimmed[..<space])
        }
        return trimmed
    }

    /// Initials for the avatar circle: first + last word for multi-part names,
    /// or the first two letters when only one name component is available.
    /// Single-character names degrade to just that letter (`prefix(2)` is
    /// bounds-safe), and an empty/whitespace-only name falls back to a bullet.
    var initials: String {
        let parts = fullName
            .split(whereSeparator: { $0.isWhitespace })
            .map(String.init)
        if parts.count >= 2,
           let first = parts.first?.first,
           let last = parts.last?.first {
            return "\(first)\(last)".uppercased()
        }
        if let only = parts.first {
            return String(only.prefix(2)).uppercased()
        }
        return "·"
    }
}

// MARK: - PartnerBadge
//
// Compact orange pill used wherever we surface "Con [partner]" — PlanView
// hero (full size) + session rows (compact). Kept brand-consistent: accent
// background at low opacity + accent foreground.
struct PartnerBadge: View {
    let text: String
    var compact: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "person.2.fill")
                .font(.system(size: compact ? 9 : 10, weight: .semibold))
            Text(text)
                .font(.system(size: compact ? 10 : 11, weight: .semibold))
                .lineLimit(1)
        }
        .foregroundStyle(Theme.Color.accentText)
        .padding(.horizontal, compact ? 6 : 8)
        .padding(.vertical, compact ? 2 : 3)
        .background(Theme.Color.accent.opacity(0.15))
        .clipShape(Capsule())
    }
}
