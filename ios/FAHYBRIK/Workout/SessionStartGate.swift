import SwiftUI

// FH-91 — ONE pre-live gate for every launch path (prescribed brief, libre,
// funcional, benchmark). Asks everything the recipe needs; does not release live
// until `SessionStartPolicy.canReleaseLive`. Reuses the existing run / erg flows
// as inline steps — never as separate doors on brief, builder, or block preview.

struct SessionStartGate: View {
    let sessionTitle: String
    let plan: WorkoutPlan
    let segments: [WorkoutSegment]
    /// Warmup-as-run blocks need the run picker even without a `.running` segment.
    let calentamientoRun: Bool
    let isBenchmark: Bool
    let activityKind: String
    let hrZones: HRZoneProfile?
    /// Stamps assignment / free metadata after the gate — container owns ids.
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
    @State private var watchWaitStarted: Date? = nil

    private var recipe: SessionStartRecipe {
        let devices = PreWorkoutDeviceEligibility.devices(for: segments)
        let ergRoles = devices.compactMap { dev -> String? in
            if case .erg(let r) = dev { return r.rawValue }
            return nil
        }
        let needsRun = segments.contains { $0.kind == .running } || calentamientoRun
        return SessionStartRecipe(
            needsRunLocation: needsRun,
            ergRoles: ergRoles,
            needsUnscopedErg: devices.contains(.ergAny),
            asksWatch: !devices.isEmpty,
            isBenchmark: isBenchmark
        )
    }

    init(
        sessionTitle: String,
        plan: WorkoutPlan,
        segments: [WorkoutSegment],
        calentamientoRun: Bool = false,
        isBenchmark: Bool = false,
        activityKind: String,
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
        self.hrZones = hrZones
        self.stampSession = stampSession
        self.onReleaseLive = onReleaseLive
        self.onCancel = onCancel
        _stagingSession = State(initialValue: WorkoutSession(plan: plan, hrZones: hrZones))
    }

    var body: some View {
        Group {
            if let step = SessionStartPolicy.nextIncompleteStep(recipe: recipe, answers: syncedAnswers) {
                stepBody(step)
            } else {
                readyFooter
            }
        }
        .onChange(of: mirror.wristJoined) { _, joined in
            if joined { answers.wristJoined = true }
        }
        .onChange(of: pool.epoch) { _, _ in }
        .onDisappear { cancelMirrorIfNeeded() }
    }

    /// Device links read from live stores — merged into answers each render.
    private var syncedAnswers: SessionStartAnswers {
        var a = answers
        a.connectedErgRoles = Set(recipe.ergRoles.filter { wire in
            guard let role = ErgMachineRole(wire: wire) else { return false }
            return pool.isRoleConnected(role)
        })
        a.unscopedErgConnected = pool.any.isConnected
        a.wristJoined = mirror.wristJoined
        if !watch.appAvailable { a.watchUnavailable = true }
        return a
    }

    @ViewBuilder
    private func stepBody(_ step: SessionStartStep) -> some View {
        switch step {
        case .runLocation:
            RunPreStartFlow(
                sessionTitle: sessionTitle,
                onStart: { env in
                    answers.runEnvironment = env
                    stagingSession.runEnvironment = env
                    stagingSession.ensurePhoneWorkoutRun()
                },
                onCancel: cancelAll
            )
        case .erg(let roleWire):
            ergStep(roleWire: roleWire)
        case .watch:
            watchStep
        }
    }

    @ViewBuilder
    private func ergStep(roleWire: String?) -> some View {
        let role = roleWire.flatMap { ErgMachineRole(wire: $0) }
        ErgPreStartFlow(
            sessionTitle: sessionTitle,
            machineWord: role?.machineWord ?? "el remo",
            isBenchmark: isBenchmark,
            store: role.map { pool.store(for: $0) } ?? pool.any,
            roleTitle: role?.titleES,
            onStart: {
                if let role {
                    if !pool.store(for: role).isConnected {
                        answers.skippedErgRoles.insert(role.rawValue)
                    }
                } else if !pool.any.isConnected {
                    answers.skippedUnscopedErg = true
                }
            },
            onCancel: cancelAll
        )
    }

    private var watchStep: some View {
        VStack(spacing: 0) {
            gateTopBar(title: "Reloj")
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    Text("Grabación en la muñeca")
                        .font(.system(size: 28, weight: .heavy, design: .default).italic())
                        .foregroundStyle(Theme.Color.foreground)
                    watchStatusCard
                    if !syncedAnswers.wristJoined && !syncedAnswers.watchUnavailable {
                        SecondaryButton(title: "Continuar sin reloj conectado") {
                            answers.watchProceedWithoutWrist = true
                        }
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.m)
            }
            if syncedAnswers.wristJoined || syncedAnswers.watchUnavailable || answers.watchProceedWithoutWrist {
                ExpertPrimaryButton(title: "Continuar", height: 56) { /* advance via empty next step */ }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.bottom, Theme.Spacing.l)
            }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .onAppear {
            if !watch.appAvailable { answers.watchUnavailable = true }
            beginMirrorIfNeeded()
        }
    }

    @ViewBuilder
    private var watchStatusCard: some View {
        CardSurface(padding: Theme.Spacing.m) {
            if syncedAnswers.wristJoined {
                statusRow(icon: "checkmark.circle.fill", color: Theme.Color.ok,
                          title: "Reloj grabando", subtitle: "Pulso y distancia llegan desde la muñeca")
            } else if syncedAnswers.watchUnavailable {
                statusRow(icon: "applewatch.slash", color: Theme.Color.muted,
                          title: "Sin Apple Watch", subtitle: "El teléfono graba lo que pueda; puedes usar banda de pulso")
            } else if let started = watchWaitStarted,
                      Date().timeIntervalSince(started) > PhoneMirrorService.watchJoinHintSeconds {
                statusRow(icon: "exclamationmark.triangle.fill", color: Theme.Color.warning,
                          title: "El reloj no se unió", subtitle: "Abre la app en la muñeca o continúa sin reloj")
            } else {
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

    private var readyFooter: some View {
        VStack(spacing: 0) {
            gateTopBar(title: "Listo")
            Spacer(minLength: 0)
            VStack(spacing: Theme.Spacing.s) {
                Text("Empieza cuando estés listo")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.faint)
                ExpertPrimaryButton(title: "▶ EMPEZAR", height: 64, action: releaseLive)
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.bottom, Theme.Spacing.l)
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .onAppear { beginMirrorIfNeeded() }
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
        watchWaitStarted = Date()
    }

    private func releaseLive() {
        stagingSession.runEnvironment = answers.runEnvironment
        stampSession?(stagingSession)
        if !didBeginMirror {
            PhoneMirrorService.shared.begin(session: stagingSession, activityKind: activityKind)
        }
        Haptics.medium()
        onReleaseLive(stagingSession)
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

// MARK: - PhoneMirrorService (watch step timing)

extension PhoneMirrorService {
    /// After this many seconds in the watch step, show honest "no se unió" copy.
    static let watchJoinHintSeconds: TimeInterval = 9
}
