import SwiftUI

// #56 — the DOBLES turn HERO shown at the top of a simulation station: whose turn it
// is (orange = you, blue = the partner), the station, the rep reparto, a bicolor bar
// for a shared station and the "Después:" preview. Pure presentation over `DoblesTurn`
// (built from the engine's SegmentDoblesSplit + the station's own reps) — it invents no
// value. Two densities: `compact` (a banner above the live HUD, for a station the
// athlete works) and full (the partner-relay recovery screen).

struct DoblesTurnHero: View {
    let turn: DoblesTurn
    /// The next dobles station's turn, for the "Después:" line. Nil hides it.
    var next: DoblesTurn? = nil
    /// Compact banner (above the work HUD) vs full (the relay recovery screen).
    var compact: Bool = true
    /// Partner name to use when the split itself carries none (the container knows the
    /// partner identity even for a split authored without a name). Falls to "compañero".
    var partnerFallback: String? = nil

    // Orange when the reading athlete works (mine / split); blue when the partner does.
    private var accent: Color { turn.who == .partner ? Theme.Color.partner : Theme.Color.accent }
    private var partner: String {
        let n = turn.partnerName?.trimmingCharacters(in: .whitespacesAndNewlines)
        if n?.isEmpty == false { return n! }
        let f = partnerFallback?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (f?.isEmpty == false) ? f! : "compañero"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 8 : 12) {
            chip
            Text(turn.station)
                .scaledFont(compact ? 20 : 26, weight: .heavy,
                            relativeTo: compact ? .title3 : .title, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .fixedSize(horizontal: false, vertical: true)
            if let reps = repsLine {
                Text(reps)
                    .font(.system(size: compact ? 13 : 15, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
            }
            // The bicolor split bar only reads as a SPLIT — a whole-station turn
            // (mine 100% / partner 100%) is already told by the chip + reps line.
            if turn.who == .split { shareBar }
            if let note = turn.note?.trimmingCharacters(in: .whitespacesAndNewlines), !note.isEmpty {
                Text(note)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.Color.faint)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let next, let desc = Self.nextDescription(next) {
                Divider().overlay(Theme.Color.hairline)
                HStack(spacing: 6) {
                    LabelText(text: "Después", color: Theme.Color.faint, size: 10)
                    Text(desc)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(compact ? 14 : 18)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                .stroke(accent.opacity(0.35), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(a11y)
    }

    // MARK: - Chip (who + role)

    private var chip: some View {
        HStack(spacing: 6) {
            Image(systemName: chipIcon)
                .font(.system(size: 10, weight: .heavy))
            Text(chipText)
                .font(.system(size: 11, weight: .heavy).italic())
                .tracking(1.2)
                .lineLimit(1)
        }
        .foregroundStyle(accent)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(accent.opacity(0.14))
        .clipShape(Capsule())
    }

    private var chipIcon: String {
        switch turn.who {
        case .mine:    return "figure.strengthtraining.functional"
        case .partner: return "figure.2"
        case .split:   return "arrow.left.arrow.right"
        }
    }

    private var chipText: String {
        switch turn.who {
        case .mine:    return "TE TOCA A TI"
        case .partner: return "AHORA · \(partner.uppercased())"
        case .split:   return "RELEVO CON \(partner.uppercased())"
        }
    }

    // MARK: - Reps line

    private var repsLine: String? {
        switch turn.who {
        case .mine:
            return turn.selfReps.map { "Estación completa · \($0) reps" } ?? "La haces tú, completa"
        case .partner:
            return turn.partnerReps.map { "\(partner) hace \($0) reps" } ?? "\(partner) hace la estación"
        case .split:
            if let mine = turn.selfReps, let theirs = turn.partnerReps {
                return "Tú \(mine) · \(partner) \(theirs)"
            }
            return "Tú \(turn.selfSharePct)% · \(partner) \(turn.partnerSharePct)%"
        }
    }

    // MARK: - Bicolor share bar (split only)

    private var shareBar: some View {
        VStack(spacing: 6) {
            GeometryReader { geo in
                HStack(spacing: 2) {
                    Theme.Color.accent
                        .frame(width: max(0, geo.size.width * CGFloat(turn.selfShare) - 1))
                    Theme.Color.partner
                }
                .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
            }
            .frame(height: 10)
            HStack {
                legendDot(Theme.Color.accent, "Tú \(turn.selfSharePct)%")
                Spacer()
                legendDot(Theme.Color.partner, "\(partner) \(turn.partnerSharePct)%")
            }
        }
    }

    private func legendDot(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(text)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
        }
    }

    // MARK: - "Después:" preview

    /// One-line "Después:" descriptor for the FOLLOWING turn: who goes + their reps
    /// (percentage only when the station has no numeric total). Nil for an empty turn.
    static func nextDescription(_ next: DoblesTurn) -> String? {
        let who = next.partnerName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let partner = (who?.isEmpty == false) ? who! : "compañero"
        switch next.who {
        case .mine:
            return next.selfReps.map { "tú · \($0) reps" } ?? "tú · estación completa"
        case .partner:
            return next.partnerReps.map { "\(partner) · \($0) reps" } ?? "\(partner) · su estación"
        case .split:
            if let mine = next.selfReps, let theirs = next.partnerReps {
                return "relevo · tú \(mine) / \(partner) \(theirs)"
            }
            return "relevo con \(partner)"
        }
    }

    private var a11y: String {
        var parts = [chipText.replacingOccurrences(of: "·", with: ""), turn.station]
        if let r = repsLine { parts.append(r) }
        return parts.joined(separator: ". ")
    }
}
