import SwiftUI

// Expert variant of the Plan tab.
// Mirrors docs/design/fahybrik-design-system/project/athlete_app/plan.jsx
// `PlanExpert`: 4-week dense grid, ACC/TRANS/REAL/PEAK macro bar, today
// highlighted in accent, dot legend (strength/aerobic/threshold). Days
// labeled in Castilian abbrevs (L M X J V S D).
struct PlanView: View {
    @State private var selectedWeek: Int = 3
    @State private var selectedDay: Int = 3

    private let daysES = ["L", "M", "X", "J", "V", "S", "D"]
    private let todayDay = 3

    private struct WeekRow {
        let wk: String
        let label: String
        let isCurrent: Bool
        let days: [String]
    }

    // Mirror design system WEEK_PLAN.
    private let weeks: [WeekRow] = [
        WeekRow(wk: "W18", label: "ACC w4", isCurrent: false,
                days: ["AM Strength · Z2 long", "AM Threshold · Skill", "AM Hyrox · Recovery",
                       "AM Strength · Mob", "AM VO2 · Sled", "AM Long", "Rest"]),
        WeekRow(wk: "W19", label: "TRANS w1", isCurrent: false,
                days: ["AM Strength", "AM Threshold", "AM Hyrox sim",
                       "AM Strength", "Test 5K", "Race-pace dress", "Rest"]),
        WeekRow(wk: "W20", label: "REAL w1", isCurrent: false,
                days: ["AM Strength", "AM Z3 Sharpen", "PM Tempo",
                       "AM Strength", "AM Race-pace", "Dress rehearsal", "Rest"]),
        WeekRow(wk: "W21", label: "REAL w2 (HOY)", isCurrent: true,
                days: ["Strength upper", "Threshold 4×1k", "Sled+WB ★",
                       "Mob", "AM Z3 · PM Z2", "Long", "Rest"]),
    ]

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    headerStrip
                    macroPhaseStrip
                    weekGrid
                    legendStrip
                }
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.l)
            }
        }
    }

    private var headerStrip: some View {
        HStack {
            Text("Plan · 4 sem")
                .font(.system(size: 16, weight: .bold, design: .default).italic())
                .foregroundStyle(Theme.Color.foreground)
            Spacer()
            MonoText(text: "\(TodayPersona.demo.daysToRace)d", size: 11, color: Theme.Color.muted)
        }
        .padding(.horizontal, 6)
    }

    private var macroPhaseStrip: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 4) {
                GeometryReader { geo in
                    HStack(spacing: 0) {
                        Rectangle().fill(Color.white.opacity(0.10))
                            .frame(width: geo.size.width * 4 / 12)
                        Rectangle().fill(Color.white.opacity(0.18))
                            .frame(width: geo.size.width * 4 / 12)
                        Rectangle().fill(Theme.Color.accent)
                            .frame(width: geo.size.width * 3 / 12)
                        Rectangle().fill(Theme.Color.accent.opacity(0.3))
                            .frame(width: geo.size.width * 1 / 12)
                    }
                }
                .frame(height: 8)
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                HStack {
                    MonoText(text: "ACC 4w", size: 9, color: Theme.Color.muted)
                    Spacer()
                    MonoText(text: "TRANS 4w", size: 9, color: Theme.Color.muted)
                    Spacer()
                    MonoText(text: "REAL 3w◆", size: 9, color: Theme.Color.accent)
                    Spacer()
                    MonoText(text: "PEAK 1w", size: 9, color: Theme.Color.muted)
                }
            }
        }
    }

    private var weekGrid: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                gridHeaderRow
                Hairline()
                ForEach(Array(weeks.enumerated()), id: \.offset) { wi, wk in
                    if wi > 0 { Hairline() }
                    weekRow(wi: wi, wk: wk)
                }
            }
        }
    }

    private var gridHeaderRow: some View {
        HStack(spacing: 0) {
            HStack {
                LabelText(text: "WK", size: 9)
                Spacer()
            }
            .padding(.horizontal, 8)
            .frame(width: 46)
            ForEach(daysES, id: \.self) { d in
                LabelText(text: d, size: 9)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .overlay(
                        Rectangle().fill(Theme.Color.hairline).frame(width: 1),
                        alignment: .leading
                    )
            }
        }
        .padding(.vertical, 6)
    }

    private func weekRow(wi: Int, wk: WeekRow) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                MonoText(
                    text: wk.wk,
                    size: 11,
                    weight: .semibold,
                    color: wk.isCurrent ? Theme.Color.accent : Theme.Color.muted
                )
                Text(wk.label.split(separator: " ").first.map(String.init) ?? "")
                    .font(.system(size: 9))
                    .foregroundStyle(wk.isCurrent ? Theme.Color.accent : Theme.Color.muted)
            }
            .padding(.horizontal, 8)
            .frame(width: 46, alignment: .leading)

            ForEach(0..<7, id: \.self) { di in
                let label = wk.days[di]
                let isToday = wk.isCurrent && di == todayDay
                let isPast = wk.isCurrent ? di < todayDay : wi < 3
                Button(action: { Haptics.light(); selectedWeek = wi; selectedDay = di }) {
                    dayCell(label: label, isToday: isToday, isPast: isPast)
                }
                .buttonStyle(.plain)
                .overlay(
                    Rectangle().fill(Theme.Color.hairline).frame(width: 1),
                    alignment: .leading
                )
            }
        }
        .background(wk.isCurrent ? Theme.Color.accent.opacity(0.05) : Color.clear)
    }

    private func dayCell(label: String, isToday: Bool, isPast: Bool) -> some View {
        VStack(spacing: 2) {
            if label == "Rest" {
                Text("—")
                    .font(.system(size: 9))
                    .foregroundStyle(isToday ? Color.white : Theme.Color.muted)
            } else {
                HStack(spacing: 2) {
                    if hasDot(label, kind: .strength) { dot(HRZone.z2.color) }
                    if hasDot(label, kind: .threshold) { dot(HRZone.z4.color) }
                    if hasDot(label, kind: .aerobic) { dot(HRZone.z3.color) }
                }
                Text(shortLabel(label))
                    .font(.system(size: 8))
                    .foregroundStyle(isToday ? Color.white : (isPast ? Theme.Color.muted : Theme.Color.foreground))
                    .lineLimit(1)
                    .multilineTextAlignment(.center)
                if isPast {
                    Text("✓")
                        .font(.system(size: 8))
                        .foregroundStyle(isToday ? Color.white : Theme.Color.ok)
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 56)
        .padding(.vertical, 6)
        .background(isToday ? Theme.Color.accent : Color.clear)
    }

    private enum DotKind { case strength, threshold, aerobic }

    private func hasDot(_ label: String, kind: DotKind) -> Bool {
        let lower = label.lowercased()
        switch kind {
        case .strength: return lower.contains("strength")
        case .threshold:
            return lower.contains("thresh") || lower.contains("hyrox") || lower.contains("sled")
                || lower.contains("vo2") || lower.contains("race") || lower.contains("test")
                || lower.contains("sharp") || lower.contains("tempo")
        case .aerobic:
            return lower.contains("long") || lower.contains("z2") || lower.contains("z3")
        }
    }

    private func shortLabel(_ label: String) -> String {
        let cleaned = label
            .replacingOccurrences(of: "AM ", with: "")
            .replacingOccurrences(of: "PM ", with: "")
        return String(cleaned.prefix(10))
    }

    private func dot(_ color: Color) -> some View {
        Circle().fill(color).frame(width: 6, height: 6)
    }

    private var legendStrip: some View {
        HStack(spacing: 12) {
            HStack(spacing: 4) {
                dot(HRZone.z2.color)
                Text("Strength").font(.system(size: 10)).foregroundStyle(Theme.Color.muted)
            }
            HStack(spacing: 4) {
                dot(HRZone.z3.color)
                Text("Aerobic").font(.system(size: 10)).foregroundStyle(Theme.Color.muted)
            }
            HStack(spacing: 4) {
                dot(HRZone.z4.color)
                Text("Threshold/Hyrox").font(.system(size: 10)).foregroundStyle(Theme.Color.muted)
            }
            Spacer()
        }
        .padding(.horizontal, 6)
        .padding(.top, 4)
    }
}

#Preview {
    PlanView()
        .preferredColorScheme(.dark)
}
