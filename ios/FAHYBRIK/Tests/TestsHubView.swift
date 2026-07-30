import SwiftUI

// Tests guiados — the athlete's TESTS hub (mockup A). One screen that closes the
// benchmark loop: current zones on top (what the tests calibrate), then every
// battery test with its last mark, the delta vs the previous one, the curve, and
// the action — «Probarme» (creates/reuses TODAY's assignment via the start
// endpoint and launches the NORMAL session flow, so the guided cursor + audio
// just work), «Continuar» when today's assignment already exists, or «Añadir
// resultado» when the session ran but the number was never captured.
//
// Reached from Inicio (the battery card summarizes and navigates here — full
// screen cover) and from Perfil (pushed). Honest states throughout: loading,
// error-with-retry, and an empty state for the athlete whose coach has not
// programmed anything yet — never a broken 0/0 or a fabricated curve.
//
// COMPOSICIÓN (contrato §6, aplicado el 30-jul). Un arquetipo se degrada, no se
// rompe, así que esta pantalla es DOS:
//
//   · con batería publicada → **Lista**, `llena` + scroll, y el siguiente acto
//     anclado abajo al alcance del pulgar. Cada tarjeta conserva su propia
//     acción; la anclada es la global.
//   · sin nada programado → **Vacío**, `centra`, con salida REAL. Era el peor
//     caso mínimo de la app: donde aterriza el atleta recién dado de alta, tres
//     tarjetas cortas apiladas arriba, el resto negro y NI UNA acción en toda la
//     pantalla. Ahora es un estado centrado con el contador pintado en cero
//     (§6.2 bis: un contador en cero es información, y es cuando más falta hace)
//     y un acto concreto — la biblioteca de marcas, donde puede probarse por su
//     cuenta sin esperar a nadie.
//
// El denominador NO se inventa: sin batería publicada no hay «de cuántos», así
// que el contador enseña sólo lo que se sabe (§7).
struct TestsHubView: View {
    let bearer: String?
    /// Athlete's resolved max-HR source, threaded into launched sessions (same
    /// contract as Inicio's launches).
    var hrZones: HRZoneProfile? = nil
    /// Non-nil when presented as a full-screen cover (Inicio) — shows the ✕.
    /// Nil when pushed (Perfil) — the nav bar carries the back affordance.
    var onClose: (() -> Void)? = nil
    /// Fired after a launched test session completes, so callers refresh their
    /// plan/battery surfaces.
    var onSessionCompleted: () -> Void = {}

    @State private var status: BatteryStatus? = nil
    @State private var zones: [ZoneModalityProfile] = []
    @State private var zonesLoaded = false
    /// calibrationSlug → benchmark series (curve + last/delta) for that test.
    /// Grouped from ONE all-series history fetch through each test's result
    /// contract (store_results[].slug = the BENCHMARK slug the history endpoint
    /// indexes by — the calibration slug would return nothing). A missing key
    /// simply hides the curve for that test.
    @State private var histories: [String: [BenchmarkSeries]] = [:]
    @State private var loading = true
    @State private var failed = false
    @State private var reloadNonce = 0

    @State private var workoutLaunch: WorkoutLaunch? = nil
    /// Slug whose /start call is in flight (spinner on that card's CTA).
    @State private var startingSlug: String? = nil
    /// Slug whose /start call failed (inline error on that card).
    @State private var startFailedSlug: String? = nil
    @State private var captureTarget: CaptureTarget? = nil
    /// La salida del atleta que aún no tiene batería: la biblioteca de marcas,
    /// donde «Probarme» lanza un intento medido por el mismo motor en vivo.
    @State private var showMarksLibrary = false

    private struct CaptureTarget: Identifiable {
        let id: String            // assignmentId
        let specs: [StoreResultSpec]
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                if let onClose { coverTopBar(onClose) }
                content
            }
        }
        .navigationTitle(onClose == nil ? "Tus tests" : "")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: reloadToken) { await load() }
        .fullScreenCover(item: $workoutLaunch) { launch in
            WorkoutContainer(
                assignmentId: launch.assignmentId,
                fallbackTitle: launch.title,
                bearer: bearer,
                hrZones: hrZones,
                onClose: {
                    workoutLaunch = nil
                    reloadNonce += 1
                },
                onCompleted: { _ in
                    reloadNonce += 1
                    onSessionCompleted()
                }
            )
        }
        .sheet(item: $captureTarget) { target in
            TestResultCaptureSheet(
                assignmentId: target.id,
                specs: target.specs,
                bearer: bearer,
                onDone: {
                    captureTarget = nil
                    reloadNonce += 1
                    onSessionCompleted()
                }
            )
        }
        // La biblioteca empuja sus propios destinos, así que viaja con su pila:
        // el hub se abre como cover desde Inicio y ahí no hay ninguna heredada.
        .fullScreenCover(isPresented: $showMarksLibrary) {
            NavigationStack {
                MarksLibraryView(bearer: bearer, hrZones: hrZones)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cerrar") { showMarksLibrary = false }
                                .foregroundStyle(Theme.Color.accentText)
                        }
                    }
            }
        }
    }

    private var reloadToken: String { "\(bearer ?? "-")#\(reloadNonce)" }

    // MARK: - Chrome (cover mode)

    private func coverTopBar(_ close: @escaping () -> Void) -> some View {
        HStack {
            LabelText(text: "Tests · Calibración", color: Theme.Color.accentText)
            Spacer()
            Button {
                Haptics.light()
                close()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 34, height: 34)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Cerrar")
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.l)
        .padding(.bottom, Theme.Spacing.s)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if loading && status == nil {
            CenteredScreen { loadingState }
        } else if failed && status == nil {
            CenteredScreen { errorState }
        } else if let status, status.isScheduled {
            scheduled(status)
        } else {
            // Sin batería publicada la Lista ES un Vacío, y se pinta como Vacío
            // (§6.2): centrado y con salida, no un encabezado colgando arriba.
            CenteredScreen { nothingScheduledState }
        }
    }

    // MARK: - Lista (hay batería publicada) — `llena` + el siguiente acto anclado

    @ViewBuilder
    private func scheduled(_ status: BatteryStatus) -> some View {
        let list = ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                header(status)
                zonesCard
                ForEach(status.tests) { test in
                    testCard(test)
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.l)
            .padding(.bottom, Theme.Spacing.xxl)
        }
        .refreshable { reloadNonce += 1 }

        // Batería cerrada = no queda acto global que anclar, y una barra vacía
        // abajo es exactamente el hueco que el §6.1 prohíbe.
        if let next = nextAction(status) {
            list.anchoredAction {
                VStack(spacing: Theme.Spacing.xs) {
                    Text(next.subject)
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                    ExpertPrimaryButton(title: next.title, height: 50, action: next.perform)
                }
            }
        } else {
            list
        }
    }

    /// El siguiente acto de la batería — el que la anclada ofrece sin que el
    /// atleta tenga que buscar la tarjeta. El orden es el de urgencia real: un
    /// número que falta bloquea la calibración, lo de hoy va antes que lo de
    /// pasado, y sólo después se propone empezar el siguiente.
    private struct NextAct {
        /// Qué test, en una línea sobre el botón: «PROBARME» a secas no dice cuál
        /// cuando hay cuatro tarjetas, y meterlo en el botón lo desborda.
        let subject: String
        let title: String
        let perform: () -> Void
    }

    private func nextAction(_ status: BatteryStatus) -> NextAct? {
        if let pending = status.firstPendingResult {
            return NextAct(subject: pending.label, title: "AÑADIR RESULTADO") {
                Task { await openCapture(pending) }
            }
        }
        if let today = status.tests.first(where: { $0.displayState == .pending && isScheduledToday($0) }) {
            return NextAct(subject: "\(today.label) · hoy", title: "CONTINUAR") {
                workoutLaunch = WorkoutLaunch(assignmentId: today.assignmentId, title: today.label)
            }
        }
        if let next = status.tests.first(where: { $0.displayState == .pending }) {
            return NextAct(
                subject: "\(next.label) · \(dateLabel(next.scheduledFor))",
                title: startingSlug == next.calibrationSlug ? "PREPARANDO…" : "PROBARME"
            ) {
                Task { await startTest(next) }
            }
        }
        return nil
    }

    private func header(_ status: BatteryStatus) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .firstTextBaseline) {
                Text("Tus tests")
                    .scaledFont(24, weight: .heavy, relativeTo: .title2, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: Theme.Spacing.s)
                CalibrationCounter(done: status.completed, total: status.total)
            }
            Text("Corre el test y la app mide por ti: marca, recuperación y zonas. Tú solo aprietas.")
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Zones summary (what the tests calibrate)

    private var zonesCard: some View {
        CardSurface(padding: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                LabelText(text: "Tus zonas actuales", color: Theme.Color.accentText)
                if zones.isEmpty {
                    Text(zonesLoaded
                         ? "Aún sin zonas. Tu primer test de ritmo las fija al momento."
                         : "Cargando tus zonas…")
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(zones.enumerated()), id: \.element.id) { idx, m in
                            if idx > 0 { Hairline() }
                            zoneRow(m)
                        }
                    }
                }
            }
        }
    }

    private func zoneRow(_ m: ZoneModalityProfile) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 1) {
                Text(m.modalityLabel)
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                if let date = m.recordedDateLabel {
                    Text(date)
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.faint)
                }
            }
            Spacer(minLength: Theme.Spacing.s)
            if let threshold = m.thresholdLabel {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(threshold)
                        .font(.system(size: 15, weight: .bold, design: .monospaced).monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                    Text("UMBRAL")
                        .font(.system(size: 9, weight: .semibold))
                        .tracking(Theme.Tracking.dataLabel)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
        .padding(.vertical, Theme.Spacing.s)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(m.modalityLabel), umbral \(m.thresholdLabel ?? "sin dato")")
    }

    // MARK: - One test (benchmark + curve + action)

    private func testCard(_ test: CalibrationTestStatus) -> some View {
        CardSurface(padding: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                HStack(alignment: .firstTextBaseline) {
                    Text(test.label)
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Spacer(minLength: Theme.Spacing.s)
                    stateTag(test)
                }

                benchmarkLines(test)

                if startFailedSlug == test.calibrationSlug {
                    Text("No se pudo preparar el test. Inténtalo de nuevo.")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.danger)
                }

                cta(test)
            }
        }
    }

    /// Small trailing state tag — the row's honest status at a glance.
    @ViewBuilder
    private func stateTag(_ test: CalibrationTestStatus) -> some View {
        switch test.displayState {
        case .done:
            HStack(spacing: 4) {
                Image(systemName: "checkmark.circle.fill")
                Text("Hecho")
            }
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Theme.Color.ok)
        case .resultPending:
            HStack(spacing: 4) {
                Image(systemName: "exclamationmark.circle.fill")
                Text("Falta el resultado")
            }
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Theme.Color.warning)
        case .pending:
            Text(isScheduledToday(test) ? "Hoy" : dateLabel(test.scheduledFor))
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
        }
    }

    /// The benchmark truth for this test: one line per series — last mark, delta
    /// chip vs the previous one, sparkline. Falls back to the status'
    /// pre-formatted `resultLabel` (no curve yet) and to an honest first-time
    /// line when there's no history at all.
    @ViewBuilder
    private func benchmarkLines(_ test: CalibrationTestStatus) -> some View {
        let series = (histories[test.calibrationSlug] ?? []).filter { !$0.results.isEmpty }
        if !series.isEmpty {
            VStack(spacing: Theme.Spacing.s) {
                ForEach(series) { s in
                    benchmarkRow(s, showLabel: series.count > 1)
                }
            }
        } else if let last = test.resultLabel {
            HStack(alignment: .lastTextBaseline, spacing: 6) {
                Text(last)
                    .font(.system(size: 20, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                Text("último resultado")
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
            }
        } else {
            Text("Sin marcas todavía. Tu primera vez fija la referencia.")
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    private func benchmarkRow(_ s: BenchmarkSeries, showLabel: Bool) -> some View {
        HStack(alignment: .center, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 2) {
                if showLabel {
                    Text(s.label)
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                }
                HStack(alignment: .lastTextBaseline, spacing: 6) {
                    if let last = s.lastValue {
                        Text(BenchmarkDelta.valueLabel(unit: s.unit, value: last))
                            .font(.system(size: 20, weight: .heavy, design: .monospaced).monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    if let delta = s.lastDelta {
                        BenchmarkDeltaChip(unit: s.unit, delta: delta)
                    }
                }
            }
            Spacer(minLength: Theme.Spacing.s)
            BenchmarkSparkline(values: s.results.map(\.value))
                .frame(width: 84, height: 30)
        }
        .accessibilityElement(children: .combine)
    }

    /// The card's action, by state: capture the missing number, continue TODAY's
    /// pending session, or start («Probarme» → POST start → the NORMAL session
    /// flow, so the guided cursor + audio work unchanged).
    @ViewBuilder
    private func cta(_ test: CalibrationTestStatus) -> some View {
        switch test.displayState {
        case .resultPending:
            ExpertPrimaryButton(title: "AÑADIR RESULTADO", height: 46) {
                Task { await openCapture(test) }
            }
        case .pending where isScheduledToday(test):
            ExpertPrimaryButton(title: "CONTINUAR", height: 46) {
                workoutLaunch = WorkoutLaunch(assignmentId: test.assignmentId, title: test.label)
            }
        default:
            ExpertPrimaryButton(
                title: startingSlug == test.calibrationSlug ? "PREPARANDO…" : "PROBARME",
                height: 46,
                enabled: startingSlug == nil && bearer != nil
            ) {
                Task { await startTest(test) }
            }
        }
    }

    // MARK: - Vacío / cargando / error
    //
    // Los tres con las piezas compartidas (§5). Antes el vacío era una tarjeta
    // dibujada a mano —duplicada además en `TestBatteryCard`— y la carga y el
    // error eran `Spacer(); …; Spacer()`, o sea `CenteredScreen` reimplementado
    // dos veces en el mismo fichero.

    private var nothingScheduledState: some View {
        TestsSinBateriaState {
            Haptics.light()
            showMarksLibrary = true
        }
    }

    private var loadingState: some View {
        VStack(spacing: Theme.Spacing.m) {
            ProgressView().tint(Theme.Color.accentText)
            Text("Cargando tus tests…")
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Color.muted)
        }
        .frame(maxWidth: .infinity)
    }

    private var errorState: some View {
        RedesignEmptyState(
            symbol: "arrow.clockwise",
            title: "No pudimos cargar tus tests",
            message: "Revisa tu conexión e inténtalo de nuevo.",
            exit: .action(title: "Reintentar") { reloadNonce += 1 }
        )
    }

    // MARK: - Actions

    /// «Probarme» → the start endpoint creates/reuses TODAY's assignment; we
    /// launch it through the exact same cover a planned session uses.
    private func startTest(_ test: CalibrationTestStatus) async {
        guard let bearer, startingSlug == nil else { return }
        startingSlug = test.calibrationSlug
        startFailedSlug = nil
        do {
            let start = try await TestBatteryService.startTest(slug: test.calibrationSlug, bearer: bearer)
            Haptics.medium()
            workoutLaunch = WorkoutLaunch(assignmentId: start.assignmentId, title: test.label)
        } catch {
            startFailedSlug = test.calibrationSlug
            Haptics.error()
        }
        startingSlug = nil
    }

    /// "Falta el resultado" → resolve the session's store_results contract, then
    /// the capture sheet (manual entry — the session already ran).
    private func openCapture(_ test: CalibrationTestStatus) async {
        guard let bearer else { return }
        do {
            let detail = try await PlanService.fetchAssignmentDetail(test.assignmentId, bearer: bearer)
            let specs = detail.storeResults
            guard !specs.isEmpty else { return }
            captureTarget = CaptureTarget(id: test.assignmentId, specs: specs)
        } catch {
            // Leave the nudge in place; the athlete can retry. Never fabricated.
        }
    }

    // MARK: - Load

    private func load() async {
        guard let bearer else {
            loading = false
            failed = true
            return
        }
        async let zonesReq = ZonesService.fetch(bearer: bearer)
        // ONE fetch for every benchmark series the athlete has; grouped per test
        // below through each test's result contract. Tolerant — a failed history
        // just hides the curves, never the hub.
        async let allSeriesReq = TestBatteryService.fetchBenchmarkHistory(bearer: bearer)
        do {
            let s = try await TestBatteryService.fetchStatus(bearer: bearer)
            status = s
            failed = false
            // Each test's BENCHMARK slugs come from its assignment detail's
            // store_results (cache-first — the container already caches details).
            var slugsByTest: [String: [String]] = [:]
            await withTaskGroup(of: (String, [String]).self) { group in
                for test in s.tests {
                    group.addTask {
                        (test.calibrationSlug, await Self.benchmarkSlugs(for: test, bearer: bearer))
                    }
                }
                for await (calibration, slugs) in group {
                    // Merge — several occurrences of the same test share the contract.
                    slugsByTest[calibration, default: []].append(contentsOf: slugs)
                }
            }
            let allSeries = (try? await allSeriesReq) ?? []
            let seriesBySlug = Dictionary(
                allSeries.map { ($0.exerciseSlug, $0) },
                uniquingKeysWith: { _, latest in latest }
            )
            histories = slugsByTest.mapValues { slugs in
                // Preserve the contract's own order (headline result first).
                var seen = Set<String>()
                return slugs.compactMap { slug in
                    guard seen.insert(slug).inserted else { return nil }
                    return seriesBySlug[slug]
                }
            }
        } catch {
            if status == nil { failed = true }
        }
        zones = (try? await zonesReq)?.modalities ?? zones
        zonesLoaded = true
        loading = false
    }

    /// The benchmark slugs this test promises (store_results contract), resolved
    /// from the assignment detail — cache-first, then the network; empty (no
    /// curve) when neither is available. Never fabricated.
    private static func benchmarkSlugs(for test: CalibrationTestStatus, bearer: String) async -> [String] {
        if let cached = AssignmentDetailCache.load(test.assignmentId) {
            return cached.storeResults.map(\.slug)
        }
        guard let detail = try? await PlanService.fetchAssignmentDetail(test.assignmentId, bearer: bearer) else {
            return []
        }
        AssignmentDetailCache.save(detail)
        return detail.storeResults.map(\.slug)
    }

    // MARK: - Dates

    private func isScheduledToday(_ test: CalibrationTestStatus) -> Bool {
        test.scheduledFor == Self.todayISO()
    }

    /// Local "YYYY-MM-DD" — the athlete's day, matching the plan's scheduling.
    static func todayISO(now: Date = Date()) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: now)
    }

    // "10 jul" from ISO YYYY-MM-DD; the raw string if unparseable (never guessed).
    private func dateLabel(_ iso: String) -> String {
        let parts = iso.split(separator: "-")
        guard parts.count == 3, let m = Int(parts[1]), let d = Int(parts[2]),
              (1...12).contains(m) else { return iso }
        let months = ["ene", "feb", "mar", "abr", "may", "jun",
                      "jul", "ago", "sep", "oct", "nov", "dic"]
        return "\(d) \(months[m - 1])"
    }
}

// MARK: - El vacío del hub

/// EL CASO DE DISEÑO (§6.3): el atleta recién dado de alta. Sin batería, sin
/// zonas, sin marcas. Lo único que NO puede pasar es que se quede sin nada que
/// tocar — que es exactamente lo que pasaba: tres tarjetas cortas arriba, el
/// resto negro y ni una acción en toda la pantalla.
///
/// Vive como pieza propia (y no como un `private var` del hub) porque es un
/// estado con vida propia: no depende de nada del hub salvo su acción, y así se
/// puede RENDERIZAR en el arnés de capturas — una pantalla se mira, no se supone
/// (§8).
struct TestsSinBateriaState: View {
    /// La salida real: la biblioteca de marcas, donde el atleta puede probarse
    /// hoy sin esperar a que nadie le programe nada.
    let onProbarme: () -> Void

    var body: some View {
        RedesignEmptyState(
            eyebrow: "Calibración",
            title: "Tus zonas y tus cargas están sin fijar",
            message: "Los tests las fijan en una sesión: a qué pulso entrenas, con cuánto peso y a qué ritmo. Hasta entonces, todo va con estimaciones.",
            exit: .action(title: "Pruébate por tu cuenta", perform: onProbarme),
            note: "Tu coach programa los tests de calibración, normalmente en tu primera semana. Cuando lo haga aparecen aquí."
        ) {
            // Sin batería publicada no hay denominador que enseñar, y no se
            // inventa (§7): el contador dice lo que se sabe — cero calibrados.
            CalibrationCounter(done: 0, total: nil, hero: true, unidad: "tests calibrados")
        }
    }
}
