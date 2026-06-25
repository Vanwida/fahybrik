import SwiftUI
import Charts

// Running · análisis completo: key metrics (threshold pace, VO₂ est., best
// 1 km, weekly volume), 8×1 km splits, pace zones Z2–Z5, threshold progression,
// and the training that works it.
//
// Two truth states, honestly:
//   • RACE/RUNNING-DERIVED (threshold, VO₂, best 1 km, splits, zones,
//     progression) — LIVE from CarrerasService.fetchRunningAnalysis
//     (GET /api/athlete/running-analysis); fields the system can't measure yet
//     (e.g. threshold/VO₂/zones with no 5K) come back null → honest empty state.
//   • LIVE weekly running volume from StatsService (GET /api/athlete/analytics):
//     real distance + the weekly trend chart, shown for real when it exists.
//
// Brand accent is orange; the per-km split severity uses the semantic
// ok/warning/danger axis, never red-as-brand.
struct RunningDeepDiveView: View {
    var bearer: String? = nil

    @Environment(\.dismiss) private var dismiss

    @State private var analysis: RunningAnalysis? = nil
    @State private var analytics: AthleteAnalytics? = nil
    @State private var loading = true

    private var effectiveBearer: String? {
        bearer ?? UserDefaults.standard.string(forKey: "fahybrik.bearer")
    }

    /// Live running totals from StatsService, if the athlete has any.
    private var runningTotals: ModalityTotals? {
        analytics?.byModalityTotals.first { AnalyticsModality(raw: $0.modality) == .run }
    }

    /// Live weekly running buckets (oldest → newest) for the volume chart.
    private var runningWeeks: [StatsWeekPoint] {
        (analytics?.weekly ?? [])
            .filter { AnalyticsModality(raw: $0.modality) == .run }
            .compactMap { w in
                StatsDateParser.parse(w.weekStart).map {
                    StatsWeekPoint(weekStart: $0, distanceMeters: w.distanceMeters)
                }
            }
            .sorted { $0.weekStart < $1.weekStart }
    }

    /// True when the analysis payload carries no usable metric at all (no 5K →
    /// no threshold/VO₂/zones, and no logged runs → no best 1 km / splits /
    /// progression). An all-empty payload reads the same as no payload.
    private var analysisHasContent: Bool {
        guard let a = analysis else { return false }
        return a.threshold_pace != nil
            || a.vo2_estimate != nil
            || a.best_1k != nil
            || !a.splits.isEmpty
            || !a.pace_zones.isEmpty
            || !a.progression.isEmpty
            || !a.training.isEmpty
    }

    /// True when there is genuinely nothing to show on the whole screen — neither
    /// the race/running-derived analysis nor the live StatsService volume.
    private var isFullyEmpty: Bool {
        !analysisHasContent && runningTotals == nil && runningWeeks.isEmpty
    }

    var body: some View {
        ZStack {
            Theme.Color.background
                .ignoresSafeArea()
                .instrumentCanvas()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    headerRow

                    if loading {
                        ProgressView()
                            .tint(Theme.Color.accentText)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Theme.Spacing.xl)
                    } else if isFullyEmpty {
                        RedesignEmptyState(
                            symbol: "figure.run",
                            title: "Aún no hay análisis de running",
                            message: "En cuanto corras tu próxima sesión con el reloj verás aquí tu ritmo umbral, tus splits por km y la deriva de ritmo."
                        )
                        .padding(.top, Theme.Spacing.m)
                    } else {
                        loadedContent
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.xxl)
            }
        }
        .navigationBarHidden(true)
        .task(id: effectiveBearer) { await load() }
    }

    // MARK: - Header

    private var headerRow: some View {
        HStack(spacing: 12) {
            BackCircleButton { dismiss() }
            Text("Running")
                .scaledFont(24, weight: .heavy, relativeTo: .title2, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Spacer(minLength: 8)
        }
        .padding(.top, Theme.Spacing.s)
    }

    // MARK: - Loaded content

    @ViewBuilder
    private var loadedContent: some View {
        keyMetrics

        // LIVE: weekly running volume from StatsService, shown for real.
        if !runningWeeks.isEmpty {
            liveWeeklyVolume
        }

        if let analysis {
            if !analysis.splits.isEmpty {
                splitsSection(analysis)
            }
            if !analysis.pace_zones.isEmpty {
                paceZones(analysis.pace_zones)
            }
            if !analysis.progression.isEmpty {
                progression(analysis.progression)
            }
            if !analysis.training.isEmpty {
                TrainingLinksList(title: "ENTRENOS QUE LO TRABAJAN", links: analysis.training)
            }
        } else {
            // Race-derived running analysis isn't shipped — be honest about the
            // half of the screen that needs it, while the live volume above is real.
            RedesignEmptyState(
                symbol: "speedometer",
                title: "Ritmo y splits en camino",
                message: "El ritmo umbral, los splits por km y las zonas aparecerán en cuanto registres una carrera o sesión de running con el reloj."
            )
            .padding(.top, Theme.Spacing.s)
        }
    }

    // Key-metric tiles. Threshold / VO₂ / best 1 km come from the (not-yet-live)
    // analysis; weekly volume prefers the LIVE StatsService figure. Each tile
    // shows "—" honestly when its source isn't available.
    private var keyMetrics: some View {
        let weeklyKm: String? = {
            if let last = runningWeeks.last { return StatsFormat.distance(last.distanceMeters) }
            return analysis?.weekly_volume_km
        }()
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            ExpertCell(label: "Ritmo umbral", value: analysis?.threshold_pace ?? "—", color: analysis?.threshold_pace != nil ? Theme.Color.accentText : Theme.Color.muted)
            ExpertCell(label: "VO₂ est.", value: analysis?.vo2_estimate ?? "—", color: analysis?.vo2_estimate != nil ? Theme.Color.foreground : Theme.Color.muted)
            ExpertCell(label: "Mejor 1 km", value: analysis?.best_1k ?? "—", color: analysis?.best_1k != nil ? Theme.Color.foreground : Theme.Color.muted)
            ExpertCell(label: "Vol. semana", value: weeklyKm ?? "—", color: weeklyKm != nil ? Theme.Color.foreground : Theme.Color.muted)
        }
    }

    // LIVE weekly running volume: real distance + the same weekly trend chart
    // StatsView uses (single-sourced via StatsWeeklyTrendChart).
    private var liveWeeklyVolume: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionLabel(text: "VOLUMEN SEMANAL · RUNNING")
            CardSurface(padding: 14) {
                VStack(alignment: .leading, spacing: 12) {
                    if let pace = runningTotals.flatMap({
                        StatsFormat.pace(forModality: .run, perKm: $0.avgPaceSPerKm, per500m: nil)
                    }) {
                        HStack(alignment: .firstTextBaseline) {
                            HStack(spacing: 8) {
                                Image(systemName: "figure.run")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Theme.Color.accentText)
                                Text("Carrera")
                                    .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                                    .foregroundStyle(Theme.Color.foreground)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(pace)
                                    .font(Theme.Typography.readoutS)
                                    .foregroundStyle(Theme.Color.accentText)
                                LabelText(text: "RITMO MEDIO", size: 9)
                            }
                        }
                    }
                    StatsWeeklyTrendChart(series: runningWeeks, color: Theme.Color.accentText)
                        .frame(height: 96)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(weeklyVolumeA11y)
            }
        }
    }

    private var weeklyVolumeA11y: String {
        var s = "Volumen semanal de running"
        if let last = runningWeeks.last {
            s += ", última semana \(StatsFormat.distance(last.distanceMeters))"
        }
        return s
    }

    // 8×1 km splits — PaceBarChart + the final-drop callout.
    private func splitsSection(_ a: RunningAnalysis) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionLabel(text: "SPLITS DE CARRERA · 8×1 KM")
            CardSurface(padding: 14) {
                VStack(alignment: .leading, spacing: 10) {
                    PaceBarChart(bars: a.splits.map {
                        PaceBarChart.Bar(
                            height: $0.height,
                            severity: BenchmarkBarRow.Severity(wire: $0.severity),
                            label: $0.label
                        )
                    })
                    if let note = a.split_drop_note {
                        Label(note, systemImage: "exclamationmark.triangle.fill")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Theme.Color.warning)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    // Pace zones Z2–Z5 — a divided list with a zone dot + descriptor + pace.
    private func paceZones(_ zones: [RunningPaceZone]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionLabel(text: "ZONAS DE RITMO")
            VStack(spacing: 0) {
                ForEach(Array(zones.enumerated()), id: \.element.id) { idx, z in
                    if idx > 0 { Hairline() }
                    HStack(spacing: 9) {
                        Circle()
                            .fill(zoneColor(z.zone))
                            .frame(width: 8, height: 8)
                        Text("\(zoneLabel(z.zone)) · \(z.descriptor)")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.Color.muted)
                        Spacer(minLength: 8)
                        MonoText(
                            text: z.pace ?? "—",
                            size: 13,
                            weight: z.highlight ? .bold : .medium,
                            color: z.highlight ? Theme.Color.accentText : Theme.Color.foreground
                        )
                    }
                    .padding(.horizontal, 13)
                    .padding(.vertical, 9)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(zoneLabel(z.zone)), \(z.descriptor), \(z.pace ?? "sin dato")")
                }
            }
            .background(Theme.Color.surfaceElevated)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            .brandShadow(Theme.Shadow.cardTight)
        }
    }

    // Threshold progression — bars per block, latest accented (faster = shorter).
    private func progression(_ points: [RunningProgressionPoint]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionLabel(text: "PROGRESIÓN · RITMO UMBRAL")
            CardSurface(padding: 14) {
                HStack(alignment: .bottom, spacing: 12) {
                    ForEach(points) { p in
                        VStack(spacing: 5) {
                            RoundedRectangle(cornerRadius: 5, style: .continuous)
                                .fill(p.current ? Theme.Color.accent : Theme.Color.surfaceElevated)
                                .frame(maxWidth: .infinity)
                                .frame(height: max(8, 58 * CGFloat(max(0, min(1, p.height)))))
                            MonoText(
                                text: p.pace ?? "—",
                                size: 9,
                                weight: .medium,
                                color: p.current ? Theme.Color.accentText : Theme.Color.faint
                            )
                        }
                    }
                }
                .frame(height: 82, alignment: .bottom)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Progresión del ritmo umbral: " + points.compactMap { $0.pace }.joined(separator: ", "))
            }
        }
    }

    // MARK: - Zone helpers
    //
    // The deep-dive labels zones Z2–Z5. Color + label come from the shared
    // HRZone scale (orange stays the brand accent and never appears as a zone).

    private func zoneColor(_ zone: Int) -> Color {
        (HRZone(rawValue: zone) ?? .z2).color
    }

    private func zoneLabel(_ zone: Int) -> String {
        (HRZone(rawValue: zone) ?? .z2).label
    }

    // MARK: - Loading

    private func load() async {
        loading = true
        async let analysisTask = CarrerasService.fetchRunningAnalysis(bearer: effectiveBearer)
        if let token = effectiveBearer {
            analytics = try? await StatsService.fetchAnalytics(bearer: token)
        } else {
            analytics = nil
        }
        analysis = await analysisTask
        loading = false
    }
}
