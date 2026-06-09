import SwiftUI

struct EnduranceBenchmarksStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 12,
            title: "Resistencia",
            subtitle: "Mejores marcas",
            hint: "Cualquier campo vacío → batería de tests primera semana.",
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Running")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)
                VStack(spacing: 0) {
                    TimeMinSecRow(label: "5K", seconds: $state.time5kSeconds)
                    TimeMinSecRow(label: "10K", seconds: $state.time10kSeconds)
                    TimeHourMinSecRow(label: "Media maratón", seconds: $state.timeHalfSeconds)
                    TimeHourMinSecRow(label: "Maratón", seconds: $state.timeMarathonSeconds)
                }
                .brandSurface()
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Concept2")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)
                VStack(spacing: 0) {
                    TimeMinSecRow(label: "2K row", seconds: $state.time2kRowSeconds)
                    TimeMinSecRow(label: "1K row", seconds: $state.time1kRowSeconds)
                    TimeMinSecRow(label: "1K ski erg", seconds: $state.time1kSkiSeconds)
                    TimeMinSecRow(label: "500m ski erg", seconds: $state.time500mSkiSeconds)
                }
                .brandSurface()
            }
            .padding(.top, Theme.Spacing.l)
        }
    }
}
