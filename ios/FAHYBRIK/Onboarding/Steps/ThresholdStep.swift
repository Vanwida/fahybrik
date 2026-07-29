import SwiftUI

// Step 7 — Anaeróbico / umbral. Optional benchmarks Pablo uses to dial Z3-Z5
// targets and zone caps. Aligns with design system ONBOARDING_STEPS.threshold.
struct ThresholdStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 13,
            title: "Anaeróbico / umbral",
            subtitle: "Tests si tienes datos. Si no, batería en w1.",
            hint: "FTP, FC umbral, ritmo umbral o 1 milla a tope son intercambiables.",
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Umbral")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)
                VStack(spacing: 0) {
                    IntRow(label: "FTP", unit: "W", value: $state.ftpWatts)
                    IntRow(label: "FC umbral", unit: Vocab.ppm, value: $state.lthrBpm)
                    TimeMinSecRow(label: "Ritmo umbral", seconds: $state.thresholdPaceSecondsPerKm)
                }
                .brandSurface()
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Tests")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)
                VStack(spacing: 0) {
                    TimeMinSecRow(label: "1 milla a tope", seconds: $state.time1MileSeconds)
                    IntRow(label: "\(Vocab.fcMax) (test)", unit: Vocab.ppm, value: $state.maxHrBpm)
                }
                .brandSurface()
            }
            .padding(.top, Theme.Spacing.l)
        }
    }
}
