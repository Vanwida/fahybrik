import SwiftUI

struct OnboardingFlow: View {
    @State private var state = OnboardingState()
    let bearer: String?
    let onFinished: () -> Void

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()

            switch state.currentStepIndex {
            case 0:
                WelcomeStep(
                    onStart: { advance() },
                    onResumeLater: {
                        // Persist + exit; user will resume from saved state on next launch.
                        state.persistDraft()
                        onFinished()
                    }
                )
                .transition(stepTransition)
            case 1:
                PersonalBasicsStep(
                    state: state,
                    onBack: goBack,
                    onNext: advance,
                    onSkip: advance
                )
                .transition(stepTransition)
            case 2:
                AthleticBackgroundStep(
                    state: state,
                    onBack: goBack,
                    onNext: advance,
                    onSkip: advance
                )
                .transition(stepTransition)
            case 3:
                HyroxHistoryStep(
                    state: state,
                    onBack: goBack,
                    onNext: advance,
                    onSkip: advance
                )
                .transition(stepTransition)
            case 4:
                StrengthOneRMStep(
                    state: state,
                    onBack: goBack,
                    onNext: { withOutlierCheck(advance) },
                    onSkip: advance
                )
                .transition(stepTransition)
            case 5:
                EnduranceBenchmarksStep(
                    state: state,
                    onBack: goBack,
                    onNext: advance,
                    onSkip: advance
                )
                .transition(stepTransition)
            case 6:
                HyroxStationsStep(
                    state: state,
                    onBack: goBack,
                    onNext: advance,
                    onSkip: advance
                )
                .transition(stepTransition)
            case 7:
                TrainingContextStep(
                    state: state,
                    onBack: goBack,
                    onNext: advance,
                    onSkip: advance
                )
                .transition(stepTransition)
            case 8:
                RecoveryStep(
                    state: state,
                    onBack: goBack,
                    onNext: advance,
                    onSkip: advance
                )
                .transition(stepTransition)
            case 9:
                GoalsStep(
                    state: state,
                    onBack: goBack,
                    onNext: advance,
                    onSkip: advance
                )
                .transition(stepTransition)
            case 10:
                ConnectionsStep(
                    state: state,
                    onBack: goBack,
                    onNext: advance,
                    onSkip: advance
                )
                .transition(stepTransition)
            case 11:
                DoneStep(onEnter: finish)
                    .transition(stepTransition)
            default:
                EmptyView()
            }

            if let alert = outlierAlertMessage {
                outlierConfirmModal(message: alert)
            }
        }
        .onAppear { state.restoreDraft() }
    }

    private var stepTransition: AnyTransition {
        .asymmetric(
            insertion: .move(edge: .trailing).combined(with: .opacity),
            removal: .move(edge: .leading).combined(with: .opacity)
        )
    }

    private func advance() {
        Haptics.light()
        withAnimation(.easeInOut(duration: 0.28)) {
            state.advance()
        }
    }

    private func goBack() {
        Haptics.light()
        withAnimation(.easeInOut(duration: 0.28)) {
            state.goBack()
        }
    }

    private func finish() {
        let snapshot = state.snapshot()
        let bearerCopy = bearer
        Task { await OnboardingAPI.submit(snapshot, bearer: bearerCopy) }
        state.clearDraft()
        Haptics.success()
        onFinished()
    }

    // MARK: - Outlier validation (1RM step)

    @State private var outlierAlertMessage: String? = nil
    @State private var pendingAdvance: (() -> Void)? = nil

    private func withOutlierCheck(_ next: @escaping () -> Void) {
        if let msg = OutlierCheck.message(for: state) {
            outlierAlertMessage = msg
            pendingAdvance = next
        } else {
            next()
        }
    }

    @ViewBuilder
    private func outlierConfirmModal(message: String) -> some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
            VStack(spacing: Theme.Spacing.l) {
                Text(message)
                    .font(Theme.Typography.body)
                    .foregroundStyle(Theme.Color.foreground)
                    .multilineTextAlignment(.center)

                HStack(spacing: Theme.Spacing.m) {
                    SecondaryButton(title: "Editar") {
                        outlierAlertMessage = nil
                        pendingAdvance = nil
                    }
                    PrimaryButton(title: "Confirmar") {
                        let next = pendingAdvance
                        outlierAlertMessage = nil
                        pendingAdvance = nil
                        next?()
                    }
                }
            }
            .padding(Theme.Spacing.xl)
            .frame(maxWidth: 320)
            .brandSurface()
            .padding(.horizontal, Theme.Spacing.xl)
        }
    }
}

private enum OutlierCheck {
    // Filters obvious typos (300kg+ squat, sub-12 5K) without blocking edge cases.
    // Returns the first triggered message; if multiple, athlete confirms once.
    static func message(for s: OnboardingState) -> String? {
        if let v = s.oneRmBackSquat, v > 300 { return "¿\(Int(v))kg back squat? Confirmar" }
        if let v = s.oneRmDeadlift, v > 360 { return "¿\(Int(v))kg deadlift? Confirmar" }
        if let v = s.oneRmBenchPress, v > 250 { return "¿\(Int(v))kg bench? Confirmar" }
        if let v = s.oneRmClean, v > 220 { return "¿\(Int(v))kg clean? Confirmar" }
        if let v = s.oneRmSnatch, v > 180 { return "¿\(Int(v))kg snatch? Confirmar" }
        return nil
    }
}
