import SwiftUI

struct AthleticBackgroundStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 2,
            title: "Trayectoria",
            subtitle: "Cuánto y qué entrenas",
            hint: nil,
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(spacing: 0) {
                IntRow(label: "Años entrenando", unit: "años", value: $state.trainingYears)
                IntRow(label: "Horas / semana", unit: "h", value: $state.hoursPerWeek)
            }
            .brandSurface()

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Disciplina principal")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)

                ChipFlow(
                    options: Discipline.allCases,
                    label: \.label,
                    selection: Binding(
                        get: { state.primaryDiscipline.map { Set([$0]) } ?? [] },
                        set: { state.primaryDiscipline = $0.first }
                    )
                )
            }
            .padding(.top, Theme.Spacing.l)
        }
    }
}
