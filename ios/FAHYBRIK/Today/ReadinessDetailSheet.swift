import SwiftUI

// Readiness detail — the sheet that opens when the athlete taps "¿Cómo llegas
// hoy?" on Inicio. Market standard (Whoop / Oura): score → what explains it →
// trend → one action. Every value is REAL (surfaced from the compute) or an
// honest "Sin dato aún"; nothing is fabricated. Visual source of truth:
// docs/superpowers/plans/2026-07-02-ux-readiness-detail.html, adapted to the
// app's own tokens (light + dark) via Theme.
struct ReadinessDetailSheet: View {
    /// Today's readiness payload (score + breakdown + 7-day trend) — read LIVE
    /// from the store by the presenter, so a check-in made from here refreshes it.
    let payload: DailyReadinessPayload
    /// Whether the plan has a session scheduled today — drives the guidance line.
    let hasSessionToday: Bool
    /// Whether TODAY's check-in is already done (device-local truth) — drives the
    /// check-in row + CTA copy ("Editar" vs "Hacer").
    let checkinDone: Bool
    let bearer: String?
    /// Drives the hero-ring entrance animation. True in the app (gated by
    /// reduce-motion below); snapshots pass false for a deterministic final frame.
    var animateRing: Bool = true
    /// A check-in submitted from here → the presenter clears the pending flag
    /// immediately (device-local truth; dismissal never waits on the network).
    let onCheckinSubmitted: () -> Void
    /// Fires once the server has the check-in — the presenter refetches
    /// readiness HERE (refetching in `onCheckinSubmitted` raced the in-flight
    /// POST and pulled the old score). Same contract as CheckinView.
    var onCheckinServerSynced: () async -> Void = {}

    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showCheckin = false

    private var zone: ReadinessZone { ReadinessZone.of(score: payload.score) }
    private var contributors: [Contributor] {
        Contributor.all(from: payload.breakdown, checkinDone: checkinDone)
    }
    private var trend: [ReadinessTrendPoint] { payload.trend ?? [] }
    private var ctaTitle: String {
        checkinDone ? "Editar el check-in de hoy" : "Hacer el check-in de hoy"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                hero
                sectionLabel("Qué lo explica")
                contributorsCard
                if trend.count >= 2 {
                    trendHeader
                    ReadinessTrendChart(points: trend)
                }
                checkinCTA
                footnote
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 28)
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .sheet(isPresented: $showCheckin) {
            CheckinView(
                bearer: bearer,
                onSubmitted: { _, _ in
                    showCheckin = false
                    onCheckinSubmitted()
                },
                onSkipped: { showCheckin = false },
                onServerSynced: onCheckinServerSynced
            )
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("¿Cómo llegas hoy?")
                    .scaledFont(20, weight: .heavy, relativeTo: .title3)
                    .foregroundStyle(Theme.Color.foreground)
                Text("\(Self.longDate(payload.recordedFor)) · calculado con tus datos de anoche")
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Button {
                Haptics.light()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 32, height: 32)
                    .background(Theme.Color.surfaceSunken)
                    .clipShape(Circle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Cerrar")
        }
        .padding(.top, 8)
    }

    // MARK: - Hero (ring + state + guidance)

    private var hero: some View {
        VStack(spacing: 0) {
            ReadinessHeroRing(score: payload.score, color: zone.color,
                              animated: animateRing && !reduceMotion)
                .padding(.top, 14)
            Text(zone.interpretation)
                .scaledFont(17, weight: .semibold, relativeTo: .headline)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.top, 14)
            Text(zone.guidance(hasSessionToday: hasSessionToday))
                .scaledFont(14, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
                .padding(.horizontal, 8)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Readiness \(payload.score) de 100, \(zone.interpretation). "
            + zone.guidance(hasSessionToday: hasSessionToday)
        )
    }

    // MARK: - Contributors

    private var contributorsCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                ForEach(contributors) { c in
                    ContributorRow(
                        contributor: c,
                        onTap: c.isAction ? { Haptics.light(); showCheckin = true } : nil
                    )
                    if c.id != contributors.last?.id { Hairline() }
                }
            }
        }
        .padding(.top, 10)
    }

    // MARK: - Trend

    private var trendHeader: some View {
        HStack {
            Text("Últimos 7 días")
                .font(.system(size: 11, weight: .semibold))
                .tracking(Theme.Tracking.dataLabel)
                .textCase(.uppercase)
                .foregroundStyle(Theme.Color.muted)
            Spacer(minLength: 8)
            if let chip = Self.deltaChip(trend) {
                Text(chip)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 3)
                    .background(Theme.Color.surfaceSunken)
                    .clipShape(Capsule())
            }
        }
        .padding(.top, 24)
        .padding(.bottom, 10)
        .padding(.horizontal, 2)
    }

    // MARK: - CTA + footnote

    private var checkinCTA: some View {
        Button {
            Haptics.light()
            showCheckin = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 14, weight: .semibold))
                Text(ctaTitle)
                    .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
            }
            .foregroundStyle(Theme.Color.foreground)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(Theme.Color.surfaceElevated)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .padding(.top, 22)
        .accessibilityLabel(ctaTitle)
    }

    private var footnote: some View {
        Text("Los datos llegan de Apple Salud. El check-in manual también cuenta.")
            .scaledFont(11, relativeTo: .caption2)
            .foregroundStyle(Theme.Color.muted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, 16)
            .padding(.horizontal, 10)
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .tracking(Theme.Tracking.dataLabel)
            .textCase(.uppercase)
            .foregroundStyle(Theme.Color.muted)
            .padding(.top, 24)
            .padding(.horizontal, 2)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Formatting helpers

    /// "Jueves 2 jul" from an ISO date (athlete-local wall date, no tz math).
    static func longDate(_ iso: String) -> String {
        guard let date = isoDate(iso) else { return "Hoy" }
        let out = DateFormatter()
        out.locale = Locale(identifier: "es_ES")
        out.dateFormat = "EEEE d MMM"
        let raw = out.string(from: date)
        return raw.prefix(1).uppercased() + raw.dropFirst()
    }

    /// How old an athlete-local day is, said the way a person says it: "ayer",
    /// "anteayer", "hace 4 días". Compared in the device's own calendar, which is
    /// the athlete's — the ISO day already arrives athlete-local, no tz math.
    static func relativeDay(_ iso: String) -> String {
        // Both sides become the UTC-midnight anchor of a WALL date (the reading's,
        // and the device's today), so the difference is a clean day count with no
        // timezone arithmetic in the middle.
        let wall = DateFormatter()
        wall.locale = Locale(identifier: "en_US_POSIX")
        wall.dateFormat = "yyyy-MM-dd"
        wall.timeZone = .current
        guard let then = isoDate(iso), let now = isoDate(wall.string(from: Date())) else {
            return "sin fecha"
        }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC") ?? .current
        let days = cal.dateComponents([.day], from: then, to: now).day ?? 0
        switch days {
        case ..<1: return "hoy"
        case 1: return "ayer"
        case 2: return "anteayer"
        default: return "hace \(days) días"
        }
    }

    /// "−3 vs tu media" / "+4 vs tu media" / "En tu media" — today vs the trend
    /// mean. Nil with fewer than two days (the section is hidden then anyway).
    static func deltaChip(_ points: [ReadinessTrendPoint]) -> String? {
        guard points.count >= 2, let today = points.last?.score else { return nil }
        let mean = Double(points.reduce(0) { $0 + $1.score }) / Double(points.count)
        let delta = today - Int(mean.rounded())
        if delta == 0 { return "En tu media" }
        return "\(delta > 0 ? "+" : "\u{2212}")\(abs(delta)) vs tu media"
    }

    static func isoDate(_ iso: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.date(from: iso)
    }
}

// MARK: - Hero ring
//
// The large score ring — value + "sobre 100", filled to the score in the zone
// color. Fills once on appear (respecting Reduce Motion → no animation).
private struct ReadinessHeroRing: View {
    let score: Int
    let color: Color
    /// When false the arc is drawn at its FINAL value immediately (reduce-motion +
    /// deterministic snapshots); when true it fills from 0 on appear. The resting
    /// value is always the target, so the arc is never stuck empty.
    let animated: Bool

    @State private var progress: CGFloat
    private let size: CGFloat = 116
    private let stroke: CGFloat = 11

    init(score: Int, color: Color, animated: Bool) {
        self.score = score
        self.color = color
        self.animated = animated
        _progress = State(initialValue: animated ? 0 : Self.target(score))
    }

    private static func target(_ score: Int) -> CGFloat { max(0, min(1, CGFloat(score) / 100)) }

    var body: some View {
        ZStack {
            Circle().stroke(Theme.Color.hairline, lineWidth: stroke)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(color, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 3) {
                Text("\(score)")
                    .font(.system(size: 44, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                Text("SOBRE 100")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.2)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .frame(width: size, height: size)
        .onAppear {
            guard animated else { return }
            withAnimation(.easeOut(duration: 0.7)) { progress = Self.target(score) }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Contributor row
//
// One "what explains it" row: icon + name + status label, then value·reference,
// then a component bar (its width = the component's contribution, its color the
// row's qualitative status). The check-in row is the only actionable one (chevron
// → the check-in flow).
private struct ContributorRow: View {
    let contributor: Contributor
    let onTap: (() -> Void)?

    var body: some View {
        let content = VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 11) {
                Image(systemName: contributor.icon)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 22)
                Text(contributor.name)
                    .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: 8)
                HStack(spacing: 4) {
                    Text(contributor.statusLabel)
                        .scaledFont(11, weight: .semibold, relativeTo: .caption)
                        .foregroundStyle(contributor.statusColor)
                    if contributor.isAction {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.Color.faint)
                    }
                }
            }
            if let value = contributor.valueText {
                HStack(spacing: 5) {
                    Text(value)
                        .font(.system(size: 12, weight: .semibold, design: .monospaced).monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                    if let reference = contributor.referenceText {
                        Text("· \(reference)")
                            .scaledFont(12, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
                .padding(.leading, 33)
            }
            if let fraction = contributor.barFraction {
                ComponentBar(fraction: fraction, color: contributor.barColor)
                    .padding(.leading, 33)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())

        Group {
            if let onTap {
                Button(action: onTap) { content }
                    .buttonStyle(PressScaleStyle())
            } else {
                content
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(contributor.axLabel)
        .accessibilityAddTraits(contributor.isAction ? .isButton : [])
    }
}

/// A thin component bar: a sunken track with a colored fill at `fraction` (0…1).
private struct ComponentBar: View {
    let fraction: Double
    let color: Color

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.Color.surfaceSunken)
                Capsule()
                    .fill(color)
                    .frame(width: max(4, geo.size.width * CGFloat(min(1, max(0, fraction)))))
            }
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }
}

// MARK: - Trend chart
//
// Last-7-days score bars (oldest→today). One series, no axes/legend/grid — just
// the shape, today in accent with its value labeled, day letters below.
private struct ReadinessTrendChart: View {
    let points: [ReadinessTrendPoint]
    // Bars scale 0–100 on a FIXED axis so heights are directly comparable; a small
    // floor keeps a low day visible. Flat bottom on the baseline, only the top rounded.
    private let maxBarHeight: CGFloat = 92
    private let minBarHeight: CGFloat = 8
    private let labelSpace: CGFloat = 22

    var body: some View {
        VStack(spacing: 8) {
            HStack(alignment: .bottom, spacing: 0) {
                ForEach(points.indices, id: \.self) { i in
                    bar(points[i], isToday: i == points.count - 1)
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: maxBarHeight + labelSpace, alignment: .bottom)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Theme.Color.hairlineStrong).frame(height: 1)
            }
            HStack(spacing: 0) {
                ForEach(points.indices, id: \.self) { i in
                    Text(Self.dayLetter(points[i].recordedFor))
                        .font(.system(size: 10, weight: i == points.count - 1 ? .bold : .regular))
                        .foregroundStyle(i == points.count - 1 ? Theme.Color.foreground : Theme.Color.muted)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.axLabel(points))
    }

    private func barHeight(_ score: Int) -> CGFloat {
        let clamped = CGFloat(min(100, max(0, score)))
        return minBarHeight + (maxBarHeight - minBarHeight) * (clamped / 100)
    }

    // A bar anchored to the baseline: flat bottom, only the top corners rounded.
    // Today's value rides above its bar; the column is bottom-aligned by the HStack.
    private func bar(_ point: ReadinessTrendPoint, isToday: Bool) -> some View {
        VStack(spacing: 4) {
            if isToday {
                Text("\(point.score)")
                    .font(.system(size: 12, weight: .bold, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
            }
            UnevenRoundedRectangle(
                topLeadingRadius: 4, bottomLeadingRadius: 0,
                bottomTrailingRadius: 0, topTrailingRadius: 4, style: .continuous
            )
            .fill(isToday ? Theme.Color.accent : Theme.Color.neutral.opacity(0.3))
            .frame(width: 14, height: barHeight(point.score))
        }
    }

    /// Spanish single-letter weekday (L M X J V S D) from an ISO date.
    static func dayLetter(_ iso: String) -> String {
        guard let date = ReadinessDetailSheet.isoDate(iso) else { return "·" }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        // weekday: 1=Sun … 7=Sat.
        let letters = ["D", "L", "M", "X", "J", "V", "S"]
        return letters[(cal.component(.weekday, from: date) - 1) % 7]
    }

    static func axLabel(_ points: [ReadinessTrendPoint]) -> String {
        var label = "Últimos 7 días. "
        if let today = points.last?.score { label += "Hoy \(today). " }
        if let chip = ReadinessDetailSheet.deltaChip(points) { label += "\(chip)." }
        return label
    }
}

// MARK: - Contributor view-model
//
// Pure presentation over the breakdown — each row's value/reference, its
// qualitative status (label + color) and its component-bar fraction. Derived
// from what the compute ALREADY provides: HRV vs its baseline, sleep vs its
// target, RHR by its component (no personal baseline exists), the check-in
// sub-score. Nothing invented; a missing input becomes an honest "Sin dato aún".
private struct Contributor: Identifiable {
    let id = UUID()
    let icon: String
    let name: String
    let valueText: String?
    let referenceText: String?
    let statusLabel: String
    let statusColor: Color
    let barFraction: Double?
    let barColor: Color
    let isAction: Bool
    let axLabel: String

    /// Qualitative row status → color (label + bar share it).
    private enum Status { case good, mid, low
        var color: Color {
            switch self {
            case .good: return Theme.Color.ok
            case .mid:  return Theme.Color.warning
            case .low:  return Theme.Color.danger
            }
        }
    }

    static func all(from breakdown: ReadinessBreakdown?, checkinDone: Bool) -> [Contributor] {
        let b = breakdown
        return [
            sleep(b),
            hrv(b),
            restingHR(b),
            checkin(b, done: checkinDone),
        ]
    }

    // MARK: rows

    private static func sleep(_ b: ReadinessBreakdown?) -> Contributor {
        let icon = "moon.zzz.fill", name = "Sueño"
        guard let hours = b?.sleepHours else {
            return empty(icon: icon, name: name, ax: "Sueño, sin dato aún")
        }
        let value = esHours(hours)
        let target = b?.sleepTargetH ?? 8
        let reference = "objetivo \(Int(target.rounded())) h"
        let status: (String, Status)
        if hours >= target { status = ("Completo", .good) }
        else if hours >= target - 1.5 { status = ("Algo corto", .mid) }
        else { status = ("Corto", .low) }
        return Contributor(
            icon: icon, name: name, valueText: value, referenceText: reference,
            statusLabel: status.0, statusColor: status.1.color,
            barFraction: b?.sleepComponent.map { $0 / 100 }, barColor: status.1.color,
            isAction: false,
            axLabel: "Sueño, \(value), \(reference), \(status.0)"
        )
    }

    private static func hrv(_ b: ReadinessBreakdown?) -> Contributor {
        let icon = "waveform.path.ecg", name = "HRV"
        guard let ms = b?.hrvMs else {
            return empty(icon: icon, name: name, ax: "HRV, sin dato aún")
        }
        let value = "\(Int(ms.rounded())) ms"
        var reference: String?
        var status: (String, Status) = ("En tu base", .mid)
        if let base = b?.hrvBaselineMs, base > 0 {
            reference = "tu base \(Int(base.rounded())) ms"
            let ratio = ms / base
            if ratio >= 1.0 { status = ("Sobre tu base", .good) }
            else if ratio >= 0.90 { status = ("En tu base", .mid) }
            else { status = ("Bajo tu base", .low) }
        }
        return Contributor(
            icon: icon, name: name, valueText: value, referenceText: reference,
            statusLabel: status.0, statusColor: status.1.color,
            barFraction: b?.hrvComponent.map { $0 / 100 }, barColor: status.1.color,
            isAction: false,
            axLabel: "HRV, \(value)\(reference.map { ", \($0)" } ?? ""), \(status.0)"
        )
    }

    private static func restingHR(_ b: ReadinessBreakdown?) -> Contributor {
        let icon = "heart.fill", name = "FC en reposo"
        guard let bpm = b?.rhrBpm else {
            // Apple publishes the daily resting HR hours after the night it
            // describes and skips days the watch was off the wrist, so "todavía no
            // ha llegado la de hoy" is the normal morning state — not "no tienes".
            // Show the last one WITH its age and WITHOUT a bar: it never scored.
            if let last = b?.rhrLastBpm, let on = b?.rhrLastOn {
                let value = "\(Int(last.rounded())) ppm"
                let age = ReadinessDetailSheet.relativeDay(on)
                return Contributor(
                    icon: icon, name: name, valueText: value, referenceText: age,
                    statusLabel: "Falta la de hoy", statusColor: Theme.Color.muted,
                    barFraction: nil, barColor: Theme.Color.muted,
                    isAction: false,
                    axLabel: "Frecuencia cardíaca en reposo, \(value) de \(age). Falta la de hoy."
                )
            }
            return empty(icon: icon, name: name, ax: "Frecuencia cardíaca en reposo, sin dato aún")
        }
        let value = "\(Int(bpm.rounded())) ppm"
        // No personal RHR baseline exists in the model — status comes from the
        // component (lower RHR → higher component → better), no fabricated reference.
        let c = b?.rhrComponent ?? 0
        let status: (String, Status)
        if c >= 80 { status = ("Excelente", .good) }
        else if c >= 50 { status = ("Correcta", .mid) }
        else { status = ("Elevada", .low) }
        return Contributor(
            icon: icon, name: name, valueText: value, referenceText: nil,
            statusLabel: status.0, statusColor: status.1.color,
            barFraction: b?.rhrComponent.map { $0 / 100 }, barColor: status.1.color,
            isAction: false,
            axLabel: "Frecuencia cardíaca en reposo, \(value), \(status.0)"
        )
    }

    private static func checkin(_ b: ReadinessBreakdown?, done: Bool) -> Contributor {
        let icon = "checklist", name = "Check-in"
        if done {
            let mood = moodLabel(b?.subScore)
            let barColor = ReadinessZone.of(score: Int((b?.subScore ?? 0).rounded())).color
            return Contributor(
                icon: icon, name: name, valueText: "\(mood) · hoy", referenceText: nil,
                statusLabel: "Editar", statusColor: Theme.Color.muted,
                barFraction: b?.subScore.map { $0 / 100 }, barColor: barColor,
                isAction: true,
                axLabel: "Check-in de hoy, \(mood). Editar."
            )
        }
        return Contributor(
            icon: icon, name: name, valueText: "Sin hacer hoy", referenceText: nil,
            statusLabel: "Hacer", statusColor: Theme.Color.accentText,
            barFraction: nil, barColor: Theme.Color.accent,
            isAction: true,
            axLabel: "Check-in de hoy sin hacer. Hazlo para afinar tu score."
        )
    }

    private static func empty(icon: String, name: String, ax: String) -> Contributor {
        Contributor(
            icon: icon, name: name, valueText: nil, referenceText: nil,
            statusLabel: "Sin dato aún", statusColor: Theme.Color.muted,
            barFraction: nil, barColor: Theme.Color.muted, isAction: false, axLabel: ax
        )
    }

    // MARK: value formatting

    /// "6,6 h" (Spanish decimal comma, one place) / "8 h" for a whole number.
    private static func esHours(_ h: Double) -> String {
        if h == h.rounded() { return "\(Int(h)) h" }
        return "\(Formato.esDecimal(h)) h"
    }

    private static func moodLabel(_ subScore: Double?) -> String {
        guard let s = subScore else { return "Hecho" }
        if s >= 70 { return "Bien" }
        if s >= 45 { return "Normal" }
        return "Justo"
    }
}
