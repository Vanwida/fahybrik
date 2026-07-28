import SwiftUI

/// A prescribed / executed workout launch payload. Presenting the brief (or the
/// read-only executed detail) via `.fullScreenCover(item:)` bound to this value
/// makes it STRUCTURALLY impossible to build the cover before the id is set — the
/// id IS the presentation trigger. This is the root fix for the intermittent
/// "Sesión / Sin detalle" brief (and the executed-detail 404): the old
/// `isPresented: $bool` + a SEPARATE optional @State id could evaluate the cover
/// while that id was still nil, so WorkoutContainer fell into its title-only
/// `WorkoutPlan.minimal` ad-hoc branch and rendered a content-less "Sesión".
struct WorkoutLaunch: Identifiable, Equatable {
    /// The backend workout_assignments.id (as string). Always present for a real
    /// prescribed / executed launch — that's the whole point of this payload.
    let assignmentId: String
    /// Session title from the plan-week summary, shown while the body loads.
    let title: String?
    var id: String { assignmentId }
}

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
    /// FREE MODE (entreno libre / no prescrito). When present the athlete BUILT
    /// this workout themselves: there is no assignment to fetch — the runnable plan
    /// is carried here — and the post-workout save routes to `FreeWorkoutAPI`
    /// (title/modality/prescription + the engine's metrics) instead of the
    /// prescribed `/api/sync/workout-execution`. Nil = the unchanged prescribed path.
    var freeContext: FreeWorkoutContext? = nil
    /// The athlete's resolved max-HR source (from the cached identity: measured
    /// FCmáx, else 220−age estimate, else nil) — the SINGLE input for HR zones,
    /// threaded into the live engine and the treadmill/outdoor HUDs. Explicit param
    /// because the AppDataStore environment does not cross the fullScreenCover this
    /// container is presented inside (same reason `bearer` is passed explicitly).
    var hrMaxSource: HRMaxSource? = nil

    /// The max-HR source every session/HUD in this container actually uses. Safety
    /// net: a launch path that dropped the profile (as the free builder once did)
    /// must degrade to GENERIC zones — labeled "genérica" — never to NO zones.
    /// resolve() with nothing known returns the generic adult default.
    private var effectiveHRMaxSource: HRMaxSource? {
        hrMaxSource ?? PersonalHRMax.resolve(measuredMaxHrBpm: nil, age: nil, sex: nil)
    }

    enum Phase: Equatable {
        case brief
        case active
        // Tests guiados — a test whose contract asks for an `hrr` result holds
        // here for the post-effort recovery window (the app keeps measuring the
        // pulse; the athlete does nothing). Reached only from a LIVE finish —
        // manual/capture logs never measured a live effort, so they skip it.
        case recovery
        case summary
        // #34 — a calibration TEST session ends here instead of closing: after the
        // execution is saved, the athlete confirms the measured number(s) (pre-
        // filled from the run) and we post them to the ejecución→benchmark bridge.
        // Reached only when the loaded detail carries `store_results`.
        case testResult
    }

    enum LoadState: Equatable {
        case loading
        // The runnable `WorkoutPlan` (live engine) plus the OPTIONAL rich
        // `AssignmentDetail` (structured prescription + true block grouping) the
        // brief renders from when available. The detail is nil for ad-hoc /
        // title-only sessions, where the brief falls back to the flat plan.
        case ready(WorkoutPlan, AssignmentDetail?)
        // A REAL assignment whose prescription couldn't be loaded (offline / auth /
        // server error / no workout body). We surface this honestly with a retry
        // instead of fabricating a fake title-only "Sesión" the athlete could
        // pointlessly "complete" — the real block content (warmup, EMOM, …) always
        // comes from the detail endpoint; when it can't load we say so.
        case failed

        static func == (lhs: LoadState, rhs: LoadState) -> Bool {
            switch (lhs, rhs) {
            case (.loading, .loading): return true
            case (.failed, .failed): return true
            case let (.ready(a, _), .ready(b, _)): return a.id == b.id
            default: return false
            }
        }
    }

    @State private var phase: Phase = .brief
    @State private var session: WorkoutSession? = nil
    @State private var crashRecoveryPrompt: PersistedWorkoutState? = nil
    @State private var loadState: LoadState = .loading
    /// True when the athlete reached the summary via "Ya lo hice" (manual entry)
    /// rather than the live timer — the summary then collects results by hand and
    /// saves with source='manual'. Reset implicitly per container instance.
    @State private var manualEntry = false
    /// Idea 1: the athlete brings a result in from another app via a screenshot.
    /// Presented over the brief; on confirm it logs through the honest path and
    /// the day flips to HECHO (same as a finished session).
    @State private var showCapture = false

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
            case .failed:
                failedView
            }

            if let recovery = crashRecoveryPrompt {
                recoveryModal(recovery)
            }
        }
        .fullScreenCover(isPresented: $showCapture) {
            // Capture-log is only meaningful for a REAL assignment (the result is
            // attributed to it). Ad-hoc/free sessions never reach this button.
            WorkoutCaptureView(
                assignmentId: assignmentId ?? "",
                sessionTitle: fallbackTitle,
                bearer: bearer,
                onClose: { showCapture = false },
                onSaved: {
                    showCapture = false
                    if let assignmentId, !assignmentId.isEmpty {
                        CompletedAssignmentsStore.markCompleted(assignmentId)
                    }
                    Task { await WorkoutStateStore.shared.clear() }
                    onCompleted(assignmentId)
                    onClose()
                }
            )
        }
        .task {
            // A free workout is a one-off in-memory build with no assignment — never
            // offer to recover an unrelated prescribed snapshot over it.
            if freeContext == nil,
               let saved = await WorkoutStateStore.shared.load(),
               // AUDIT-1/2 — offer ONLY for the same assignment, fresh (<6h) and not a
               // finished/discarded snapshot (those are cleared on close). An older
               // snapshot with no assignment is discarded, never guessed.
               WorkoutRecoveryGate.shouldOffer(saved: saved, currentAssignmentId: assignmentId) {
                crashRecoveryPrompt = saved
            }
            await loadPlan()
        }
        // The ONE teardown point for the shared BLE device layer (cinta + banda + remo).
        // Fires on EVERY exit of the whole flow — brief-back, clean discard, or a
        // saved finish — but NOT when a sub-cover (the treadmill HUD) opens over the
        // active view, so the belt connected in the brief stays live all session and
        // is released only when the athlete truly leaves. The active view still
        // releases the erg + belt the INSTANT the work ends (before the summary, which
        // is the timing the athlete feels); this is the backstop for the paths that
        // never reach it — above all backing out of the brief with a monitor paired.
        .onDisappear { DeviceHub.shared.stopAll() }
    }

    @ViewBuilder
    private func content(plan: WorkoutPlan, detail: AssignmentDetail?) -> some View {
        switch phase {
            case .brief:
                PreWorkoutBriefView(
                    plan: plan,
                    detail: detail,
                    onStart: { runEnv in
                        let new = WorkoutSession(plan: plan, hrMaxSource: effectiveHRMaxSource)
                        new.assignmentId = assignmentId   // AUDIT-1 — stamp for honest recovery
                        new.runEnvironment = runEnv       // #8 — auto-open the chosen run HUD
                        session = new
                        manualEntry = false
                        // Mirror mode: remote-start the wrist recording alongside the
                        // live engine. Non-blocking — the workout runs alone if the
                        // watch never joins. Manual/capture flows never begin (below).
                        PhoneMirrorService.shared.begin(session: new, activityKind: mirrorActivityKind(for: plan))
                        // #56 — dobles en vivo: emit presence so the training partner's
                        // phone sees this session live. Self-gates (no pair / private →
                        // stops); a no-op for an ad-hoc session (no numeric assignment).
                        DoblesLivePresence.shared.begin(session: new, assignmentId: assignmentId, bearer: bearer)
                        Haptics.medium()
                        phase = .active
                    },
                    onManualLog: {
                        // "Ya lo hice": skip ActiveWorkout entirely. Build a session
                        // with NO live laps and jump straight to the summary, which
                        // collects the result by hand and saves source='manual'.
                        let new = WorkoutSession(plan: plan, hrMaxSource: effectiveHRMaxSource)
                        session = new
                        manualEntry = true
                        Haptics.medium()
                        phase = .summary
                    },
                    onCaptureLog: {
                        // Only offer the capture-log for a real assignment (the
                        // result must attribute to one); ad-hoc sessions skip it.
                        guard let id = assignmentId, !id.isEmpty else { return }
                        Haptics.light()
                        showCapture = true
                    },
                    showCaptureLog: assignmentId?.isEmpty == false,
                    // #Marcas — a benchmark brief hides the manual paths ("Ya lo
                    // hice"/captura): a mark the app didn't measure doesn't exist.
                    // (The erg connect is enforced later, at the engine's pre-block
                    // gate — this brief never even shows for free/benchmark paths.)
                    isBenchmark: freeContext?.benchmark != nil,
                    onClose: onClose
                )
            case .active:
                if let session {
                    ActiveWorkoutView(
                        session: session,
                        onFinish: {
                            // #56 — one final "ha terminado" beat: the headline time (the
                            // captured score for a timed format, else the duration); RPE is
                            // not known until the summary, so null here.
                            DoblesLivePresence.shared.finish(
                                finalTimeS: session.capturedScoreTimeSeconds
                                    ?? Int(session.elapsedSeconds.rounded()),
                                finalRpe: nil
                            )
                            Haptics.heavy()
                            if wantsHRRecovery(detail) {
                                // Tests guiados — the effort ended but the MEASUREMENT
                                // hasn't: open the session's HRR window and hold on the
                                // recovery screen. The wrist recording stays open too
                                // (its HR stream feeds the window); it closes when the
                                // window does.
                                session.beginRecoveryWindow()
                                phase = .recovery
                            } else {
                                // Live finish: close the wrist recording (→ one
                                // HKWorkout). The wrist replies with its UUID while the
                                // athlete fills the summary; PostWorkoutSummaryView
                                // stamps source_workout_ref.
                                PhoneMirrorService.shared.end(save: true)
                                phase = .summary
                            }
                        },
                        // Clean exit: leave the workout WITHOUT recording anything.
                        // No execution is saved and the session is never marked done
                        // — the athlete returns to a still-pending session, as if they
                        // never entered. Clearing the autosaved snapshot leaves no
                        // crash-recovery trace of the discarded run.
                        onExit: {
                            // Discard: tell the wrist to drop its recording (no HKWorkout).
                            PhoneMirrorService.shared.end(save: false)
                            // #56 — one "ha salido" beat so the partner's strip reflects it.
                            DoblesLivePresence.shared.leave()
                            // AUDIT-3 — stop the engine + latch-close persistence in order,
                            // so a late autosave Task can't resurrect the abandoned run.
                            session.discardAndClose()
                            onClose()
                        },
                        hrMaxSource: effectiveHRMaxSource,
                        bearer: bearer,
                        // #Marcas — the engine's pre-block erg gate drops its manual
                        // escape for a benchmark (no monitor → no mark to save).
                        isBenchmark: freeContext?.benchmark != nil
                    )
                    .toolbar(.hidden, for: .tabBar)
                }
            case .recovery:
                if let session {
                    RecoveryCaptureView(
                        session: session,
                        onDone: {
                            // The window is over (skip / continue / 90 s auto-close):
                            // NOW close the wrist recording, then the normal summary.
                            PhoneMirrorService.shared.end(save: true)
                            phase = .summary
                        }
                    )
                    .toolbar(.hidden, for: .tabBar)
                }
            case .summary:
                if let session {
                    PostWorkoutSummaryView(
                        session: session,
                        assignmentId: assignmentId,
                        logTarget: logTarget,
                        manualEntry: manualEntry,
                        freeContext: freeContext,
                        onSave: {
                            // Record the optimistic mark BEFORE closing so the
                            // caller's refetch (driven by onCompleted) already sees
                            // this assignment, even pre-server-sync. Honest: a
                            // terminated-early session marks PARTIAL (amber ½), never
                            // a fake 'completed'; the full path marks done.
                            if let assignmentId, !assignmentId.isEmpty {
                                if session.completeness == .partial {
                                    CompletedAssignmentsStore.markPartial(assignmentId)
                                } else {
                                    CompletedAssignmentsStore.markCompleted(assignmentId)
                                }
                                // #48 — the athlete just did this session HERE, so the
                                // copy sitting in the watch's Entrenamiento app must
                                // stop offering it; otherwise the same run looks
                                // pending on the wrist and can be started twice.
                                Task { await AppleWatchWorkoutScheduler.shared.markComplete(assignmentId: assignmentId) }
                            }
                            Task { await WorkoutStateStore.shared.clear() }
                            // #34 — a calibration TEST captures its measured result
                            // before leaving. The execution is already saved above;
                            // we defer onCompleted/onClose to the testResult step so
                            // the number gets posted to the bridge (and so a caller
                            // whose onCompleted dismisses this cover doesn't cut it
                            // short). A normal session closes as before.
                            if !(detail?.storeResults ?? []).isEmpty {
                                phase = .testResult
                            } else {
                                onCompleted(assignmentId)
                                onClose()
                            }
                        }
                    )
                }
            case .testResult:
                // Present the capture over the finished session, pre-filled from the
                // execution. onDone fires after a successful save OR a skip — either
                // way the execution is already recorded; only the calibration is
                // optional. Then we refresh the caller and close.
                if let session {
                    let specs = detail?.storeResults ?? []
                    TestResultCaptureSheet(
                        assignmentId: assignmentId ?? "",
                        specs: specs,
                        prefill: TestBatteryPrefill.map(session: session, specs: specs),
                        bearer: bearer,
                        onDone: {
                            onCompleted(assignmentId)
                            onClose()
                        }
                    )
                    .toolbar(.hidden, for: .tabBar)
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

    // Honest "couldn't load" state for a REAL assignment whose prescription failed
    // to load (offline / auth / server / no workout body). We never fabricate a
    // fake "Sesión" the athlete could complete — we show the session name we know,
    // a retry, and a clean way out.
    private var failedView: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.l) {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                VStack(spacing: Theme.Spacing.xs) {
                    Text("No pudimos cargar tu entreno")
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                        .multilineTextAlignment(.center)
                    if let title = fallbackTitle, !title.isEmpty {
                        Text(title)
                            .font(Theme.Typography.small)
                            .foregroundStyle(Theme.Color.muted)
                    }
                    Text("Revisa tu conexión e inténtalo de nuevo.")
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                        .multilineTextAlignment(.center)
                }
                VStack(spacing: Theme.Spacing.s) {
                    PrimaryButton(title: "Reintentar") {
                        loadState = .loading
                        Task { await loadPlan() }
                    }
                    SecondaryButton(title: "Salir") { onClose() }
                }
                .frame(maxWidth: 320)
            }
            .padding(Theme.Spacing.xl)
        }
    }

    // Tests guiados — this test's contract promises an HRR result (measure `hrr`,
    // canonically slug `hrr60`), so a LIVE finish routes through the recovery
    // window before the summary. Slug fallback keeps it working if the backend
    // ever ships the entry without the measure.
    private func wantsHRRecovery(_ detail: AssignmentDetail?) -> Bool {
        (detail?.storeResults ?? []).contains {
            TestMeasure($0.measure) == .hrr || $0.slug == "hrr60"
        }
    }

    // The wrist recording's activity kind (mirror mode), in the watch vocabulary
    // ("running" | "strength" | "hyrox" | "mixed"). Reuses the SAME string→kind map
    // the watch push uses. A dobles session records as HYROX; a free workout carries
    // its own modality; a prescribed session reads the runnable plan's principal work.
    private func mirrorActivityKind(for plan: WorkoutPlan) -> String {
        let modality: String
        if logTarget == .doublesJoint {
            modality = "hyrox"
        } else if let free = freeContext {
            modality = free.modalityWire
        } else {
            modality = plan.principalModalityWire
        }
        return WatchConnectivityiOSService.activityKind(from: modality)
    }

    // Load the real workout body. Prefer the on-device cache for an instant brief,
    // then fetch the authoritative detail.
    //
    // ROOT-CAUSE NOTE (the "Sesión" bug): the detail endpoint returns the FULL
    // prescription (warmup + EMOM + cooldown) for a session even when it's already
    // executed — being completed does NOT empty the payload (verified against real
    // data). So a generic "Sesión" preview was never the real content: it was the
    // title-only `WorkoutPlan.minimal` fallback this method used to fabricate
    // whenever the load couldn't complete (offline / auth / server). That fake
    // single-segment plan let the athlete "do" a meaningless session. We no longer
    // fabricate for a REAL assignment — we either show the real content (cache or
    // fetch) or fail honestly (.failed → retry). `minimal` survives ONLY for a
    // genuinely ad-hoc session (no assignment), where a title-only freeform plan
    // IS the real content (there is no prescription to load).
    private func loadPlan() async {
        guard case .loading = loadState else { return }

        // FREE MODE: the plan is already built (the athlete configured it). Skip the
        // brief + the assignment fetch and go straight to the live engine.
        if let free = freeContext {
            loadState = .ready(free.plan, nil)
            let new = WorkoutSession(plan: free.plan, hrMaxSource: effectiveHRMaxSource)
            new.runEnvironment = free.runEnvironment   // #8 — chosen in the free builder
            session = new
            manualEntry = false
            // Mirror the free workout to the wrist too (records HR + one HKWorkout).
            PhoneMirrorService.shared.begin(session: new, activityKind: mirrorActivityKind(for: free.plan))
            phase = .active
            return
        }

        guard let assignmentId else {
            loadState = .ready(WorkoutPlan.minimal(title: fallbackTitle), nil)
            return
        }

        if let cached = AssignmentDetailCache.load(assignmentId),
           let plan = WorkoutPlan.from(detail: cached) {
            loadState = .ready(plan, cached)
        }

        guard let bearer else {
            // No bearer to fetch with: keep the cached real plan if we have one,
            // otherwise fail honestly — never a fabricated "Sesión".
            if case .loading = loadState { loadState = .failed }
            return
        }

        do {
            let detail = try await PlanService.fetchAssignmentDetail(assignmentId, bearer: bearer)
            AssignmentDetailCache.save(detail)
            if let plan = WorkoutPlan.from(detail: detail) {
                loadState = .ready(plan, detail)
            } else if case .loading = loadState {
                // Fetched, but there is no runnable workout body (rest day / empty).
                // Surface it honestly rather than inventing a fake session.
                loadState = .failed
            }
        } catch {
            // Offline / auth / server error. Keep the cached real plan if the cache
            // already gave us one; otherwise fail honestly with a retry.
            if case .loading = loadState { loadState = .failed }
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
                        let recovered = WorkoutSession(plan: saved.plan, hrMaxSource: effectiveHRMaxSource, startedAt: saved.startedAt)
                        recovered.assignmentId = saved.assignmentId   // AUDIT-1 — the gate ensured it matches
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
