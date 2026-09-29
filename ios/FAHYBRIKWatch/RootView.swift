import SwiftUI

// The watch app root. One state machine over the coordinator's phase + the pushed
// day payload:
//   • no payload            → empty state (open the phone)
//   • payload, done         → done state (check + title)
//   • payload, pending      → pre-workout flow (readiness glance ▸ today brief)
//   (las pantallas de reposo viven en Views/Entrada/)
//   • coordinator active    → live flow (the workout)
//   • coordinator finished  → summary (▸ splits), then back to the done state
struct RootView: View {
    @EnvironmentObject private var plan: WatchPlanModel
    @Environment(WatchWorkoutCoordinator.self) private var coordinator
    // Mirror HUD: phone is coach (or a recovered PRIMARY re-mirroring to it).
    // `has PRIMARY` is not this switch — solo recording keeps LiveFlowView.
    @Environment(WatchPrimaryOwner.self) private var primary

    /// A fresh, matching crash snapshot for today's session, if one is on disk — the
    /// idle state then offers to resume it instead of starting fresh. Loaded off the
    /// WorkoutStateStore actor whenever the day changes; nil clears the offer.
    @State private var recoverable: PersistedWorkoutState? = nil

    /// FH-30: pager index for the live flow. Lives on RootView (not coordinator,
    /// not LiveFlowView) so the page survives view remounts (solo↔mirror) without
    /// polluting the HK motor. Default Vivo (1) on mount; only the athlete's
    /// finger or the TabView Binding set writes it.
    @State private var livePage = 1

    var body: some View {
        content
            // The engine finishes itself when the last lap closes (or via Terminar);
            // catch that here (RootView is always mounted) and finalize once.
            .onChange(of: coordinator.session?.isFinished == true) { _, finished in
                // Mirror: phone POSTs; wrist enriches HK only (card 157).
                if finished, primary.role != .mirror { coordinator.finalize() }
            }
            // Look for a resumable crash snapshot each time the pushed day changes.
            .task(id: plan.today?.assignmentId ?? "") {
                if coordinator.phase == .idle, let today = plan.today, !today.isDone {
                    recoverable = await coordinator.restorableSnapshot(
                        payload: today, detail: plan.assignmentDetail
                    )
                } else {
                    recoverable = nil
                }
            }
        #if DEBUG
            // Test seam: `simctl launch … --fahybrik-autostart` drives the app straight
            // into the live flow, exercising detail-decode ▸ plan-build ▸ engine start
            // without touch input (simctl cannot tap). DEBUG builds only.
            .task {
                guard CommandLine.arguments.contains("--fahybrik-autostart"),
                      coordinator.phase == .idle,
                      let today = plan.today, !today.isDone,
                      today.dayKind == WatchDayKind.session else { return }
                coordinator.start(payload: today, detail: plan.assignmentDetail)
            }
        #endif
    }

    @ViewBuilder
    private var content: some View {
        if primary.showsMirrorHUD {
            MirrorHUDView(owner: primary)
        } else {
            standaloneContent
        }
    }

    @ViewBuilder
    private var standaloneContent: some View {
        switch coordinator.phase {
        case .active:
            if let session = coordinator.session {
                LiveFlowView(session: session, page: $livePage)
            }
        case .finished:
            if let session = coordinator.session {
                // "Listo" commits the (possibly toggled) staged result, then resets.
                PostFinishFlow(session: session, coordinator: coordinator) {
                    coordinator.confirmAndReset()
                }
            }
        case .idle:
            // Cada pantalla de reposo cierra con la versión de ESTE binario
            // (`EntradaVersion`): el HUD live no cede ni un píxel.
            idleContent
        }
    }

    @ViewBuilder
    private var idleContent: some View {
        if let today = plan.today {
            if today.isDone {
                EntradaHechoFlow(payload: today)
            } else if let snapshot = recoverable {
                // A fresh, matching crash snapshot exists → offer to resume the
                // interrupted workout (its laps + elapsed) rather than start over.
                EntradaReanudarView(
                    title: today.title ?? "Sesión",
                    onResume: {
                        coordinator.resume(from: snapshot, payload: today)
                        recoverable = nil
                    },
                    onDiscard: {
                        Task { await WorkoutStateStore.shared.clear() }
                        recoverable = nil
                    }
                )
            } else {
                EntradaAntesFlow(
                    payload: today,
                    sessionPlan: coordinator.sessionPlan(for: plan.assignmentDetail)
                ) {
                    coordinator.start(payload: today, detail: plan.assignmentDetail)
                }
            }
        } else {
            EntradaSinPlanView()
        }
    }
}

// MARK: - Post-finish flow (summary ▸ splits)

private struct PostFinishFlow: View {
    let session: WorkoutSession
    let coordinator: WatchWorkoutCoordinator
    let onDone: () -> Void

    var body: some View {
        if SplitsView.hasSplits(session) {
            TabView {
                SummaryView(session: session, coordinator: coordinator, onDone: onDone)
                SplitsView(session: session)
            }
            .tabViewStyle(.verticalPage)
        } else {
            SummaryView(session: session, coordinator: coordinator, onDone: onDone)
        }
    }
}
