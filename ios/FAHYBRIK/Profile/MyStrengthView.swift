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
//
// AQUÍ SE QUEDA QUIÉN ERES, NO CÓMO HAS CAMBIADO. La evolución de cada 1RM
// (curva + delta) vivía en esta pantalla, tres toques por debajo de Perfil, que
// es donde nadie va a preguntarse si está progresando. Se ha ido a Analíticas ›
// Fuerza, que es la pestaña que existe para esa pregunta — la misma regla que
// puso el VO₂máx en Analíticas dejando su número en Perfil. Lo que queda aquí es
// el peso de hoy, que es el que gobierna los porcentajes del próximo entreno.
struct MyStrengthView: View {
    let bearer: String?
    /// FREE tier switch (athlete without coach) — the register-test note must
    /// not name a coach that does not exist.
    var hasCoach: Bool = true

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
            RegisterStrengthTestView(bearer: bearer, hasCoach: hasCoach) { await load() }
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
        VStack(alignment: .leading, spacing: 6) {
            Text("Tu fuerza máxima por levantamiento. Cuando un entreno te pide un % de tu 1RM, este es el peso real que te toca.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            // Lo que se llevó Analíticas se dice, y se dice dónde: una pantalla
            // que pierde una lectura sin decir a dónde fue la deja huérfana.
            Text("Cómo ha ido subiendo cada uno, en Analíticas · Fuerza.")
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.faint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Lift card

    private func liftCard(_ m: StrengthMaxProfile) -> some View {
        CardSurface(padding: 0) {
            // El levantamiento y su peso de hoy, con el origen del número debajo.
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
            .padding(.vertical, 13)
        }
    }

    /// "130 kg × 3 · 20 jun 2026" — only the parts genuinely present.
    ///
    /// El sello de origen sale cuando el número NO lo midió el propio atleta. Un
    /// 1RM declarado al entrar llega sin peso ni repeticiones (no hubo test), así
    /// que sin sello se pintaba con la fecha a secas — idéntico a uno que sí se
    /// levantó. Misma grafía que en Marcas (`DataOrigin`).
    private func sourceSubtitle(_ m: StrengthMaxProfile) -> String? {
        var parts: [String] = []
        if let w = m.testWeightKg, let r = m.testReps, w > 0, r > 0 {
            parts.append("\(Int(w.rounded())) kg × \(r)")
        }
        if let date = m.recordedDateLabel { parts.append(date) }
        if m.source != DataOrigin.athleteTest, let origin = DataOrigin.label(m.source) {
            parts.append(origin)
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    // MARK: - Empty / error states

    private var emptyState: some View {
        CenteredScreen {
            RedesignEmptyState(
                symbol: "dumbbell",
                title: "Aún no has registrado tu fuerza",
                message: "Registra un test (peso × repeticiones) y calcularemos tu 1RM al momento.",
                exit: .action(title: "Registrar test") { showRegister = true }
            )
        }
    }

    private var errorState: some View {
        CenteredScreen {
            RedesignEmptyState(
                symbol: "arrow.clockwise",
                title: "No pudimos cargar tu fuerza",
                message: "Revisa tu conexión e inténtalo de nuevo.",
                exit: .action(title: "Reintentar") { Task { await load() } }
            )
        }
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

// "Registrar test de fuerza" — the athlete self-enters a lift + weight × reps.
// The backend computes & stores the 1RM (the coach's formula is authoritative);
// the live "1RM estimado" here is an instant Epley preview only. On success the
// parent re-fetches so "Mi fuerza" reflects it.
struct RegisterStrengthTestView: View {
    let bearer: String?
    /// FREE: the definitive value is stored by the app, not "tu coach".
    var hasCoach: Bool = true
    /// Called after a successful save so the host can re-fetch the maxes.
    let onSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var exerciseSlug: String = StrengthService.STRENGTH_LIFTS[0].slug
    @State private var weightKg: Double? = nil
    /// Starts EMPTY, like the weight beside it. A stepper parked on 5 turned a real
    /// 100×3 into 100×5 the moment the athlete didn't touch it — 116,7 kg estimated
    /// instead of 110, and that number governs the strength % of the next plan.
    @State private var reps: Int? = nil
    @State private var saving = false
    @State private var errorText: String? = nil

    private let repsRange = 1...20
    private var canSave: Bool {
        (weightKg ?? 0) > 0 && reps.map(repsRange.contains) == true && !saving
    }

    /// "≈ 117 kg" instant Epley preview, or nil until the inputs are valid.
    private var estimatePreview: String? {
        guard let w = weightKg, w > 0, let reps, repsRange.contains(reps) else { return nil }
        let est = StrengthService.estimatedOneRm(weightKg: w, reps: reps)
        let value = Formato.esDecimal(est)
        return "≈ \(value) kg"
    }

    /// Lo que falta para que haya estimación, dicho como el acto que lo llena
    /// (§6.2 bis). Nil cuando ya se puede estimar.
    private var estimateMissing: String? {
        if let reps, !repsRange.contains(reps) {
            return "Las repeticiones van de \(repsRange.lowerBound) a \(repsRange.upperBound)"
        }
        switch ((weightKg ?? 0) <= 0, reps == nil) {
        case (true, true):   return "Escribe el peso y las repeticiones"
        case (true, false):  return "Escribe el peso que moviste"
        case (false, true):  return "Escribe cuántas repeticiones hiciste"
        case (false, false): return nil
        }
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
            .anchoredAction {
                ExpertPrimaryButton(
                    title: saving ? "GUARDANDO…" : "GUARDAR TEST",
                    height: 46,
                    enabled: canSave,
                    action: save
                )
            }
        }
        .compactSheet()
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
                // The shared row both fields deserve: it starts EMPTY (its text
                // field shows the placeholder until you type), which a stepper
                // parked on a number does not.
                IntRow(label: "Repeticiones", unit: "", value: $reps)
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
            // Hasta que no están los dos datos no hay 1RM que estimar. En vez de
            // una raya de 28 puntos, la línea dice qué falta por escribir.
            if let preview = estimatePreview {
                Text(preview)
                    .font(.system(size: 28, weight: .heavy, design: .default).italic().monospacedDigit())
                    .foregroundStyle(Theme.Color.accentText)
            } else if let missing = estimateMissing {
                Text(missing)
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(hasCoach
                 ? "Estimación Epley al momento. Tu coach guarda el valor definitivo (puede usar otra fórmula)."
                 : "Estimación al momento. El valor definitivo se calcula al guardar.")
                .scaledFont(12, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.faint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Save

    private func save() {
        guard let bearer, let w = weightKg, w > 0,
              let reps, repsRange.contains(reps), !saving else { return }
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
