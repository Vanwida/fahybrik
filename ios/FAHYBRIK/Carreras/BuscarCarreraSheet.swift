import SwiftUI

// "Buscar carrera" — the target-race picker. The athlete browses the official
// race calendar (GET /api/races/calendar), narrows it with a debounced search +
// SERIE / PAÍS / FECHA chips, picks an event, and fixes it as their TARGET race
// (→ FijarObjetivoView). The chosen target drives the home countdown.
//
// Search + date window hit the server (the heavy dimensions); SERIE + PAÍS are
// client-side facets DERIVED from the loaded events (never a hardcoded list), so
// the chips always reflect what's really there. Events are grouped by month.
//
// Presented as a .sheet with its own NavigationStack (mirrors how CarrerasView
// presents ImportRaceSheet). On a successful set, `onTargetSet` fires and the
// whole sheet dismisses so the caller can reload. Light+dark off Theme tokens.
struct BuscarCarreraSheet: View {
    @Environment(\.dismiss) private var dismiss

    var bearer: String?
    /// FREE tier switch (athlete without coach). False hides the manual
    /// fallback ("¿No encuentras tu carrera? Pídesela a tu coach") and its
    /// request flow — there is no coach curating the calendar for a free
    /// athlete, so the app must not promise one.
    var hasCoach: Bool = true
    /// Called after the athlete fixes a target so the caller reloads (countdown).
    let onTargetSet: () -> Void

    // Data
    @State private var events: [RaceCalendarEvent] = []
    @State private var currentTargetEventId: String? = nil

    // Query / filters
    @State private var query: String = ""
    @State private var selectedSeries: String? = nil   // raw series token, nil = all
    @State private var selectedCountry: String? = nil  // ISO-2 code, nil = all
    @State private var dateFilter: RaceDateFilter = .any

    // Load state
    @State private var loading = false
    @State private var loadFailed = false
    @State private var hasLoadedOnce = false
    @State private var startedLoad = false
    @State private var loadTask: Task<Void, Never>? = nil

    // Navigation
    @State private var selected: RaceCalendarEvent? = nil
    @State private var showRequestRace = false

    @FocusState private var fieldFocused: Bool

    private let debounceNanos: UInt64 = 350_000_000
    private let minQueryLength = 2
    private let undatedKey = "zzzz-undated"

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        intro
                        searchField
                        filters
                        content
                        if hasCoach {
                            manualFallback
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.l)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
            }
            .navigationTitle("Buscar carrera")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .tint(Theme.Color.accentText)
                }
            }
            .navigationDestination(item: $selected) { event in
                FijarObjetivoView(event: event, bearer: bearer) {
                    onTargetSet()
                    dismiss()
                }
            }
            .navigationDestination(isPresented: $showRequestRace) {
                // A future objective can't be a pasted PAST result link. When the
                // race isn't in the official calendar, the athlete asks their coach
                // to add it — the coach curates the calendar, then it's fixable.
                // COACHED-only: the fallback that raises this is hidden for free.
                if hasCoach {
                    SolicitarCarreraView(bearer: bearer) {
                        dismiss()
                    }
                }
            }
        }
        .onAppear {
            guard !startedLoad else { return }
            startedLoad = true
            scheduleReload(immediate: true)
        }
        .onDisappear { loadTask?.cancel() }
    }

    // MARK: - Sections

    private var intro: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Elige tu carrera objetivo")
                .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Text("Busca en el calendario oficial y fíjala como tu objetivo. Tu cuenta atrás y tu plan se enfocan en ella.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.faint)
            TextField("Ciudad o nombre de la carrera", text: $query)
                .font(.system(size: 15))
                .foregroundStyle(Theme.Color.foreground)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled(true)
                .submitLabel(.search)
                .focused($fieldFocused)
                .onChange(of: query) { _, _ in scheduleReload(immediate: false) }
            if loading {
                ProgressView()
                    .controlSize(.small)
                    .tint(Theme.Color.accentText)
            } else if !query.isEmpty {
                Button {
                    query = ""
                    scheduleReload(immediate: true)
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.Color.faint)
                }
                .accessibilityLabel("Borrar búsqueda")
            }
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 12)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }

    // MARK: Filters (data-derived chips)

    @ViewBuilder
    private var filters: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            if availableSeries.count > 1 {
                chipRow(label: "SERIE") {
                    PillChip(title: "Todas", selected: selectedSeries == nil) {
                        selectedSeries = nil
                    }
                    ForEach(availableSeries, id: \.self) { s in
                        PillChip(title: s.uppercased(), selected: selectedSeries == s) {
                            selectedSeries = (selectedSeries == s) ? nil : s
                        }
                    }
                }
            }
            if availableCountries.count > 1 {
                chipRow(label: "PAÍS") {
                    PillChip(title: "Todos", selected: selectedCountry == nil) {
                        selectedCountry = nil
                    }
                    ForEach(availableCountries, id: \.self) { c in
                        PillChip(title: countryChipLabel(c), selected: selectedCountry == c) {
                            selectedCountry = (selectedCountry == c) ? nil : c
                        }
                    }
                }
            }
            chipRow(label: "FECHA") {
                ForEach(RaceDateFilter.allCases) { f in
                    PillChip(title: f.label, selected: dateFilter == f) {
                        guard dateFilter != f else { return }
                        dateFilter = f
                        scheduleReload(immediate: true)
                    }
                }
            }
        }
    }

    private func chipRow<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: label, size: 10)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) { content() }
                    .padding(.horizontal, 1)
            }
        }
    }

    // MARK: Content (loading / error / empty / list)

    @ViewBuilder
    private var content: some View {
        if loading && !hasLoadedOnce {
            ProgressView()
                .controlSize(.large)
                .tint(Theme.Color.accentText)
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.xxl)
        } else if loadFailed {
            errorState
        } else if sections.isEmpty {
            RedesignEmptyState(
                symbol: "flag.checkered",
                title: "Sin carreras",
                message: "No encontramos carreras con estos filtros. Prueba con otra búsqueda o amplía el rango de fechas.",
                // Two real ways out. Coached: ask the coach to add the race (they
                // curate the calendar). Free: no coach to ask — so the honest exit
                // is the filters themselves, cleared in one tap.
                exit: hasCoach
                    ? .action(title: "Pedir mi carrera al coach") {
                        fieldFocused = false
                        showRequestRace = true
                    }
                    : .action(title: "Quitar los filtros") { clearFilters() }
            )
            .padding(.top, Theme.Spacing.l)
        } else {
            calendarList
        }
    }

    /// Back to the widest possible view of the calendar — the way out of a
    /// no-results state that the athlete narrowed themselves into.
    private func clearFilters() {
        Haptics.light()
        query = ""
        selectedSeries = nil
        selectedCountry = nil
        dateFilter = .any
        scheduleReload(immediate: true)
    }

    private var errorState: some View {
        RedesignEmptyState(
            symbol: "wifi.exclamationmark",
            title: "No pudimos cargar el calendario",
            message: "Revisa tu conexión e inténtalo de nuevo.",
            exit: .action(title: "Reintentar") { scheduleReload(immediate: true) }
        )
        .padding(.top, Theme.Spacing.l)
    }

    private var calendarList: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            ForEach(sections, id: \.key) { section in
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    SectionLabel(text: sectionHeader(section.key))
                    VStack(spacing: 8) {
                        ForEach(section.events) { event in
                            RaceCalendarRow(
                                event: event,
                                isTarget: event.eventId == currentTargetEventId,
                                onTap: {
                                    fieldFocused = false
                                    selected = event
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    private var manualFallback: some View {
        Button {
            Haptics.light()
            showRequestRace = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "paperplane")
                    .font(.system(size: 13, weight: .semibold))
                Text("¿No encuentras tu carrera? Pídesela a tu coach")
                    .font(.system(size: 13, weight: .semibold))
                    .multilineTextAlignment(.center)
            }
            .foregroundStyle(Theme.Color.accentText)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, Theme.Spacing.s)
        }
        .buttonStyle(PressScaleStyle())
        .padding(.top, Theme.Spacing.s)
    }

    // MARK: - Derived

    /// Distinct series tokens present in the loaded events (sorted) — the SERIE
    /// facet, derived from real data.
    private var availableSeries: [String] {
        Array(Set(events.compactMap { $0.series }.filter { !$0.isEmpty })).sorted()
    }

    /// Distinct ISO-2 country codes present in the loaded events (sorted) — the
    /// PAÍS facet.
    private var availableCountries: [String] {
        Array(Set(events.compactMap { $0.country }.filter { !$0.isEmpty })).sorted()
    }

    /// Events after applying the client-side SERIE + PAÍS facets.
    private var visibleEvents: [RaceCalendarEvent] {
        events.filter { event in
            (selectedSeries == nil || event.series == selectedSeries)
                && (selectedCountry == nil || event.country == selectedCountry)
        }
    }

    /// Month sections, ascending. Undated events sink to a final bucket.
    private var sections: [(key: String, events: [RaceCalendarEvent])] {
        let grouped = Dictionary(grouping: visibleEvents) { $0.monthKey ?? undatedKey }
        return grouped
            .map { (key: $0.key, events: $0.value.sorted { ($0.startDate ?? "") < ($1.startDate ?? "") }) }
            .sorted { $0.key < $1.key }
    }

    private func sectionHeader(_ key: String) -> String {
        key == undatedKey ? "FECHA POR CONFIRMAR" : RaceDate.monthHeader(forKey: key)
    }

    private func countryChipLabel(_ code: String) -> String {
        if let flag = raceCountryFlag(code) { return "\(flag) \(code)" }
        return code
    }

    // MARK: - Load driving

    /// Cancel any in-flight load and start a fresh one. `immediate` skips the
    /// debounce (chip taps, retry, initial); search keystrokes debounce.
    private func scheduleReload(immediate: Bool) {
        loadTask?.cancel()
        loadTask = Task { @MainActor in
            loading = true
            if !immediate {
                try? await Task.sleep(nanoseconds: debounceNanos)
                if Task.isCancelled { return }
            }
            await performLoad()
        }
    }

    @MainActor
    private func performLoad() async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let q = trimmed.count >= minQueryLength ? trimmed : nil
        var from: String? = nil
        var to: String? = nil
        if let months = dateFilter.monthsAhead {
            from = RaceDate.todayISO()
            to = RaceDate.isoMonthsAhead(months)
        }

        let resp = await RaceCalendarService.fetchCalendar(bearer: bearer, q: q, from: from, to: to)
        if Task.isCancelled { return }

        loading = false
        hasLoadedOnce = true
        guard let resp else {
            loadFailed = true
            return
        }
        loadFailed = false
        events = resp.events
        currentTargetEventId = resp.currentTargetEventId
        // Drop facet selections that no longer exist in the new result set so a
        // chip can never get stuck with nothing to deselect it.
        if let s = selectedSeries, !availableSeries.contains(s) { selectedSeries = nil }
        if let c = selectedCountry, !availableCountries.contains(c) { selectedCountry = nil }
    }
}

// MARK: - Calendar row

/// One event row: series badge + name + city · date, with a "Tu objetivo" badge
/// when it's the athlete's current target (else a chevron). Tapping pushes the
/// "Fijar objetivo" detail.
private struct RaceCalendarRow: View {
    let event: RaceCalendarEvent
    let isTarget: Bool
    let onTap: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            onTap()
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    if let series = event.seriesLabel {
                        SeriesPill(text: series)
                    }
                    Text(event.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                    Text(event.cityDateLine)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Color.faint)
                }
                Spacer(minLength: 8)
                if isTarget {
                    TargetBadge()
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.faint)
                        .padding(.top, 2)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(isTarget ? Theme.Color.accent.opacity(0.35) : Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(.isButton)
    }

    private var accessibilityLabel: String {
        var parts: [String] = []
        if let series = event.seriesLabel { parts.append(series) }
        parts.append(event.name)
        parts.append(event.cityDateLine)
        if isTarget { parts.append("tu carrera objetivo") }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Pills

/// Small series badge — brand orange-as-text on a faint accent fill.
private struct SeriesPill: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .bold))
            .tracking(0.4)
            .textCase(.uppercase)
            .foregroundStyle(Theme.Color.accentText)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(Theme.Color.accent.opacity(0.10))
            .clipShape(Capsule())
    }
}

/// "Tu objetivo" confirmation badge — green check, reads as "already set".
private struct TargetBadge: View {
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 10, weight: .bold))
            Text("Tu objetivo")
                .font(.system(size: 10, weight: .bold))
                .tracking(0.3)
        }
        .foregroundStyle(Theme.Color.ok)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Theme.Color.okTint)
        .clipShape(Capsule())
        .accessibilityHidden(true)
    }
}
