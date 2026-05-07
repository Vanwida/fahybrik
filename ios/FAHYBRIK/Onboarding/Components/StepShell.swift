import SwiftUI

struct StepShell<Content: View>: View {
    let stepIndex: Int
    let title: String
    let subtitle: String?
    let hint: String?
    var primaryTitle: String = "Siguiente"
    var primaryEnabled: Bool = true
    var skipTitle: String? = nil
    let onBack: (() -> Void)?
    let onPrimary: () -> Void
    let onSkip: (() -> Void)?
    @ViewBuilder let content: () -> Content

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                StepHeader(
                    stepNumber: stepIndex + 1,
                    totalSteps: OnboardingState.totalSteps,
                    onBack: onBack
                )

                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(title)
                                .font(Theme.Typography.headlineL)
                                .foregroundStyle(Theme.Color.foreground)
                            if let subtitle {
                                Text(subtitle)
                                    .font(Theme.Typography.body)
                                    .foregroundStyle(Theme.Color.muted)
                            }
                        }
                        .padding(.top, Theme.Spacing.l)

                        if let hint {
                            Text(hint)
                                .font(Theme.Typography.small)
                                .italic()
                                .foregroundStyle(Theme.Color.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        content()
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.bottom, Theme.Spacing.xxl)
                }

                VStack(spacing: Theme.Spacing.m) {
                    if let skipTitle, let onSkip {
                        SkipLink(title: skipTitle, action: onSkip)
                    }
                    ProgressDots(total: OnboardingState.totalSteps, current: stepIndex)
                    PrimaryButton(title: primaryTitle, enabled: primaryEnabled, action: onPrimary)
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.bottom, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.m)
            }
        }
    }
}
