import SwiftUI

// Carreras tab root — the performance/race hub and HYROX differentiator. It
// absorbs the old Analíticas/Stats content.
//
// Two truth states live side by side, honestly:
//   • RACE-DERIVED (last race, station benchmarks, per-km pace, evolution,
//     history) — LIVE from GET /api/athlete/race-context, built from the
//     athlete's IMPORTED HYROX results. No race yet → honest empty state with an
//     "Importar carrera" CTA (ImportRaceSheet → POST /race-results/import).
//   • REAL TRAINING ANALYTICS — the "Rendimiento" section surfaces live volume,
//     pace and recent executions from StatsService (GET /api/athlete/analytics).
//
// Composes RedesignComponents (BenchmarkBarRow, PaceBarChart) + Atoms
// (CardSurface, InstrumentReadout, MonoText, LabelText) on Theme tokens. Brand
// accent is orange; only signed deltas use the semantic ok/warning/danger axis.
struct CarrerasView: View {
    var bearer: String? = nil

    @State private var overview: CarrerasOverview? = nil
    @State private var loadingRace = true

    // Live training analytics (StatsService) — the real, shippable section.
    @State private var analytics: AthleteAnalytics? = nil
    @State private var loadingPerf = true
    @State private var perfFailed = false

    // HYROX import sheet (search by name → import-all → refresh).
    @State private var showImport = false

    // Undo import ("No soy yo"): confirm gate → purge server-side + locally →
    // re-open the search so the athlete can pick the correct profile.
    @State private var showRemoveConfirm = false
    @State private var removing = false
    @State private var removeError: String? = nil

    // Rich, doubles-aware history from the full-history import. Seeded from the
    // local cache on load and refreshed when an import returns; preferred over
    // the leaner race-context history whenever present.
    @State private var importedRaces: [ImportedRace] = []

    @State private var appear = false

    private var effectiveBearer: String? {
        bearer ?? UserDefaults.standard.string(forKey: "fahybrik.bearer")
    }

    var body: some View {
        // Own NavigationStack so the station + running deep-dives push within the
        // Carreras tab (AppShell hosts each tab root flat, no shared stack). Bar
        // hidden — the screen draws its own header, matching the other roots.
        NavigationStack {
            ZStack {
                Theme.Color.background
                    .ignoresSafeArea()
                    .instrumentCanvas()
                scroll
            }
            .navigationBarHidden(true)
        }
        .task(id: effectiveBearer) { await load() }
        .sheet(isPresented: $showImport) {
            ImportRaceSheet(bearer: effectiveBearer) { result in
                // Full-history import returns the rich, doubles-aware races — seed
                // the history immediately + persist. The legacy single-link path
                // passes nil, so we just re-fetch the race-context overview.
                if let result {
                    importedRaces = result.races
                    CarrerasHistoryStore.save(result.races)
                }
                Task { await load() }
            }
        }
        .confirmationDialog(
            "¿Eliminar las carreras importadas?",
            isPresented: $showRemoveConfirm,
            titleVisibility: .visible
        ) {
            Button("Eliminar carreras importadas", role: .destructive) {
                Task { await removeImport() }
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Esto borrará las carreras importadas y podrás volver a buscar tu perfil.")
        }
        .alert(
            "No se pudo eliminar",
            isPresented: Binding(
                get: { removeError != nil },
                set: { if !$0 { removeError = nil } }
            )
        ) {
            Button("Aceptar", role: .cancel) { removeError = nil }
        } message: {
            Text(removeError ?? "")
        }
    }

    // Purge the imported history ("No soy yo"): clear it server-side + locally,
    // refresh the (now empty) hub, then re-open the search so the athlete can
    // pick the correct profile. The slug is null after the purge, so a fresh
    // import adopts the new profile cleanly.
    @MainActor
    private func removeImport() async {
        guard !removing else { return }
        removing = true
        defer { removing = false }
        do {
            _ = try await CarrerasService.undoImport(bearer: effectiveBearer)
            Haptics.success()
            importedRaces = []
            CarrerasHistoryStore.clear()
            await load()
            // Back to the search step with a clean slate (slug now null).
            showImport = true
        } catch let err as HyresultImportError {
            Haptics.error()
            removeError = err.message
        } catch {
            Haptics.error()
            removeError = "No pudimos eliminar las carreras importadas. Inténtalo de nuevo."
        }
    }

    private var scroll: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                header
                    .staggerReveal(appear, index: 0)

                raceSection
                    .staggerReveal(appear, index: 1)

                performanceSection
                    .staggerReveal(appear, index: 2)
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.xxl)
        }
        .onAppear { appear = true }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                LabelText(text: "RENDIMIENTO Y CARRERAS", color: Theme.Color.accentText)
                Text("Mis carreras")
                    .scaledFont(30, weight: .heavy, relativeTo: .title, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            // Always-available import affordance (the empty state has its own
            // primary CTA; this lets an athlete add another race at any time).
            importPill
        }
        .padding(.top, Theme.Spacing.s)
    }

    private var importPill: some View {
        Button {
            Haptics.light()
            showImport = true
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "plus")
                    .font(.system(size: 11, weight: .bold))
                Text("Importar")
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(Theme.Color.accentText)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Theme.Color.accent.opacity(0.10))
            .overlay(Capsule().stroke(Theme.Color.accent.opacity(0.30), lineWidth: 1))
            .clipShape(Capsule())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Importar carrera")
    }

    // MARK: - Race section (live race-context → honest empty state when no race)

    @ViewBuilder
    private var raceSection: some View {
        if loadingRace {
            ProgressView()
                .tint(Theme.Color.accentText)
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.xl)
        } else if (overview?.last_race != nil) || !importedRaces.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                // Race-context analytics (last race, IA report, benchmarks, pace,
                // evolution) — present whenever the athlete has a singles result.
                if let overview, overview.last_race != nil {
                    CarrerasRaceContent(overview: overview, bearer: effectiveBearer)
                }
                // History list: the rich, doubles-aware import when we have it;
                // otherwise the leaner race-context history (legacy single-link).
                if !importedRaces.isEmpty {
                    ImportedRaceHistorySection(races: importedRaces) {
                        showRemoveConfirm = true
                    }
                } else if let overview, !overview.history.isEmpty {
                    LegacyHistorySection(history: overview.history)
                }
            }
        } else {
            VStack(spacing: Theme.Spacing.l) {
                RedesignEmptyState(
                    symbol: "flag.checkered",
                    title: "Aún no hay carreras",
                    message: "Busca tu nombre e importa tu historial de HYROX —individuales y dobles— y verás aquí tus splits, el informe de puntos débiles y tu evolución."
                )
                ExpertPrimaryButton(title: "IMPORTAR CARRERAS") {
                    showImport = true
                }
            }
            .padding(.top, Theme.Spacing.m)
        }
    }

    // MARK: - Performance section (LIVE StatsService data)

    @ViewBuilder
    private var performanceSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionLabel(text: "RENDIMIENTO · TU ENTRENAMIENTO")

            if loadingPerf {
                ProgressView()
                    .tint(Theme.Color.accentText)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Theme.Spacing.l)
            } else if let analytics, !analytics.isEmpty {
                CarrerasPerformanceContent(analytics: analytics, bearer: effectiveBearer)
            } else if perfFailed {
                RedesignEmptyState(
                    symbol: "exclamationmark.triangle",
                    title: "No pudimos cargar tu rendimiento",
                    message: "Revisa tu conexión e inténtalo de nuevo más tarde."
                )
            } else {
                RedesignEmptyState(
                    symbol: "chart.bar.xaxis",
                    title: "Aún no hay datos de entrenamiento",
                    message: "Registra entrenamientos de carrera, remo o ergómetro y aquí verás tu volumen, tus ritmos y la progresión sesión a sesión."
                )
            }
        }
    }

    // MARK: - Loading

    private func load() async {
        // Seed the doubles-aware history from the local cache so it paints
        // instantly; a fresh import (which sets importedRaces first) is kept.
        if importedRaces.isEmpty { importedRaces = CarrerasHistoryStore.load() }
        loadingRace = true
        loadingPerf = true
        perfFailed = false

        async let raceTask = CarrerasService.fetchOverview(bearer: effectiveBearer)

        // Live analytics: only the performance section depends on it.
        if let token = effectiveBearer {
            do {
                analytics = try await StatsService.fetchAnalytics(bearer: token)
                perfFailed = false
            } catch {
                analytics = nil
                perfFailed = true
            }
        } else {
            analytics = nil
            perfFailed = true
        }
        loadingPerf = false

        overview = await raceTask
        loadingRace = false
    }
}

// MARK: - Race content
//
// The full race hub once a result exists: last-race card → IA report (orange
// tint) → station benchmarks → per-km pace → evolution → history. Split into
// its own view so the gap-vs-live branching in CarrerasView stays readable.

private struct CarrerasRaceContent: View {
    let overview: CarrerasOverview
    var bearer: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            if let race = overview.last_race {
                LastRaceCard(race: race)
            }
            if let report = overview.ia_report {
                IAReportCard(report: report)
            }
            if !overview.station_benchmarks.isEmpty {
                stationBenchmarks
            }
            if !overview.running_splits.isEmpty {
                paceChart
            }
            if let evolution = evolutionPoints, evolution.count >= 2 {
                evolutionChart(evolution)
            }
        }
    }

    // Estaciones vs benchmark — a labeled list of BenchmarkBarRow.
    private var stationBenchmarks: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionLabel(text: "ESTACIONES VS. BENCHMARK")
            CardSurface(padding: 14) {
                VStack(spacing: 12) {
                    ForEach(overview.station_benchmarks) { b in
                        NavigationLink {
                            StationDetailView(station: b.station, bearer: bearer)
                        } label: {
                            HStack(spacing: 10) {
                                BenchmarkBarRow(
                                    label: b.station,
                                    fraction: b.fraction,
                                    delta: b.delta ?? "—",
                                    severity: BenchmarkBarRow.Severity(wire: b.severity)
                                )
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundStyle(Theme.Color.faint)
                                    .accessibilityHidden(true)
                            }
                        }
                        .buttonStyle(PressScaleStyle())
                    }
                }
            }
        }
    }

    // Ritmo por km — PaceBarChart + the final-pace-drop callout.
    private var paceChart: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionLabel(text: "RITMO POR KM · ¿AGUANTAS EL FINAL?")
            CardSurface(padding: 14) {
                VStack(alignment: .leading, spacing: 10) {
                    PaceBarChart(bars: overview.running_splits.map {
                        PaceBarChart.Bar(
                            height: $0.height,
                            severity: BenchmarkBarRow.Severity(wire: $0.severity),
                            label: $0.label
                        )
                    })
                    if let note = overview.pace_drop_note {
                        Label(note, systemImage: "exclamationmark.triangle.fill")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Theme.Color.warning)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    // Evolución — descending total-time bars, derived from history + last race.
    private func evolutionChart(_ points: [EvolutionPoint]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionLabel(text: "EVOLUCIÓN · TIEMPO TOTAL")
            CardSurface(padding: 14) {
                HStack(alignment: .bottom, spacing: 14) {
                    ForEach(points) { p in
                        VStack(spacing: 6) {
                            RoundedRectangle(cornerRadius: 5, style: .continuous)
                                .fill(p.isLatest ? Theme.Color.accent : Theme.Color.surfaceElevated)
                                .frame(maxWidth: .infinity)
                                .frame(height: max(8, 56 * CGFloat(p.fraction)))
                            MonoText(
                                text: p.label,
                                size: 10,
                                weight: .medium,
                                color: p.isLatest ? Theme.Color.accentText : Theme.Color.faint
                            )
                        }
                    }
                }
                .frame(height: 80, alignment: .bottom)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Evolución del tiempo total: " + points.map { "\($0.label)" }.joined(separator: ", "))
            }
        }
    }

    // MARK: - Evolution derivation
    //
    // The chart wants the last few races oldest→newest with bar heights relative
    // to the SLOWEST time in the set (taller = slower), matching the handoff's
    // descending bars. We use `total_seconds` when present; if any race in the
    // window lacks it we suppress the chart rather than guess heights.

    private struct EvolutionPoint: Identifiable {
        let id = UUID()
        let label: String
        let fraction: Double
        let isLatest: Bool
    }

    private var evolutionPoints: [EvolutionPoint]? {
        guard let latest = overview.last_race else { return nil }
        // Oldest → newest: history is most-recent-first, so reverse it then
        // append the latest race as the final (current) bar.
        var ordered = Array(overview.history.reversed())
        ordered.append(latest)
        let window = Array(ordered.suffix(4))
        let seconds = window.map { $0.total_seconds }
        guard !seconds.contains(nil) else { return nil }
        let values = seconds.compactMap { $0 }.map(Double.init)
        guard let maxV = values.max(), maxV > 0 else { return nil }
        return window.enumerated().map { idx, race in
            let secs = Double(race.total_seconds ?? 0)
            return EvolutionPoint(
                label: race.total_time ?? "—",
                fraction: secs / maxV,
                isLatest: idx == window.count - 1
            )
        }
    }
}

// MARK: - Legacy history (race-context projection)
//
// The leaner history list from `GET /race-context` — used only when the athlete
// has NO full-history import yet (e.g. they imported a single race via the link
// path). Once they import their full history, ImportedRaceHistorySection (rich,
// doubles-aware) supersedes this.

private struct LegacyHistorySection: View {
    let history: [RaceResultSummary]

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionLabel(text: "HISTORIAL")
            VStack(spacing: 8) {
                ForEach(history) { r in
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.event_name)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Theme.Color.foreground)
                            Text(meta(r))
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.Color.faint)
                        }
                        Spacer(minLength: 8)
                        MonoText(text: r.total_time ?? "—", size: 13, weight: .bold)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(Theme.Color.surface)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                            .stroke(Theme.Color.hairline, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(r.event_name), \(meta(r)), \(r.total_time ?? "sin tiempo")")
                }
            }
        }
    }

    private func meta(_ r: RaceResultSummary) -> String {
        [r.date, r.division].compactMap { $0 }.joined(separator: " · ")
    }
}

// MARK: - Last race card
//
// "Última · 02 nov · Pro" eyebrow, event + mono total time, Run/Estaciones/
// RoxZone split tiles, and the standing band. Brand-neutral surface; the
// standing band reads ok-green when present (a positive result).

private struct LastRaceCard: View {
    let race: RaceResultSummary

    private var eyebrow: String {
        ["Última", race.date, race.division].compactMap { $0 }.joined(separator: " · ")
    }

    var body: some View {
        CardSurface(padding: 16, topAccent: true, elevated: true) {
            VStack(alignment: .leading, spacing: 10) {
                LabelText(text: eyebrow)
                HStack(alignment: .firstTextBaseline) {
                    Text(race.event_name)
                        .scaledFont(19, weight: .heavy, relativeTo: .headline, italic: true)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 12)
                    Text(race.total_time ?? "—")
                        .font(Theme.Typography.readoutM)
                        .foregroundStyle(Theme.Color.foreground)
                }
                HStack(spacing: Theme.Spacing.l) {
                    splitTile(label: "Run", value: race.run_time)
                    splitTile(label: "Estac.", value: race.stations_time)
                    splitTile(label: "RoxZone", value: race.roxzone_time, accent: true)
                }
                if let standing = race.standing_label {
                    standingBand(standing)
                }
            }
            .accessibilityElement(children: .contain)
        }
    }

    private func splitTile(label: String, value: String?, accent: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            LabelText(text: label, size: 10)
            MonoText(
                text: value ?? "—",
                size: 14,
                weight: .bold,
                color: accent ? Theme.Color.warning : Theme.Color.foreground
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(value ?? "sin dato")")
    }

    private func standingBand(_ text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "arrowtriangle.up.fill")
                .font(.system(size: 9, weight: .bold))
            Text(text)
                .font(.system(size: 11, weight: .medium))
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(Theme.Color.ok)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - IA report card
//
// Orange-TINT card (our brand, NOT the handoff red): a tracked accent eyebrow,
// the "a priorizar" prose, and the recommended training-group chips.

private struct IAReportCard: View {
    let report: RaceIAReport

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            LabelText(text: "INFORME IA · A PRIORIZAR", color: Theme.Color.accentText)
            Text(report.summary)
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            if !report.recommended_groups.isEmpty {
                FlowChips(items: report.recommended_groups)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.accent.opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                .stroke(Theme.Color.accent.opacity(0.30), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Performance content (LIVE StatsService)
//
// The real, shippable analytics surfaced inside Carreras: volume per modality,
// avg pace, and recent executions. We compose the existing Stats sections so
// there is ONE source of truth for the analytics layout (StatsView retains the
// same components); only the screen chrome differs.

private struct CarrerasPerformanceContent: View {
    let analytics: AthleteAnalytics
    var bearer: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            totalDistanceReadout

            // Running deep-dive entry — running is half a HYROX race, so it gets
            // its own screen. Honest about its own (race-derived) gaps inside.
            NavigationLink {
                RunningDeepDiveView(bearer: bearer)
            } label: {
                runningEntryRow
            }
            .buttonStyle(PressScaleStyle())

            if !analytics.byModalityTotals.isEmpty {
                StatsVolumeSection(totals: analytics.byModalityTotals)
            }
            if !analytics.weekly.isEmpty {
                StatsPaceSection(totals: analytics.byModalityTotals, weekly: analytics.weekly)
            }
            if !analytics.recentExecutions.isEmpty {
                StatsRecentSection(executions: analytics.recentExecutions)
            }
        }
    }

    private var totalDistanceReadout: some View {
        let totalMeters = analytics.byModalityTotals.reduce(0) { $0 + $1.distanceMeters }
        let parts = StatsFormat.distanceParts(totalMeters)
        return Group {
            if totalMeters > 0 {
                CardSurface(topAccent: true, elevated: true) {
                    InstrumentReadout(
                        label: "Distancia total",
                        value: parts.value,
                        unit: parts.unit,
                        accent: true,
                        size: 56
                    )
                }
            }
        }
    }

    private var runningEntryRow: some View {
        HStack(spacing: 12) {
            Image(systemName: "figure.run")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text("Running · análisis completo")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                Text("Ritmo umbral, splits por km y zonas")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.faint)
        }
        .padding(.horizontal, 15)
        .padding(.vertical, 13)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Running, análisis completo")
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Flow chips
//
// A wrapping row of pill chips for the IA report's recommended training groups.
// Uses iOS-16 native layout wrapping via a simple HStack-per-line fold.

private struct FlowChips: View {
    let items: [String]

    var body: some View {
        // Lightweight wrap: chunk into rows of up to two chips (chip copy like
        // "G09 · Circuitos f-r" is wide; two per line reads cleanly at 390pt).
        let rows = stride(from: 0, to: items.count, by: 2).map {
            Array(items[$0..<min($0 + 2, items.count)])
        }
        return VStack(alignment: .leading, spacing: 7) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 7) {
                    ForEach(row, id: \.self) { chip in
                        Text(chip)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Theme.Color.foreground)
                            .padding(.horizontal, 11)
                            .padding(.vertical, 5)
                            .background(Theme.Color.surfaceElevated)
                            .overlay(Capsule().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
                            .clipShape(Capsule())
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

// MARK: - Shared empty state

/// Honest empty-state scaffold used across the redesign's not-yet-populated
/// surfaces. A muted SF symbol, a title, and a sentence — never mock data.
struct RedesignEmptyState: View {
    let symbol: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 34, weight: .regular))
                .foregroundStyle(Theme.Color.faint)
            Text(title)
                .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text(message)
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Spacing.l)
        .accessibilityElement(children: .combine)
    }
}
