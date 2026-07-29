import SwiftUI

// Step 17 (index 16) — "Tu objetivo". The race that anchors the plan. PRIMARY
// path is the official calendar (the SAME BuscarCarreraSheet → FijarObjetivoView
// the Carreras hub uses): pick the event + format/division/category + optional
// goal time → it persists SERVER-SIDE (setTarget) immediately, so the coach
// report picks it up without an onboarding-submit dependency.
//
// FALLBACK ("añádela a mano"): when the race isn't in the calendar, the athlete
// types it free-text — name/date/division/objective — which round-trips through
// the onboarding snapshot (races[] + a_event_*). Fixing a calendar target clears
// any half-typed manual entry so we never submit two competing targets.
//
// Fully optional: skip it and onboard with no objective.
struct ObjectiveStep: View {
    @Bindable var state: OnboardingState
    var bearer: String?
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    @State private var showCatalog = false
    @State private var showManual = false

    var body: some View {
        StepShell(
            stepIndex: 16,
            title: "Tu objetivo",
            subtitle: "La carrera que ancla tu plan",
            hint: nil,
            primaryEnabled: true,
            skipTitle: state.targetRaceFixed ? nil : "Sin objetivo por ahora",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            if state.targetRaceFixed {
                fixed
            } else {
                chooser
            }
        }
        .sheet(isPresented: $showCatalog) {
            BuscarCarreraSheet(bearer: bearer) {
                // The calendar target is now the source of truth — drop any
                // half-typed manual fallback so the snapshot can't submit a
                // duplicate target race.
                state.targetRaceFixed = true
                clearManualEntry()
                showManual = false
            }
        }
    }

    // MARK: - No target yet

    private var chooser: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            RaceActionCard(
                icon: "flag.checkered",
                title: "Buscar en el calendario",
                subtitle: "Elige tu carrera del calendario oficial y fíjala como objetivo. Tu cuenta atrás y tu plan se enfocan en ella.",
                action: { showCatalog = true }
            )

            if showManual {
                manualForm
            } else {
                RaceInlineLink(icon: "square.and.pencil", title: "¿No la encuentras? Añádela a mano") {
                    withAnimation(.easeInOut(duration: 0.2)) { showManual = true }
                }
            }
        }
    }

    private var manualForm: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            AEventManualForm(state: state)
            RaceInlineLink(icon: "magnifyingglass", title: "Mejor buscarla en el calendario") {
                clearManualEntry()
                withAnimation(.easeInOut(duration: 0.2)) { showManual = false }
            }
        }
    }

    // MARK: - Target fixed (via calendar)

    private var fixed: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            RaceDoneCard(
                title: "Carrera objetivo fijada",
                subtitle: "Tu cuenta atrás y tu plan se enfocan en ella. Puedes cambiarla cuando quieras."
            )
            RaceInlineLink(icon: "arrow.clockwise", title: "Cambiar de carrera") {
                showCatalog = true
            }
        }
    }

    // MARK: - Helpers

    private func clearManualEntry() {
        state.aEventName = ""
        state.aEventDate = nil
        state.aEventDivision = nil
        state.goalKind = nil
        state.goalTimeSeconds = nil
    }
}

// MARK: - Manual A-event fallback form
//
// The free-text A-event entry, extracted from the former standalone AEventStep
// so it can live inside the objective step as the "añádela a mano" fallback.
// Name/date/division/objective bind straight to the snapshot fields, so a manual
// entry submits as the target race on onboarding finish.
struct AEventManualForm: View {
    @Bindable var state: OnboardingState

    /// Range vs exact selection for the "Tiempo objetivo" goal kind. Kept local —
    /// the resolved seconds live in `state.goalTimeSeconds` (the submitted field).
    @State private var goalChoice: GoalChoice? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            VStack(spacing: 0) {
                TextRow(label: "Evento", placeholder: "Nombre de la carrera", value: $state.aEventName)

                DateRow(
                    label: "Fecha",
                    value: $state.aEventDate,
                    range: Date()...Date(timeIntervalSinceNow: 60 * 60 * 24 * 365 * 4)
                )

                LabeledRow(label: "División") {
                    HStack(spacing: 6) {
                        ForEach(HyroxDivision.allCases) { d in
                            Chip(title: d.label, selected: state.aEventDivision == d) {
                                state.aEventDivision = (state.aEventDivision == d) ? nil : d
                            }
                        }
                    }
                }
            }
            .brandSurface()

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                SectionLabel("Objetivo")
                VStack(spacing: 0) {
                    ForEach(GoalKind.allCases) { g in
                        RadioRow(title: g.label, selected: state.goalKind == g) {
                            state.goalKind = (state.goalKind == g) ? nil : g
                        }
                    }
                }
                .brandSurface()

                if state.goalKind == .time {
                    goalTimeInput
                }
            }
        }
    }

    // Range presets (sub-60…sub-90) for the "Tiempo objetivo" kind, with the
    // exact h:mm:ss field as the "tiempo exacto" fallback. Both write the SAME
    // `state.goalTimeSeconds` field the snapshot submits.
    private var goalTimeInput: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            GoalPresetGrid(choice: $goalChoice)

            if case .exact = goalChoice {
                VStack(spacing: 0) {
                    TimeHourMinSecRow(label: "Tiempo objetivo", seconds: $state.goalTimeSeconds)
                }
                .brandSurface()
            } else {
                GoalExactLink {
                    withAnimation(.easeInOut(duration: 0.18)) { goalChoice = .exact }
                }
            }
        }
        .onChange(of: goalChoice) { _, new in
            if case .preset(let preset) = new { state.goalTimeSeconds = preset.seconds }
        }
        .onAppear {
            // Re-entering the step: pre-select the rung a stored time matches, else
            // fall to the exact field when a non-rung time already exists.
            if goalChoice == nil, let secs = state.goalTimeSeconds {
                goalChoice = GoalPreset.matching(secs).map { .preset($0) } ?? .exact
            }
        }
    }
}
