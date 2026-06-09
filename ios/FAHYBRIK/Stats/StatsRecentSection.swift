import SwiftUI

// Recent workouts — a list of logged executions, each collapsible to reveal
// its per-segment breakdown (the run leg, the row leg, …). This is where the
// athlete sees run-vs-row *within* a single session, with whatever the device
// captured per leg: distance, pace/split, power, stroke rate, HR, calories.

struct StatsRecentSection: View {
    let executions: [RecentExecution]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: "ENTRENAMIENTOS RECIENTES")
            VStack(spacing: 8) {
                ForEach(executions) { ex in
                    StatsExecutionRow(execution: ex)
                }
            }
        }
    }
}

// One execution row. Collapsed: date + total duration + RPE + a compact
// modality chip strip. Expanded: a divided list of segment rows. Tapping the
// whole header toggles; expansion is animated.
struct StatsExecutionRow: View {
    let execution: RecentExecution
    @State private var expanded = false

    // Distinct modalities in the session, in segment order — the chip strip.
    private var modalityChips: [AnalyticsModality] {
        var seen = Set<String>()
        var out: [AnalyticsModality] = []
        for seg in execution.segments.sorted(by: { $0.position < $1.position }) {
            let key = seg.modality.lowercased()
            if !seen.contains(key) {
                seen.insert(key)
                out.append(AnalyticsModality(raw: seg.modality))
            }
        }
        return out
    }

    private var dateLabel: String {
        if let d = execution.parsedDate {
            return StatsDateParser.shortLabel(d).capitalized
        }
        return execution.date
    }

    var body: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                headerButton
                if expanded {
                    Hairline()
                    segmentList
                        .padding(.horizontal, 14)
                        .padding(.vertical, 4)
                }
            }
        }
    }

    private var headerButton: some View {
        Button {
            Haptics.light()
            withAnimation(.easeInOut(duration: 0.22)) { expanded.toggle() }
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Text(dateLabel)
                            .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                            .foregroundStyle(Theme.Color.foreground)
                        if let total = execution.totalDurationSeconds {
                            MonoText(text: StatsFormat.duration(total), size: 12, color: Theme.Color.muted)
                        }
                        if let rpe = execution.perceivedExertion {
                            rpePill(rpe)
                        }
                    }
                    if !modalityChips.isEmpty {
                        HStack(spacing: 6) {
                            ForEach(modalityChips, id: \.rawValue) { m in
                                ModalityChip(modality: m)
                            }
                        }
                    }
                }
                Spacer()
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .rotationEffect(.degrees(expanded ? 180 : 0))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(headerA11y)
        .accessibilityHint(expanded ? "Toca para contraer" : "Toca para ver los segmentos")
        .accessibilityAddTraits(.isButton)
    }

    private var headerA11y: String {
        var s = "Entrenamiento \(dateLabel)"
        if let total = execution.totalDurationSeconds {
            s += ", duración \(StatsFormat.duration(total))"
        }
        if let rpe = execution.perceivedExertion {
            s += ", RPE \(StatsFormat.rpe(rpe))"
        }
        let mods = modalityChips.map { $0.fullName }.joined(separator: ", ")
        if !mods.isEmpty { s += ", modalidades: \(mods)" }
        return s
    }

    private func rpePill(_ rpe: Double) -> some View {
        Text("RPE \(StatsFormat.rpe(rpe))")
            .font(.system(size: 10, weight: .semibold))
            .tracking(0.8)
            .foregroundStyle(rpeColor(rpe))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(rpeColor(rpe).opacity(0.15))
            .clipShape(Capsule())
    }

    // RPE → green (easy) / amber (moderate) / red (hard). Mirrors zone semantics.
    private func rpeColor(_ rpe: Double) -> Color {
        switch rpe {
        case ..<5:  return Theme.Color.ok
        case ..<8:  return Theme.Color.warning
        default:    return Theme.Color.danger
        }
    }

    private var segmentList: some View {
        VStack(spacing: 0) {
            let ordered = execution.segments.sorted { $0.position < $1.position }
            ForEach(Array(ordered.enumerated()), id: \.element.id) { idx, seg in
                if idx > 0 { Hairline() }
                StatsSegmentRow(segment: seg)
            }
        }
    }
}

// Compact modality chip — symbol + short label, modality-colored.
struct ModalityChip: View {
    let modality: AnalyticsModality

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: modality.symbol)
                .font(.system(size: 9, weight: .semibold))
            Text(modality.shortLabel)
                .font(.system(size: 9, weight: .heavy, design: .monospaced))
                .tracking(0.6)
        }
        .foregroundStyle(modality.color)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(modality.color.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
        .accessibilityHidden(true)
    }
}

// One segment within an execution. Renders only the metrics actually present
// for that leg (a run leg has pace+HR; a row leg adds power+stroke rate; a
// strength leg may carry reps+weight) — never invents a value.
struct StatsSegmentRow: View {
    let segment: ExecutionSegment

    private var modality: AnalyticsModality { AnalyticsModality(raw: segment.modality) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                ModalityChip(modality: modality)
                if let primary = primaryLine {
                    MonoText(text: primary, size: 13, color: Theme.Color.foreground)
                }
                Spacer()
            }
            if !metricChips.isEmpty {
                FlowMetrics(items: metricChips)
            }
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(segmentA11y)
    }

    // The headline line for the leg: distance + pace/split + duration.
    private var primaryLine: String? {
        var parts: [String] = []
        if let dist = segment.distanceMeters, dist > 0 {
            parts.append(StatsFormat.distance(dist))
        }
        if let pace = StatsFormat.pace(forModality: modality,
                                       perKm: segment.avgPaceSPerKm,
                                       per500m: segment.avgPaceSPer500m) {
            parts.append(pace)
        }
        if let dur = segment.durationSeconds, dur > 0 {
            parts.append(StatsFormat.duration(dur))
        }
        return parts.isEmpty ? nil : parts.joined(separator: "  ·  ")
    }

    // Secondary metrics as small labelled chips — only those present.
    private var metricChips: [MetricChipData] {
        var out: [MetricChipData] = []
        if let p = segment.avgPowerW, p > 0 {
            out.append(.init(label: "POT", value: StatsFormat.intUnit(p, "W")))
        }
        if let s = segment.strokeRateSpm, s > 0 {
            out.append(.init(label: "SPM", value: "\(Int(s.rounded()))"))
        }
        if let hr = segment.avgHr, hr > 0 {
            out.append(.init(label: "FC", value: "\(Int(hr.rounded()))"))
        }
        if let mhr = segment.maxHr, mhr > 0 {
            out.append(.init(label: "FC MÁX", value: "\(Int(mhr.rounded()))"))
        }
        if let cal = segment.calories, cal > 0 {
            out.append(.init(label: "KCAL", value: "\(Int(cal.rounded()))"))
        }
        if let reps = segment.repsCompleted, reps > 0 {
            out.append(.init(label: "REPS", value: "\(reps)"))
        }
        if let kg = segment.weightUsedKg, kg > 0 {
            out.append(.init(label: "CARGA", value: StatsFormat.weight(kg)))
        }
        return out
    }

    private var segmentA11y: String {
        var s = modality.fullName
        if let primary = primaryLine {
            s += ", " + primary.replacingOccurrences(of: "·", with: ",")
        }
        for chip in metricChips {
            s += ", \(chip.label) \(chip.value)"
        }
        return s
    }
}

struct MetricChipData: Identifiable {
    let id = UUID()
    let label: String
    let value: String
}

// Small wrapping row of label/value metric chips. Uses an HStack that wraps via
// a simple layout — for the small counts here (≤7) a flexible HStack reads fine
// and stays robust under Dynamic Type.
struct FlowMetrics: View {
    let items: [MetricChipData]

    var body: some View {
        WrapHStack(items: items, spacing: 6) { chip in
            VStack(alignment: .leading, spacing: 1) {
                Text(chip.label)
                    .font(.system(size: 8, weight: .semibold))
                    .tracking(0.6)
                    .foregroundStyle(Theme.Color.muted)
                Text(chip.value)
                    .font(.system(size: 13, weight: .heavy, design: .monospaced))
                    .foregroundStyle(Theme.Color.foreground)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Theme.Color.background.opacity(0.6))
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
    }
}

// Lightweight wrapping HStack (no external deps). Lays children left-to-right,
// wrapping to a new line when the row width is exceeded. Sufficient for the
// small, bounded metric-chip sets here.
struct WrapHStack<Item: Identifiable, Content: View>: View {
    let items: [Item]
    var spacing: CGFloat = 6
    @ViewBuilder let content: (Item) -> Content

    @State private var totalHeight: CGFloat = .zero

    var body: some View {
        GeometryReader { geo in
            self.layout(in: geo)
        }
        .frame(height: totalHeight)
    }

    private func layout(in geo: GeometryProxy) -> some View {
        var x: CGFloat = 0
        var y: CGFloat = 0
        return ZStack(alignment: .topLeading) {
            ForEach(items) { item in
                content(item)
                    .alignmentGuide(.leading) { d in
                        if x + d.width > geo.size.width {
                            x = 0
                            y -= d.height + spacing
                        }
                        let result = x
                        if item.id == items.last?.id {
                            x = 0
                        } else {
                            x -= d.width + spacing
                        }
                        return result
                    }
                    .alignmentGuide(.top) { _ in
                        let result = y
                        if item.id == items.last?.id { y = 0 }
                        return result
                    }
            }
        }
        .background(heightReader)
    }

    private var heightReader: some View {
        GeometryReader { geo -> Color in
            DispatchQueue.main.async {
                if totalHeight != geo.size.height {
                    totalHeight = geo.size.height
                }
            }
            return Color.clear
        }
    }
}
