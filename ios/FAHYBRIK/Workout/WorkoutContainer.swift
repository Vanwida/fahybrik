import SwiftUI

// Hosts pre-brief → active → summary flow. Tab bar is hidden during active
// per spec ("lock-in mode").
struct WorkoutContainer: View {
    /// Backend workout_assignments.id (as string) that this execution maps to.
    /// Nil for ad-hoc sessions. When nil the post-workout summary still saves
    /// locally but skips the backend sync.
    let assignmentId: String?
    /// Session title from the plan-week summary. Used as the brief title while
    /// the full workout body loads, and as the fallback plan if the detail fetch
    /// fails or there is no assignmentId (ad-hoc session).
    let fallbackTitle: String?
    /// Athlete bearer — required to fetch the real assignment detail (blocks +
    /// items + params) so EMPEZAR runs the actual prescribed workout, not an
    /// empty title-only shell.
    let bearer: String?
    /// Where the finished execution is submitted. Defaults to `.solo`; the Dobles
    /// "train together" flow passes `.doublesJoint` so the summary logs against
    /// the joint endpoint (links partner + shares result). Same workout flow.
    var logTarget: WorkoutLogTarget = .solo

    enum Phase: Equatable {
        case brief
        case active
        case summary
    }

    enum LoadState: Equatable {
        case loading
        // The runnable `WorkoutPlan` (live engine) plus the OPTIONAL rich
        // `AssignmentDetail` (structured prescription + true block grouping) the
        // brief renders from when available. The detail is nil for ad-hoc /
        // title-only sessions, where the brief falls back to the flat plan.
        case ready(WorkoutPlan, AssignmentDetail?)

        static func == (lhs: LoadState, rhs: LoadState) -> Bool {
            switch (lhs, rhs) {
            case (.loading, .loading): return true
            case let (.ready(a, _), .ready(b, _)): return a.id == b.id
            default: return false
            }
        }
    }

    @State private var phase: Phase = .brief
    @State private var session: WorkoutSession? = nil
    @State private var crashRecoveryPrompt: PersistedWorkoutState? = nil
    @State private var loadState: LoadState = .loading

    let onClose: () -> Void
    /// Fired once the post-workout summary is saved, with the assignment id that
    /// was just completed (nil for ad-hoc sessions). Callers use this to refresh
    /// their plan state so the finished session no longer shows "Empezar".
    var onCompleted: (String?) -> Void = { _ in }

    var body: some View {
        ZStack(alignment: .top) {
            switch loadState {
            case .loading:
                loadingView
            case let .ready(plan, detail):
                content(plan: plan, detail: detail)
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
            await loadPlan()
        }
    }

    @ViewBuilder
    private func content(plan: WorkoutPlan, detail: AssignmentDetail?) -> some View {
        switch phase {
            case .brief:
                PreWorkoutBriefView(
                    plan: plan,
                    detail: detail,
                    connections: .current,
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
                    PostWorkoutSummaryView(
                        session: session,
                        assignmentId: assignmentId,
                        logTarget: logTarget,
                        onSave: {
                            // Record optimistic completion BEFORE closing so the
                            // caller's refetch (driven by onCompleted) already sees
                            // this assignment as done, even pre-server-sync.
                            if let assignmentId, !assignmentId.isEmpty {
                                CompletedAssignmentsStore.markCompleted(assignmentId)
                            }
                            Task { await WorkoutStateStore.shared.clear() }
                            onCompleted(assignmentId)
                            onClose()
                        }
                    )
                }
        }
    }

    private var loadingView: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.m) {
                ProgressView()
                    .tint(Theme.Color.accent)
                if let title = fallbackTitle, !title.isEmpty {
                    Text(title)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }

    // Load the real workout body. Prefer the on-device cache for an instant
    // brief, then fetch the authoritative detail. Falls back to the title-only
    // minimal plan only when there is no assignment or the fetch fails — never
    // an empty shell when the real prescription is available.
    private func loadPlan() async {
        guard case .loading = loadState else { return }

        guard let assignmentId else {
            loadState = .ready(WorkoutPlan.minimal(title: fallbackTitle), nil)
            return
        }

        if let cached = AssignmentDetailCache.load(assignmentId),
           let plan = WorkoutPlan.from(detail: cached) {
            loadState = .ready(plan, cached)
        }

        guard let bearer else {
            if case .loading = loadState {
                loadState = .ready(WorkoutPlan.minimal(title: fallbackTitle), nil)
            }
            return
        }

        do {
            let detail = try await PlanService.fetchAssignmentDetail(assignmentId, bearer: bearer)
            AssignmentDetailCache.save(detail)
            if let plan = WorkoutPlan.from(detail: detail) {
                loadState = .ready(plan, detail)
            } else if case .loading = loadState {
                // Rest day (no workout body) reached via EMPEZAR — degrade to the
                // minimal plan rather than blocking on the spinner.
                loadState = .ready(WorkoutPlan.minimal(title: fallbackTitle), nil)
            }
        } catch {
            if case .loading = loadState {
                loadState = .ready(WorkoutPlan.minimal(title: fallbackTitle), nil)
            }
        }
    }

    @ViewBuilder
    private func recoveryModal(_ saved: PersistedWorkoutState) -> some View {
        ZStack {
            Theme.Color.scrim.ignoresSafeArea()
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
