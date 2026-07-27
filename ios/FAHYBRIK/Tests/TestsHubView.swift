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
// error-with-retry, and a "Pablo prepara tus tests" empty state — never a
// broken 0/0 or a fabricated curve.
struct TestsHubView: View {
    let bearer: String?
    /// Athlete's resolved max-HR source, threaded into launched sessions (same
    /// contract as Inicio's launches).
    var hrMaxSource: HRMaxSource? = nil
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
                hrMaxSource: hrMaxSource,
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
            Spacer()
            ProgressView().tint(Theme.Color.accentText)
            Spacer()
        } else if failed && status == nil {
            errorState
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    header
                    zonesCard
                    if let status, status.isScheduled {
                        ForEach(status.tests) { test in
                            testCard(test)
                        }
                    } else {
                        preparingCard
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .refreshable { reloadNonce += 1 }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("Tus tests")
                    .scaledFont(24, weight: .heavy, relativeTo: .title2, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: Theme.Spacing.s)
                if let status, status.isScheduled {
                    HStack(alignment: .lastTextBaseline, spacing: 2) {
                        Text("\(status.completed)")
                            .font(Theme.Typography.readoutM)
                            .foregroundStyle(status.isComplete ? Theme.Color.ok : Theme.Color.foreground)
                        Text("/\(status.total)")
                            .font(.system(size: 18, weight: .bold, design: .monospaced))
                            .foregroundStyle(Theme.Color.muted)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(status.completed) de \(status.total) tests con resultado")
                }
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

    // MARK: - Empty / error states

    private var preparingCard: some View {
        CardSurface(padding: Theme.Spacing.l) {
            HStack(spacing: Theme.Spacing.m) {
                Image(systemName: "stopwatch")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(width: 44, height: 44)
                    .background(Theme.Color.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Tu coach prepara tus tests")
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Cuando los programe aparecerán aquí, con tu progreso y tus zonas.")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var errorState: some View {
        VStack(spacing: 10) {
            Spacer()
            Text("No pudimos cargar tus tests")
                .font(Theme.Typography.headlineS)
                .foregroundStyle(Theme.Color.foreground)
            Button("Reintentar") { reloadNonce += 1 }
                .font(Theme.Typography.bodyEmph)
                .foregroundStyle(Theme.Color.accentText)
            Spacer()
        }
        .frame(maxWidth: .infinity)
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
        zones = (try? await zonesReq) ?? zones
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
