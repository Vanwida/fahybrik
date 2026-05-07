import SwiftUI

// Expert variant of the Stats tab.
// Mirrors docs/design/fahybrik-design-system/project/athlete_app/stats.jsx
// `StatsExpert`: dense multi-panel dashboard with CTL/ATL/TSB chart, 2x3
// metric tiles, polarization bar, HYROX stations table. Sub-tabs (Carga/HR/
// Hyrox/Tendencias) gate which panels render top-of-list — Expert is single
// scroll dashboard so all show without sub-tab gating per the JSX.
struct StatsView: View {
    enum SubTab: String, CaseIterable, Identifiable {
        case carga = "Carga"
        case hr = "HR"
        case hyrox = "Hyrox"
        case trend = "Tendencias"
        var id: String { rawValue }
    }

    @State private var tab: SubTab = .carga

    private struct Station {
        let name: String
        let time: String
        let best: String
        let delta: String
        let flag: Bool
    }

    private let stations: [Station] = [
        Station(name: "SkiErg 1000m",   time: "4:18", best: "4:08", delta: "+10s", flag: false),
        Station(name: "Sled Push 50m",  time: "0:55", best: "0:52", delta: "+3s",  flag: false),
        Station(name: "Sled Pull 50m",  time: "1:12", best: "1:08", delta: "+4s",  flag: false),
        Station(name: "Burpee BJ 80m",  time: "4:22", best: "4:00", delta: "+22s", flag: true),
        Station(name: "Row 1000m",      time: "3:58", best: "3:50", delta: "+8s",  flag: false),
        Station(name: "Farmers 200m",   time: "1:48", best: "1:42", delta: "+6s",  flag: false),
        Station(name: "Sandbag Lunges", time: "2:38", best: "2:30", delta: "+8s",  flag: false),
        Station(name: "Wall Balls 100", time: "4:12", best: "3:55", delta: "+17s", flag: true),
    ]

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                subTabBar
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        loadChartCard
                        metricGrid
                        polarizationCard
                        if tab == .hyrox || tab == .carga {
                            hyroxStationsCard
                        }
                        if tab == .trend {
                            trendsCard
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.m)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
            }
        }
    }

    private var subTabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(SubTab.allCases) { t in
                    PillChip(title: t.rawValue, selected: tab == t) {
                        tab = t
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.m)
        }
    }

    private var loadChartCard: some View {
        let p = TodayPersona.demo
        return CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    LabelText(text: "CTL · ATL · TSB · 28d", size: 9)
                    Spacer()
                    MonoText(text: "+\(p.tsb) \(p.tsbLabel)", size: 10, color: Theme.Color.ok)
                }
                LoadChart()
                    .frame(height: 100)
            }
        }
    }

    private var metricGrid: some View {
        let p = TodayPersona.demo
        let cols = [
            GridItem(.flexible(), spacing: 6),
            GridItem(.flexible(), spacing: 6),
            GridItem(.flexible(), spacing: 6),
        ]
        return LazyVGrid(columns: cols, spacing: 6) {
            ExpertCell(label: "CTL", value: "\(p.ctl)", unit: "fitness")
            ExpertCell(label: "ATL", value: "\(p.atl)", unit: "fatiga")
            ExpertCell(label: "ACR", value: p.acr, unit: "ratio")
            ExpertCell(label: "HRV", value: "\(p.hrvValue)", unit: "▲4", color: Theme.Color.ok)
            ExpertCell(label: "RHR", value: "\(p.rhr)", unit: "▼4", color: Theme.Color.ok)
            ExpertCell(label: "Ready", value: "\(p.readiness)", unit: "comp", color: Theme.Color.ok)
        }
    }

    private var polarizationCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 4) {
                LabelText(text: "Polarización · 28d", size: 9)
                GeometryReader { geo in
                    HStack(spacing: 0) {
                        Rectangle().fill(HRZone.z2.color)
                            .frame(width: geo.size.width * 0.72)
                        Rectangle().fill(HRZone.z3.color)
                            .frame(width: geo.size.width * 0.12)
                        Rectangle().fill(HRZone.z4.color)
                            .frame(width: geo.size.width * 0.16)
                    }
                }
                .frame(height: 14)
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                HStack {
                    MonoText(text: "Z1+Z2 (tgt 80%)", size: 9, color: HRZone.z2.color)
                    Spacer()
                    MonoText(text: "Z3 (tgt 10%)", size: 9, color: HRZone.z3.color)
                    Spacer()
                    MonoText(text: "Z4+Z5 (tgt 10%)", size: 9, color: HRZone.z4.color)
                }
            }
        }
    }

    private var hyroxStationsCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                HStack {
                    LabelText(text: "Hyrox · Stations", size: 9)
                    Spacer()
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                Hairline()
                ForEach(Array(stations.enumerated()), id: \.offset) { idx, s in
                    if idx > 0 { Hairline() }
                    HStack(spacing: 6) {
                        Text(s.name)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.foreground)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .lineLimit(1)
                        MonoText(text: s.time, size: 11, color: Theme.Color.muted)
                            .frame(width: 50, alignment: .trailing)
                        MonoText(text: s.delta, size: 10, color: s.flag ? Theme.Color.warning : Theme.Color.muted)
                            .frame(width: 46, alignment: .trailing)
                        Text(s.flag ? "⚑" : "")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.warning)
                            .frame(width: 18, alignment: .center)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                }
            }
        }
    }

    private var trendsCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "Volumen · 8 sem", size: 9)
                BarChart(values: [7.2, 8.1, 7.8, 9.0, 9.4, 8.6, 10.2, 9.8])
                    .frame(height: 100)
            }
        }
    }
}

// MARK: - Mini charts (Path-based, deterministic demo data)

private struct LoadChart: View {
    private static let count = 28
    private static let minY: Double = 30
    private static let maxY: Double = 100

    private static func makeCtl() -> [Double] {
        var out: [Double] = []
        out.reserveCapacity(count)
        for i in 0..<count {
            let v: Double = 60.0 + sin(Double(i) * 0.18) * 6.0 + Double(i) * 0.55
            out.append(v)
        }
        return out
    }
    private static func makeAtl() -> [Double] {
        var out: [Double] = []
        out.reserveCapacity(count)
        for i in 0..<count {
            let v: Double = 50.0 + cos(Double(i) * 0.3) * 12.0 + Double(i) * 0.45
            out.append(v)
        }
        return out
    }
    private static let ctl: [Double] = makeCtl()
    private static let atl: [Double] = makeAtl()

    var body: some View {
        GeometryReader { geo in
            ZStack {
                baseline(width: geo.size.width, height: geo.size.height)
                line(values: Self.ctl, color: Theme.Color.foreground, width: 2,
                     w: geo.size.width, h: geo.size.height)
                line(values: Self.atl, color: Theme.Color.warning, width: 1.5,
                     w: geo.size.width, h: geo.size.height)
            }
        }
    }

    private func baseline(width: CGFloat, height: CGFloat) -> some View {
        Path { p in
            p.move(to: CGPoint(x: 0, y: height - 0.5))
            p.addLine(to: CGPoint(x: width, y: height - 0.5))
        }
        .stroke(Theme.Color.hairline, lineWidth: 1)
    }

    private func line(values: [Double], color: Color, width: CGFloat,
                      w: CGFloat, h: CGFloat) -> some View {
        let count = values.count
        let minY = Self.minY
        let maxY = Self.maxY
        return Path { p in
            for (i, v) in values.enumerated() {
                let x = CGFloat(i) / CGFloat(count - 1) * w
                let y = h - CGFloat((v - minY) / (maxY - minY)) * h
                if i == 0 { p.move(to: CGPoint(x: x, y: y)) }
                else { p.addLine(to: CGPoint(x: x, y: y)) }
            }
        }
        .stroke(color, lineWidth: width)
    }
}

private struct BarChart: View {
    let values: [Double]
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height - 14
            let maxV = (values.max() ?? 1) * 1.1
            let bw = w / CGFloat(values.count) - 6
            HStack(alignment: .bottom, spacing: 6) {
                ForEach(Array(values.enumerated()), id: \.offset) { i, v in
                    VStack(spacing: 2) {
                        Rectangle()
                            .fill(i == values.count - 1 ? Theme.Color.accent : Theme.Color.foreground.opacity(0.7))
                            .frame(width: bw, height: CGFloat(v / maxV) * h)
                            .clipShape(RoundedRectangle(cornerRadius: 1.5, style: .continuous))
                        Text("w\(i+1)")
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
        }
    }
}

#Preview {
    StatsView()
        .preferredColorScheme(.dark)
}
