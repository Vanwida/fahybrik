import SwiftUI

// The chassis every onboarding step is built on: pinned progress header · the
// question at the top · the answer centred in the height the question leaves
// over · the action anchored at the bottom.
//
// ARQUETIPO Configurar · altura `centra` (docs/CONTRATO-UI.md §6). Half the
// steps are four rows inside one card — "tus hábitos", "estaciones", "umbral" —
// and the scroll used to top-align them, so a third of the phone said nothing
// under the last row. Now the leftover is spent centring the form: the title
// still lands in the same place on every step, so the flow does not jump as you
// advance, and the form sits where the eye and the thumb already are.
//
// The footer is `.anchoredAction`, not the hand-rolled `VStack` + guessed
// bottom padding this shell used to carry: `safeAreaInset` both places the bar
// outside the scroll AND grows the scroll's content inset, so nothing can end
// up hidden underneath it at large Dynamic Type.
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

            CenteredScreen {
                StepHeader(
                    stepNumber: stepIndex + 1,
                    totalSteps: OnboardingState.totalSteps,
                    onBack: onBack
                )
            } lead: {
                question
            } content: {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    content()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.vertical, Theme.Spacing.l)
            }
            .anchoredAction {
                VStack(spacing: Theme.Spacing.m) {
                    if let skipTitle, let onSkip {
                        SkipLink(title: skipTitle, action: onSkip)
                    }
                    ProgressDots(total: OnboardingState.totalSteps, current: stepIndex)
                    PrimaryButton(title: primaryTitle, enabled: primaryEnabled, action: onPrimary)
                }
                // 16 (the footer's own inset) + 8 = the 24 pt gutter the form uses.
                .padding(.horizontal, Theme.Spacing.s)
            }
        }
    }

    // Scrolls with the content — it is not pinned — so at accessibility text
    // sizes a three-line headline can be scrolled past instead of eating the
    // screen the form needs.
    private var question: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text(title)
                    .font(Theme.Typography.headlineL)
                    .foregroundStyle(Theme.Color.foreground)
                if let subtitle {
                    Text(subtitle)
                        .font(Theme.Typography.body)
                        .foregroundStyle(Theme.Color.muted)
                }
            }

            if let hint {
                Text(hint)
                    .font(Theme.Typography.small)
                    .italic()
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.l)
    }
}
