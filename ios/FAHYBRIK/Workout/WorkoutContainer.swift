import SwiftUI

// Hosts pre-brief → active → summary flow. Tab bar is hidden during active
// per spec ("lock-in mode").
struct WorkoutContainer: View {
    let plan: WorkoutPlan

    enum Phase: Equatable {
        case brief
        case active
        case summary
    }

    @State private var phase: Phase = .brief
    @State private var session: WorkoutSession? = nil
    @State private var crashRecoveryPrompt: PersistedWorkoutState? = nil

    let onClose: () -> Void

    var body: some View {
        ZStack {
            switch phase {
            case .brief:
                PreWorkoutBriefView(
                    plan: plan,
                    connections: .mock,
                    onStart: {
                        let new = WorkoutSession(plan: plan)
                        session = new
                        Haptics.medium()
                        phase = .active
                    },
                    onClose: onClose
                )
            case .active:
                if let session {
                    ActiveWorkoutView(session: session, onFinish: {
                        Haptics.heavy()
                        phase = .summary
                    })
                    .toolbar(.hidden, for: .tabBar)
                }
            case .summary:
                if let session {
                    PostWorkoutSummaryView(session: session, onSave: {
                        Task { await WorkoutStateStore.shared.clear() }
                        onClose()
                    })
                }
            }

            if let recovery = crashRecoveryPrompt {
                recoveryModal(recovery)
            }
        }
        .task {
            if let saved = await WorkoutStateStore.shared.load(),
               !saved.plan.id.uuidString.isEmpty {
                crashRecoveryPrompt = saved
            }
        }
    }

    @ViewBuilder
    private func recoveryModal(_ saved: PersistedWorkoutState) -> some View {
        ZStack {
            Color.black.opacity(0.65).ignoresSafeArea()
            VStack(spacing: Theme.Spacing.m) {
                Text("Workout sin guardar")
                    .font(Theme.Typography.headlineS)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Tienes un entreno en curso del \(formatted(saved.savedAt)). ¿Recuperar?")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                HStack(spacing: Theme.Spacing.m) {
                    SecondaryButton(title: "Descartar") {
                        Task { await WorkoutStateStore.shared.clear() }
                        crashRecoveryPrompt = nil
                    }
                    PrimaryButton(title: "Recuperar") {
                        let recovered = WorkoutSession(plan: saved.plan, startedAt: saved.startedAt)
                        recovered.currentSegmentIndex = saved.currentSegmentIndex
                        recovered.elapsedSeconds = saved.elapsedSeconds
                        recovered.lapElapsedSeconds = saved.lapElapsedSeconds
                        recovered.laps = saved.laps
                        recovered.repsCurrentSegment = saved.repsByCurrentSegment
                        session = recovered
                        crashRecoveryPrompt = nil
                        phase = .active
                    }
                }
            }
            .padding(Theme.Spacing.xl)
            .frame(maxWidth: 320)
            .brandSurface()
            .padding(.horizontal, Theme.Spacing.xl)
        }
    }

    private func formatted(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "d MMM HH:mm"
        return f.string(from: d)
    }
}
