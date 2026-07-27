import SwiftUI

// One mark (#Marcas): the PR, the history, the race twin, and the way to attack it.
//
// · Self-testable marks → "Probarme ahora": a run mark asks calle/cinta through the
//   SAME pre-start flow every run uses (the belt connect included), an erg mark goes
//   straight in — the PM5 measures. The attempt is a single-bout free session on the
//   existing engine; the summary posts the value on a full finish.
// · Race marks → "Registrar": candidates from the watch, or typed.
// · Run marks keep a PR PER CONTEXT: the belt moves the floor for you, so a
//   treadmill 5K never beats the street one — both bests show side by side.
struct MarkDetailView: View {
    let slug: String
    let bearer: String?
    var hrMaxSource: HRMaxSource? = nil

    @State private var mark: MarkView? = nil
    @State private var loading = true
    @State private var error: String? = nil
    /// Snapshot of the best BEFORE an attempt, so the return can celebrate honestly.
    @State private var bestBeforeAttempt: Double? = nil
    @State private var newMarkBanner: (label: String, deltaLabel: String?, improved: Bool)? = nil

    @State private var showRunPreStart = false
    @State private var liveContext: FreeWorkoutContext? = nil
    @State private var showRegister = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    if let mark {
                        if let banner = newMarkBanner { newMarkCard(banner) }
                        heroCard(mark)
                        if mark.group == "run" { contextBests(mark) }
                        if let twin = mark.raceTwin, let best = mark.best {
                            twinCard(mark, twin: twin, best: best)
                        }
                        historyCard(mark)
                    } else if loading {
                        ProgressView()
                            .tint(Theme.Color.accentText)
                            .frame(maxWidth: .infinity)
                            .padding(.top, Theme.Spacing.xl)
                    }
                    if let error {
                        Text(error)
                            .font(Theme.Typography.small)
                            .foregroundStyle(Theme.Color.warning)
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, 120)
            }

            // The one action, pinned where the thumb lives.
            if let mark {
                VStack {
                    Spacer()
                    ctaButton(mark)
                        .padding(.horizontal, Theme.Spacing.l)
                        .padding(.bottom, Theme.Spacing.l)
                }
            }
        }
        .navigationTitle(mark?.label ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        // Run marks: calle/cinta first — the same question every run gets asked.
        .fullScreenCover(isPresented: $showRunPreStart) {
            RunPreStartFlow(
                sessionTitle: mark?.label ?? "",
                onStart: { environment in
                    showRunPreStart = false
                    startAttempt(environment: environment)
                },
                onCancel: { showRunPreStart = false }
            )
        }
        .fullScreenCover(item: liveBinding) { boxed in
            WorkoutContainer(
                assignmentId: nil,
                fallbackTitle: boxed.context.title,
                bearer: bearer,
                freeContext: boxed.context,
                hrMaxSource: hrMaxSource,
                onClose: { liveContext = nil },
                onCompleted: { _ in
                    liveContext = nil
                    Task { await reloadAfterAttempt() }
                }
            )
        }
        .sheet(isPresented: $showRegister) {
            if let mark {
                RegisterRaceSheet(
                    mark: mark,
                    bearer: bearer,
                    onSaved: { Task { await reloadAfterAttempt() } }
                )
            }
        }
    }

    // fullScreenCover(item:) needs Identifiable — box the context.
    private struct BoxedContext: Identifiable {
        let id = UUID()
        let context: FreeWorkoutContext
    }
    private var liveBinding: Binding<BoxedContext?> {
        Binding(
            get: { liveContext.map { BoxedContext(context: $0) } },
            set: { if $0 == nil { liveContext = nil } }
        )
    }

    // MARK: - Cards

    private func heroCard(_ mark: MarkView) -> some View {
        CardSurface(padding: 18) {
            VStack(spacing: 6) {
                LabelText(text: mark.best == nil ? "Sin marca todavía" : "Tu mejor marca")
                Text(mark.best.map { MarkFormat.value(mark, $0.value) } ?? "—")
                    .font(Theme.Typography.readoutL)
                    .foregroundStyle(Theme.Color.foreground)
                if let best = mark.best {
                    HStack(spacing: 6) {
                        if let pace = MarkFormat.paceLine(mark, best.value) {
                            Text(pace)
                        }
                        if let rel = MarkFormat.relative(best.recordedAt) {
                            Text("·")
                            Text(rel)
                        }
                    }
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                } else {
                    Text(mark.approxLabel)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    /// Run marks: street and belt keep separate records — show both, never mix.
    @ViewBuilder
    private func contextBests(_ mark: MarkView) -> some View {
        if mark.bestOutdoor != nil || mark.bestTreadmill != nil {
            HStack(spacing: 10) {
                contextTile("Aire libre", result: mark.bestOutdoor, mark: mark)
                contextTile("En cinta", result: mark.bestTreadmill, mark: mark)
            }
        }
    }

    private func contextTile(_ title: String, result: MarkResult?, mark: MarkView) -> some View {
        CardSurface(padding: 12) {
            VStack(alignment: .leading, spacing: 4) {
                LabelText(text: title)
                Text(result.map { MarkFormat.value(mark, $0.value) } ?? "—")
                    .font(.system(size: 17, weight: .bold, design: .monospaced))
                    .foregroundStyle(result == nil ? Theme.Color.faint : Theme.Color.foreground)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// The comparison nobody else can show: your fresh mark vs the SAME distance
    /// inside your last race. The gap is what the plan trains.
    private func twinCard(_ mark: MarkView, twin: RaceTwin, best: MarkResult) -> some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    twinHalf("En el box", MarkFormat.clock(best.value), caption: "tu PR")
                    Divider().overlay(Theme.Color.hairlineStrong).frame(height: 40)
                    twinHalf("En carrera", MarkFormat.clock(twin.seconds), caption: twin.raceName)
                }
                if let delta = twinDeltaLine(best: best.value, race: twin.seconds) {
                    Text(delta)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private func twinHalf(_ title: String, _ value: String, caption: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            LabelText(text: title)
            Text(value)
                .font(.system(size: 19, weight: .bold, design: .monospaced))
                .foregroundStyle(Theme.Color.foreground)
            Text(caption)
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Color.faint)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func twinDeltaLine(best: Double, race: Double) -> String? {
        let gap = Int((race - best).rounded())
        guard gap > 0 else { return nil }
        return "En carrera fuiste \(gap) s más lento que fresco. Normal: llegas con kilómetros en las piernas. Ese hueco es lo que entrena tu plan."
    }

    private func historyCard(_ mark: MarkView) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            LabelText(text: "Historial")
            CardSurface(padding: 0) {
                if mark.history.isEmpty {
                    Text(mark.measuredBy == "registered"
                        ? "Registra tu primera \(mark.label.lowercased()) y aquí verás la progresión."
                        : "Pruébate y aquí verás la progresión.")
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(mark.history.enumerated()), id: \.offset) { index, result in
                            historyRow(mark, result: result, previous: mark.history[safe: index + 1])
                            if index < mark.history.count - 1 {
                                Divider().overlay(Theme.Color.hairline).padding(.leading, 14)
                            }
                        }
                    }
                }
            }
        }
    }

    private func historyRow(_ mark: MarkView, result: MarkResult, previous: MarkResult?) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(MarkFormat.relative(result.recordedAt) ?? "")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.foreground)
                Text(historyTag(result))
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.faint)
            }
            Spacer()
            if let previous, let delta = MarkFormat.delta(mark, from: previous.value, to: result.value) {
                Text(delta.label)
                    .font(Theme.Typography.caption)
                    .foregroundStyle(delta.improved ? Theme.Color.ok : Theme.Color.danger)
            }
            Text(MarkFormat.value(mark, result.value))
                .font(.system(size: 14, weight: .bold, design: .monospaced))
                .foregroundStyle(Theme.Color.foreground)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func historyTag(_ result: MarkResult) -> String {
        switch result.source {
        case "coach_test": return "test del coach"
        case "registered": return result.eventName ?? "carrera registrada"
        case "onboarding": return "declarado al entrar"
        default:
            switch result.runContext {
            case "treadmill": return "en cinta"
            case "outdoor": return "aire libre"
            default: return "te probaste"
            }
        }
    }

    /// The post-attempt celebration: the big number and what it beat. No confetti.
    private func newMarkCard(_ banner: (label: String, deltaLabel: String?, improved: Bool)) -> some View {
        CardSurface(padding: 16) {
            HStack(spacing: 12) {
                Image(systemName: banner.improved ? "trophy.fill" : "checkmark.circle.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(banner.improved ? Theme.Color.accent : Theme.Color.ok)
                VStack(alignment: .leading, spacing: 2) {
                    Text(banner.improved ? "Marca nueva · PR" : "Marca guardada")
                        .font(Theme.Typography.bodyEmph)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(banner.deltaLabel.map { "\(banner.label) · \($0)" }
                         ?? "\(banner.label) · Pablo la verá en tu ficha")
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                }
                Spacer()
            }
        }
    }

    // MARK: - CTA + attempt

    @ViewBuilder
    private func ctaButton(_ mark: MarkView) -> some View {
        if mark.measuredBy == "registered" {
            PrimaryButton(title: "Registrar carrera", enabled: !loading) { showRegister = true }
        } else {
            PrimaryButton(title: "Probarme ahora", enabled: !loading) {
                bestBeforeAttempt = comparableBest(mark)?.value
                if mark.measuredBy == "run" {
                    showRunPreStart = true
                } else {
                    startAttempt(environment: nil)
                }
            }
        }
    }

    private func comparableBest(_ mark: MarkView) -> MarkResult? {
        mark.group == "run" ? (mark.bestOutdoor ?? mark.bestTreadmill) : mark.best
    }

    private func startAttempt(environment: RunEnvironment?) {
        guard let mark, let context = BenchmarkLaunch.context(for: mark, environment: environment)
        else { return }
        liveContext = context
    }

    // MARK: - Data

    @MainActor
    private func load() async {
        error = nil
        do {
            mark = try await MarksService.fetchMarks(bearer: bearer).marks.first { $0.slug == slug }
        } catch {
            self.error = "No pudimos cargar la marca."
        }
        loading = false
    }

    /// After an attempt or a registration: refetch and, if a new result landed,
    /// celebrate it against the best we snapshotted before starting.
    @MainActor
    private func reloadAfterAttempt() async {
        let before = mark?.latest
        await load()
        guard let mark, let latest = mark.latest, latest != before else { return }
        let deltaLabel: String?
        let improved: Bool
        if let prev = bestBeforeAttempt,
           let delta = MarkFormat.delta(mark, from: prev, to: latest.value) {
            deltaLabel = delta.label
            improved = delta.improved
        } else {
            deltaLabel = nil
            improved = bestBeforeAttempt == nil // first ever = a PR by definition
        }
        withAnimation(Theme.Motion.reveal) {
            newMarkBanner = (MarkFormat.value(mark, latest.value), deltaLabel, improved)
        }
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
