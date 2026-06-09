import SwiftUI

struct StrengthOneRMStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 11,
            title: "1RMs",
            subtitle: "Tus máximos en fuerza",
            hint: "Si no tienes datos recientes, salta. Te programaremos tests.",
            primaryEnabled: true,
            skipTitle: "Saltar resto",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(spacing: 0) {
                NumberRow(label: "Back squat", unit: "kg", value: $state.oneRmBackSquat)
                NumberRow(label: "Deadlift", unit: "kg", value: $state.oneRmDeadlift)
                NumberRow(label: "Bench press", unit: "kg", value: $state.oneRmBenchPress)
                NumberRow(label: "OHP", unit: "kg", value: $state.oneRmOhp)
                NumberRow(label: "Clean", unit: "kg", value: $state.oneRmClean)
                NumberRow(label: "Snatch", unit: "kg", value: $state.oneRmSnatch)
                IntRow(label: "Pull-ups (max)", unit: "reps", value: $state.pullUpsMax)
                IntRow(label: "Push-ups / 1 min", unit: "reps", value: $state.pushUpsPerMinute)
            }
            .brandSurface()
        }
    }
}
