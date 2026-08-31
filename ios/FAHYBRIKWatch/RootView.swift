import SwiftUI

// The watch app root. One state machine over the coordinator's phase + the pushed
// day payload:
//   • no payload            → empty state (open the phone)
//   • payload, done         → done state (check + title)
//   • payload, pending      → pre-workout flow (readiness glance ▸ today brief)
//   • coordinator active    → live flow (the workout)
//   • coordinator finished  → summary (▸ splits), then back to the done state
struct RootView: View {
    @EnvironmentObject private var plan: WatchPlanModel
    @Environment(WatchWorkoutCoordinator.self) private var coordinator
    // Mirror mode (iPhone-driven session): takes precedence over ALL idle content
    // when active (`adopt` flips `isActive`). It can't co-occur with a standalone
    // session — the coordinator yields while the mirror is recording.
    @Environment(MirrorSessionController.self) private var mirror

    /// A fresh, matching crash snapshot for today's session, if one is on disk — the
    /// idle state then offers to resume it instead of starting fresh. Loaded off the
    /// WorkoutStateStore actor whenever the day changes; nil clears the offer.
    @State private var recoverable: PersistedWorkoutState? = nil

    var body: some View {
        content
            // The engine finishes itself when the last lap closes (or via Terminar);
            // catch that here (RootView is always mounted) and finalize once.
            .onChange(of: coordinator.session?.isFinished == true) { _, finished in
                if finished { coordinator.finalize() }
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
        if mirror.isActive {
            MirrorHUDView(controller: mirror)
        } else {
            standaloneContent
        }
    }

    @ViewBuilder
    private var standaloneContent: some View {
        switch coordinator.phase {
        case .active:
            if let session = coordinator.session {
                LiveFlowView(session: session)
            }
        case .finished:
            if let session = coordinator.session {
                // "Listo" commits the (possibly toggled) staged result, then resets.
                PostFinishFlow(session: session, coordinator: coordinator) {
                    coordinator.confirmAndReset()
                }
            }
        case .idle:
            idleContent
        }
    }

    @ViewBuilder
    private var idleContent: some View {
        if let today = plan.today {
            if today.isDone {
                DoneDayFlow(payload: today)
            } else if let snapshot = recoverable {
                // A fresh, matching crash snapshot exists → offer to resume the
                // interrupted workout (its laps + elapsed) rather than start over.
                ResumeOfferView(
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
                PreWorkoutFlow(
                    payload: today,
                    plan: coordinator.previewPlan(for: plan.assignmentDetail)
                ) {
                    coordinator.start(payload: today, detail: plan.assignmentDetail)
                }
            }
        } else {
            EmptyStateView()
        }
    }
}

// MARK: - Pre-workout flow (readiness glance ▸ today brief)

private struct PreWorkoutFlow: View {
    let payload: WatchTodayPayload
    let plan: WorkoutPlan?
    let onStart: () -> Void

    var body: some View {
        if let score = payload.readinessScore {
            TabView {
                ReadinessGlanceView(
                    score: score,
                    delta7d: payload.readinessDelta7d,
                    worstDriver: payload.readinessWorstDriver
                )
                TodayBriefView(payload: payload, plan: plan, onStart: onStart)
            }
            .tabViewStyle(.verticalPage)
        } else {
            TodayBriefView(payload: payload, plan: plan, onStart: onStart)
        }
    }
}

// MARK: - Done-day flow (readiness glance ▸ done card)

/// The completed-day idle state. It must NOT be a dead end: the athlete keeps the
/// day's readiness glanceable all day. Same vertical pager as PreWorkoutFlow —
/// readiness on page 1, the done card on page 2 — so crown/swipe always moves. No
/// fake "exit" button (leaving the app is the system crown press). When no readiness
/// was pushed, the done card stands alone.
private struct DoneDayFlow: View {
    let payload: WatchTodayPayload

    var body: some View {
        if let score = payload.readinessScore {
            TabView {
                ReadinessGlanceView(
                    score: score,
                    delta7d: payload.readinessDelta7d,
                    worstDriver: payload.readinessWorstDriver
                )
                doneCard
            }
            .tabViewStyle(.verticalPage)
        } else {
            doneCard
        }
    }

    private var doneCard: some View {
        DoneStateView(
            title: payload.title ?? "Sesión",
            completeness: payload.doneCompleteness,
            doublesBadge: payload.doublesBadgeText
        )
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

// MARK: - Idle states

private struct DoneStateView: View {
    let title: String
    /// "full" | "partial" — carried from the finish so the badge tells the truth: a
    /// green check + "completada" for a full run, an amber half-ring + "parcial" for a
    /// Terminar-early save (matching the phone's amber ½ language). Nil (older re-push)
    /// reads as full.
    let completeness: String?
    /// #23 — "DOBLES · con {nombre}", or nil for a solo/individual session.
    var doublesBadge: String? = nil

    private var isPartial: Bool { completeness == WorkoutCompleteness.partial.rawValue }

    var body: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            VStack(spacing: 8) {
                badge
                WatchLabel(text: "Hecho hoy", accent: true)
                Text(title)
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundStyle(WatchTheme.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                if let doublesBadge {
                    DoublesBadge(text: doublesBadge)
                }
                Text(isPartial ? "Sesión parcial registrada" : "Sesión completada")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(WatchTheme.dim)
            }
            .padding(.horizontal, 14)
        }
    }

    @ViewBuilder
    private var badge: some View {
        if isPartial {
            // Amber half-ring: honest "part of it" glyph, matching the phone's ½.
            Circle()
                .trim(from: 0, to: 0.5)
                .stroke(WatchTheme.zoneAmber, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .frame(width: 40, height: 40)
                .rotationEffect(.degrees(90))
        } else {
            ZStack {
                Circle().fill(WatchTheme.zoneGreen).frame(width: 40, height: 40)
                Image(systemName: "checkmark")
                    .font(.system(size: 19, weight: .heavy))
                    .foregroundStyle(WatchTheme.greenOn)
            }
        }
    }
}

// MARK: - Resume offer (crash recovery)

/// Offered in the idle state when a fresh, matching crash snapshot is on disk:
/// resume the interrupted workout (its laps + elapsed survive process death) or
/// discard it. Dark bg + orange primary, per the wrist design language.
private struct ResumeOfferView: View {
    let title: String
    let onResume: () -> Void
    let onDiscard: () -> Void

    var body: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 8) {
                WatchLabel(text: "Entreno sin guardar", accent: true)
                Text(title)
                    .font(.system(size: 20, weight: .heavy))
                    .foregroundStyle(WatchTheme.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.6)
                Text("Se cortó a mitad. ¿Retomarlo?")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(WatchTheme.dim)
                Spacer(minLength: 0)
                BigTapButton(title: "Reanudar entreno", systemImage: "play.fill") { onResume() }
                Button(action: onDiscard) {
                    Text("Descartar")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundStyle(WatchTheme.dim)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                }
                .buttonStyle(.plain)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
    }
}

private struct EmptyStateView: View {
    var body: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            VStack(spacing: 8) {
                Image(systemName: "iphone.gen3")
                    .font(.system(size: 28))
                    .foregroundStyle(WatchTheme.dim)
                Text("Abre FAHYBRID en el iPhone")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(WatchTheme.ink)
                    .multilineTextAlignment(.center)
                Text("Tu entreno aparecerá aquí.")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(WatchTheme.dim)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 12)
        }
    }
}
