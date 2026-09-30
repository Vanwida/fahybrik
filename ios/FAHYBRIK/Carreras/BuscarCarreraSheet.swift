import SwiftUI

// "Buscar carrera" — the target-race picker. The athlete browses the official
// race calendar (GET /api/races/calendar), narrows it with a debounced search +
// FAMILIA / SERIE / PAÍS / FECHA chips, picks an event, and fixes it as their TARGET
// race (→ FijarObjetivoView). The chosen target drives the home countdown.
//
// Search, family and the date window hit the server (the heavy dimensions); SERIE + PAÍS are
// client-side facets DERIVED from the loaded events (never a hardcoded list), so the chips
// always reflect what's really there. Events are grouped by month. Espejo de `buscar.tsx`.
//
// Presented as a .sheet with its own NavigationStack: «Fijar objetivo» (and the custom-objective
// form) push inside it. On a successful set, `onTargetSet` fires and the whole sheet dismisses so
// the caller can reload.
struct BuscarCarreraSheet: View {
    @Environment(\.dismiss) private var dismiss

    var bearer: String?
    /// Called after the athlete fixes a target so the caller reloads (countdown).
    let onTargetSet: () -> Void

    // Data
    @State private var events: [RaceCalendarEvent] = []
    @State private var currentTargetEventId: String? = nil
    /// El nombre del objetivo principal de ahora, cuando sale entre los eventos cargados: es lo que dice
    /// «pasará a ser secundaria» al fijar otro.
    @State private var principalNombre: String? = nil

    // Query / filters
    @State private var query: String = ""
    @State private var selectedFamily: ObjectiveFamily? = nil
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
    @State private var showCustom = false

    @FocusState private var campoEnFoco: Bool

    private let debounceNanos: UInt64 = 350_000_000
    private let minQueryLength = 2
    private let undatedKey = "zzzz-undated"

    var body: some View {
        NavigationStack {
            MarcoDeHojaDia("Buscar carrera", cerrar: { dismiss() }) {
                VStack(alignment: .leading, spacing: 18) {
                    intro
                    campoBusqueda
                    filtros
                    contenido
                    BotonTextoDia("Crear objetivo personalizado", centrado: true, accion: { showCustom = true }) {
                        IconoDia(.mas, tam: 20, peso: .bold)
                    }
                }
            }
            .navigationBarHidden(true)
            .navigationDestination(item: $selected) { event in
                FijarObjetivoView(
                    event: event,
                    bearer: bearer,
                    pasaASecundaria: avisoDeSecundaria(al: event),
                    onTargetSet: {
                        onTargetSet()
                        dismiss()
                    },
                    cerrar: { dismiss() }
                )
            }
            .navigationDestination(isPresented: $showCustom) {
                CrearObjetivoCustomView(bearer: bearer) { event in
                    selected = event
                    showCustom = false
                }
            }
        }
        .presentationDetents([.large])
        .onAppear {
            guard !startedLoad else { return }
            startedLoad = true
            scheduleReload(immediate: true)
        }
        .onDisappear { loadTask?.cancel() }
    }

    // MARK: - Secciones

    private var intro: some View {
        VStack(alignment: .leading, spacing: 6) {
            SubtituloDia("Elige tu objetivo")
            Text("Running, híbrida, CrossFit u OCR: elige del calendario o créalo si no está.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var campoBusqueda: some View {
        CampoDia(
            "Buscar",
            enFoco: campoEnFoco,
            izquierda: { IconoDia(.lupa, tam: 20) },
            derecha: {
                if loading {
                    ProgressView()
                        .tint(Theme.Color.accentText)
                        .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                        .accessibilityLabel("Buscando")
                } else if !query.isEmpty {
                    Button {
                        Haptics.light()
                        query = ""
                        scheduleReload(immediate: true)
                    } label: {
                        IconoDia(.cerrar, tam: 18, peso: .bold)
                            .foregroundStyle(Theme.Color.muted)
                            .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Borrar búsqueda")
                }
            }
        ) {
            TextField("Ciudad o nombre de la carrera", text: $query)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled(true)
                .submitLabel(.search)
                .focused($campoEnFoco)
                .onChange(of: query) { _, _ in scheduleReload(immediate: false) }
                .accessibilityLabel("Ciudad o nombre de la carrera")
        }
    }

    // MARK: Filtros (chips derivados de los datos)

    private var filtros: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            FilaChipsDia("Familia") {
                ChipFiltroDia(texto: "Todas", elegido: selectedFamily == nil) {
                    selectedFamily = nil
                    scheduleReload(immediate: true)
                }
                ForEach(ObjectiveFamily.allCases) { fam in
                    ChipFiltroDia(texto: fam.label, elegido: selectedFamily == fam) {
                        selectedFamily = (selectedFamily == fam) ? nil : fam
                        scheduleReload(immediate: true)
                    }
                }
            }
            if availableSeries.count > 1 {
                FilaChipsDia("Serie") {
                    ChipFiltroDia(texto: "Todas", elegido: selectedSeries == nil) { selectedSeries = nil }
                    ForEach(availableSeries, id: \.self) { s in
                        ChipFiltroDia(texto: RaceCalendarEvent.seriesLabel(s), elegido: selectedSeries == s) {
                            selectedSeries = (selectedSeries == s) ? nil : s
                        }
                    }
                }
            }
            if availableCountries.count > 1 {
                FilaChipsDia("País") {
                    ChipFiltroDia(texto: "Todos", elegido: selectedCountry == nil) { selectedCountry = nil }
                    ForEach(availableCountries, id: \.self) { c in
                        ChipFiltroDia(texto: countryChipLabel(c), elegido: selectedCountry == c) {
                            selectedCountry = (selectedCountry == c) ? nil : c
                        }
                    }
                }
            }
            FilaChipsDia("Fecha") {
                ForEach(RaceDateFilter.allCases) { f in
                    ChipFiltroDia(texto: f.label, elegido: dateFilter == f) {
                        guard dateFilter != f else { return }
                        dateFilter = f
                        scheduleReload(immediate: true)
                    }
                }
            }
        }
    }

    // MARK: Contenido (cargando / error / vacío / lista)

    @ViewBuilder
    private var contenido: some View {
        if loading && !hasLoadedOnce {
            EsqueletoLista()
        } else if loadFailed {
            AvisoEnLineaDia("No pudimos cargar el calendario. Revisa tu conexión e inténtalo de nuevo.") {
                BotonTextoDia("Reintentar", tono: .tinta) { scheduleReload(immediate: true) }
            }
        } else if sections.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
                SubtituloDia("Sin carreras")
                Text("No encontramos carreras con estos filtros. Prueba con otra búsqueda o amplía el rango de fechas.")
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                BotonAccionDia("Quitar los filtros", relleno: .acento, accion: clearFilters)
            }
            .padding(EdgeInsets(top: 18, leading: 18, bottom: 16, trailing: 18))
            .frame(maxWidth: .infinity, alignment: .leading)
            .tarjetaDia()
        } else {
            calendarList
        }
    }

    /// Back to the widest possible view of the calendar — the way out of a
    /// no-results state that the athlete narrowed themselves into.
    private func clearFilters() {
        query = ""
        selectedSeries = nil
        selectedCountry = nil
        dateFilter = .any
        scheduleReload(immediate: true)
    }

    private var calendarList: some View {
        VStack(alignment: .leading, spacing: 18) {
            ForEach(sections, id: \.key) { section in
                VStack(alignment: .leading, spacing: 10) {
                    Text(sectionHeader(section.key))
                        .papel(.etiqueta)
                        .foregroundStyle(Theme.Color.muted)
                        .accessibilityAddTraits(.isHeader)
                    ForEach(section.events) { event in
                        FilaEvento(
                            evento: event,
                            esObjetivo: event.eventId == currentTargetEventId,
                            alElegir: {
                                campoEnFoco = false
                                selected = event
                            }
                        )
                    }
                }
            }
        }
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
        key == undatedKey ? "Fecha por confirmar" : RaceDate.monthHeader(forKey: key)
    }

    private func countryChipLabel(_ code: String) -> String {
        if let flag = raceCountryFlag(code) { return "\(flag) \(code)" }
        return code
    }

    /// Fijar otra carrera pasa la principal de ahora a secundaria (un solo principal, invariante del
    /// servidor). Se dice ANTES de fijar. Si el evento elegido ya es el objetivo, no pasa nada: no se avisa.
    private func avisoDeSecundaria(al event: RaceCalendarEvent) -> String? {
        guard let actual = currentTargetEventId, actual != event.eventId else { return nil }
        return principalNombre.map { "«\($0)» pasará a ser secundaria. Un solo objetivo principal a la vez." }
            ?? "Tu objetivo principal actual pasará a ser secundaria. Un solo objetivo principal a la vez."
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

        let resp = await RaceCalendarService.fetchCalendar(
            bearer: bearer,
            family: selectedFamily?.rawValue,
            q: q,
            from: from,
            to: to
        )
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
        if let id = resp.currentTargetEventId, let actual = resp.events.first(where: { $0.eventId == id }) {
            principalNombre = actual.name
        }
        // Drop facet selections that no longer exist in the new result set so a
        // chip can never get stuck with nothing to deselect it.
        if let s = selectedSeries, !availableSeries.contains(s) { selectedSeries = nil }
        if let c = selectedCountry, !availableCountries.contains(c) { selectedCountry = nil }
    }
}

#if DEBUG
// LOS ESTADOS DE LA HOJA, para la galería de `#Preview` y las capturas: arranca ya cargada (o cargando,
// o rota) sin pedir nada a la red.
extension BuscarCarreraSheet {
    enum VistaDePrueba { case lista, cargando, error, sinCarreras }

    init(vista: VistaDePrueba) {
        self.init(bearer: nil, onTargetSet: {})
        _startedLoad = State(initialValue: true)
        switch vista {
        case .lista:
            _events = State(initialValue: CasosCarreras.eventos)
            _hasLoadedOnce = State(initialValue: true)
            // El objetivo de ahora sale marcado y su nombre es lo que dice «pasará a ser secundaria».
            _currentTargetEventId = State(initialValue: "5")
            _principalNombre = State(initialValue: "HYROX Barcelona")
        case .cargando:
            _loading = State(initialValue: true)
        case .error:
            _hasLoadedOnce = State(initialValue: true)
            _loadFailed = State(initialValue: true)
        case .sinCarreras:
            _hasLoadedOnce = State(initialValue: true)
        }
    }
}
#endif

// MARK: - Una fila del calendario

/// One event row: series badge + name + city · date, with a "Tu objetivo" badge when it's the
/// athlete's current target (else a chevron). Tapping pushes the "Fijar objetivo" detail.
private struct FilaEvento: View {
    let evento: RaceCalendarEvent
    let esObjetivo: Bool
    let alElegir: () -> Void

    private var donde: String {
        let cuando: String
        if evento.tentative || evento.startDate == nil {
            cuando = "Fecha por confirmar"
        } else {
            cuando = evento.startDate.flatMap { FechaES.corta($0, hoy: RaceDate.todayISO(), conDia: true) } ?? evento.dateText
        }
        return [evento.location.flatMap { $0.isEmpty ? nil : $0 }, cuando].compactMap { $0 }.joined(separator: " · ")
    }

    var body: some View {
        Button {
            Haptics.light()
            alElegir()
        } label: {
            HStack(spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: 4) {
                    if let serie = evento.seriesLabel { InfoPill(text: serie, estilo: .acento) }
                    Text(evento.name).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(donde).papel(.nota).foregroundStyle(Theme.Color.muted)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if esObjetivo {
                    HStack(spacing: 6) {
                        IconoDia(.check, tam: 16, peso: .bold).foregroundStyle(Theme.Color.ok)
                        Text("Tu objetivo").papel(.rotulo).foregroundStyle(Theme.Color.foreground)
                    }
                    .padding(.horizontal, Theme.Spacing.m)
                    .frame(minHeight: 32)
                    .background(Theme.Color.okTint, in: Capsule())
                    .overlay(Capsule().strokeBorder(Theme.Color.ok.opacity(0.34), lineWidth: 1))
                    .accessibilityHidden(true)
                } else {
                    IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.muted)
                }
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
            .tarjetaDia(realce: esObjetivo)
            .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
        }
        .buttonStyle(PressScaleStyle(escala: 0.985))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([evento.seriesLabel, evento.name, donde, esObjetivo ? "tu carrera objetivo" : nil].compactMap { $0 }.joined(separator: ". "))
        .accessibilityAddTraits(.isButton)
    }
}

/// El esqueleto de la lista mientras carga por primera vez: la forma de las filas reales.
private struct EsqueletoLista: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SkeletonBar(width: 150, height: 15, radius: 5)
            ForEach(0..<4, id: \.self) { _ in
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    SkeletonBar(width: 64, height: 20, radius: 10)
                    SkeletonBar(height: 17, radius: 6).frame(maxWidth: 220)
                    SkeletonBar(height: 15, radius: 5).frame(maxWidth: 150)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, Theme.Spacing.m)
                .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
                .tarjetaDia()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando el calendario")
        .accessibilityAddTraits(.updatesFrequently)
    }
}
