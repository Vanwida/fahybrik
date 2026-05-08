import SwiftUI

// Expert variant of the Post-Workout Summary.
// Mirrors docs/design/fahybrik-design-system/project/athlete_app/workout.jsx
// `PostExpert`: tight header (✓ + 47:23 + PR pill), zones stacked bar,
// 2x3 metric tiles (HR avg/max, decoupling, recovery 60s, avg/peak power),
// per-segment table, RPE 1-10 selector. No motivational copy.
struct PostWorkoutSummaryView: View {
    let session: WorkoutSession
    let onSave: () -> Void

    @State private var rpe: Int = 7
    @State private var notes: String = ""

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    tightHeader
                    zonesStackedBar
                    metricTiles
                    segmentsTable
                    rpeCard
                    notesCard
                }
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .layoutPriority(1)
            ExpertPrimaryButton(title: "GUARDAR", height: 46, action: onSave)
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.m)
                .padding(.top, Theme.Spacing.s)
        }
        .background(Theme.Color.background.ignoresSafeArea())
    }

    // MARK: - Header
    private var tightHeader: some View {
        HStack(spacing: 10) {
            Text("✓")
                .font(.system(size: 18))
                .foregroundStyle(Theme.Color.ok)
            HeroNumber(text: WorkoutSession.formatElapsed(session.elapsedSeconds), size: 36)
            prPill
            Spacer()
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
    }

    private var prPill: some View {
        Text("PR −2:14")
            .font(.system(size: 10, weight: .bold))
            .tracking(1.0)
            .foregroundStyle(Theme.Color.ok)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(Theme.Color.ok.opacity(0.15))
            .clipShape(Capsule())
    }

    // MARK: - Zones stacked bar
    private var zonesStackedBar: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 4) {
                LabelText(text: "Zonas", size: 9)
                GeometryReader { geo in
                    HStack(spacing: 0) {
                        ForEach(zoneDistribution, id: \.zone) { z in
                            Rectangle().fill(z.zone.color)
                                .frame(width: max(0, geo.size.width * CGFloat(z.pct) / 100))
                        }
                    }
                }
                .frame(height: 16)
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                HStack {
                    ForEach(zoneDistribution, id: \.zone) { z in
                        MonoText(
                            text: "\(z.zone.label) \(z.pct)%",
                            size: 9,
                            color: z.zone.color
                        )
                        if z.zone != .z5 { Spacer() }
                    }
                }
            }
        }
    }

    // Demo zone distribution mirrors workout.jsx ZONE_DIST when no live data
    // is available (laps haven't accumulated zone seconds yet). When laps have
    // data we use the real percentages.
    private var zoneDistribution: [(zone: HRZone, pct: Int, time: Double)] {
        let totals = HRZone.allCases.map { z -> (HRZone, Double) in
            let secs = session.laps.reduce(into: 0.0) { $0 += $1.zoneSecondsByZone[z.rawValue] ?? 0 }
            return (z, secs)
        }
        let total = totals.reduce(0) { $0 + $1.1 }
        if total > 0 {
            return totals.map { (z, secs) in
                let pct = Int((secs / total * 100).rounded())
                return (z, pct, secs)
            }
        }
        // Fallback demo distribution from design system.
        return [
            (.z1, 3, 84),
            (.z2, 7, 198),
            (.z3, 31, 882),
            (.z4, 42, 1194),
            (.z5, 17, 485),
        ]
    }

    // MARK: - 2x3 metric tiles
    private var metricTiles: some View {
        let cols = [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)]
        let avgHR = avgHRBpm
        let maxHR = maxHRBpm
        return LazyVGrid(columns: cols, spacing: 6) {
            ExpertCell(label: "Avg HR", value: avgHR.map { "\($0)" } ?? "161", unit: "bpm")
            ExpertCell(label: "Max HR", value: maxHR.map { "\($0)" } ?? "184", unit: "bpm")
            ExpertCell(label: "Decoup", value: "+4.2", unit: "%", color: Theme.Color.warning)
            ExpertCell(label: "Rec 60s", value: "−42", unit: "bpm", color: Theme.Color.ok)
            ExpertCell(label: "Avg Pwr", value: "232", unit: "W")
            ExpertCell(label: "Peak", value: "318", unit: "W")
        }
    }

    private var avgHRBpm: Int? {
        let avgs = session.laps.compactMap(\.avgHRBpm)
        guard !avgs.isEmpty else { return nil }
        return avgs.reduce(0, +) / avgs.count
    }
    private var maxHRBpm: Int? { session.laps.compactMap(\.maxHRBpm).max() }

    // MARK: - Per-segment table
    private var segmentsTable: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                HStack {
                    LabelText(text: "Por segmento", size: 9)
                    Spacer()
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                Hairline()
                ForEach(Array(session.plan.segments.enumerated()), id: \.element.id) { idx, seg in
                    if idx > 0 { Hairline() }
                    let lap = session.laps.first(where: { $0.segmentId == seg.id })
                    let timeStr = lap.map { WorkoutSession.formatElapsed($0.durationSeconds) } ?? "—"
                    HStack(alignment: .center, spacing: 6) {
                        Text(seg.title)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.foreground)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .lineLimit(1)
                        MonoText(text: timeStr, size: 11, color: Theme.Color.muted)
                            .frame(width: 44, alignment: .trailing)
                        Text(trendArrow(idx: idx))
                            .font(.system(size: 10))
                            .foregroundStyle(trendColor(idx: idx))
                            .frame(width: 18, alignment: .center)
                        if let z = seg.targetZone {
                            ZBadge(zone: z).frame(width: 38, alignment: .trailing)
                        } else {
                            Color.clear.frame(width: 38)
                        }
                        MonoText(text: "\(95 - idx * 2)%", size: 10, color: weakIdx(idx) ? Theme.Color.warning : Theme.Color.muted)
                            .frame(width: 36, alignment: .trailing)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                }
            }
        }
    }

    private func trendArrow(idx: Int) -> String {
        // Placeholder pattern from design fixture (▲ ─ ▼ ─ ▲); real engine
        // compares to prior 4-week median per segment kind.
        ["▲", "─", "▼", "─", "▲"][safe: idx] ?? "─"
    }
    private func trendColor(idx: Int) -> Color {
        switch trendArrow(idx: idx) {
        case "▲": return Theme.Color.ok
        case "▼": return Theme.Color.danger
        default:  return Theme.Color.muted
        }
    }
    private func weakIdx(_ idx: Int) -> Bool { idx == 2 } // wall balls flagged

    // MARK: - RPE
    private var rpeCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "RPE", size: 9)
                HStack(spacing: 4) {
                    ForEach(1...10, id: \.self) { n in
                        Button(action: { rpe = n; Haptics.light() }) {
                            Text("\(n)")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(rpe == n ? Color.white : Theme.Color.foreground)
                                .frame(width: 26, height: 26)
                                .background(rpe == n ? Theme.Color.accent : Theme.Color.surfaceElevated)
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Notes
    private var notesCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "Notas", size: 9)
                TextField("Opcional", text: $notes, axis: .vertical)
                    .lineLimit(2...4)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.foreground)
                    .padding(.vertical, 4)
            }
        }
    }
}

private extension Array {
    subscript(safe i: Int) -> Element? {
        indices.contains(i) ? self[i] : nil
    }
}
