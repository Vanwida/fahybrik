import SwiftUI

// Tests guiados — the hub's tiny benchmark curve + delta chip. Both are pure
// presentational atoms: the sparkline draws RAW values (a 5K improving trends
// DOWN — honest, like every serious training app), and the chip colors by the
// unit's better-direction through BenchmarkDelta so it can never disagree with
// the result screen.

/// Mini line chart of a benchmark's history. Draws nothing meaningful below two
/// points (a single mark renders as a lone dot — a curve needs history).
struct BenchmarkSparkline: View {
    let values: [Double]
    var lineColor: Color = Theme.Color.accentText

    var body: some View {
        GeometryReader { geo in
            let points = normalizedPoints(in: geo.size)
            ZStack {
                if points.count >= 2 {
                    // Soft area fill under the curve.
                    Path { p in
                        guard let first = points.first, let last = points.last else { return }
                        p.move(to: CGPoint(x: first.x, y: geo.size.height))
                        for pt in points { p.addLine(to: pt) }
                        p.addLine(to: CGPoint(x: last.x, y: geo.size.height))
                        p.closeSubpath()
                    }
                    .fill(lineColor.opacity(0.12))

                    Path { p in
                        p.move(to: points[0])
                        for pt in points.dropFirst() { p.addLine(to: pt) }
                    }
                    .stroke(lineColor, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                }
                if let last = points.last {
                    Circle()
                        .fill(lineColor)
                        .frame(width: 4, height: 4)
                        .position(last)
                }
            }
        }
        .accessibilityHidden(true)   // the row's text carries the numbers
    }

    // Map values into the rect, min–max normalized with a small vertical inset
    // so a flat series doesn't hug an edge. A single point centers itself.
    private func normalizedPoints(in size: CGSize) -> [CGPoint] {
        guard !values.isEmpty else { return [] }
        let inset: CGFloat = 3
        let h = size.height - inset * 2
        let lo = values.min() ?? 0
        let hi = values.max() ?? 1
        let span = hi - lo
        return values.enumerated().map { idx, v in
            let x = values.count == 1
                ? size.width / 2
                : size.width * CGFloat(idx) / CGFloat(values.count - 1)
            let norm = span > 0 ? (v - lo) / span : 0.5
            let y = inset + h * (1 - CGFloat(norm))
            return CGPoint(x: x, y: y)
        }
    }
}

/// "−12 s" / "+2.5 kg" pill, colored by whether the change BEATS the previous
/// mark (unit-aware direction). A zero delta reads neutral.
struct BenchmarkDeltaChip: View {
    let unit: String
    let delta: Double

    private var improved: Bool { BenchmarkDelta.improved(unit: unit, delta: delta) }
    private var tint: Color {
        if delta == 0 { return Theme.Color.muted }
        return improved ? Theme.Color.ok : Theme.Color.danger
    }

    var body: some View {
        Text(BenchmarkDelta.deltaLabel(unit: unit, delta: delta))
            .font(.system(size: 11, weight: .bold, design: .monospaced).monospacedDigit())
            .foregroundStyle(tint)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(tint.opacity(0.13))
            .clipShape(Capsule())
            .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        let change = BenchmarkDelta.deltaLabel(unit: unit, delta: delta)
        if delta == 0 { return "Sin cambio respecto a la marca anterior" }
        return improved ? "Mejora de \(change)" : "Empeora \(change)"
    }
}
