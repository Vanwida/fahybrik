import SwiftUI

// FH-91 / FH-93 — ONE pre-live gate. Device steps (run env, erg) then a single
// EMPEZAR (or auto-release when the builder already committed). Watch join is
// inline status — never a second full-screen gate. Mirror/HK begins ONLY on
// releaseLive(), not on appear (no green pill before EMPEZAR).

struct SessionStartGate: View {
    let sessionTitle: String
    let plan: WorkoutPlan
    let segments: [WorkoutSegment]
    let calentamientoRun: Bool
    let isBenchmark: Bool
    let activityKind: String
    /// True when the athlete already tapped Empezar in the free builder — this
    /// gate only resolves devices/watch honesty, then auto-opens live.
    let liveAlreadyCommitted: Bool
    let hrZones: HRZoneProfile?
    var stampSession: ((WorkoutSession) -> Void)? = nil
    let onReleaseLive: (WorkoutSession) -> Void
    let onCancel: () -> Void

    @State private var answers = SessionStartAnswers.empty
    @State private var stagingSession: WorkoutSession
    @State private var pool = PM5Pool.shared
    @State private var hub = DeviceHub.shared
    @State private var watch = WatchPresence.shared
    @State private var mirror = PhoneMirrorService.shared
    @State private var didBeginMirror = false
    @State private var didAutoRelease = false

    private var recipe: SessionStartRecipe {
        PreWorkoutDeviceEligibility.startRecipe(
            segments: segments,
            calentamientoRun: calentamientoRun,
            isBenchmark: isBenchmark
        )
    }

    private var connectedRoles: Set<ErgMachineRole> {
        Set(PreWorkoutDeviceEligibility.namedErgRoles(in: segments)
            .filter { pool.isRoleConnected($0) })
    }

    private var nextStep: PreWorkoutDeviceEligibility.StartStep? {
        PreWorkoutDeviceEligibility.nextStartStep(
            recipe: recipe,
            segments: segments,
            answers: answers,
            roleConnected: connectedRoles,
            anyConnected: pool.any.isConnected,
            wristJoined: mirror.wristJoined
        )
    }

    /// Watch honesty is resolved inline on the ready screen — not a StartStep.
    /// After the builder's Empezar, watch join is best-effort (never blocks live).
    private var watchResolved: Bool {
        liveAlreadyCommitted
            || !recipe.asksWatch
            || SessionStartPolicy.watchResolved(answers: answers, wristJoined: mirror.wristJoined)
    }

    init(
        sessionTitle: String,
        plan: WorkoutPlan,
        segments: [WorkoutSegment],
        calentamientoRun: Bool = false,
        isBenchmark: Bool = false,
        activityKind: String,
        liveAlreadyCommitted: Bool = false,
        hrZones: HRZoneProfile? = nil,
        stampSession: ((WorkoutSession) -> Void)? = nil,
        onReleaseLive: @escaping (WorkoutSession) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.sessionTitle = sessionTitle
        self.plan = plan
        self.segments = segments
        self.calentamientoRun = calentamientoRun
        self.isBenchmark = isBenchmark
        self.activityKind = activityKind
        self.liveAlreadyCommitted = liveAlreadyCommitted
        self.hrZones = hrZones
        self.stampSession = stampSession
        self.onReleaseLive = onReleaseLive
        self.onCancel = onCancel
        _stagingSession = State(initialValue: WorkoutSession(plan: plan, hrZones: hrZones))
    }

    var body: some View {
        Group {
            if let step = nextStep {
                stepBody(step)
            } else {
                readyFooter
            }
        }
        .onChange(of: pool.epoch) { _, _ in }
        .onDisappear { cancelMirrorIfNeeded() }
    }

    @ViewBuilder
    private func stepBody(_ step: PreWorkoutDeviceEligibility.StartStep) -> some View {
        switch step {
        case .runLocation:
            VStack(spacing: 0) {
                gatePlanPreviewStrip
                RunPreStartFlow(
                    sessionTitle: sessionTitle,
                    onStart: { env in
                        answers.runEnvironment = env
                        stagingSession.runEnvironment = env
                        stagingSession.ensurePhoneWorkoutRun()
                    },
                    onCancel: cancelAll
                )
            }
        case .erg(let role):
            VStack(spacing: 0) {
                gatePlanPreviewStrip
                ErgPreStartFlow(
                    sessionTitle: sessionTitle,
                    machineWord: role?.machineWord ?? "el remo",
                    isBenchmark: isBenchmark,
                    store: role.map { pool.store(for: $0) } ?? pool.any,
                    roleTitle: role?.titleES,
                    onStart: {
                        if let role {
                            if !pool.store(for: role).isConnected {
                                answers.skippedErgRoleWires.insert(role.rawValue)
                            }
                        } else if !pool.any.isConnected {
                            answers.skippedUnscopedErg = true
                        }
                    },
                    onCancel: cancelAll
                )
            }
        }
    }

    /// Compact plan strip on device steps so the gate never opens blank.
    private var gatePlanPreviewStrip: some View {
        SessionStartGatePlanPreview(plan: plan, segments: segments)
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.s)
    }

    private var readyFooter: some View {
        VStack(spacing: 0) {
            gateTopBar(title: liveAlreadyCommitted ? "Listo" : "Listo")
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    SessionStartGatePlanPreview(plan: plan, segments: segments)
                    if recipe.asksWatch {
                        watchStatusCard
                    }
                    Spacer(minLength: Theme.Spacing.m)
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.m)
            }
            if !liveAlreadyCommitted {
                VStack(spacing: Theme.Spacing.s) {
                    Text("Empieza cuando estés listo")
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.faint)
                    ExpertPrimaryButton(title: "▶ EMPEZAR", height: 64, action: releaseLive)
                        .disabled(!canReleaseLive)
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.bottom, Theme.Spacing.l)
            }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .onAppear {
            if !watch.appAvailable { answers.watchUnavailable = true }
            tryAutoReleaseIfNeeded()
        }
        .onChange(of: watchResolved) { _, _ in tryAutoReleaseIfNeeded() }
        .onChange(of: mirror.wristJoined) { _, _ in tryAutoReleaseIfNeeded() }
    }

    @ViewBuilder
    private var watchStatusCard: some View {
        CardSurface(padding: Theme.Spacing.m) {
            if didBeginMirror, mirror.wristJoined {
                statusRow(icon: "checkmark.circle.fill", color: Theme.Color.ok,
                          title: "Reloj grabando",
                          subtitle: "Espejo HealthKit activo en la muñeca")
            } else if answers.watchUnavailable {
                statusRow(icon: "applewatch.slash", color: Theme.Color.muted,
                          title: "Sin Apple Watch",
                          subtitle: "El teléfono graba lo que pueda; puedes usar banda de pulso")
            } else if didBeginMirror, !mirror.wristJoined,
                      let started = mirror.watchJoinStartedAt,
                      Date().timeIntervalSince(started) > PhoneMirrorService.watchJoinHintSeconds {
                statusRow(icon: "exclamationmark.triangle.fill", color: Theme.Color.warning,
                          title: "El reloj no se unió",
                          subtitle: "Abre la app en la muñeca o continúa sin reloj")
            } else if didBeginMirror {
                HStack(spacing: Theme.Spacing.m) {
                    ProgressView().tint(Theme.Color.accent)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Esperando al reloj…")
                            .font(Theme.Typography.bodyEmph)
                            .foregroundStyle(Theme.Color.foreground)
                        Text("Abre FAHYBRID en la muñeca si no arrancó sola")
                            .font(Theme.Typography.caption)
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            } else {
                statusRow(icon: "applewatch", color: Theme.Color.muted,
                          title: "Grabación en la muñeca",
                          subtitle: "Al empezar, el Apple Watch firmará pulso y calorías")
            }
            if recipe.asksWatch && !mirror.wristJoined && !answers.watchUnavailable {
                SecondaryButton(title: "Continuar sin reloj conectado") {
                    answers.watchProceedWithoutWrist = true
                    tryAutoReleaseIfNeeded()
                }
                .padding(.top, Theme.Spacing.s)
            }
        }
    }

    private func statusRow(icon: String, color: Color, title: String, subtitle: String) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            Image(systemName: icon)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Text(subtitle)
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func gateTopBar(title: String) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            Button(action: cancelAll) {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cancelar")
            Text(sessionTitle)
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
            Spacer(minLength: 0)
            Text(title.uppercased())
                .font(.system(size: 10, weight: .heavy, design: .default).italic())
                .foregroundStyle(Theme.Color.faint)
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.m)
    }

    private func beginMirrorIfNeeded() {
        guard !didBeginMirror else { return }
        stagingSession.runEnvironment = answers.runEnvironment
        stampSession?(stagingSession)
        PhoneMirrorService.shared.begin(session: stagingSession, activityKind: activityKind)
        didBeginMirror = true
    }

    private func releaseLive() {
        guard canReleaseLive else { return }
        stagingSession.runEnvironment = answers.runEnvironment
        stampSession?(stagingSession)
        beginMirrorIfNeeded()
        Haptics.medium()
        onReleaseLive(stagingSession)
    }

    private func tryAutoReleaseIfNeeded() {
        guard liveAlreadyCommitted, canReleaseLive, !didAutoRelease else { return }
        didAutoRelease = true
        releaseLive()
    }

    /// Live opens only after device steps resolve and watch honesty is settled.
    private var canReleaseLive: Bool {
        nextStep == nil && watchResolved
    }

    private func cancelAll() {
        Haptics.light()
        cancelMirrorIfNeeded()
        hub.stopAll()
        onCancel()
    }

    private func cancelMirrorIfNeeded() {
        guard didBeginMirror else { return }
        PhoneMirrorService.shared.end(save: false)
        didBeginMirror = false
    }
}
