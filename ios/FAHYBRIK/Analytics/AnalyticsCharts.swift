import SwiftUI
import Charts

// The two series renderers for the Analíticas tab, both driven by the SAME wire
// data (an array of CardSeriesPoint, height 0..1). A card routes to one via its
// `chartKind` (server `series_kind`, id fallback):
//
//   • LineSeriesChart — trends / progressions. A 2px accent line over a soft area
//     gradient (accent 28% → clear), small dots on each point, the LAST point
//     emphasized (halo ring + larger dot + a mono value callout above), 3 recessive
//     hairline gridlines, muted mono axis labels (y = real min/max from series_axis
//     when present; x = short date hints at first / mid / last).
//
//   • BarSeriesChart — volume-type cards. Thin rounded bars with clear gaps, the
//     current period a solid accent and the rest accent at ~28%, a mono value
//     callout over the current bar. (Rendered with RoundedRectangles rather than
//     Swift Charts' BarMark, which can't produce rounded thin bars.)
//
// Colors are Theme tokens only (never a hardcoded hex); the tuned magnitudes live
// in ChartMetric so there are no scattered magic numbers.

private enum ChartMetric {
    static let plotHeight: CGFloat = 96
    static let lineWidth: CGFloat = 2
    static let areaTopOpacity: Double = 0.28
    static let inactiveOpacity: Double = 0.28
    static let dotSize: CGFloat = 16          // small point symbol area
    static let lastDotSize: CGFloat = 42      // emphasized endpoint
    static let haloSize: CGFloat = 120        // halo ring behind the endpoint
    static let haloOpacity: Double = 0.16
    static let gridValues: [Double] = [0, 0.5, 1]  // 3 recessive gridlines
    static let xDomainPad: Double = 0.6
    static let barCorner: CGFloat = 3
    static let barSpacing: CGFloat = 5
    static let calloutSize: CGFloat = 11
    static let axisLabelSize: CGFloat = 9.5
}

// MARK: - Line series (trend / progression)

struct LineSeriesChart: View {
    let points: [CardSeriesPoint]
    let axis: CardSeriesAxis?
    let axLabel: String

    private var pts: [(x: Double, point: CardSeriesPoint)] {
        points.enumerated().map { (Double($0.offset), $0.element) }
    }
    private var lastX: Double { Double(max(points.count - 1, 0)) }

    var body: some View {
        Chart {
            // Area fill + line share one implicit series (flat foregroundStyle).
            ForEach(pts, id: \.point.id) { item in
                AreaMark(x: .value("t", item.x), y: .value("v", clamp(item.point.height)))
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(
                        .linearGradient(
                            colors: [Theme.Color.accent.opacity(ChartMetric.areaTopOpacity), Theme.Color.accent.opacity(0)],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
            }
            ForEach(pts, id: \.point.id) { item in
                LineMark(x: .value("t", item.x), y: .value("v", clamp(item.point.height)))
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(Theme.Color.accent)
                    .lineStyle(StrokeStyle(lineWidth: ChartMetric.lineWidth, lineCap: .round, lineJoin: .round))
            }
            // Small dots on every point except the emphasized last one.
            ForEach(pts.dropLast(), id: \.point.id) { item in
                PointMark(x: .value("t", item.x), y: .value("v", clamp(item.point.height)))
                    .symbolSize(ChartMetric.dotSize)
                    .foregroundStyle(Theme.Color.accent)
            }
            // Emphasized endpoint: halo ring, solid dot, mono value callout above.
            if let last = pts.last {
                let y = clamp(last.point.height)
                PointMark(x: .value("t", last.x), y: .value("v", y))
                    .symbolSize(ChartMetric.haloSize)
                    .foregroundStyle(Theme.Color.accent.opacity(ChartMetric.haloOpacity))
                PointMark(x: .value("t", last.x), y: .value("v", y))
                    .symbolSize(ChartMetric.lastDotSize)
                    .foregroundStyle(Theme.Color.accent)
                    .annotation(position: .top, alignment: .center, spacing: 3) {
                        if let display = last.point.display {
                            Text(display)
                                .font(.system(size: ChartMetric.calloutSize, weight: .heavy, design: .monospaced))
                                .foregroundStyle(Theme.Color.accentText)
                                .fixedSize()
                        }
                    }
            }
        }
        .chartYScale(domain: 0...1)
        .chartXScale(domain: (0 - ChartMetric.xDomainPad)...(lastX + ChartMetric.xDomainPad))
        .chartYAxis {
            AxisMarks(position: .leading, values: ChartMetric.gridValues) { value in
                AxisGridLine().foregroundStyle(Theme.Color.hairline)
                if let axis {
                    if value.index == 0 {
                        AxisValueLabel { axisText(axis.min_display) }
                    } else if value.index == value.count - 1 {
                        AxisValueLabel { axisText(axis.max_display) }
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: xTickValues) { value in
                if let x = value.as(Double.self) {
                    AxisValueLabel { axisText(xLabel(Int(x.rounded()))) }
                }
            }
        }
        .frame(height: ChartMetric.plotHeight)
        .padding(.top, 6)
        .accessibilityElement()
        .accessibilityLabel(axLabel)
    }

    /// First / middle / last indices (deduped) for the x hints.
    private var xTickValues: [Double] {
        guard points.count > 1 else { return [0] }
        let mid = points.count / 2
        return Array(Set([0, mid, points.count - 1])).sorted().map(Double.init)
    }

    /// Short "d MMM" hint for a point's date-ish label (falls back to the raw
    /// string when it isn't a parseable date). Reuses the shared date formatter.
    private func xLabel(_ i: Int) -> String {
        guard i >= 0, i < points.count, let raw = points[i].label else { return "" }
        if let d = StatsDateParser.parse(raw) { return StatsDateParser.dayMonth(d) }
        return raw
    }
}

// MARK: - Bar series (volume)

struct BarSeriesChart: View {
    let points: [CardSeriesPoint]
    let axLabel: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .bottom, spacing: ChartMetric.barSpacing) {
                ForEach(points) { p in
                    VStack(spacing: 3) {
                        // Mono value callout sits above the CURRENT bar only.
                        if p.current, let display = p.display {
                            Text(display)
                                .font(.system(size: ChartMetric.calloutSize, weight: .heavy, design: .monospaced))
                                .foregroundStyle(Theme.Color.accentText)
                                .lineLimit(1)
                                .fixedSize()
                        }
                        RoundedRectangle(cornerRadius: ChartMetric.barCorner, style: .continuous)
                            .fill(p.current ? Theme.Color.accent : Theme.Color.accent.opacity(ChartMetric.inactiveOpacity))
                            .frame(height: max(3, ChartMetric.plotHeight * clamp(p.height)))
                            .frame(maxWidth: .infinity)
                    }
                    .frame(maxWidth: .infinity, alignment: .bottom)
                }
            }
            .frame(height: ChartMetric.plotHeight + 18, alignment: .bottom)
        }
        .accessibilityElement()
        .accessibilityLabel(axLabel)
    }
}

// MARK: - Shared helpers

private func clamp(_ h: Double) -> Double { min(1, max(0, h)) }

/// Muted mono axis label (both x hints and y min/max).
@ViewBuilder
private func axisText(_ s: String) -> some View {
    Text(s)
        .font(.system(size: ChartMetric.axisLabelSize, weight: .semibold, design: .monospaced))
        .foregroundStyle(Theme.Color.faint)
}
