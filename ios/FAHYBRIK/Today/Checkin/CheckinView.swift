import SwiftUI

// Daily Morning Check-in per docs/ux/07-daily-morning-checkin.md.
// Full-screen, 5 segmented 1-5 questions + notes + CTA. "Saltar" link is
// muted (soft-required). Notes draft auto-saves on every change.
struct CheckinView: View {
    @State private var answers = CheckinAnswers()
    @FocusState private var notesFocused: Bool

    let bearer: String?
    let onSubmitted: (Int, CheckinSnapshot) -> Void
    let onSkipped: () -> Void
    /// Fires AFTER the server has ingested (or definitively rejected) the
    /// check-in — the moment a readiness refetch actually returns the recomputed
    /// score. `onSubmitted` fires immediately (dismissal must never wait on the
    /// network); refreshing readiness there raced the in-flight POST and
    /// re-fetched the OLD score, which read as "el check-in no hace nada".
    var onServerSynced: () async -> Void = {}

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                    headline
                    // Every row reads the same way: 1 = peor, 5 = mejor. Soreness
                    // and fatigue are negatively keyed in the model (5 = worst),
                    // so they bind inverted and are reframed positive (recuperación
                    // / energía) — the athlete never has to flip the scale's
                    // meaning between questions.
                    questionRow(
                        title: "Recuperación muscular",
                        binding: invertedBind(\.soreness),
                        leftHint: "1 dolorido",
                        rightHint: "5 recuperado"
                    )
                    questionRow(
                        title: "Ánimo",
                        binding: bind(\.mood),
                        leftHint: "1 mal",
                        rightHint: "5 genial"
                    )
                    questionRow(
                        title: "Motivación",
                        binding: bind(\.motivation),
                        leftHint: "1 cero",
                        rightHint: "5 a tope"
                    )
                    questionRow(
                        title: "Energía",
                        binding: invertedBind(\.fatigue),
                        leftHint: "1 agotado",
                        rightHint: "5 a tope"
                    )
                    questionRow(
                        title: "Calidad del sueño",
                        binding: bind(\.sleepQuality),
                        leftHint: "1 mal",
                        rightHint: "5 perfecto"
                    )
                    notesField
                    submitArea
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.xxl)
                .padding(.bottom, Theme.Spacing.xxl)
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Hecho") { notesFocused = false }
                    .foregroundStyle(Theme.Color.accentText)
            }
        }
        .onAppear {
            answers.notes = CheckinStore.loadDraftNotes()
        }
        // Explicit, findable escape (top-leading "Cerrar") for the auto-presented
        // morning check-in — a MANUAL dismiss that leaves the pending banner up,
        // distinct from the bottom "Saltar" (which clears it for the day).
        .dismissableSheet()
    }

    // MARK: - Sections

    private var headline: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text("Buenos días.")
                .font(Theme.Typography.headlineL)
                .foregroundStyle(Theme.Color.foreground)
            Text("¿Cómo te sientes hoy?")
                .font(Theme.Typography.body)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    private func questionRow(
        title: String,
        binding: Binding<Int?>,
        leftHint: String,
        rightHint: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.foreground)
            Scale1to5Picker(
                value: binding,
                leftHint: leftHint,
                rightHint: rightHint
            )
        }
    }

    private var notesField: some View {
        VStack(alignment: .leading, spacing: 8) {
            LabelText(text: "Notas (opc)")
            ZStack(alignment: .topLeading) {
                if answers.notes.isEmpty {
                    Text("p.ej. quemado pierna izq desde ayer")
                        .scaledFont(14, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted.opacity(0.7))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                }
                TextEditor(text: Binding(
                    get: { answers.notes },
                    set: { newValue in
                        answers.notes = newValue
                        CheckinStore.saveDraftNotes(newValue)
                    }
                ))
                .focused($notesFocused)
                .scrollContentBackground(.hidden)
                .scaledFont(14, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.foreground)
                .frame(minHeight: 84)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
            }
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.outline, lineWidth: 1)
            )
        }
    }

    private var submitArea: some View {
        VStack(spacing: Theme.Spacing.m) {
            ExpertPrimaryButton(
                title: "CONTINUAR",
                enabled: answers.allAnswered
            ) {
                let score = answers.subScore
                let snap = answers.snapshot(score: score)
                CheckinStore.markCompleted(score: score)
                let bearerCopy = bearer
                Haptics.success()
                onSubmitted(score, snap)
                let synced = onServerSynced
                Task {
                    await CheckinAPI.submit(snap, bearer: bearerCopy)
                    await synced()
                }
            }

            Button(action: {
                Haptics.light()
                CheckinStore.markSkipped()
                onSkipped()
            }) {
                Text("Saltar")
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .underline()
            }
            .buttonStyle(.plain)
        }
        .padding(.top, Theme.Spacing.l)
    }

    private func bind(_ kp: ReferenceWritableKeyPath<CheckinAnswers, Int?>) -> Binding<Int?> {
        Binding(get: { answers[keyPath: kp] }, set: { answers[keyPath: kp] = $0 })
    }

    /// Inverted 1–5 binding for the negatively-keyed wellness fields (soreness,
    /// fatigue). The model + submitted snapshot keep the RAW semantic (5 = worst)
    /// so the backend contract and `subScore` are untouched; the UI shows them
    /// reframed positive (5 = best) so EVERY row's "good" end is 5. 1↔5, 2↔4, 3↔3.
    private func invertedBind(_ kp: ReferenceWritableKeyPath<CheckinAnswers, Int?>) -> Binding<Int?> {
        Binding(
            get: { answers[keyPath: kp].map { 6 - $0 } },
            set: { answers[keyPath: kp] = $0.map { 6 - $0 } }
        )
    }
}
