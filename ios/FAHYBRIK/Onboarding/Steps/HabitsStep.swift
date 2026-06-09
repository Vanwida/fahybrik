import SwiftUI

// Step 4 — Hábitos. Subjective 1-10 baselines that feed readiness modeling and
// load tolerance. Sliders, not free text, so the IA can reason on them.
struct HabitsStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 3,
            title: "Tus hábitos",
            subtitle: "Cómo descansas y cuánto te puedes comprometer",
            hint: nil,
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(spacing: 0) {
                NumberRow(
                    label: "Horas de sueño / noche",
                    unit: "h",
                    value: $state.sleepHoursAvg
                )
                SliderRow(
                    label: "Calidad del sueño",
                    value: $state.sleepQuality,
                    minLabel: "Mala",
                    maxLabel: "Excelente"
                )
                SliderRow(
                    label: "Nivel de estrés",
                    value: $state.stressLevel,
                    minLabel: "Bajo",
                    maxLabel: "Alto"
                )
                SliderRow(
                    label: "Compromiso",
                    value: $state.commitmentLevel,
                    minLabel: "Flexible",
                    maxLabel: "Todo dentro"
                )
            }
            .brandSurface()
        }
    }
}
