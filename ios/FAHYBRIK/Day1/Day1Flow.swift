import SwiftUI

// Day-1 orientation (#17, opción B). The first open after a funnel athlete claims
// their account: welcome + goal echo → [Dobles partner] → connect Apple Health →
// week-1 tests preview → weekly loop → land on Inicio. NEVER asks for data (the
// funnel already filled the profile at alta); the precise numbers come from the
// week-1 calibration tests. Shown once (AuthState.day1Completed), resumes where it
// was left (day1Step). Non-blocking throughout — every step can be skipped/continued.
struct Day1Flow: View {
    let bearer: String?
    let startStep: Int
    let onStepChange: (Int) -> Void
    let onFinished: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var model = Day1Model()
    @State private var stepIndex = 0
    @State private var healthRequesting = false
    @State private var healthError = false

    private enum Beat { case welcome, partner, health, tests, loop, done }

    private var beats: [Beat] {
        var b: [Beat] = [.welcome]
        if model.isDobles { b.append(.partner) } // fork 4: Dobles-only
        b.append(contentsOf: [.health, .tests, .loop, .done])
        return b
    }
    private var beat: Beat { beats[min(stepIndex, beats.count - 1)] }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            if !model.loaded {
                ProgressView().tint(Theme.Color.accent)
            } else {
                content
            }
        }
        .task {
            await model.load(bearer: bearer)
            stepIndex = min(startStep, beats.count - 1)
        }
    }

    private var content: some View {
        VStack(spacing: 0) {
            progressRail
                .padding(.bottom, Theme.Spacing.xl)
            Spacer(minLength: 0)
            Group {
                switch beat {
                case .welcome: welcomeStep
                case .partner: partnerStep
                case .health: healthStep
                case .tests: testsStep
                case .loop: loopStep
                case .done: doneStep
                }
            }
            .id(stepIndex)
            .transition(.asymmetric(
                insertion: .move(edge: .trailing).combined(with: .opacity),
                removal: .move(edge: .leading).combined(with: .opacity)
            ))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.xxl)
        .padding(.bottom, Theme.Spacing.xl)
        .animation(.spring(response: 0.5, dampingFraction: 0.86), value: stepIndex)
    }

    // MARK: - Chrome

    private var progressRail: some View {
        HStack(spacing: 6) {
            ForEach(0..<beats.count, id: \.self) { i in
                Capsule()
                    .fill(i <= stepIndex ? Theme.Color.accent : Theme.Color.hairlineStrong)
                    .frame(width: i == stepIndex ? 22 : 7, height: 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func advance() {
        if stepIndex >= beats.count - 1 { onFinished(); return }
        Haptics.light()
        stepIndex += 1
        onStepChange(stepIndex)
    }

    // MARK: - Beats

    private var welcomeStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            Wordmark(size: 18)
            Spacer().frame(height: Theme.Spacing.xl)
            LabelText(text: "BIENVENIDO/A", color: Theme.Color.accentText)
            Text("Hola,\n\(model.firstName.isEmpty ? "atleta" : model.firstName).")
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.top, 8)
            Text("Tu coach ya tiene tu perfil. Dejamos la app lista en 30 segundos, sin repetir nada de lo que ya nos contaste.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.Color.muted)
                .padding(.top, 10)
            if let goal = model.goalLine {
                CardSurface(padding: 14, leftAccent: true) {
                    VStack(alignment: .leading, spacing: 8) {
                        LabelText(text: "TU OBJETIVO")
                        Text(goal)
                            .font(Theme.Typography.headlineS)
                            .foregroundStyle(Theme.Color.foreground)
                        if let d = model.daysPerWeek {
                            Text("\(d) días por semana con tu coach")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }
                }
                .padding(.top, 18)
            }
            Text("Podrás revisar y editar tu perfil cuando quieras desde Ajustes.")
                .font(.system(size: 11))
                .foregroundStyle(Theme.Color.faint)
                .padding(.top, 12)
            Spacer().frame(height: Theme.Spacing.xl)
            ExpertPrimaryButton(title: "EMPEZAR", enabled: true) { advance() }
        }
    }

    private var partnerStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            LabelText(text: "DOBLES", color: Theme.Color.accentText)
            Text("Entrenáis\nen pareja")
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.top, 8)
            Text("Compartís plan y sesión conjunta. Todo lo de Dobles vive en su propia sección.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.Color.muted)
                .padding(.top, 10)
            CardSurface(padding: 14) {
                if let name = model.partnerName {
                    HStack(spacing: 11) {
                        avatar(String(name.prefix(2)))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(name).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.Color.foreground)
                            Text("Emparejado · plan compartido").font(.system(size: 11)).foregroundStyle(Theme.Color.muted)
                        }
                    }
                } else {
                    HStack(spacing: 11) {
                        avatar("?")
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Aún sin pareja").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.Color.foreground)
                            Text("Podrás invitar a tu compañero/a desde Perfil").font(.system(size: 11)).foregroundStyle(Theme.Color.muted)
                        }
                    }
                }
            }
            .padding(.top, 18)
            Spacer().frame(height: Theme.Spacing.xl)
            ExpertPrimaryButton(title: "CONTINUAR", enabled: true) { advance() }
        }
    }

    private var healthStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            LabelText(text: "CONECTA", color: Theme.Color.accentText)
            Text("Apple Health")
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.top, 8)
            VStack(alignment: .leading, spacing: 11) {
                whyRow("Sincroniza tus entrenos automáticamente — no los registras a mano.")
                whyRow("Lee tu FC, sueño y HRV para que tu coach vea tu recuperación real.")
                whyRow("Tus ritmos y zonas se calculan solos desde tus datos.")
            }
            .padding(.top, 18)
            CardSurface(padding: 12) {
                VStack(spacing: 10) {
                    deviceRow("Concept2 PM5", "En tus entrenos de remo, ski y bici",
                              status: "Disponible", available: true)
                    Rectangle().fill(Theme.Color.hairline).frame(height: 1)
                    deviceRow("Garmin", "Sincronización automática",
                              status: "Próximamente", available: false)
                }
            }
            .padding(.top, 16)
            Spacer().frame(height: Theme.Spacing.xl)
            ExpertPrimaryButton(title: healthRequesting ? "CONECTANDO…" : "PERMITIR ACCESO", enabled: !healthRequesting) {
                Task { await connectHealth() }
            }
            if healthError {
                Text("No pudimos activar Apple Salud en este dispositivo. Puedes continuar y conectarlo más tarde desde Ajustes.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Color.warning)
                    .padding(.top, 10)
            }
            Button {
                advance()
            } label: {
                Text("Hacerlo después")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 12)
            }
            .buttonStyle(.plain)
            .disabled(healthRequesting)
        }
    }

    private var testsStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            LabelText(text: "SEMANA 1 · CALIBRACIÓN", color: Theme.Color.accentText)
            Text("Tu punto\nde partida")
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.top, 8)
            Text("Tu coach te programará tus tests en la primera semana. Los harás como sesiones normales — marcan tus números reales y calibran tu plan.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.Color.muted)
                .padding(.top, 10)
            // Point to the real "Tus tests" card on Inicio rather than list a fixed
            // battery: WHICH tests and HOW MANY are the coach's call (data-driven),
            // so we don't invent a canned 4-test set here.
            CardSurface(padding: Theme.Spacing.l) {
                HStack(spacing: Theme.Spacing.m) {
                    Text("⏱️")
                        .font(.system(size: 22))
                        .frame(width: 44, height: 44)
                        .background(Theme.Color.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        LabelText(text: "Tus tests")
                        Text("Los verás en Inicio")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.Color.foreground)
                        Text("Una tarjeta te dice cuántos llevas y cuáles faltan. Los que ponga tu coach, ni más ni menos.")
                            .font(.system(size: 11.5))
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
            }
            .padding(.top, 16)
            Spacer().frame(height: Theme.Spacing.xl)
            ExpertPrimaryButton(title: "ENTENDIDO", enabled: true) { advance() }
        }
    }

    private var loopStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            LabelText(text: "CÓMO FUNCIONA", color: Theme.Color.accentText)
            Text("Tu semana,\nen 3 pasos")
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.top, 8)
            VStack(alignment: .leading, spacing: 0) {
                loopRow(1, "Tu coach publica tu semana", "Cada domingo tienes tu plan listo en la app.")
                loopConnector
                loopRow(2, "Entrenas con la app y tu reloj", "La app te guía sesión a sesión; el Apple Watch registra tu FC.")
                loopConnector
                loopRow(3, "Tu coach ve tus resultados", "Al terminar, todo le llega. Ajusta tu plan según cómo respondes.")
            }
            .padding(.top, 20)
            Spacer().frame(height: Theme.Spacing.xl)
            ExpertPrimaryButton(title: "CASI LISTO", enabled: true) { advance() }
        }
    }

    private var doneStep: some View {
        VStack(alignment: .center, spacing: 0) {
            ZStack {
                Circle().fill(Theme.Color.accent.opacity(0.16)).frame(width: 68, height: 68)
                Image(systemName: "checkmark")
                    .font(.system(size: 26, weight: .heavy))
                    .foregroundStyle(Theme.Color.accent)
            }
            Text("Todo listo,\n\(model.firstName.isEmpty ? "vamos" : model.firstName).")
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
                .padding(.top, 18)
            Text("Tu coach está preparando tu primera semana. Te avisamos en cuanto esté.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
                .padding(.top, 10)
            Spacer().frame(height: Theme.Spacing.xl)
            ExpertPrimaryButton(title: "IR A INICIO", enabled: true) { onFinished() }
        }
    }

    // MARK: - Small pieces

    private func whyRow(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Text("›").font(.system(size: 14, weight: .heavy)).foregroundStyle(Theme.Color.accent)
            Text(text).font(.system(size: 13)).foregroundStyle(Theme.Color.muted)
        }
    }

    // Other integrations, honestly labelled: Concept2 PM5 ships today (paired from a
    // workout); Garmin auto-sync is not shipped yet. Mirrors ProfileView's device stance.
    private func deviceRow(_ name: String, _ detail: String, status: String, available: Bool) -> some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text(name).font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.Color.foreground)
                Text(detail).font(.system(size: 10.5)).foregroundStyle(Theme.Color.muted)
            }
            Spacer()
            Text(status.uppercased())
                .font(.system(size: 9.5, weight: .bold)).tracking(0.06)
                .foregroundStyle(available ? Theme.Color.ok : Theme.Color.faint)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background((available ? Theme.Color.ok : Theme.Color.faint).opacity(0.14))
                .clipShape(Capsule())
        }
    }

    private func loopRow(_ n: Int, _ title: String, _ sub: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(n)")
                .font(.system(size: 13, weight: .heavy)).italic()
                .foregroundStyle(Theme.Color.accent)
                .frame(width: 26, height: 26)
                .overlay(Circle().stroke(Theme.Color.accent, lineWidth: 1.5))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.Color.foreground)
                Text(sub).font(.system(size: 11.5)).foregroundStyle(Theme.Color.muted)
            }
        }
    }

    private var loopConnector: some View {
        Rectangle().fill(Theme.Color.hairlineStrong)
            .frame(width: 1.5, height: 14).padding(.leading, 12).padding(.vertical, 2)
    }

    private func avatar(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 12, weight: .heavy)).italic()
            .foregroundStyle(Color(red: 0.1, green: 0.06, blue: 0))
            .frame(width: 34, height: 34)
            .background(
                LinearGradient(colors: [Theme.Color.accent, Theme.Color.accentText],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
            )
            .clipShape(Circle())
    }

    // MARK: - Health connect (mirrors ProfileView.connectAppleHealth; never blocks)

    private func connectHealth() async {
        guard !healthRequesting else { return }
        healthRequesting = true
        healthError = false
        defer { healthRequesting = false }
        do {
            // Presents the system permission sheet (or returns immediately if already
            // answered). HealthKit never reports READ-grant status, so a successful
            // return = the sheet was shown → treat as connected, start sync, advance.
            try await HealthKitPermissions.request()
            HealthKitConnection.markConnectedAndSync(bearer: bearer)
            advance()
        } catch {
            // HealthKit genuinely unavailable (simulator / unprovisioned build). Do
            // NOT auto-advance — that made the button look like a silent "Siguiente".
            // Surface a note; the athlete continues with "Hacerlo después".
            healthError = true
        }
    }
}
