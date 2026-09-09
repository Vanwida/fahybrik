import SwiftUI

// FH-95 — ONE pre-live prepare screen. Devices were handled on
// PreWorkoutDevicesHubView (or skipped when none needed). This view is the ONLY
// place with ▶ EMPEZAR before live. Watch join is inline status — never a gate step.
// Mirror/HK begins ONLY on releaseLive(), not on appear.

struct PreWorkoutPrepareView: View {
    let sessionTitle: String
    let plan: WorkoutPlan
    let segments: [WorkoutSegment]
    let calentamientoRun: Bool
    let isBenchmark: Bool
    let activityKind: String
    let hrZones: HRZoneProfile?
    @Binding var answers: SessionStartAnswers
    var stampSession: ((WorkoutSession) -> Void)? = nil
    let onReleaseLive: (WorkoutSession) -> Void
    let onBack: () -> Void

    @State private var stagingSession: WorkoutSession
    @State private var pool = PM5Pool.shared
    @State private var mirror = PhoneMirrorService.shared
    @State private var didBeginMirror = false

    private var recipe: SessionStartRecipe {
        PreWorkoutDeviceEligibility.startRecipe(
            segments: segments,
            calentamientoRun: calentamientoRun,
            isBenchmark: isBenchmark
        )
    }

    private var watchResolved: Bool {
        !recipe.asksWatch
            || SessionStartPolicy.watchResolved(answers: answers, wristJoined: mirror.wristJoined)
    }

    init(
        sessionTitle: String,
        plan: WorkoutPlan,
        segments: [WorkoutSegment],
        calentamientoRun: Bool = false,
        isBenchmark: Bool = false,
        activityKind: String,
        hrZones: HRZoneProfile? = nil,
        answers: Binding<SessionStartAnswers>,
        stampSession: ((WorkoutSession) -> Void)? = nil,
        onReleaseLive: @escaping (WorkoutSession) -> Void,
        onBack: @escaping () -> Void
    ) {
        self.sessionTitle = sessionTitle
        self.plan = plan
        self.segments = segments
        self.calentamientoRun = calentamientoRun
        self.isBenchmark = isBenchmark
        self.activityKind = activityKind
        self.hrZones = hrZones
        _answers = answers
        self.stampSession = stampSession
        self.onReleaseLive = onReleaseLive
        self.onBack = onBack
        _stagingSession = State(initialValue: WorkoutSession(plan: plan, hrZones: hrZones))
    }

    var body: some View {
        VStack(spacing: 0) {
            gateTopBar
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    SessionStartGatePlanPreview(plan: plan, segments: segments)
                    coachNote
                    if recipe.asksWatch {
                        watchStatusCard
                    }
                    Spacer(minLength: Theme.Spacing.m)
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.m)
            }
            empezarFooter
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .onAppear {
            if !WatchPresence.shared.appAvailable { answers.watchUnavailable = true }
        }
        .onDisappear { cancelMirrorIfNeeded() }
    }

    @ViewBuilder
    private var coachNote: some View {
        if let note = plan.coachNote, !note.isEmpty {
            CardSurface(padding: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Del coach")
                        .font(.system(size: 11, weight: .heavy, design: .default).italic())
                        .tracking(0.6)
                        .foregroundStyle(Theme.Color.muted)
                    Text(note)
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var empezarFooter: some View {
        VStack(spacing: Theme.Spacing.s) {
            Text(empezarFooterHint)
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(canReleaseLive ? Theme.Color.faint : Theme.Color.warning)
                .multilineTextAlignment(.center)
            ExpertPrimaryButton(
                title: "▶ EMPEZAR",
                height: 64,
                enabled: canReleaseLive,
                action: releaseLive
            )
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.bottom, Theme.Spacing.l)
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

    private var gateTopBar: some View {
        HStack(spacing: Theme.Spacing.m) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Atrás")
            Text(sessionTitle)
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
            Spacer(minLength: 0)
            Text("LISTO")
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
        stagingSession.ensurePhoneWorkoutRun()
        beginMirrorIfNeeded()
        Haptics.medium()
        onReleaseLive(stagingSession)
    }

    private var canReleaseLive: Bool { watchResolved }

    private var empezarFooterHint: String {
        SessionStartPolicy.empezarFooterHint(
            asksWatch: recipe.asksWatch,
            watchResolved: watchResolved,
            canReleaseLive: canReleaseLive
        )
    }

    private func cancelMirrorIfNeeded() {
        guard didBeginMirror else { return }
        PhoneMirrorService.shared.end(save: false)
        didBeginMirror = false
    }
}
