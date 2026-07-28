import SwiftUI

// Detail for a single HYROX station (e.g. Sled Push): technique video, your
// last time vs benchmark + percentile, trend between races, sub-metrics, the
// training that improves it, and the IA recommendation. Data is LIVE from
// CarrerasService.fetchStationDetail (GET /api/athlete/stations/{station}); it
// renders an honest empty state when the athlete has no imported race recording
// this station. Replicable for all 8 stations via `init(station:bearer:)`.
//
// Brand accent is orange; the worse/slightly-worse/better delta uses the
// semantic danger/warning/ok axis, never red-as-brand.
struct StationDetailView: View {
    let station: String
    var bearer: String? = nil

    @Environment(\.dismiss) private var dismiss

    @State private var detail: StationDetail? = nil
    @State private var loading = true
    /// "Importar mis carreras" from the no-data state — the station's numbers are
    /// derived from imported HYROX results, so that is the way out of here.
    @State private var showImport = false

    private var effectiveBearer: String? {
        bearer
    }

    var body: some View {
        ZStack {
            Theme.Color.background
                .ignoresSafeArea()
                .instrumentCanvas()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    headerRow

                    TechniqueVideoPlaceholder(
                        title: station,
                        available: detail?.technique_video_url != nil
                    )

                    if loading {
                        ProgressView()
                            .tint(Theme.Color.accentText)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Theme.Spacing.xl)
                    } else if let detail {
                        loadedContent(detail)
                    } else {
                        RedesignEmptyState(
                            symbol: "chart.bar",
                            title: "Sin datos de esta estación",
                            message: "Cuando registres una carrera con esta estación verás aquí tu tiempo vs benchmark, tu tendencia y la recomendación de tu coach.",
                            // The data comes from an imported race — and importing
                            // is exactly what the athlete can do from here.
                            exit: .action(title: "Importar mis carreras") { showImport = true }
                        )
                        .padding(.top, Theme.Spacing.m)
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.xxl)
            }
        }
        .navigationBarHidden(true)
        .sheet(isPresented: $showImport) {
            ImportRaceSheet(bearer: effectiveBearer) { _ in
                Task {
                    loading = true
                    detail = await CarrerasService.fetchStationDetail(station: station, bearer: effectiveBearer)
                    loading = false
                }
            }
        }
        .task(id: effectiveBearer) {
            loading = true
            detail = await CarrerasService.fetchStationDetail(station: station, bearer: effectiveBearer)
            loading = false
        }
    }

    // MARK: - Header

    private var headerRow: some View {
        HStack(spacing: 12) {
            BackCircleButton { dismiss() }
            Text(station)
                .scaledFont(23, weight: .heavy, relativeTo: .title2, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
        }
        .padding(.top, Theme.Spacing.s)
    }

    // MARK: - Loaded content

    @ViewBuilder
    private func loadedContent(_ d: StationDetail) -> some View {
        lastVsBenchmark(d)
        if !d.trend.isEmpty {
            trendSection(d.trend)
        }
        if !d.sub_metrics.isEmpty {
            subMetrics(d.sub_metrics)
        }
        if !d.training.isEmpty {
            TrainingLinksList(title: "ENTRENOS QUE LA TRABAJAN", links: d.training)
        }
        if let reco = d.ia_recommendation {
            IARecommendationCard(text: reco, objective: d.ia_objective)
        }
    }

    // Tu última vs benchmark + delta + percentile, in a left-accented card.
    private func lastVsBenchmark(_ d: StationDetail) -> some View {
        let severity = BenchmarkBarRow.Severity(wire: d.severity)
        return CardSurface(padding: 15, leftAccent: true) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        LabelText(text: "TU ÚLTIMA", size: 10)
                        Text(d.last_time ?? "—")
                            .font(Theme.Typography.readoutM)
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    Spacer(minLength: 12)
                    VStack(alignment: .trailing, spacing: 3) {
                        LabelText(text: "BENCHMARK", size: 10)
                        MonoText(text: d.benchmark_time ?? "—", size: 18, weight: .bold, color: Theme.Color.muted)
                    }
                }
                HStack(spacing: 10) {
                    MonoText(text: d.delta ?? "—", size: 13, weight: .bold, color: severityColor(severity))
                        .frame(width: 48, alignment: .leading)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.Color.surfaceElevated)
                            Capsule()
                                .fill(severityColor(severity))
                                .frame(width: geo.size.width * CGFloat(max(0, min(1, d.fraction))))
                        }
                    }
                    .frame(height: 6)
                    if let pct = d.percentile_label {
                        Text(pct)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(benchmarkA11y(d))
        }
    }

    private func benchmarkA11y(_ d: StationDetail) -> String {
        var s = "\(station). Tu última \(d.last_time ?? "sin dato"), benchmark \(d.benchmark_time ?? "sin dato")"
        if let delta = d.delta { s += ", diferencia \(delta)" }
        if let pct = d.percentile_label { s += ", \(pct)" }
        return s
    }

    // Between-races trend — descending bars, latest colored by severity.
    private func trendSection(_ points: [StationTrendPoint]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionLabel(text: "TENDENCIA · ÚLTIMAS CARRERAS")
            CardSurface(padding: 14) {
                HStack(alignment: .bottom, spacing: 14) {
                    ForEach(points) { p in
                        let latest = p.id == points.last?.id
                        VStack(spacing: 5) {
                            RoundedRectangle(cornerRadius: 5, style: .continuous)
                                .fill(latest ? severityColor(BenchmarkBarRow.Severity(wire: p.severity)) : Theme.Color.surfaceElevated)
                                .frame(maxWidth: .infinity)
                                .frame(height: max(8, 60 * CGFloat(max(0, min(1, p.height)))))
                            MonoText(
                                text: p.time ?? p.label,
                                size: 9,
                                weight: .medium,
                                color: latest ? Theme.Color.accentText : Theme.Color.faint
                            )
                        }
                    }
                }
                .frame(height: 84, alignment: .bottom)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Tendencia entre carreras: " + points.map { $0.time ?? $0.label }.joined(separator: ", "))
            }
        }
    }

    // Sub-metrics grid (best / avg / sled weight / stops).
    private func subMetrics(_ metrics: [StationSubMetric]) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            ForEach(metrics) { m in
                ExpertCell(
                    label: m.label,
                    value: m.value ?? "—",
                    unit: m.unit ?? "",
                    color: emphasisColor(m.emphasis)
                )
            }
        }
    }

    // MARK: - Color helpers

    private func severityColor(_ s: BenchmarkBarRow.Severity) -> Color {
        switch s {
        case .better:        return Theme.Color.ok
        case .slightlyWorse: return Theme.Color.warning
        case .worse:         return Theme.Color.danger
        }
    }

    private func emphasisColor(_ raw: String?) -> Color {
        switch (raw ?? "").lowercased() {
        case "ok":      return Theme.Color.ok
        case "warning": return Theme.Color.warning
        case "danger":  return Theme.Color.danger
        default:        return Theme.Color.foreground
        }
    }
}

// MARK: - Back circle button
//
// The handoff's circular "‹" back affordance, reused by the station + running
// deep-dives (the parent NavigationStack hides its bar, so the screen draws
// its own back control).
struct BackCircleButton: View {
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            action()
        } label: {
            Image(systemName: "chevron.left")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 34, height: 34)
                .background(Theme.Color.surfaceElevated)
                .clipShape(Circle())
                .overlay(Circle().stroke(Theme.Color.hairline, lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Atrás")
    }
}

// MARK: - Training links list
//
// "Entrenos que la trabajan / lo trabajan" — a labeled list of TrainingLink
// rows. A normal row shows a modality dot, title, group and ×count; the "next"
// row is the orange-tint highlight ("→ próximo · viernes").
struct TrainingLinksList: View {
    let title: String
    let links: [TrainingLink]

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionLabel(text: title)
            VStack(spacing: 8) {
                ForEach(links) { link in
                    row(link)
                }
            }
        }
    }

    @ViewBuilder
    private func row(_ link: TrainingLink) -> some View {
        if let next = link.next_label {
            HStack(spacing: 10) {
                Text("→ \(next)")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                Text(link.title)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 11)
            .background(Theme.Color.accent.opacity(0.08))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.accent.opacity(0.30), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Próximo, \(next), \(link.title)")
        } else {
            HStack(spacing: 11) {
                ModalityDot(modality: link.modality, size: 7)
                VStack(alignment: .leading, spacing: 2) {
                    Text(link.title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                    if let group = link.group {
                        Text(group)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.faint)
                    }
                }
                Spacer(minLength: 8)
                if let count = link.count {
                    MonoText(text: count, size: 12, weight: .medium, color: Theme.Color.muted)
                }
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 11)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel([link.title, link.group, link.count].compactMap { $0 }.joined(separator: ", "))
        }
    }
}

// MARK: - IA recommendation card
//
// Left-accent (orange) card with a tracked accent eyebrow, the recommendation
// prose, and an optional bold objective ("Objetivo: sub 2:20").
struct IARecommendationCard: View {
    let text: String
    var objective: String? = nil

    var body: some View {
        CardSurface(padding: 13, leftAccent: true) {
            VStack(alignment: .leading, spacing: 7) {
                LabelText(text: "RECOMENDACIÓN IA", color: Theme.Color.accentText)
                Text(text)
                    .scaledFont(12, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                if let objective {
                    HStack(spacing: 5) {
                        Text("Objetivo:")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.Color.muted)
                        Text(objective)
                            .font(.system(size: 12, weight: .heavy))
                            .foregroundStyle(Theme.Color.foreground)
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}
