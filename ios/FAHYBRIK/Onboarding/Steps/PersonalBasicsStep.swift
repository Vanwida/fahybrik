import SwiftUI

struct PersonalBasicsStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 1,
            title: "Lo básico",
            subtitle: "Datos personales para el modelo",
            hint: nil,
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(spacing: 0) {
                TextRow(label: "Nombre", placeholder: "Tu nombre", value: $state.fullName)

                DateRow(
                    label: "Fecha nac.",
                    value: $state.dateOfBirth,
                    range: Date(timeIntervalSince1970: -2_208_988_800)...Date()
                )

                LabeledRow(label: "Sexo") {
                    HStack(spacing: 6) {
                        ForEach(Sex.allCases) { s in
                            Chip(title: s.label, selected: state.sex == s) {
                                state.sex = (state.sex == s) ? nil : s
                            }
                        }
                    }
                }

                IntRow(label: "Altura", unit: "cm", value: $state.heightCm)

                NumberRow(label: "Peso", unit: "kg", value: $state.weightKg)
            }
            .brandSurface()
        }
    }
}
