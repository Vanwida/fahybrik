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
    @State private var actionError: String? = nil

    // Rich, doubles-aware history from the full-history import. Seeded from the
    // local cache on load and refreshed when an import returns; preferred over
    // the leaner race-context history whenever present.
    @State private var importedRaces: [ImportedRace] = []

    // PRÓXIMAS — all future objectives (target + secondary/tune-up), source of
    // truth from GET /api/athlete/races. The athlete can have several; the server
    // sorts them soonest-first.
    @State private var upcoming: [UpcomingRace] = []
    @State private var loadingUpcoming = true
    @State private var showBuscar = false
    /// The objective the athlete tapped to remove — drives the confirm dialog.
    @State private var objectiveToRemove: UpcomingRace? = nil

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
        .sheet(isPresented: $showBuscar) {
            // Reuse the target-race picker (→ FijarObjetivoView); on a successful
            // set we reload so the new objective appears in PRÓXIMAS.
            BuscarCarreraSheet(bearer: effectiveBearer) {
                Task { await load() }
            }
        }
        .confirmationDialog(
            "¿Quitar este objetivo?",
            isPresented: Binding(
                get: { objectiveToRemove != nil },
                set: { if !$0 { objectiveToRemove = nil } }
            ),
            titleVisibility: .visible,
            presenting: objectiveToRemove
        ) { race in
            Button("Quitar objetivo", role: .destructive) {
                Task { await removeObjective(race) }
            }
            Button("Cancelar", role: .cancel) { objectiveToRemove = nil }
        } message: { race in
            Text("\(race.name) dejará de contar para tu cuenta atrás. Podrás volver a fijarla cuando quieras.")
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
            "No se pudo completar",
            isPresented: Binding(
                get: { actionError != nil },
                set: { if !$0 { actionError = nil } }
            )
        ) {
            Button("Aceptar", role: .cancel) { actionError = nil }
        } message: {
            Text(actionError ?? "")
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
            actionError = err.message
        } catch {
            Haptics.error()
            actionError = "No pudimos eliminar las carreras importadas. Inténtalo de nuevo."
        }
    }

    // Remove one future objective ("Quitar objetivo"): confirm-gated delete via
    // the races endpoint, then refresh both lists. The thrown HyresultImportError
    // messages are import-flavored, so we map to removal-appropriate copy here and
    // reuse the existing actionError alert.
    @MainActor
    private func removeObjective(_ race: UpcomingRace) async {
        objectiveToRemove = nil
        do {
            try await CarrerasService.deleteObjective(raceId: race.raceId, bearer: effectiveBearer)
            Haptics.success()
            await load()
        } catch let err as HyresultImportError {
            Haptics.error()
            switch err {
            case .unauthorized:
                actionError = "Tu sesión ha caducado. Vuelve a iniciar sesión e inténtalo de nuevo."
            default:
                actionError = "No pudimos quitar este objetivo. Inténtalo de nuevo."
            }
        } catch {
            Haptics.error()
            actionError = "No pudimos quitar este objetivo. Inténtalo de nuevo."
        }
    }

    // Promote one upcoming race to the PRIMARY objective ("Hacer objetivo
    // principal"): POST to the races endpoint (server demotes the prior target to
    // secondary — single primary at a time), then refresh so the badges update and
    // Inicio's main countdown follows the new primary. Reuses the actionError alert.
    @MainActor
    private func makePrimary(_ race: UpcomingRace) async {
        do {
            try await CarrerasService.makePrimaryObjective(raceId: race.raceId, bearer: effectiveBearer)
            Haptics.success()
            await load()
        } catch let err as HyresultImportError {
            Haptics.error()
            switch err {
            case .unauthorized:
                actionError = "Tu sesión ha caducado. Vuelve a iniciar sesión e inténtalo de nuevo."
            default:
                actionError = "No pudimos cambiar tu objetivo principal. Inténtalo de nuevo."
            }
        } catch {
            Haptics.error()
            actionError = "No pudimos cambiar tu objetivo principal. Inténtalo de nuevo."
        }
    }

    private var scroll: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                header
                    .staggerReveal(appear, index: 0)

                upcomingSection
                    .staggerReveal(appear, index: 1)

                pastSection
                    .staggerReveal(appear, index: 2)

                performanceSection
                    .staggerReveal(appear, index: 3)
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.xxl)
        }
        .onAppear { appear = true }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: "RENDIMIENTO Y CARRERAS", color: Theme.Color.accentText)
            Text("Mis carreras")
                .scaledFont(30, weight: .heavy, relativeTo: .title, italic: true)
                .foregroundStyle(Theme.Color.foreground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        .padding(.top, Theme.Spacing.s)
    }

    // MARK: - Section header action pills (accent capsule)
    //
    // One pill style, two intents — DRY across "Buscar carrera" (PRÓXIMAS, adds a
    // future objective) and "Importar" (PASADAS, adds a past result).

    private func actionPill(icon: String, title: String, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.light()
            action()
        } label: {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 11, weight: .bold))
                Text(title)
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
        .accessibilityLabel(title)
    }

    private var buscarPill: some View {
        actionPill(icon: "plus", title: "Buscar carrera") { showBuscar = true }
    }

    private var importPill: some View {
        actionPill(icon: "plus", title: "Importar") { showImport = true }
    }

    /// A section label with a trailing action pill, baseline-aligned on one row.
    private func sectionHeaderRow<Trailing: View>(
        _ title: String,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        HStack(alignment: .firstTextBaseline) {
            SectionLabel(text: title)
            Spacer(minLength: 8)
            trailing()
        }
    }

    // MARK: - PRÓXIMAS · the athlete's future objectives (countdowns)
    //
    // All upcoming races (target + secondary/tune-up), source of truth from
    // GET /api/athlete/races, sorted soonest-first by the server. Each card shows
    // its role and offers "Hacer objetivo principal" (non-primary) + a confirm-gated
    // remove. "Buscar carrera" (→ BuscarCarreraSheet → FijarObjetivoView) lives in
    // the section header.

    @ViewBuilder
    private var upcomingSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            sectionHeaderRow("PRÓXIMAS · TUS OBJETIVOS") { buscarPill }

            if loadingUpcoming {
                ProgressView()
                    .tint(Theme.Color.accentText)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Theme.Spacing.l)
            } else if !upcoming.isEmpty {
                VStack(spacing: Theme.Spacing.m) {
                    ForEach(upcoming) { race in
                        UpcomingRaceCard(
                            race: race,
                            onMakePrimary: { Task { await makePrimary(race) } },
                            onRemove: { objectiveToRemove = race }
                        )
                    }
                }
            } else {
                VStack(spacing: Theme.Spacing.l) {
                    RedesignEmptyState(
                        symbol: "target",
                        title: "Sin objetivos todavía",
                        message: "Fija tu próxima carrera y verás aquí la cuenta atrás. Tu plan se enfoca en la fecha que elijas."
                    )
                    ExpertPrimaryButton(title: "BUSCAR CARRERA") {
                        showBuscar = true
                    }
                }
                .padding(.top, Theme.Spacing.s)
            }
        }
    }

    // MARK: - PASADAS · history + race-derived analytics (honest empty state)
    //
    // The race-context analytics (last race, IA report, benchmarks, pace,
    // evolution) + the rich doubles-aware history, fed by the new endpoint's
    // `past` (write-through cached). "Importar" (past results) + the undo ("No soy
    // yo") live here.

    @ViewBuilder
    private var pastSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            sectionHeaderRow("PASADAS · TU HISTORIAL") { importPill }

            if loadingRace {
                ProgressView()
                    .tint(Theme.Color.accentText)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Theme.Spacing.l)
            } else if (overview?.last_race != nil) || !importedRaces.isEmpty {
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
            } else {
                VStack(spacing: Theme.Spacing.l) {
                    RedesignEmptyState(
                        symbol: "flag.checkered",
                        title: "Aún no hay carreras pasadas",
                        message: "Busca tu nombre e importa tu historial de HYROX —individuales y dobles— y verás aquí tus splits, el informe de puntos débiles y tu evolución."
                    )
                    ExpertPrimaryButton(title: "IMPORTAR CARRERAS") {
                        showImport = true
                    }
                }
                .padding(.top, Theme.Spacing.s)
            }
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
        loadingUpcoming = true
        perfFailed = false

        // The races hub (upcoming objectives + past results) is the source of
        // truth for both lists; the race-context overview still powers the PASADAS
        // analytics. Fetch both concurrently.
        async let racesTask = CarrerasService.fetchRaces(bearer: effectiveBearer)
        async let overviewTask = CarrerasService.fetchOverview(bearer: effectiveBearer)

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

        // Races hub → upcoming + past. Server is source of truth: on success we
        // overwrite both the upcoming list and the history (write-through cache).
        // On nil (offline / no bearer) we keep the cached history + empty upcoming.
        if let races = await racesTask {
            upcoming = races.upcoming
            importedRaces = races.past
            CarrerasHistoryStore.save(races.past)
        }
        loadingUpcoming = false

        overview = await overviewTask
        loadingRace = false
    }
}

// MARK: - Upcoming race card (countdown · role badge · promote / remove)
//
// A premium countdown for one future objective: a role badge ("Objetivo
// principal" for the target, "Secundaria"/"Tune-up" otherwise), the big mono days
// number (the InicioView countdown language), the race name, its category line,
// city + date, and an optional goal time. Two explicit controls: an accessory
// remove button in the eyebrow (the hub confirms before dropping) and, on
// non-primary cards, a full-width "Hacer objetivo principal" action that promotes
// the race to the single primary (server demotes the prior target). The primary
// card carries the orange top accent. Light+dark off Theme tokens; brand accent is
// orange-as-text. Label copy reuses AthleteNextRace's static helpers so the home
// countdown and this card never drift.

private struct UpcomingRaceCard: View {
    let race: UpcomingRace
    /// Promote this race to the PRIMARY objective (the hub owns the POST + refresh).
    /// Shown only on non-primary cards.
    let onMakePrimary: () -> Void
    /// Signals intent to remove this objective (the hub owns the confirm + delete).
    let onRemove: () -> Void

    /// The target race is the single primary objective. Absent priority defaults to
    /// 'target' (the create path's default), so a legacy row with no priority reads
    /// as primary rather than orphaned.
    private var isPrimary: Bool { (race.priority?.lowercased() ?? "target") == "target" }

    var body: some View {
        // A container (not a button): the card holds two explicit controls — an
        // accessory remove button in the eyebrow and, for non-primary races, a
        // "Hacer objetivo principal" action. The primary card carries the orange
        // top accent so the goal race reads as the anchor at a glance.
        CardSurface(padding: 16, topAccent: isPrimary, elevated: true) {
            VStack(alignment: .leading, spacing: 11) {
                eyebrowRow
                infoBlock
                if !isPrimary {
                    makePrimaryButton
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    // MARK: Rows

    private var eyebrowRow: some View {
        HStack(spacing: 8) {
            priorityBadge
            Spacer(minLength: 8)
            Button {
                Haptics.light()
                onRemove()
            } label: {
                Image(systemName: "xmark.circle")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Quitar objetivo")
            .accessibilityHint("\(race.name) dejará de contar para tu cuenta atrás")
        }
    }

    /// The role badge: accent "Objetivo principal" for the target, a neutral
    /// "Secundaria" / "Tune-up" for the rest.
    @ViewBuilder
    private var priorityBadge: some View {
        if isPrimary {
            HStack(spacing: 5) {
                Image(systemName: "target")
                    .font(.system(size: 10, weight: .bold))
                Text("Objetivo principal")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.4)
                    .textCase(.uppercase)
            }
            .foregroundStyle(Theme.Color.accentText)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Theme.Color.accent.opacity(0.12))
            .clipShape(Capsule())
        } else {
            Text(secondaryBadgeLabel)
                .font(.system(size: 10, weight: .bold))
                .tracking(0.4)
                .textCase(.uppercase)
                .foregroundStyle(Theme.Color.neutral)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Theme.Color.neutralTint)
                .clipShape(Capsule())
        }
    }

    /// The textual body of the card (countdown + name + category + city/date +
    /// goal), combined into one a11y element so VoiceOver reads it as a unit and
    /// the two action buttons stay separately focusable.
    private var infoBlock: some View {
        VStack(alignment: .leading, spacing: 11) {
            countdownRow
            Text(race.name)
                .scaledFont(18, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            if let category = categoryLine {
                Text(category)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.Color.faint)
            }
            if let meta = locationDateLine {
                Text(meta)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.Color.muted)
            }
            if let goal = goalText {
                HStack(spacing: 5) {
                    Image(systemName: "stopwatch")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Theme.Color.accentText)
                    Text("Objetivo \(goal)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(infoAccessibilityLabel)
    }

    /// Full-width accent capsule action to promote a secondary/tune-up race to the
    /// primary objective. Hidden on the primary card (nothing to promote).
    private var makePrimaryButton: some View {
        Button {
            Haptics.light()
            onMakePrimary()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "star")
                    .font(.system(size: 11, weight: .bold))
                Text("Hacer objetivo principal")
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(Theme.Color.accentText)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .background(Theme.Color.accent.opacity(0.10))
            .overlay(Capsule().stroke(Theme.Color.accent.opacity(0.30), lineWidth: 1))
            .clipShape(Capsule())
        }
        .buttonStyle(PressScaleStyle())
        .padding(.top, 2)
        .accessibilityLabel("Hacer objetivo principal")
        .accessibilityHint("Fija \(race.name) como tu carrera principal; la cuenta atrás de Inicio la reflejará")
    }

    @ViewBuilder
    private var countdownRow: some View {
        if let days = race.daysUntil {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(max(0, days))")
                    .font(.system(size: 30, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.accentText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(days == 1 ? "día" : "días")
                    .scaledFont(13, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }

    // MARK: Derived copy (reuses AthleteNextRace helpers + the shared date fmt)

    private var categoryLine: String? {
        let parts = [
            AthleteNextRace.formatLabel(race.format),
            AthleteNextRace.divisionLabel(race.division),
            AthleteNextRace.genderLabel(race.genderCategory),
        ].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var locationDateLine: String? {
        let date = race.raceDate
            .flatMap { StatsDateParser.parse($0) }
            .map { ImportedRaceDateFormat.medium.string(from: $0) }
        let parts = [race.location, date].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var goalText: String? { AthleteNextRace.goalTimeFormatted(race.goalTimeSeconds) }

    /// Neutral badge for a non-primary race. tune_up reads "Tune-up"; everything
    /// else (secondary, or an unexpected token) reads "Secundaria".
    private var secondaryBadgeLabel: String {
        switch race.priority?.lowercased() {
        case "tune_up": return "Tune-up"
        default:        return "Secundaria"
        }
    }

    private var infoAccessibilityLabel: String {
        var parts: [String] = [isPrimary ? "Objetivo principal" : secondaryBadgeLabel, race.name]
        if let days = race.daysUntil {
            let d = max(0, days)
            parts.append("faltan \(d) \(d == 1 ? "día" : "días")")
        }
        if let category = categoryLine { parts.append(category) }
        if let meta = locationDateLine { parts.append(meta) }
        if let goal = goalText { parts.append("objetivo \(goal)") }
        return parts.joined(separator: ", ")
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
