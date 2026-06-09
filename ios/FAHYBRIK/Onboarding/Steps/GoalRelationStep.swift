import SwiftUI

// Step 3 — Relación con el deporte. The athlete's intent + how they relate to
// the two pillars (running, strength). Shapes the whole prescription bias.
struct GoalRelationStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 2,
            title: "Tu relación con el deporte",
            subtitle: "Qué buscas y de dónde vienes",
            hint: nil,
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                SectionLabel("¿Qué te trae aquí?")
                VStack(spacing: 0) {
                    ForEach(OnbGoalType.allCases, id: \.self) { g in
                        RadioRow(
                            title: goalLabel(g),
                            selected: state.goalType == g
                        ) {
                            state.goalType = (state.goalType == g) ? nil : g
                        }
                    }
                    if state.goalType == .other {
                        TextRow(
                            label: "Cuéntanos",
                            placeholder: "tu objetivo",
                            value: $state.goalOtherText
                        )
                    }
                }
                .brandSurface()
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                SectionLabel("Correr")
                ChoiceGrid(
                    options: RunExperience.allCases,
                    label: runLabel,
                    isSelected: { state.runExperience == $0 },
                    onTap: { state.runExperience = (state.runExperience == $0) ? nil : $0 }
                )
            }
            .padding(.top, Theme.Spacing.l)

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                SectionLabel("Fuerza")
                ChoiceGrid(
                    options: StrengthExperience.allCases,
                    label: strengthLabel,
                    isSelected: { state.strengthExperience == $0 },
                    onTap: { state.strengthExperience = (state.strengthExperience == $0) ? nil : $0 }
                )
            }
            .padding(.top, Theme.Spacing.l)
        }
    }

    private func goalLabel(_ g: OnbGoalType) -> String {
        switch g {
        case .firstHyrox: return "Mi primera HYROX"
        case .improveHyroxMark: return "Mejorar mi marca HYROX"
        case .improveRunning: return "Mejorar mi running"
        case .completeFun: return "Completar y disfrutar"
        case .other: return "Otro"
        }
    }

    private func runLabel(_ r: RunExperience) -> String {
        switch r {
        case .enthusiast: return "Me encanta"
        case .comfortable: return "Cómodo"
        case .reluctant: return "A regañadientes"
        case .none: return "Nada"
        }
    }

    private func strengthLabel(_ s: StrengthExperience) -> String {
        switch s {
        case .lovesLifting: return "Me encanta levantar"
        case .weeklyIsh: return "Semanal-ish"
        case .withGuidance: return "Con guía"
        case .none: return "Nada"
        }
    }
}
