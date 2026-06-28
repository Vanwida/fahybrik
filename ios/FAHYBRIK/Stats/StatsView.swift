import SwiftUI
import Charts

// Analíticas tab — the athlete's training analytics, wired to the live
// `GET /api/athlete/analytics` endpoint (athlete Bearer auth).
//
// Three real sections, no fabricated numbers:
//   1. Volumen — distance + time per modality (run / row / ski / bike), with a
//      proportional horizontal bar so "32 km corriendo vs 8 200 m remando"
//      reads at a glance.
//   2. Ritmo — avg run pace /km and avg row split /500m, each with a weekly
//      distance trend (Swift Charts, iOS 18 target).
//   3. Entrenamientos — recent executions, each expandable to its segments so
//      the athlete sees run-vs-row within a single session.
//
// Honest loading / empty / error states like the rest of the app: a brand-new
// athlete with no logged executions sees a real empty state, never demo data.
struct StatsView: View {
    var bearer: String? = nil

    @State private var analytics: AthleteAnalytics? = nil
    @State private var loading = true
    @State private var loadFailed = false
    /// Drives the one orchestrated staggered reveal of the loaded sections.
    @State private var appear = false

    var body: some View {
        ZStack {
            Theme.Color.background
                .ignoresSafeArea()
                .instrumentCanvas()
            content
        }
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        if loading && analytics == nil {
            ProgressView()
                .tint(Theme.Color.accentText)
                .accessibilityLabel("Cargando analíticas")
        } else if let analytics, !analytics.isEmpty {
            loadedScroll(analytics)
        } else if loadFailed {
            errorState
        } else {
            emptyState
        }
    }

    // MARK: - Loaded

    private func loadedScroll(_ data: AthleteAnalytics) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header(data)
                    .staggerReveal(appear, index: 0)
                if !data.byModalityTotals.isEmpty {
                    StatsVolumeSection(totals: data.byModalityTotals)
                        .staggerReveal(appear, index: 1)
                }
                if !data.weekly.isEmpty {
                    StatsPaceSection(
                        totals: data.byModalityTotals,
                        weekly: data.weekly
                    )
                    .staggerReveal(appear, index: 2)
                }
                if !data.recentExecutions.isEmpty {
                    StatsRecentSection(executions: data.recentExecutions)
                        .staggerReveal(appear, index: 3)
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .onAppear { appear = true }
    }

    // Header + a hero instrument readout of total logged distance across every
    // modality — the at-a-glance "how much have I moved" number, in the mono
    // race-clock voice that anchors the rest of the screen.
    private func header(_ data: AthleteAnalytics) -> some View {
        let totalMeters = data.byModalityTotals.reduce(0) { $0 + $1.distanceMeters }
        let parts = StatsFormat.distanceParts(totalMeters)
        return VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: 4) {
                LabelText(text: "ANALÍTICAS", color: Theme.Color.accentText)
                Text("Tu volumen")
                    .scaledFont(30, weight: .heavy, relativeTo: .title, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            if totalMeters > 0 {
                CardSurface(topAccent: true, elevated: true) {
                    InstrumentReadout(
                        label: "Distancia total",
                        value: parts.value,
                        unit: parts.unit,
                        accent: true,
                        size: 64
                    )
                }
            }
        }
    }

    // MARK: - Loading

    private func load() async {
        defer { loading = false }
        guard let token = bearer ?? UserDefaults.standard.string(forKey: "fahybrik.bearer") else {
            loadFailed = true
            return
        }
        do {
            analytics = try await StatsService.fetchAnalytics(bearer: token)
            loadFailed = false
        } catch {
            analytics = nil
            loadFailed = true
        }
    }

    // MARK: - Empty / error

    // New athlete with no logged executions yet. Honest, never demo numbers.
    private var emptyState: some View {
        VStack(spacing: Theme.Spacing.m) {
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 40))
                .foregroundStyle(Theme.Color.muted)
            Text("Aún no hay analíticas")
                .scaledFont(18, weight: .heavy, relativeTo: .title3, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text("Registra entrenamientos de carrera, remo o ergómetro y aquí verás tu volumen, tus ritmos y la progresión sesión a sesión.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, Theme.Spacing.xxl)
    }

    private var errorState: some View {
        VStack(spacing: Theme.Spacing.m) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundStyle(Theme.Color.muted)
            Text("No pudimos cargar tus analíticas")
                .scaledFont(18, weight: .heavy, relativeTo: .title3, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text("Revisa tu conexión e inténtalo de nuevo.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
            Button {
                Haptics.light()
                loading = true
                loadFailed = false
                Task { await load() }
            } label: {
                Text("Reintentar")
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.accentOn)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(Theme.Color.accent)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
        .padding(.horizontal, Theme.Spacing.xxl)
    }
}

// MARK: - Volume section
//
// Per-modality distance + time, plus a single proportional bar that encodes
// each modality's share of total distance — so the athlete instantly sees
// "mostly running this block, some rowing".

struct StatsVolumeSection: View {
    let totals: [ModalityTotals]

    private var totalDistance: Double {
        totals.reduce(0) { $0 + $1.distanceMeters }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: "VOLUMEN POR MODALIDAD")

            if totalDistance > 0 {
                distanceBar
                    .accessibilityHidden(true) // summarised by the cards below
            }

            VStack(spacing: 8) {
                ForEach(totals) { t in
                    modalityCard(t)
                }
            }
        }
    }

    // Stacked proportional bar — each modality's slice = its share of total
    // distance. Pure visual summary; the per-modality numbers live in the cards.
    private var distanceBar: some View {
        GeometryReader { geo in
            HStack(spacing: 2) {
                ForEach(totals) { t in
                    let frac = totalDistance > 0 ? t.distanceMeters / totalDistance : 0
                    Rectangle()
                        .fill(AnalyticsModality(raw: t.modality).color)
                        .frame(width: max(0, geo.size.width * CGFloat(frac)))
                }
            }
        }
        .frame(height: 10)
        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
    }

    private func modalityCard(_ t: ModalityTotals) -> some View {
        let m = AnalyticsModality(raw: t.modality)
        let dist = StatsFormat.distance(t.distanceMeters)
        let dur = StatsFormat.duration(t.durationSeconds)
        let pace = StatsFormat.pace(forModality: m,
                                    perKm: t.avgPaceSPerKm,
                                    per500m: t.avgPaceSPer500m)
        return CardSurface(padding: 14) {
            HStack(spacing: 14) {
                Image(systemName: m.symbol)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(m.textColor)
                    .frame(width: 30)
                VStack(alignment: .leading, spacing: 4) {
                    Text(m.fullName)
                        .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.foreground)
                    HStack(spacing: 8) {
                        MonoText(text: dur, size: 12, color: Theme.Color.muted)
                        Text("·").foregroundStyle(Theme.Color.muted)
                        MonoText(text: "\(t.sessions) ses.", size: 12, color: Theme.Color.muted)
                        if let pace {
                            Text("·").foregroundStyle(Theme.Color.muted)
                            MonoText(text: pace, size: 12, color: Theme.Color.muted)
                        }
                    }
                }
                Spacer()
                Text(dist)
                    .font(Theme.Typography.readoutS)
                    .foregroundStyle(Theme.Color.foreground)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(volumeA11y(m: m, dist: dist, dur: dur, sessions: t.sessions, pace: pace))
        }
    }

    private func volumeA11y(m: AnalyticsModality, dist: String, dur: String, sessions: Int, pace: String?) -> String {
        var s = "\(m.fullName): \(dist), \(dur), \(sessions) sesiones"
        if let pace { s += ", ritmo medio \(pace)" }
        return s
    }
}

// MARK: - Pace section
//
// Surfaces the avg pace per modality as a headline number, plus a weekly
// distance trend chart per modality (Swift Charts). The trend answers "is my
// volume building or tapering?" — the defining periodization question.

struct StatsPaceSection: View {
    let totals: [ModalityTotals]
    let weekly: [WeeklyVolume]

    // Modalities present in the weekly data, ordered by total distance desc so
    // the dominant modality (usually running) charts first.
    private var modalities: [AnalyticsModality] {
        let present = Set(weekly.map { AnalyticsModality(raw: $0.modality) })
        return totals
            .sorted { $0.distanceMeters > $1.distanceMeters }
            .map { AnalyticsModality(raw: $0.modality) }
            .filter { present.contains($0) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: "RITMO Y TENDENCIA")
            ForEach(modalities, id: \.rawValue) { m in
                trendCard(for: m)
            }
        }
    }

    private func trendCard(for m: AnalyticsModality) -> some View {
        let series = weekSeries(for: m)
        let total = totals.first { AnalyticsModality(raw: $0.modality) == m }
        let pace = total.flatMap {
            StatsFormat.pace(forModality: m, perKm: $0.avgPaceSPerKm, per500m: $0.avgPaceSPer500m)
        }
        return CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    HStack(spacing: 8) {
                        Image(systemName: m.symbol)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(m.textColor)
                        Text(m.fullName)
                            .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    Spacer()
                    if let pace {
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(pace)
                                .font(Theme.Typography.readoutS)
                                .foregroundStyle(Theme.Color.accentText)
                            LabelText(text: "RITMO MEDIO", size: 9)
                        }
                    }
                }
                StatsWeeklyTrendChart(series: series, color: m.textColor)
                    .frame(height: 96)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(trendA11y(m: m, pace: pace, series: series))
        }
    }

    // Build the dense weekly series for one modality (sorted by week).
    private func weekSeries(for m: AnalyticsModality) -> [StatsWeekPoint] {
        weekly
            .filter { AnalyticsModality(raw: $0.modality) == m }
            .compactMap { w -> StatsWeekPoint? in
                guard let date = StatsDateParser.parse(w.weekStart) else { return nil }
                return StatsWeekPoint(weekStart: date, distanceMeters: w.distanceMeters)
            }
            .sorted { $0.weekStart < $1.weekStart }
    }

    private func trendA11y(m: AnalyticsModality, pace: String?, series: [StatsWeekPoint]) -> String {
        var s = m.fullName
        if let pace { s += ", ritmo medio \(pace)" }
        if let last = series.last {
            s += ", última semana \(StatsFormat.distance(last.distanceMeters))"
        }
        s += ". Tendencia semanal de distancia."
        return s
    }
}

// One week's distance for a modality — chart input.
struct StatsWeekPoint: Identifiable {
    var id: Date { weekStart }
    let weekStart: Date
    let distanceMeters: Double
}

// Weekly distance trend — bars for per-week volume + an overlaid line so the
// build/taper shape is legible even with few points. Uses Swift Charts
// (iOS 18 deployment target). Single bar collapses gracefully.
struct StatsWeeklyTrendChart: View {
    let series: [StatsWeekPoint]
    var color: Color

    var body: some View {
        Chart(series) { point in
            BarMark(
                x: .value("Semana", point.weekStart, unit: .weekOfYear),
                y: .value("Distancia", point.distanceMeters / 1000)
            )
            .foregroundStyle(color.opacity(0.35))
            .cornerRadius(3)

            LineMark(
                x: .value("Semana", point.weekStart, unit: .weekOfYear),
                y: .value("Distancia", point.distanceMeters / 1000)
            )
            .foregroundStyle(color)
            .interpolationMethod(.catmullRom)

            PointMark(
                x: .value("Semana", point.weekStart, unit: .weekOfYear),
                y: .value("Distancia", point.distanceMeters / 1000)
            )
            .foregroundStyle(color)
            .symbolSize(28)
        }
        .chartYAxis {
            AxisMarks(position: .leading) { value in
                AxisGridLine().foregroundStyle(Theme.Color.hairline)
                AxisValueLabel {
                    if let km = value.as(Double.self) {
                        Text("\(Int(km))")
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .weekOfYear)) { value in
                AxisValueLabel {
                    if let date = value.as(Date.self) {
                        Text(StatsDateParser.dayMonth(date))
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
        }
        .accessibilityHidden(true) // summarised by the card's combined label
    }
}

#Preview("Dark") {
    StatsView()
        .preferredColorScheme(.dark)
}

#Preview("Light") {
    StatsView()
        .preferredColorScheme(.light)
}
