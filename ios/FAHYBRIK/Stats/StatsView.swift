import SwiftUI

// Expert variant of the Stats tab. Sub-tabs filter content per the demo
// depth spec: Carga (load + ACR), HR (HRV/RHR/zone distribution/recovery),
// Hyrox (stations + race prediction + best-vs-current), Tendencias (volume
// trend + monthly + per-exercise PR progressions). Garmin-density across
// all four — no consumer-grade simplification.
//
// Mock data is realistic for Marc Vidal · 42d to HYROX BCN · REAL block.
struct StatsView: View {
    enum SubTab: String, CaseIterable, Identifiable {
        case carga = "Carga"
        case hr = "HR"
        case hyrox = "Hyrox"
        case trend = "Tendencias"
        var id: String { rawValue }
    }

    @State private var tab: SubTab = .carga

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                subTabBar
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        switch tab {
                        case .carga: cargaPanel
                        case .hr:    hrPanel
                        case .hyrox: hyroxPanel
                        case .trend: trendPanel
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
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.m)
        }
    }

    // MARK: - Carga panel

    @ViewBuilder
    private var cargaPanel: some View {
        loadChartCard
        cargaMetricGrid
        polarizationCard
        acrTrendCard
    }

    private var loadChartCard: some View {
        let p = TodayPersona.demo
        return CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    LabelText(text: "CTL · ATL · TSB · 28d", size: 11)
                    Spacer()
                    MonoText(text: "+\(p.tsb) \(p.tsbLabel)", size: 12, color: Theme.Color.ok)
                }
                LoadChart()
                    .frame(height: 110)
                HStack(spacing: 14) {
                    LegendDot(color: Theme.Color.foreground, label: "CTL fitness")
                    LegendDot(color: Theme.Color.warning, label: "ATL fatiga")
                    LegendDot(color: Theme.Color.ok, label: "TSB form")
                }
            }
        }
    }

    private var cargaMetricGrid: some View {
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

    private var acrTrendCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    LabelText(text: "ACR · 90d", size: 9)
                    Spacer()
                    MonoText(text: "actual 1.10", size: 11, color: Theme.Color.ok)
                }
                ACRSparkline()
                    .frame(height: 56)
                HStack {
                    MonoText(text: "ventana óptima 0.8–1.3", size: 9, color: Theme.Color.muted)
                    Spacer()
                    MonoText(text: "12 semanas dentro", size: 9, color: Theme.Color.ok)
                }
            }
        }
    }

    // MARK: - HR panel

    @ViewBuilder
    private var hrPanel: some View {
        hrvHistoryCard
        rhrHistoryCard
        hrMaxCard
        zoneDistributionCard
        recoveryBreakdownCard
    }

    private var hrvHistoryCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    LabelText(text: "HRV · 90d", size: 9)
                    Spacer()
                    MonoText(text: "58ms · ▲4 vs 28d", size: 11, color: Theme.Color.ok)
                }
                HRVBarChart()
                    .frame(height: 96)
                HStack {
                    MonoText(text: "baseline 28d 54ms", size: 9, color: Theme.Color.muted)
                    Spacer()
                    MonoText(text: "rango 42–66ms", size: 9, color: Theme.Color.muted)
                }
            }
        }
    }

    private var rhrHistoryCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    LabelText(text: "RHR · 90d", size: 9)
                    Spacer()
                    MonoText(text: "48bpm · ▼4 vs 28d", size: 11, color: Theme.Color.ok)
                }
                RHRLineChart()
                    .frame(height: 80)
            }
        }
    }

    private var hrMaxCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "HRmax estimado", size: 9)
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    Text("188")
                        .font(.system(size: 36, weight: .heavy, design: .default).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                    Text("bpm")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.muted)
                    Spacer()
                    MonoText(text: "VO2max 58 mL/kg/min", size: 10, color: Theme.Color.muted)
                }
                Text("Última prueba: 14 abr 2026 · sprint test 4×4 con Polar H10")
                    .font(.system(size: 10))
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }

    private var zoneDistributionCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    LabelText(text: "Distribución HR · 14d", size: 9)
                    Spacer()
                    MonoText(text: "9h 22m total", size: 11, color: Theme.Color.muted)
                }
                ZoneStackBar(
                    parts: [
                        (HRZone.z1, 0.18),
                        (HRZone.z2, 0.54),
                        (HRZone.z3, 0.08),
                        (HRZone.z4, 0.12),
                        (HRZone.z5, 0.08),
                    ]
                )
                .frame(height: 18)
                VStack(spacing: 4) {
                    HRZoneRow(zone: .z1, time: "1h 41m", percent: "18%")
                    HRZoneRow(zone: .z2, time: "5h 03m", percent: "54%")
                    HRZoneRow(zone: .z3, time: "0h 45m", percent: "8%")
                    HRZoneRow(zone: .z4, time: "1h 07m", percent: "12%")
                    HRZoneRow(zone: .z5, time: "0h 46m", percent: "8%")
                }
            }
        }
    }

    private var recoveryBreakdownCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    LabelText(text: "Readiness · breakdown", size: 9)
                    Spacer()
                    MonoText(text: "78/100", size: 11, color: Theme.Color.ok)
                }
                RecoveryBar(label: "HRV vs baseline", value: 0.86, color: Theme.Color.ok)
                RecoveryBar(label: "Sueño 7h12m / 7h30m", value: 0.78, color: Theme.Color.ok)
                RecoveryBar(label: "RHR -4 vs baseline", value: 0.82, color: Theme.Color.ok)
                RecoveryBar(label: "Check-in subjetivo 4/5", value: 0.72, color: Theme.Color.warning)
            }
        }
    }

    // MARK: - Hyrox panel

    @ViewBuilder
    private var hyroxPanel: some View {
        racePredictionCard
        stationsTableCard
        gapToBestCard
    }

    private var racePredictionCard: some View {
        CardSurface(padding: 14, topAccent: true) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    LabelText(text: "Predicción · HYROX BCN", color: Theme.Color.accent, size: 10)
                    Spacer()
                    MonoText(text: "42 días", size: 11, color: Theme.Color.muted)
                }
                HStack(alignment: .lastTextBaseline, spacing: 12) {
                    Text("1:06:42")
                        .font(.system(size: 38, weight: .heavy, design: .default).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("objetivo 1:05:00")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.muted)
                        Text("+1:42 vs goal")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.Color.warning)
                    }
                }
                Hairline()
                VStack(alignment: .leading, spacing: 4) {
                    Text("Run total · 31:18 · pace 3:55/km")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Stations · 28:24 · transiciones 7:00")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Color.foreground)
                }
                Text("Modelo: 6 sesiones HYROX-spec últimos 28d · margen ±0:48s")
                    .font(.system(size: 10))
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }

    private var stationsTableCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                HStack {
                    LabelText(text: "Stations · best vs actual", size: 9)
                    Spacer()
                    MonoText(text: "actual / best / Δ", size: 9, color: Theme.Color.muted)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                Hairline()
                ForEach(Array(StatsDemoData.stations.enumerated()), id: \.offset) { idx, s in
                    if idx > 0 { Hairline() }
                    HStack(spacing: 6) {
                        Text(s.name)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.foreground)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .lineLimit(1)
                        MonoText(text: s.time, size: 11, color: Theme.Color.foreground)
                            .frame(width: 50, alignment: .trailing)
                        MonoText(text: s.best, size: 10, color: Theme.Color.muted)
                            .frame(width: 50, alignment: .trailing)
                        MonoText(text: s.delta, size: 10, color: s.flag ? Theme.Color.warning : Theme.Color.muted)
                            .frame(width: 46, alignment: .trailing)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                }
            }
        }
    }

    private var gapToBestCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "Gap to best · por estación", size: 9)
                ForEach(StatsDemoData.gapToBest, id: \.station) { row in
                    GapBar(station: row.station, gapPct: row.gapPct, label: row.label)
                }
            }
        }
    }

    // MARK: - Tendencias panel

    @ViewBuilder
    private var trendPanel: some View {
        weeklyVolumeCard
        monthlyCompareCard
        prProgressionCard
        intensityTrendCard
    }

    private var weeklyVolumeCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    LabelText(text: "Volumen · 8 sem", size: 9)
                    Spacer()
                    MonoText(text: "9.8h esta sem · +14% vs media", size: 10, color: Theme.Color.ok)
                }
                BarChart(values: [7.2, 8.1, 7.8, 9.0, 9.4, 8.6, 10.2, 9.8])
                    .frame(height: 100)
            }
        }
    }

    private var monthlyCompareCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "Volumen · abr vs may", size: 9)
                HStack(spacing: 12) {
                    MonthCompareCol(label: "ABR", hours: "32:18", deltaText: "—", deltaColor: Theme.Color.muted)
                    MonthCompareCol(label: "MAY", hours: "37:42", deltaText: "+16.8%", deltaColor: Theme.Color.ok)
                }
                HStack {
                    MonoText(text: "TSS abr 412", size: 10, color: Theme.Color.muted)
                    Spacer()
                    MonoText(text: "TSS may 478 · +66", size: 10, color: Theme.Color.ok)
                }
            }
        }
    }

    private var prProgressionCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "PR · progresión 6 meses", size: 9)
                PRProgressionRow(
                    title: "Wall Ball 100",
                    valueLabel: "3:55 (best)",
                    valueColor: Theme.Color.ok,
                    points: [4.32, 4.20, 4.10, 4.05, 4.00, 3.92]
                )
                Hairline()
                PRProgressionRow(
                    title: "Sled Push 50m @ 102kg",
                    valueLabel: "0:52 (best)",
                    valueColor: Theme.Color.ok,
                    points: [1.05, 1.02, 0.58, 0.55, 0.54, 0.52]
                )
                Hairline()
                PRProgressionRow(
                    title: "5K time trial",
                    valueLabel: "18:42 (best)",
                    valueColor: Theme.Color.ok,
                    points: [19.45, 19.20, 19.05, 18.55, 18.42, 18.42]
                )
            }
        }
    }

    private var intensityTrendCard: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    LabelText(text: "Distribución intensidad · 12 sem", size: 9)
                    Spacer()
                    MonoText(text: "polariz. estable", size: 10, color: Theme.Color.ok)
                }
                IntensityTrendChart()
                    .frame(height: 90)
                HStack(spacing: 10) {
                    LegendDot(color: HRZone.z2.color, label: "Z1-2")
                    LegendDot(color: HRZone.z3.color, label: "Z3")
                    LegendDot(color: HRZone.z4.color, label: "Z4-5")
                }
            }
        }
    }
}

// MARK: - Demo data

private enum StatsDemoData {
    struct StationRow {
        let name: String
        let time: String
        let best: String
        let delta: String
        let flag: Bool
    }

    static let stations: [StationRow] = [
        .init(name: "SkiErg 1000m",   time: "4:18", best: "4:08", delta: "+10s", flag: false),
        .init(name: "Sled Push 50m",  time: "0:55", best: "0:52", delta: "+3s",  flag: false),
        .init(name: "Sled Pull 50m",  time: "1:12", best: "1:08", delta: "+4s",  flag: false),
        .init(name: "Burpee BJ 80m",  time: "4:22", best: "4:00", delta: "+22s", flag: true),
        .init(name: "Row 1000m",      time: "3:58", best: "3:50", delta: "+8s",  flag: false),
        .init(name: "Farmers 200m",   time: "1:48", best: "1:42", delta: "+6s",  flag: false),
        .init(name: "Sandbag Lunges", time: "2:38", best: "2:30", delta: "+8s",  flag: false),
        .init(name: "Wall Balls 100", time: "4:12", best: "3:55", delta: "+17s", flag: true),
    ]

    struct GapRow {
        let station: String
        let gapPct: Double
        let label: String
    }

    static let gapToBest: [GapRow] = [
        .init(station: "Burpee BJ",  gapPct: 0.92, label: "+22s · 9.2% off"),
        .init(station: "Wall Balls", gapPct: 0.72, label: "+17s · 7.2% off"),
        .init(station: "SkiErg",     gapPct: 0.40, label: "+10s · 4.0% off"),
        .init(station: "Row 1000",   gapPct: 0.35, label: "+8s · 3.5% off"),
        .init(station: "Sandbag",    gapPct: 0.32, label: "+8s · 3.2% off"),
        .init(station: "Farmers",    gapPct: 0.30, label: "+6s · 3.0% off"),
        .init(station: "Sled Pull",  gapPct: 0.20, label: "+4s · 2.0% off"),
        .init(station: "Sled Push",  gapPct: 0.10, label: "+3s · 1.0% off"),
    ]
}

// MARK: - Charts

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

private struct ACRSparkline: View {
    private static let values: [Double] = [
        0.85, 0.92, 1.05, 1.18, 1.22, 1.10, 0.98, 0.92, 1.00, 1.08,
        1.14, 1.05, 1.02, 1.10
    ]

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Rectangle()
                    .fill(Theme.Color.ok.opacity(0.05))
                    .frame(height: geo.size.height * 0.5)
                    .offset(y: geo.size.height * 0.0)
                Path { p in
                    let n = Self.values.count
                    let minV = 0.6
                    let maxV = 1.5
                    for (i, v) in Self.values.enumerated() {
                        let x = CGFloat(i) / CGFloat(n - 1) * geo.size.width
                        let y = geo.size.height - CGFloat((v - minV) / (maxV - minV)) * geo.size.height
                        if i == 0 { p.move(to: CGPoint(x: x, y: y)) }
                        else { p.addLine(to: CGPoint(x: x, y: y)) }
                    }
                }
                .stroke(Theme.Color.foreground, lineWidth: 1.5)
            }
        }
    }
}

private struct HRVBarChart: View {
    private static let values: [Double] = [
        48, 52, 51, 49, 47, 50, 53, 55, 54, 56, 58, 57,
        55, 52, 50, 48, 51, 54, 56, 57, 59, 58, 60, 62,
        59, 57, 58, 60
    ]
    private static let baseline: Double = 54

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let maxV = (Self.values.max() ?? 1) * 1.05
            let minV = (Self.values.min() ?? 0) * 0.85
            let bw = w / CGFloat(Self.values.count) - 1
            ZStack(alignment: .bottomLeading) {
                Path { p in
                    let y = h - CGFloat((Self.baseline - minV) / (maxV - minV)) * h
                    p.move(to: CGPoint(x: 0, y: y))
                    p.addLine(to: CGPoint(x: w, y: y))
                }
                .stroke(Theme.Color.muted.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))

                HStack(alignment: .bottom, spacing: 1) {
                    ForEach(Array(Self.values.enumerated()), id: \.offset) { _, v in
                        let height = max(2, CGFloat((v - minV) / (maxV - minV)) * h)
                        Rectangle()
                            .fill(v >= Self.baseline ? Theme.Color.ok : Theme.Color.muted.opacity(0.6))
                            .frame(width: bw, height: height)
                            .clipShape(RoundedRectangle(cornerRadius: 1, style: .continuous))
                    }
                }
            }
        }
    }
}

private struct RHRLineChart: View {
    private static let values: [Double] = [
        54, 53, 52, 53, 51, 50, 51, 50, 49, 50, 49, 48, 49, 47,
        48, 47, 48, 47, 46, 47, 48, 47, 46, 47, 46, 47, 48, 47
    ]

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let maxV = (Self.values.max() ?? 60) + 1
            let minV = (Self.values.min() ?? 40) - 1
            ZStack {
                Path { p in
                    for (i, v) in Self.values.enumerated() {
                        let x = CGFloat(i) / CGFloat(Self.values.count - 1) * w
                        let y = h - CGFloat((v - minV) / (maxV - minV)) * h
                        if i == 0 { p.move(to: CGPoint(x: x, y: y)) }
                        else { p.addLine(to: CGPoint(x: x, y: y)) }
                    }
                }
                .stroke(Theme.Color.foreground, lineWidth: 1.5)
            }
        }
    }
}

private struct ZoneStackBar: View {
    let parts: [(zone: HRZone, fraction: Double)]

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                    Rectangle()
                        .fill(part.zone.color)
                        .frame(width: max(0, geo.size.width * CGFloat(part.fraction)))
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
    }
}

private struct HRZoneRow: View {
    let zone: HRZone
    let time: String
    let percent: String

    var body: some View {
        HStack(spacing: 8) {
            Rectangle()
                .fill(zone.color)
                .frame(width: 12, height: 8)
                .clipShape(RoundedRectangle(cornerRadius: 1, style: .continuous))
            Text(zone.label)
                .font(.system(size: 10, weight: .bold))
                .tracking(1.2)
                .foregroundStyle(zone.color)
                .frame(width: 22, alignment: .leading)
            Text(time)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(Theme.Color.foreground)
            Spacer()
            Text(percent)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(Theme.Color.muted)
        }
    }
}

private struct RecoveryBar: View {
    let label: String
    let value: Double
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(label)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.foreground)
                Spacer()
                Text("\(Int(value * 100))")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(color)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(Theme.Color.surface)
                        .frame(height: 4)
                    Rectangle()
                        .fill(color)
                        .frame(width: geo.size.width * CGFloat(value), height: 4)
                }
                .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
            }
            .frame(height: 4)
        }
    }
}

private struct LegendDot: View {
    let color: Color
    let label: String
    var body: some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(label)
                .font(.system(size: 10))
                .foregroundStyle(Theme.Color.muted)
        }
    }
}

private struct GapBar: View {
    let station: String
    let gapPct: Double
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(station)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.foreground)
                Spacer()
                Text(label)
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(Theme.Color.muted)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(Theme.Color.surface)
                        .frame(height: 4)
                    Rectangle()
                        .fill(gapPct >= 0.7 ? Theme.Color.warning : Theme.Color.foreground.opacity(0.7))
                        .frame(width: geo.size.width * CGFloat(min(gapPct, 1.0)), height: 4)
                }
                .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
            }
            .frame(height: 4)
        }
    }
}

private struct MonthCompareCol: View {
    let label: String
    let hours: String
    let deltaText: String
    let deltaColor: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: label, size: 9)
            Text(hours)
                .font(.system(size: 22, weight: .heavy, design: .default).italic().monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
            Text(deltaText)
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .foregroundStyle(deltaColor)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Theme.Color.background)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

private struct PRProgressionRow: View {
    let title: String
    let valueLabel: String
    let valueColor: Color
    let points: [Double]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.foreground)
                Spacer()
                Text(valueLabel)
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(valueColor)
            }
            MiniSparkline(points: points, color: Theme.Color.foreground)
                .frame(height: 24)
        }
    }
}

private struct MiniSparkline: View {
    let points: [Double]
    let color: Color

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let maxV = points.max() ?? 1
            let minV = points.min() ?? 0
            let range = max(0.001, maxV - minV)
            ZStack {
                Path { p in
                    for (i, v) in points.enumerated() {
                        let x = CGFloat(i) / CGFloat(points.count - 1) * w
                        let y = h - CGFloat((v - minV) / range) * h
                        if i == 0 { p.move(to: CGPoint(x: x, y: y)) }
                        else { p.addLine(to: CGPoint(x: x, y: y)) }
                    }
                }
                .stroke(color, lineWidth: 1.5)
                if let last = points.last {
                    let x = w
                    let y = h - CGFloat((last - minV) / range) * h
                    Circle()
                        .fill(Theme.Color.accent)
                        .frame(width: 5, height: 5)
                        .position(x: x - 2, y: y)
                }
            }
        }
    }
}

private struct IntensityTrendChart: View {
    // Stacked area-style bar chart, 12 weeks. Each week: Z1-2 / Z3 / Z4-5 stack.
    private static let weeks: [(z12: Double, z3: Double, z45: Double)] = [
        (0.78, 0.10, 0.12), (0.76, 0.10, 0.14), (0.80, 0.08, 0.12),
        (0.82, 0.08, 0.10), (0.78, 0.10, 0.12), (0.76, 0.12, 0.12),
        (0.74, 0.12, 0.14), (0.72, 0.14, 0.14), (0.74, 0.10, 0.16),
        (0.76, 0.10, 0.14), (0.78, 0.08, 0.14), (0.78, 0.08, 0.14),
    ]

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height - 12
            let bw = w / CGFloat(Self.weeks.count) - 3
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(Array(Self.weeks.enumerated()), id: \.offset) { i, wk in
                    VStack(spacing: 2) {
                        VStack(spacing: 0) {
                            Rectangle().fill(HRZone.z4.color).frame(height: CGFloat(wk.z45) * h)
                            Rectangle().fill(HRZone.z3.color).frame(height: CGFloat(wk.z3) * h)
                            Rectangle().fill(HRZone.z2.color).frame(height: CGFloat(wk.z12) * h)
                        }
                        .frame(width: bw)
                        .clipShape(RoundedRectangle(cornerRadius: 1, style: .continuous))
                        Text("w\(i+1)")
                            .font(.system(size: 8, design: .monospaced))
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
        }
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
