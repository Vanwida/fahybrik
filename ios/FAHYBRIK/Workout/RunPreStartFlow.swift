import SwiftUI

// #8 (rediseño aprobado) — the PRE-START sequence for a session with running work:
// a FULL-SCREEN step flow presented when the athlete taps "Empezar", per the
// approved mockup — never an embedded widget lost inside a form.
//
//   PASO 1 — "¿Dónde corres hoy?": two BIG cards (En cinta / En la calle) + Continuar.
//   PASO 2 — only for "En cinta": "Conecta tu cinta" — the how-to guide, the
//            compatibility note, "Buscar mi cinta" (the ONE existing picker sheet via
//            the shared DeviceHub channel) and "Correr sin conectar".
//
// Finishing the sequence calls the caller's ORIGINAL start closure with the chosen
// RunEnvironment — the session stamping + right-HUD auto-open plumbing downstream
// stays untouched. "En la calle" starts immediately after paso 1.
struct RunPreStartFlow: View {
    /// Shown small over the question so the athlete knows WHAT they're starting.
    let sessionTitle: String
    /// The original start closure — fired with the chosen environment.
    let onStart: (RunEnvironment) -> Void
    /// Backs out without starting (the athlete can rethink / edit the workout).
    let onCancel: () -> Void

    @State private var step: Step = .location
    @State private var choice: RunEnvironment? = nil
    @State private var hub = DeviceHub.shared

    private enum Step { case location, treadmill }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                topBar
                switch step {
                case .location:  locationStep
                case .treadmill: treadmillStep
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.l)
        }
        // THE treadmill picker (scan → list by name → pick) — the same single sheet
        // every treadmill journey in the app funnels into.
        .sheet(isPresented: pickerBinding) {
            DevicePickerSheet(channel: hub.treadmill)
        }
    }

    // MARK: - Top bar (back / cancel + session context)

    private var topBar: some View {
        HStack(spacing: Theme.Spacing.m) {
            Button {
                Haptics.light()
                if step == .treadmill {
                    withAnimation(.easeInOut(duration: 0.2)) { step = .location }
                } else {
                    onCancel()
                }
            } label: {
                Image(systemName: step == .treadmill ? "chevron.left" : "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface)
                    .clipShape(Circle())
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(step == .treadmill ? "Atrás" : "Cancelar")

            Text(sessionTitle)
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
    }

    // MARK: - Paso 1 · ¿Dónde corres hoy?

    private var locationStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            Text("¿Dónde corres hoy?")
                .font(.system(size: 28, weight: .heavy, design: .default).italic())
                .foregroundStyle(Theme.Color.foreground)
            bigCard(value: .treadmill, icon: "figure.run",
                    title: "En cinta", subtitle: "Conéctala y contrólala")
            bigCard(value: .outdoor, icon: "location.fill",
                    title: "En la calle", subtitle: "GPS, mapa y ritmo en vivo")
            Spacer(minLength: 0)
            ExpertPrimaryButton(title: "Continuar", height: 56, enabled: choice != nil) {
                guard let choice else { return }
                if choice == .outdoor {
                    onStart(.outdoor)     // la calle: nothing to connect — GO
                } else {
                    withAnimation(.easeInOut(duration: 0.2)) { step = .treadmill }
                }
            }
        }
    }

    private func bigCard(value: RunEnvironment, icon: String,
                         title: String, subtitle: String) -> some View {
        let selected = choice == value
        return Button(action: { Haptics.light(); choice = value }) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.accentText)
                Text(title)
                    .font(.system(size: 22, weight: .heavy, design: .default).italic())
                    .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.foreground)
                Text(subtitle)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(selected ? Theme.Color.accentOn.opacity(0.85) : Theme.Color.muted)
            }
            .frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading)
            .padding(18)
            .background(selected ? Theme.Color.accent : Theme.Color.surface)
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(selected ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("\(title). \(subtitle)")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    // MARK: - Paso 2 · Conecta tu cinta (shared guide — the ONE connect journey)

    private var treadmillStep: some View {
        TreadmillConnectGuide(
            link: hub.treadmill.link,
            onSearch: { searchBelt() },
            onSkip: { onStart(.treadmill) },
            onStartConnected: { onStart(.treadmill) }
        )
        .onAppear {
            // A remembered belt reconnects silently — the state simply shows
            // connected; a first-timer keeps the guide + "Buscar mi cinta".
            if hub.treadmill.hasRemembered, !hub.treadmill.isConnected {
                hub.connectTreadmill()
            }
        }
    }

    private func searchBelt() {
        Haptics.light()
        switch hub.treadmill.link {
        case .scanning, .connecting, .reconnecting:
            hub.treadmill.openPicker()                       // see progress / pick
        default:
            hub.treadmill.beginConnect(autoPresentPicker: true)
        }
    }

    private var pickerBinding: Binding<Bool> {
        Binding(get: { hub.treadmill.isPresentingPicker },
                set: { hub.treadmill.isPresentingPicker = $0 })
    }
}

// MARK: - Conecta tu cinta — the ONE treadmill connect screen
//
// Shared verbatim between the pre-start sequence (paso 2) and the treadmill HUD's
// not-connected state, so there is a SINGLE connect journey: same heading, same
// how-to, same "Buscar mi cinta" primary, same "Correr sin conectar" escape — the
// HUD case is the same screen reappearing when the belt drops mid-run, never a
// different-looking second path.
struct TreadmillConnectGuide: View {
    let link: DeviceLink
    /// "Buscar mi cinta" — scan + the shared picker (or reopen it while busy).
    let onSearch: () -> Void
    /// "Correr sin conectar" — run anyway (pre-start: GO; HUD: back to the phone HUD).
    let onSkip: () -> Void
    /// HUD-only extra: share the FTMS dump for an unrecognized machine. Hidden when nil.
    var onShareDiagnostics: (() -> Void)? = nil
    /// Pre-start only: "▶ Empezar" once the belt is live. nil in the HUD — there the
    /// live layout takes over by itself the moment the link streams.
    var onStartConnected: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            Text("Conecta tu cinta")
                .font(.system(size: 28, weight: .heavy, design: .default).italic())
                .foregroundStyle(Theme.Color.foreground)

            if link.isLive {
                connectedCard
            } else {
                howToCard
                if isBusy { busyLine }
            }

            compatibilityNote

            if let onShareDiagnostics, !link.isLive {
                Button(action: onShareDiagnostics) {
                    Text("Compartir diagnóstico")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                }
                .buttonStyle(PressScaleStyle())
            }

            Spacer(minLength: 0)

            if link.isLive, let onStartConnected {
                ExpertPrimaryButton(title: "▶ Empezar", height: 56, action: onStartConnected)
            } else if !link.isLive {
                ExpertPrimaryButton(title: "Buscar mi cinta", height: 56, action: onSearch)
            }
            SecondaryButton(title: "Correr sin conectar", action: onSkip)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // MARK: pieces

    private var connectedCard: some View {
        CardSurface(padding: Theme.Spacing.m) {
            HStack(spacing: Theme.Spacing.m) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Theme.Color.ok)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Conectada · \(link.deviceName ?? "cinta")")
                        .font(Theme.Typography.bodyEmph)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Text("Ritmo y distancia en vivo desde la cinta")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var howToCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            guideRow(1, "Enciende la cinta y ponla en su pantalla principal.")
            guideRow(2, "Si tiene ajuste de Bluetooth, actívalo.")
            guideRow(3, "Acércate; aparecerá con su nombre.")
        }
        .padding(Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }

    private func guideRow(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(n)")
                .font(.system(size: 13, weight: .heavy, design: .monospaced))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 24, height: 24)
                .background(Theme.Color.surfaceSunken)
                .clipShape(Circle())
            Text(text)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var busyLine: some View {
        HStack(spacing: Theme.Spacing.s) {
            ProgressView().tint(Theme.Color.accent).scaleEffect(0.85)
            Text(busyWord)
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    private var busyWord: String {
        switch link {
        case .reconnecting: return "Reconectando — sigue corriendo, la recuperamos sola."
        case .connecting:   return "Conectando…"
        default:            return "Buscando tu cinta…"
        }
    }

    private var isBusy: Bool {
        switch link {
        case .scanning, .connecting, .reconnecting: return true
        default: return false
        }
    }

    private var compatibilityNote: some View {
        Text("Por ahora, cintas Titanium y compatibles Bluetooth FTMS. Si la tuya no aparece, corre igual: registra la distancia a mano.")
            .font(Theme.Typography.caption)
            .foregroundStyle(Theme.Color.muted)
            .fixedSize(horizontal: false, vertical: true)
    }
}
