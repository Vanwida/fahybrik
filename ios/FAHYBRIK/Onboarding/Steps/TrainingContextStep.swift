import SwiftUI

struct TrainingContextStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 8,
            title: "Contexto",
            subtitle: "Volumen y disponibilidad",
            hint: nil,
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(spacing: 0) {
                IntRow(label: "Días / semana", unit: "días", value: $state.daysPerWeek)
                NumberRow(label: "Horas / sesión", unit: "h", value: $state.hoursPerSession)
            }
            .brandSurface()

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Equipamiento")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)
                ChipFlow(
                    options: EquipmentAccess.allCases,
                    label: \.label,
                    selection: $state.equipmentAccess
                )
            }
            .padding(.top, Theme.Spacing.l)

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Lesiones / limitaciones")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)
                TextField("p.ej. evitar BBJ por tendón rotuliano",
                          text: $state.injuriesNotes, axis: .vertical)
                    .lineLimit(2...4)
                    .padding(Theme.Spacing.m)
                    .background(Theme.Color.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                    .foregroundStyle(Theme.Color.foreground)
            }
            .padding(.top, Theme.Spacing.l)
        }
    }
}
