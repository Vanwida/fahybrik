import SwiftUI

struct RecoveryStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    private var stressBinding: Binding<Int> {
        Binding(
            get: { state.subjectiveStress ?? 5 },
            set: { state.subjectiveStress = $0 }
        )
    }

    var body: some View {
        StepShell(
            stepIndex: 9,
            title: "Recovery",
            subtitle: "Sueño, estrés, dispositivos",
            hint: nil,
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(spacing: 0) {
                NumberRow(label: "Sueño promedio", unit: "h", value: $state.sleepHoursAvg)

                LabeledRow(label: "Estrés (1-10)") {
                    HStack(spacing: 4) {
                        Text("\(stressBinding.wrappedValue)")
                            .font(Theme.Typography.bodyEmph.monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                            .frame(width: 24)
                        Stepper("", value: stressBinding, in: 1...10)
                            .labelsHidden()
                    }
                }

                LabeledRow(label: "HRV measured?") {
                    HStack(spacing: 6) {
                        Chip(title: "Sí", selected: state.hrvMeasured == true) {
                            state.hrvMeasured = (state.hrvMeasured == true) ? nil : true
                        }
                        Chip(title: "No", selected: state.hrvMeasured == false) {
                            state.hrvMeasured = (state.hrvMeasured == false) ? nil : false
                        }
                    }
                }
            }
            .brandSurface()

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Dispositivos")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)
                ChipFlow(
                    options: DeviceBrand.allCases,
                    label: \.label,
                    selection: $state.devicesOwned
                )
            }
            .padding(.top, Theme.Spacing.l)
        }
    }
}
