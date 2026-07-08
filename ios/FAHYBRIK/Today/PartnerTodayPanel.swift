import SwiftUI

// "Tu pareja" — the Hoy/Inicio panel for Dobles athletes. It surfaces how the
// athlete's coach-paired partner is doing TODAY, consuming the training snapshot
// in `GET /api/athlete/partner` (source == "doubles_pair"). Every value is REAL
// data from the endpoint or an honest empty state — nothing fabricated.
//
// Layout (top → bottom), tracking the dobles doc panel
// (docs/superpowers/plans/2026-06-26-dobles.html, "Tu pareja"):
//   header  — partner avatar (info-blue, the Dobles "partner" identity) + name +
//             "Hoy · mismo entreno" + today's status badge (✓ Hecho / ⏳ Pendiente)
//   week    — "Semana" + progress bar + "completed/total"
//   recent  — up to 3 finished sessions (date · name · status · time)
//   nudge   — a quiet line driven by whether the partner trained today
//
// Visibility is owned by the caller: the panel is only built when the envelope
// is a doubles_pair (InicioView gates on `PartnerEnvelope.isDoublesPair`), so
// the no-partner / billing-only / loading / error cases simply don't render it.
struct PartnerTodayPanel: View {
    let partner: PartnerInfo

    var body: some View {
        CardSurface(padding: 16) {
            VStack(alignment: .leading, spacing: 14) {
                LabelText(text: "Tu pareja")
                header
                weekRow
                if !recent.isEmpty {
                    Hairline()
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(recent) { session in
                            recentRow(session)
                        }
                    }
                }
                nudgeRow
            }
        }
        .accessibilityElement(children: .contain)
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            CoachAvatar(initials: partner.initials, size: 40, tint: Theme.Color.partner)
            VStack(alignment: .leading, spacing: 2) {
                Text(partner.fullName)
                    .scaledFont(16, weight: .heavy, relativeTo: .body, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                Text(subtitle)
                    .scaledFont(11, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if let badge = todayBadge {
                statusBadge(badge)
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// True when the coach has PAUSED the partner's plan (backend `partner_paused`).
    /// Drives the muted "En pausa" treatment instead of a today status.
    private var partnerPaused: Bool { partner.partnerPaused == true }

    /// "En pausa" when the partner is paused; "Hoy · mismo entreno" when they have a
    /// session today; otherwise the honest Dobles label (no invented "same workout").
    private var subtitle: String {
        if partnerPaused { return "En pausa" }
        return partner.today != nil ? "Hoy · mismo entreno" : "Tu pareja de Dobles"
    }

    // MARK: - Status badge

    private struct BadgeSpec { let text: String; let color: Color; let tint: Color }

    /// The pill for today's session status. A paused partner shows a muted "En
    /// pausa" pill instead of a done/pending status. Nil → no session today (no pill).
    private var todayBadge: BadgeSpec? {
        if partnerPaused {
            return BadgeSpec(text: "En pausa", color: Theme.Color.muted, tint: Theme.Color.neutralTint)
        }
        guard let today = partner.today else { return nil }
        switch today.status.lowercased() {
        case "completed":
            return BadgeSpec(text: "✓ Hecho", color: Theme.Color.ok, tint: Theme.Color.okTint)
        case "missed":
            return BadgeSpec(text: "Perdido", color: Theme.Color.danger, tint: Theme.Color.dangerTint)
        case "skipped":
            return BadgeSpec(text: "Saltado", color: Theme.Color.muted, tint: Theme.Color.neutralTint)
        default: // scheduled / unknown → still to do
            return BadgeSpec(text: "⏳ Pendiente", color: Theme.Color.warning, tint: Theme.Color.warningTint)
        }
    }

    private func statusBadge(_ spec: BadgeSpec) -> some View {
        Text(spec.text)
            .scaledFont(11, weight: .semibold, relativeTo: .caption)
            .foregroundStyle(spec.color)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(spec.tint)
            .clipShape(Capsule())
            .accessibilityLabel("Hoy: \(spec.text)")
    }

    // MARK: - Week progress

    private var weekRow: some View {
        let week = partner.week ?? PartnerWeekProgress(completed: 0, total: 0)
        return HStack(spacing: 10) {
            LabelText(text: "Semana", size: 10)
            ProgressBar(fraction: week.fraction, tint: Theme.Color.partner)
                .frame(height: 6)
                .frame(maxWidth: .infinity)
            MonoText(text: "\(week.completed)/\(week.total)", size: 12, weight: .semibold, color: Theme.Color.foreground)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Semana, \(week.completed) de \(week.total) sesiones hechas")
    }

    // MARK: - Recent sessions

    private var recent: [PartnerRecentSession] {
        Array((partner.recent ?? []).prefix(3))
    }

    private func recentRow(_ session: PartnerRecentSession) -> some View {
        HStack(spacing: 10) {
            Circle()
                .fill(recentStatusColor(session.status))
                .frame(width: 6, height: 6)
            Text(session.workoutName ?? "Sesión")
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
            // "juntos" tag when this was a joint train-together session (0074).
            if session.isJoint {
                Text("juntos")
                    .scaledFont(9, weight: .bold, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.accentText)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .background(Theme.Color.accent.opacity(0.15))
                    .clipShape(Capsule())
            }
            Spacer(minLength: 6)
            Text(recentMeta(session))
                .scaledFont(11, relativeTo: .caption, monospaced: true)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(session.workoutName ?? "Sesión"), \(session.isJoint ? "entrenasteis juntos, " : "")\(dateLabel(session.date)), \(recentMeta(session))"
        )
    }

    private func recentStatusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "completed": return Theme.Color.ok
        case "missed":    return Theme.Color.danger
        default:          return Theme.Color.faint
        }
    }

    /// "26 jun · 48 min · RPE 7" — each segment only when present. Date always;
    /// duration / RPE only when the backend supplies them (never invented).
    private func recentMeta(_ session: PartnerRecentSession) -> String {
        var parts: [String] = [dateLabel(session.date)]
        // The headline result first (in HYROX the time IS the result).
        if let score = session.scoreText {
            parts.append(score)
        }
        if let secs = session.durationSeconds, secs > 0 {
            parts.append(durationLabel(secs))
        }
        if let rpe = session.perceivedExertion {
            parts.append("RPE \(rpeLabel(rpe))")
        }
        return parts.joined(separator: " · ")
    }

    // MARK: - Nudge

    private var nudgeRow: some View {
        let trained = partner.today?.isDone ?? false
        return Text(nudgeText(trained: trained))
            .scaledFont(12, relativeTo: .caption)
            .foregroundStyle(trained ? Theme.Color.foreground : Theme.Color.muted)
            .lineLimit(2)
    }

    private func nudgeText(trained: Bool) -> String {
        let name = partner.firstName
        if partnerPaused {
            return "\(name) está en pausa"
        }
        if partner.today == nil {
            return "\(name) no tiene sesión hoy"
        }
        return trained
            ? "\(name) ya ha entrenado hoy"
            : "\(name) aún no ha entrenado hoy"
    }

    // MARK: - Formatting

    /// "26 jun" from an ISO "YYYY-MM-DD" date; returns the raw string if unparseable.
    private func dateLabel(_ iso: String) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: iso) else { return iso }
        let out = DateFormatter()
        out.locale = Locale(identifier: "es_ES")
        out.dateFormat = "d MMM"
        return out.string(from: date)
    }

    /// "48 min" for ≥60s, else "0:45". Mirrors the compact session meta voice.
    private func durationLabel(_ seconds: Int) -> String {
        if seconds >= 60 {
            return "\(seconds / 60) min"
        }
        return "0:\(String(format: "%02d", seconds))"
    }

    /// "7" or "7.5" — drops the trailing ".0" so integer RPE reads clean.
    private func rpeLabel(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(value))
            : String(format: "%.1f", value)
    }
}

// MARK: - ProgressBar
//
// A rounded track + tinted fill. The track uses the sunken well token so it
// recedes in both light and dark; the fill is the caller's tint (partner blue).
private struct ProgressBar: View {
    let fraction: Double
    var tint: Color

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.Color.surfaceSunken)
                Capsule()
                    .fill(tint)
                    .frame(width: max(0, min(1, fraction)) * geo.size.width)
            }
        }
    }
}
