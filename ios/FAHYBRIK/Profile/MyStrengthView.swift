import SwiftUI

// "Mi fuerza" — the athlete sees their OWN strength maxes (1RM per lift), the
// same way the coach reads them. Powered by GET /api/athlete/benchmarks
// (read-only) + POST /api/athlete/strength-test (self-enter a rep test).
//
// Honest states (mirrors MyZonesView): a spinner while loading, a clear empty
// state when the athlete hasn't tested yet (no fabricated maxes), and an error
// state with a retry when the fetch fails. The 1RM shown is always the SERVER's
// stored value — the register sheet shows an instant Epley preview, but the
// authoritative number comes back from the backend.
struct MyStrengthView: View {
    let bearer: String?

    @State private var maxes: [StrengthMaxProfile] = []
    @State private var loading = true
    @State private var failed = false
    @State private var showRegister = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            content
        }
        .navigationTitle("Mi fuerza")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showRegister = true
                } label: {
                    Label("Registrar test", systemImage: "plus")
                }
                .foregroundStyle(Theme.Color.accentText)
                .accessibilityLabel("Registrar un test de fuerza")
            }
        }
        .sheet(isPresented: $showRegister) {
            RegisterStrengthTestView(bearer: bearer) { await load() }
        }
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        if loading {
            ProgressView()
                .tint(Theme.Color.accentText)
        } else if failed {
            errorState
        } else if maxes.isEmpty {
            emptyState
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    intro
                    ForEach(maxes) { lift in
                        liftCard(lift)
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xxl)
            }
        }
    }

    // MARK: - Intro

    private var intro: some View {
        Text("Tu fuerza máxima por levantamiento. Cuando un entreno te pide un % de tu 1RM, este es el peso real que te toca.")
            .scaledFont(13, relativeTo: .footnote)
            .foregroundStyle(Theme.Color.muted)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - Lift card

    private func liftCard(_ m: StrengthMaxProfile) -> some View {
        CardSurface(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                // Header: lift + current 1RM, with the source test/date below.
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(m.exerciseLabel)
                            .scaledFont(16, weight: .heavy, relativeTo: .headline, italic: true)
                            .foregroundStyle(Theme.Color.foreground)
                        if let sub = sourceSubtitle(m) {
                            Text(sub)
                                .scaledFont(11, relativeTo: .caption2)
                                .foregroundStyle(Theme.Color.faint)
                        }
                    }
                    Spacer(minLength: 8)
                    Text(m.oneRmLabel)
                        .font(.system(size: 22, weight: .heavy, design: .default).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.accentText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .padding(.horizontal, 14)
                .padding(.top, 13)
                .padding(.bottom, 11)

                // Evolution: sparkline + prev→current + delta, only when there
                // are at least two versions to compare.
                if let evo = evolution(m) {
                    Hairline()
                    evolutionRow(evo)
                }
            }
        }
    }

    /// "130 kg × 3 · 20 jun 2026" — only the parts genuinely present.
    private func sourceSubtitle(_ m: StrengthMaxProfile) -> String? {
        var parts: [String] = []
        if let w = m.testWeightKg, let r = m.testReps, w > 0, r > 0 {
            parts.append("\(Int(w.rounded())) kg × \(r)")
        }
        if let date = m.recordedDateLabel { parts.append(date) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    // MARK: - Evolution

    /// Chronological 1RM series (oldest→newest) + prev/current for the delta.
    /// Merges `history` with the current top-level max, keyed by version so a
    /// history that does — or doesn't — include the current version both work.
    private struct Evolution {
        let values: [Double]
        let previous: Double
        let current: Double
        var delta: Double { current - previous }
    }

    private func evolution(_ m: StrengthMaxProfile) -> Evolution? {
        var byVersion: [Int: Double] = [:]
        for p in m.history { byVersion[p.version] = p.oneRmKg }
        if let v = m.version { byVersion[v] = m.oneRmKg }
        let series = byVersion.sorted { $0.key < $1.key }.map { $0.value }
        guard series.count >= 2 else { return nil }
        return Evolution(values: series, previous: series[series.count - 2], current: series[series.count - 1])
    }

    private func evolutionRow(_ evo: Evolution) -> some View {
        HStack(spacing: 12) {
            StrengthSparkline(values: evo.values)
                .frame(width: 64, height: 28)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text("Evolución")
                    .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
                Text("\(Int(evo.previous.rounded())) → \(Int(evo.current.rounded())) kg")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
            }
            Spacer(minLength: 8)
            deltaBadge(evo.delta)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Evolución, de \(Int(evo.previous.rounded())) a \(Int(evo.current.rounded())) kilos")
    }

    /// "+5 kg" green / "-3 kg" red / "0 kg" muted — direction at a glance.
    private func deltaBadge(_ delta: Double) -> some View {
        let rounded = Int(delta.rounded())
        let color: Color = rounded > 0 ? Theme.Color.ok : (rounded < 0 ? Theme.Color.danger : Theme.Color.muted)
        let sign = rounded > 0 ? "+" : ""
        return Text("\(sign)\(rounded) kg")
            .font(.system(size: 12, weight: .bold, design: .monospaced).monospacedDigit())
            .foregroundStyle(color)
    }

    // MARK: - Empty / error states

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "dumbbell")
                .font(.system(size: 30, weight: .regular))
                .foregroundStyle(Theme.Color.faint)
            Text("Aún no has registrado tu fuerza")
                .scaledFont(16, weight: .bold, relativeTo: .headline)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text("Registra un test (peso × repeticiones) y calcularemos tu 1RM al momento.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                showRegister = true
            } label: {
                Text("Registrar test")
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.accentText)
            }
            .padding(.top, 4)
        }
        .padding(.horizontal, Theme.Spacing.xxl)
    }

    private var errorState: some View {
        VStack(spacing: 10) {
            Text("No pudimos cargar tu fuerza")
                .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.foreground)
            Button("Reintentar") { Task { await load() } }
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.accentText)
        }
        .padding(.horizontal, Theme.Spacing.xxl)
    }

    // MARK: - Load

    private func load() async {
        guard let bearer else { loading = false; failed = true; return }
        loading = true
        failed = false
        do {
            maxes = try await StrengthService.fetch(bearer: bearer)
        } catch {
            failed = true
        }
        loading = false
    }
}

// A minimal line sparkline over a lift's 1RM history (oldest→newest). Drawn in
// the brand accent with a trailing dot on the latest value; decorative, so the
// row carries the accessible label. A tiny vertical inset keeps the stroke and
// dot from clipping at the frame edges.
private struct StrengthSparkline: View {
    let values: [Double]

    var body: some View {
        GeometryReader { geo in
            let pts = points(in: geo.size)
            ZStack {
                Path { path in
                    guard let first = pts.first else { return }
                    path.move(to: first)
                    for pt in pts.dropFirst() { path.addLine(to: pt) }
                }
                .stroke(
                    Theme.Color.accentText,
                    style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round)
                )
                if let last = pts.last {
                    Circle()
                        .fill(Theme.Color.accentText)
                        .frame(width: 4, height: 4)
                        .position(last)
                }
            }
        }
    }

    private func points(in size: CGSize) -> [CGPoint] {
        guard values.count > 1 else { return [] }
        let inset: CGFloat = 3
        let minV = values.min() ?? 0
        let maxV = values.max() ?? 1
        let range = max(maxV - minV, 0.0001)
        let usableH = max(size.height - inset * 2, 1)
        let stepX = size.width / CGFloat(values.count - 1)
        return values.enumerated().map { index, value in
            let x = CGFloat(index) * stepX
            let y = inset + (usableH - CGFloat((value - minV) / range) * usableH)
            return CGPoint(x: x, y: y)
        }
    }
}

// "Registrar test de fuerza" — the athlete self-enters a lift + weight × reps.
// The backend computes & stores the 1RM (the coach's formula is authoritative);
// the live "1RM estimado" here is an instant Epley preview only. On success the
// parent re-fetches so "Mi fuerza" reflects it.
struct RegisterStrengthTestView: View {
    let bearer: String?
    /// Called after a successful save so the host can re-fetch the maxes.
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var exerciseSlug: String = StrengthService.STRENGTH_LIFTS[0].slug
    @State private var weightKg: Double? = nil
    @State private var reps: Int = 5
    @State private var saving = false
    @State private var errorText: String? = nil

    private let repsRange = 1...20
    private var canSave: Bool { (weightKg ?? 0) > 0 && repsRange.contains(reps) && !saving }

    /// "≈ 117 kg" instant Epley preview, or nil until the inputs are valid.
    private var estimatePreview: String? {
        guard let w = weightKg, w > 0, repsRange.contains(reps) else { return nil }
        let est = StrengthService.estimatedOneRm(weightKg: w, reps: reps)
        let value = est.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(est))
            : String(format: "%.1f", est)
        return "≈ \(value) kg"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    liftPicker
                    testInputs
                    estimateBlock

                    if let errorText {
                        Text(errorText)
                            .scaledFont(12, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.danger)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .background(Theme.Color.background.ignoresSafeArea())
            .navigationTitle("Registrar fuerza")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancelar") { dismiss() }
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .safeAreaInset(edge: .bottom) {
                ExpertPrimaryButton(
                    title: saving ? "GUARDANDO…" : "GUARDAR TEST",
                    height: 46,
                    enabled: canSave,
                    action: save
                )
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.m)
            }
        }
    }

    // MARK: - Sections

    private var liftPicker: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text("Levantamiento")
                .font(Theme.Typography.dataLabel)
                .uppercaseTracked()
                .foregroundStyle(Theme.Color.muted)
            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)],
                spacing: 6
            ) {
                ForEach(StrengthService.STRENGTH_LIFTS) { lift in
                    Button {
                        exerciseSlug = lift.slug
                        Haptics.light()
                    } label: {
                        Text(lift.label)
                            .scaledFont(12, weight: .semibold, relativeTo: .caption)
                            .foregroundStyle(exerciseSlug == lift.slug ? Theme.Color.accentOn : Theme.Color.foreground)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .background(exerciseSlug == lift.slug ? Theme.Color.accent : Theme.Color.surfaceElevated)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(lift.label)
                    .accessibilityAddTraits(exerciseSlug == lift.slug ? .isSelected : [])
                }
            }
        }
    }

    private var testInputs: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text("Resultado del test")
                .font(Theme.Typography.dataLabel)
                .uppercaseTracked()
                .foregroundStyle(Theme.Color.muted)
            VStack(spacing: 0) {
                NumberRow(label: "Peso levantado", unit: "kg", value: $weightKg)
                LabeledRow(label: "Repeticiones") {
                    HStack(spacing: 10) {
                        Text("\(reps)")
                            .font(Theme.Typography.bodyEmph.monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                            .frame(minWidth: 24)
                        Stepper("", value: $reps, in: repsRange)
                            .labelsHidden()
                            .tint(Theme.Color.accent)
                    }
                }
            }
            .brandSurface()
            Text("El peso máximo que moviste y cuántas repeticiones limpias hiciste. Con eso estimamos tu 1RM.")
                .scaledFont(12, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.faint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var estimateBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("1RM estimado")
                .font(Theme.Typography.dataLabel)
                .uppercaseTracked()
                .foregroundStyle(Theme.Color.muted)
            Text(estimatePreview ?? "—")
                .font(.system(size: 28, weight: .heavy, design: .default).italic().monospacedDigit())
                .foregroundStyle(Theme.Color.accentText)
            Text("Estimación Epley al momento. Tu coach guarda el valor definitivo (puede usar otra fórmula).")
                .scaledFont(12, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.faint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Save

    private func save() {
        guard let bearer, let w = weightKg, w > 0, repsRange.contains(reps), !saving else { return }
        saving = true
        errorText = nil
        Task {
            do {
                _ = try await StrengthService.submitTest(
                    exerciseSlug: exerciseSlug,
                    weightKg: w,
                    reps: reps,
                    bearer: bearer
                )
                await onSaved()
                dismiss()
            } catch {
                errorText = "No pudimos guardar el test. Revisa tu conexión e inténtalo de nuevo."
                saving = false
            }
        }
    }
}
