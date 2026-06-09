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
    let userId: String
    let athleteId: String?
    let fullName: String
    let email: String?
    let modality: String?
    let onboardedAt: String?
}

struct PartnerEnvelope: Codable, Equatable {
    let partner: PartnerInfo?
    /// Optional envelope-level hint. Backend (W4) does NOT currently expose
    /// self-modality on this endpoint — kept as a forward-compat field so a
    /// future backend version can populate it without an iOS change.
    let athleteModality: String?
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
    /// or a single letter when only one name component is available.
    var initials: String {
        let parts = fullName
            .split(whereSeparator: { $0.isWhitespace })
            .map(String.init)
        if parts.count >= 2,
           let first = parts.first?.first,
           let last = parts.last?.first {
            return "\(first)\(last)".uppercased()
        }
        if let only = parts.first?.first {
            return String(only).uppercased()
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
        .foregroundStyle(Theme.Color.accent)
        .padding(.horizontal, compact ? 6 : 8)
        .padding(.vertical, compact ? 2 : 3)
        .background(Theme.Color.accent.opacity(0.15))
        .clipShape(Capsule())
    }
}
