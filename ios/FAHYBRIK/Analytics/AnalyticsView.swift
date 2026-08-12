import SwiftUI

// ANALÍTICAS tab — "todo tu entrenamiento, aquí dentro; y el único sitio que
// entiende tu HYROX". Five sections (Carrera first/biggest, then Ergo, Fuerza,
// HYROX, Recuperación), each faithful to docs/superpowers/plans/analiticas-tab.html.
//
// Two patterns run through every section:
//   • PERIOD SELECTOR — 7 días / Mes / Año / Custom, the `where` window applied to
//     every temporal aggregate AND its drill-down.
//   • DRILL-DOWN — every aggregate opens its REAL source sessions; a provenance
//     chip ("de N carreras") on each metric, tappable to the list.
//
// Honest states throughout: real / needs-more-logging / needs-wearable / field /
// gate — never a fabricated number. Cache-first via the shared AppDataStore (one
// in-memory + on-disk slice per section×period, SWR), so switching sections and
// periods you've already opened is instant.
//
// COMPOSICIÓN (contrato §6, aplicado el 30-jul). La pantalla estaba llena de
// forma y vacía de fondo: el selector de periodo mandaba arriba y las tarjetas
// eran N cajas grises diciendo cada una que no había nada, ninguna con salida.
//
//   · EL SUJETO ES EL VEREDICTO DE LA SECCIÓN, no el selector de periodo. Y el
//     veredicto NO se inventa: sale de la primera tarjeta que trae cifra
//     (`primary.value` + `unit`), su título la etiqueta, y el juicio es su
//     `meaning_es` — que ya lo escribe el servidor. El periodo baja a un control
//     pequeño, que es lo que es.
//   · SIN COBERTURA NO HAY VEREDICTO: cuando la tarjeta no está en `real`, la
//     CIFRA se queda y el JUICIO se retira; en su sitio se declara el hueco con
//     el `availability_note` del propio servidor («Haz un test de carrera para
//     fijar tu umbral»). Es el §6.2 bis: el hueco se declara cuando hay un acto
//     concreto detrás.
//   · UNA SECCIÓN SIN NADA ES UN VACÍO, y se pinta como Vacío (§6.2): UN estado
//     centrado con salida, no diez tarjetas repitiendo la misma ausencia.
struct AnalyticsView: View {
    var bearer: String? = nil
    /// FREE tier switch (athlete without coach) — hides the chat affordance.
    var hasCoach: Bool = true

    @Environment(AppDataStore.self) private var store

    @State private var section: AnalyticsSectionKey = .running
    @State private var period: AnalyticsPeriod = .default
    /// Which ergometer the Ergo section is scoped to. Persisted so the last pick
    /// sticks across launches; only meaningful while `section == .ergo`.
    @AppStorage("fahybrik.analytics.erg") private var erg: ErgScope = .row
    @State private var drillTarget: DrillTarget? = nil
    @State private var showCustomPicker = false
    @State private var revealed = false
    /// La salida del vacío: los tests son el acto que SIEMBRA estas analíticas.
    /// Y el hub degrada honestamente si el atleta tampoco tiene batería, así que
    /// la cadena se cierra en vez de acabar en otro callejón.
    @State private var showTestsHub = false
    /// El progreso de carrera, con su propia carga (ver `progresoDeCarrera`).
    @State private var progreso: RunningProgressPayload?
    @State private var progresoFallo = false

    /// Effective bearer: the one AppShell passed, else the persisted token.
    private var effectiveBearer: String? {
        bearer
    }

    /// The erg scope to send / cache by — only the Ergo section carries one.
    private var scopedErg: ErgScope? { section == .ergo ? erg : nil }

    private var slice: Slice<AnalyticsSection> { store.analyticsSection(section, period: period, erg: scopedErg) }
    private var currentSection: AnalyticsSection? { slice.value }

    var body: some View {
        // `head` queda fijo: el título, las secciones y (en Ergo) la máquina son
        // la IDENTIDAD de lo que estás mirando, y no deben irse al scrollear.
        // El cuerpo `llena` cuando hay tarjetas y reparte el aire cuando no —
        // resuelto por contenido, no por una decisión a priori (§6.1).
        CenteredScreen(head: { chrome }) {
            main
        }
        // EL TINTE DEL VEREDICTO VA DETRÁS DE TODO, incluido el cromo, y NO
        // scrollea: es el lienzo de la pantalla, no un fondo de una tarjeta. Es la
        // misma pieza `Ambiente` que tiñe la lectura de una carrera con la zona de
        // pulso — aquí el sujeto es el veredicto, así que tiñe él.
        .background(alignment: .top) {
            if section == .running, let p = progreso {
                Ambiente(
                    zona: nil,
                    tono: AnaliticasCorrerView.tono(ProgresoDeCarrera.veredictoEfectivo(p).clase)
                )
            }
        }
        .refreshable {
            // Pull-to-refresh: re-pull the active section×period fresh (force
            // bypasses the SWR staleness window).
            await store.refreshAnalyticsSection(section, period: period, erg: scopedErg, force: true)
        }
        .sheet(item: $drillTarget) { target in
            AnalyticsDrillDownSheet(target: target, bearer: effectiveBearer)
                .environment(store)
        }
        .sheet(isPresented: $showCustomPicker) {
            CustomPeriodSheet(initial: period) { newPeriod in
                period = newPeriod
            }
        }
        .fullScreenCover(isPresented: $showTestsHub) {
            TestsHubView(
                bearer: effectiveBearer,
                onClose: { showTestsHub = false },
                onSessionCompleted: {
                    Task {
                        await store.refreshAnalyticsSection(section, period: period, erg: scopedErg, force: true)
                    }
                }
            )
        }
        .onAppear {
            revealed = false
            DispatchQueue.main.async { revealed = true }
        }
        // Revalidate whenever the bearer, section or period changes. Cache-first:
        // a warm slice renders instantly; this just refreshes it (throttled + SWR).
        .task(id: refreshKey) {
            store.activate(bearer: effectiveBearer)
            if section == .running {
                await cargarProgreso()
            } else {
                await store.refreshAnalyticsSection(section, period: period, erg: scopedErg)
            }
        }
    }

    // MARK: - Carrera · ¿estoy mejorando?

    /// La pantalla de progreso de carrera, con su propia carga. No pasa por el
    /// motor SWR de secciones a propósito: no devuelve `AnalyticsSection` y
    /// doblar aquel contrato hasta que le cupiera dejaría de describir lo que
    /// sirve, además de romper a quien ya dibuja tarjetas con él.
    @ViewBuilder
    private var progresoDeCarrera: some View {
        if let p = progreso {
            AnaliticasCorrerView(progreso: p, onSalida: { showTestsHub = true })
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xxl)
        } else if progresoFallo {
            RedesignEmptyState(
                symbol: "arrow.clockwise",
                title: "No pudimos cargar tu progreso",
                message: "Revisa tu conexión e inténtalo de nuevo.",
                exit: .action(title: "Reintentar") { Task { await cargarProgreso() } }
            )
        } else {
            VStack(spacing: Theme.Spacing.m) {
                ForEach(0..<3, id: \.self) { _ in AnalyticsSkeletonCard() }
            }
            .padding(.horizontal, Theme.Spacing.xl)
        }
    }

    private func cargarProgreso() async {
        guard let bearer = effectiveBearer else { return }
        progresoFallo = false
        do {
            progreso = try await AnalyticsService.fetchRunningProgress(bearer: bearer)
        } catch {
            // Sin caché previa el fallo se dice; con ella se conserva lo último
            // bueno, que es más útil que un error sobre una pantalla en blanco.
            if progreso == nil { progresoFallo = true }
        }
    }

    /// Composite identity that drives the revalidation task (erg only for Ergo).
    private var refreshKey: String {
        "\(effectiveBearer ?? "nil")|\(section.rawValue)|\(period.cacheSuffix)|\(scopedErg?.rawValue ?? "")"
    }

    // MARK: - Chrome (pinned: title · sections · erg)

    /// Lo que NO scrollea: qué pantalla es y qué estás mirando. El periodo no
    /// vive aquí — es un calificador del detalle, no la identidad de la sección.
    private var chrome: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            header
                .padding(.horizontal, Theme.Spacing.xl)
            sectionNav
            if section == .ergo {
                ergSelector
                    .padding(.horizontal, Theme.Spacing.xl)
            }
        }
        .padding(.top, Theme.Spacing.s)
        .padding(.bottom, Theme.Spacing.m)
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: 2) {
                LabelText(text: "Tu rendimiento", color: Theme.Color.accentText, size: 11)
                Text("Analíticas")
                    .scaledFont(30, weight: .heavy, relativeTo: .title, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
            }
            Spacer(minLength: 8)
            if hasCoach {
                ChatHeaderButton()
            }
        }
        .padding(.top, 2)
        .accessibilityElement(children: .contain)
    }

    // MARK: - Section nav (Carrera · Ergo · Fuerza · HYROX · Recup.)

    private var sectionNav: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(AnalyticsSectionKey.allCases) { key in
                    let active = key == section
                    Button {
                        guard !active else { return }
                        Haptics.light()
                        withAnimation(.easeInOut(duration: 0.16)) { section = key }
                    } label: {
                        Text(key.navLabel)
                            .font(.system(size: 12, weight: .heavy))
                            .foregroundStyle(active ? Theme.Color.accentOn : Theme.Color.muted)
                            .padding(.horizontal, 13)
                            .padding(.vertical, 7)
                            .background(active ? Theme.Color.accent : Theme.Color.surfaceElevated)
                            .overlay(
                                Capsule().stroke(active ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1)
                            )
                            .clipShape(Capsule())
                    }
                    .buttonStyle(PressScaleStyle())
                    .accessibilityLabel(key.navLabel)
                    .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
                }
            }
            .padding(.vertical, Theme.Spacing.xs)
            .padding(.horizontal, Theme.Spacing.xl)
        }
    }

    // MARK: - Period selector (7 días · Mes · Año · Custom)

    private var periodSelector: some View {
        HStack(spacing: 4) {
            ForEach(AnalyticsPeriodKey.allCases, id: \.self) { key in
                let active = key == period.key
                Button {
                    Haptics.light()
                    if key == .custom {
                        showCustomPicker = true
                    } else if !active {
                        withAnimation(.easeInOut(duration: 0.16)) {
                            period = AnalyticsPeriod(key: key)
                        }
                    }
                } label: {
                    Text(periodLabel(key))
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(active ? Theme.Color.accentOn : Theme.Color.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .background(active ? Theme.Color.accent : Color.clear)
                        .clipShape(Capsule())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Periodo \(key.label)")
                .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(3)
        .background(Theme.Color.surfaceSunken)
        .overlay(Capsule().stroke(Theme.Color.hairline, lineWidth: 1))
        .clipShape(Capsule())
    }

    // MARK: - Ergo scope selector (Remo · SkiErg · BikeErg)
    //
    // Same segmented style as the period selector; scopes the Ergo section to one
    // machine so every metric names it (never a bare "ergo"). Switching refetches
    // that erg (cache is keyed per erg, so an already-seen one renders instantly).

    private var ergSelector: some View {
        HStack(spacing: 4) {
            ForEach(ErgScope.allCases) { scope in
                let active = scope == erg
                Button {
                    guard !active else { return }
                    Haptics.light()
                    withAnimation(.easeInOut(duration: 0.16)) { erg = scope }
                } label: {
                    Text(scope.label)
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(active ? Theme.Color.accentOn : Theme.Color.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .background(active ? Theme.Color.accent : Color.clear)
                        .clipShape(Capsule())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Ergo \(scope.label)")
                .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(3)
        .background(Theme.Color.surfaceSunken)
        .overlay(Capsule().stroke(Theme.Color.hairline, lineWidth: 1))
        .clipShape(Capsule())
    }

    /// Custom shows its resolved range ("12 jun → 24 jun") once chosen.
    private func periodLabel(_ key: AnalyticsPeriodKey) -> String {
        if key == .custom, period.key == .custom, let label = currentSection?.period.label_es {
            return label
        }
        return key.label
    }

    // MARK: - Body

    @ViewBuilder
    private var main: some View {
        // CARRERA NO ES UNA SECCIÓN DE TARJETAS. Una rejilla enumera métricas;
        // esta pregunta se contesta con UN veredicto y la evidencia que lo
        // sostiene, así que la sección de correr tiene su propia pantalla y su
        // propia llamada. Las otras cuatro siguen exactamente igual.
        if section == .running {
            progresoDeCarrera
        } else if let loaded = currentSection {
            // Una sección puede llegar LLENA DE TARJETAS y vacía de fondo: el
            // servidor emite siempre su juego de cards, y con un atleta recién
            // dado de alta todas vienen sin cifra. Eso no es una lista corta, es
            // un Vacío — y se pinta como Vacío.
            if AnalyticsVerdict.isBlank(loaded) {
                emptyState(loaded)
            } else {
                loadedBody(loaded)
            }
        } else if slice.isRevalidating || !slice.hasLoaded {
            // Cold load (no cache yet) — quiet skeletons, not an empty state.
            VStack(spacing: Theme.Spacing.m) {
                ForEach(0..<3, id: \.self) { _ in AnalyticsSkeletonCard() }
            }
            .padding(.horizontal, Theme.Spacing.xl)
        } else {
            // Ni caché ni respuesta: es un error, y un error lleva reintento.
            RedesignEmptyState(
                symbol: "arrow.clockwise",
                title: "No pudimos cargar tus analíticas",
                message: "Revisa tu conexión e inténtalo de nuevo.",
                exit: .action(title: "Reintentar") {
                    Task {
                        await store.refreshAnalyticsSection(section, period: period, erg: scopedErg, force: true)
                    }
                },
                eyebrow: section.navLabel
            )
        }
    }

    private func loadedBody(_ loaded: AnalyticsSection) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            // El sujeto, primero y más grande.
            if let verdict = AnalyticsVerdict.of(loaded) {
                verdictBlock(verdict, in: loaded)
            }

            // El periodo, a su tamaño real, justo encima de lo que califica.
            HStack(alignment: .center, spacing: Theme.Spacing.s) {
                LabelText(text: "El detalle")
                Spacer(minLength: Theme.Spacing.s)
                periodSelector
                    .frame(maxWidth: 210)
            }

            ForEach(Array(loaded.cards.enumerated()), id: \.element.id) { idx, card in
                AnalyticsCardView(card: card) { drill in
                    drillTarget = DrillTarget(ref: drill, period: period)
                }
                .staggerReveal(revealed, index: min(idx, 8))
            }
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.bottom, Theme.Spacing.xl)
    }

    private func verdictBlock(_ v: AnalyticsVerdict, in loaded: AnalyticsSection) -> some View {
        AnalyticsVerdictBlock(verdict: v, periodLabel: loaded.period.label_es)
    }

    private func emptyState(_ loaded: AnalyticsSection) -> some View {
        AnalyticsSeccionVaciaState(
            seccion: section.navLabel,
            porque: AnalyticsVerdict.blankReason(loaded),
            necesitaDispositivo: loaded.availability == .needs_wearable
        ) {
            Haptics.light()
            showTestsHub = true
        }
    }
}

// MARK: - El sujeto: el veredicto

/// La cifra que se lee a tres metros, qué es, y — sólo si hay cobertura — la
/// frase que la juzga. Sin cobertura la cifra SE QUEDA y el juicio se retira,
/// con el hueco declarado en su sitio.
struct AnalyticsVerdictBlock: View {
    let verdict: AnalyticsVerdict
    /// «últimos 30 días» — un veredicto sin su ventana miente por omisión.
    let periodLabel: String

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.xs) {
                Text(verdict.figure)
                    .font(Theme.Typography.readoutL)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                if let unit = verdict.unit {
                    Text(unit)
                        .font(Theme.Typography.bodyEmph)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            Text("\(verdict.label) · \(periodLabel)")
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            if let judgement = verdict.judgement {
                Text(judgement)
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let gap = verdict.coverageGap {
                HStack(alignment: .top, spacing: Theme.Spacing.s) {
                    Image(systemName: "exclamationmark.circle")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.Color.warning)
                        .padding(.top, 1)
                    Text(gap)
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.vertical, Theme.Spacing.s)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                        .stroke(Theme.Color.hairlineStrong, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                )
                .accessibilityElement(children: .combine)
            }
        }
        .accessibilityElement(children: .contain)
    }
}

// MARK: - La sección vacía

/// UN estado, centrado, con salida — no N tarjetas grises repitiendo la misma
/// ausencia. El porqué lo escribe el servidor (`availability_note`), así que no
/// nos lo inventamos aquí.
struct AnalyticsSeccionVaciaState: View {
    let seccion: String
    let porque: String
    /// Sin dispositivo no hay acto que ofrecer DENTRO de la app, y un botón
    /// falso es peor que ninguno: se explica y punto.
    let necesitaDispositivo: Bool
    let onVerTests: () -> Void

    var body: some View {
        if necesitaDispositivo {
            RedesignEmptyState(
                symbol: "applewatch",
                title: "Todavía no hay nada que analizar aquí",
                message: porque,
                exit: .explained(note: "Esto se llena solo en cuanto entrenes con un reloj o pulsómetro conectado."),
                eyebrow: seccion
            )
        } else {
            RedesignEmptyState(
                symbol: "chart.line.uptrend.xyaxis",
                title: "Todavía no hay nada que analizar aquí",
                message: porque,
                exit: .action(title: "Ver mis tests", perform: onVerTests),
                note: "Y cada entreno que registres suma aquí sin que tengas que hacer nada.",
                eyebrow: seccion
            )
        }
    }
}

// MARK: - El veredicto de una sección
//
// Derivado, nunca inventado: el servidor ya manda la cifra, su título y la frase
// que la interpreta. Esto sólo decide CUÁL de las tarjetas es la portada y
// cuándo el juicio deja de sostenerse.

struct AnalyticsVerdict {
    /// `primary.value` de la tarjeta de portada.
    let figure: String
    /// `primary.unit` — «/km · Z4», «kg».
    let unit: String?
    /// El título de esa tarjeta: qué es la cifra.
    let label: String
    /// `meaning_es` — SÓLO cuando la tarjeta está en `real`. Sin cobertura, la
    /// cifra se queda y el juicio se retira.
    let judgement: String?
    /// `availability_note` cuando la cobertura no da: el hueco, declarado con
    /// las palabras del servidor.
    let coverageGap: String?

    /// La portada de la sección: la primera tarjeta que trae cifra. Si ninguna
    /// la trae, la sección no tiene veredicto que dar.
    static func of(_ section: AnalyticsSection) -> AnalyticsVerdict? {
        guard let card = section.cards.first(where: { ($0.primary?.value?.isEmpty == false) }),
              let value = card.primary?.value else { return nil }
        let covered = card.availability == .real
        return AnalyticsVerdict(
            figure: value,
            unit: card.primary?.unit,
            label: card.title_es,
            judgement: covered ? card.meaning_es : nil,
            coverageGap: covered ? nil : card.availability_note
        )
    }

    /// Una sección está VACÍA DE FONDO cuando ninguna de sus tarjetas lleva un
    /// solo dato: ni cifra, ni fila con valor, ni serie, ni zona con valor. Es el
    /// caso del atleta recién dado de alta, y es cuando la pantalla se llenaba de
    /// tarjetas grises que sólo decían que no había nada.
    static func isBlank(_ section: AnalyticsSection) -> Bool {
        section.cards.allSatisfy { card in
            (card.primary?.value?.isEmpty ?? true)
                && card.rows.allSatisfy { ($0.value?.isEmpty ?? true) }
                && card.series.isEmpty
                && card.zones.allSatisfy { ($0.value?.isEmpty ?? true) }
        }
    }

    /// Por qué está vacía, con las palabras del servidor. La primera nota de
    /// disponibilidad que exista; si no hay ninguna, una frase honesta y neutra.
    static func blankReason(_ section: AnalyticsSection) -> String {
        section.cards.compactMap { $0.availability_note }.first(where: { !$0.isEmpty })
            ?? "Aún no hay sesiones registradas en este periodo."
    }
}

// MARK: - Skeleton card (cold-load placeholder)

private struct AnalyticsSkeletonCard: View {
    @State private var pulse = false
    var body: some View {
        CardSurface(padding: 15) {
            VStack(alignment: .leading, spacing: 12) {
                RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                    .fill(Theme.Color.surfaceElevated)
                    .frame(width: 120, height: 12)
                RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                    .fill(Theme.Color.surfaceElevated)
                    .frame(width: 90, height: 30)
                RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                    .fill(Theme.Color.surfaceElevated)
                    .frame(maxWidth: .infinity)
                    .frame(height: 12)
            }
        }
        .opacity(pulse ? 0.55 : 1)
        .onAppear {
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { pulse = true }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Custom period picker

private struct CustomPeriodSheet: View {
    let initial: AnalyticsPeriod
    let onConfirm: (AnalyticsPeriod) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var from: Date
    @State private var to: Date

    init(initial: AnalyticsPeriod, onConfirm: @escaping (AnalyticsPeriod) -> Void) {
        self.initial = initial
        self.onConfirm = onConfirm
        let cal = Calendar.current
        let now = Date()
        let defaultFrom = cal.date(byAdding: .day, value: -30, to: now) ?? now
        _from = State(initialValue: Self.parse(initial.from) ?? defaultFrom)
        _to = State(initialValue: Self.parse(initial.to) ?? now)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    DatePicker("Desde", selection: $from, in: ...to, displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .tint(Theme.Color.accent)
                    Hairline()
                    DatePicker("Hasta", selection: $to, in: from...Date(), displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .tint(Theme.Color.accent)
                    Spacer()
                    ExpertPrimaryButton(title: "Aplicar") {
                        onConfirm(AnalyticsPeriod(key: .custom, from: Self.iso(from), to: Self.iso(to)))
                        dismiss()
                    }
                }
                .padding(Theme.Spacing.xl)
            }
            .navigationTitle("Rango personalizado")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .foregroundStyle(Theme.Color.accentText)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private static let isoFmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    private static func iso(_ d: Date) -> String { isoFmt.string(from: d) }
    private static func parse(_ s: String?) -> Date? { s.flatMap { isoFmt.date(from: $0) } }
}
