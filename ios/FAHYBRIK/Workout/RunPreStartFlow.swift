import SwiftUI

// #8 (rediseño aprobado) — the PRE-START sequence for a session with running work:
// a FULL-SCREEN step flow presented when the athlete taps "Empezar", per the
// approved mockup — never an embedded widget lost inside a form.
//
//   PASO 1 — "¿Dónde corres hoy?": two BIG cards (En cinta / En la calle) + Continuar.
//   PASO 2 — only for "En cinta": "Conecta tu cinta" — the how-to guide, the
//            compatibility note, "Buscar mi cinta" and "Correr sin conectar".
//   PASO 3 — "Cintas cerca": the list of found belts. A FULL-SCREEN STEP of this same
//            flow, exactly as the mockup drew it — NOT a sheet.
//
// WHY PASO 3 IS A STEP AND NOT A SHEET (field bug, founder blocked on device): this
// screen used to present `DevicePickerSheet` via `.sheet(isPresented:)` bound to
// `hub.treadmill.isPresentingPicker` — CHANNEL-OWNED state — from inside a
// fullScreenCover whose body re-renders continuously as the scan mutates `candidates`
// and `link`. The channel could therefore dismiss its own presenter: `evaluate()`
// stopped the source and idled the link under the open sheet, and the sheet's
// `onDisappear` then called `cancelConnect()`. The athlete glimpsed his treadmill's
// name and the view vanished before he could tap it.
//
// As a STEP, the list is driven by this view's private `@State step`, which nothing in
// the device layer can reach. It is entered only by an explicit tap and left only by
// the back arrow or by an actual connection. No `isPresented` binding, no presentation
// lifecycle, no `onDisappear` teardown — the dismissal is structurally impossible.
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

    private enum Step { case location, treadmill, picker }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                topBar
                switch step {
                case .location:  locationStep
                case .treadmill: treadmillStep
                case .picker:    pickerStep
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.l)
        }
        // A belt landing while the athlete is on the list closes the loop by itself:
        // back to paso 2, which now reads "✓ Conectada · <nombre>" with "▶ Empezar".
        .onChange(of: hub.treadmill.isConnected) { _, connected in
            guard connected, step == .picker else { return }
            Haptics.medium()
            withAnimation(.easeInOut(duration: 0.2)) { step = .treadmill }
        }
    }

    // MARK: - Top bar (back / cancel + session context)

    private var topBar: some View {
        HStack(spacing: Theme.Spacing.m) {
            Button {
                Haptics.light()
                goBack()
            } label: {
                Image(systemName: step == .location ? "xmark" : "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface)
                    .clipShape(Circle())
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(step == .location ? "Cancelar" : "Atrás")

            Text(sessionTitle)
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
    }

    /// The ONE way out of a step, backwards. Leaving the list without choosing stops
    /// the scan (battery) exactly like dismissing the old sheet did — the difference is
    /// that only THIS, an explicit tap, can do it.
    private func goBack() {
        switch step {
        case .location:
            onCancel()
        case .treadmill:
            withAnimation(.easeInOut(duration: 0.2)) { step = .location }
        case .picker:
            // Symmetric with `beginInlineSelection()`: releases the no-sheet latch AND
            // stops the scan if he never chose. Leaving the latch up would silently mute
            // the chip pickers everywhere else for the rest of the session.
            hub.treadmill.endInlineSelection()
            withAnimation(.easeInOut(duration: 0.2)) { step = .treadmill }
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
        // NO .onAppear CONNECT. This step used to silently reconnect a remembered belt
        // on entry, so the athlete arrived at a "✓ Conectada" he never asked for — and
        // in a gym that belt is frequently somebody else's, possibly mid-run, with our
        // app holding its control point. The button ALWAYS leads to the list now.
    }

    /// "Buscar mi cinta" — go to paso 3 and make sure a LIST-bound scan is running.
    ///
    /// `beginInlineSelection()`, NEVER `openPicker()`. Both start (or upgrade) the same
    /// scan, but `openPicker()` also raises the channel's `isPresentingPicker` — and
    /// that flag is a SHEET trigger observed by `DeviceConnectCard` and the treadmill
    /// HUD. Raising it from in here asked UIKit to present a sheet from a screen buried
    /// under this fullScreenCover; UIKit refused ("Currently, only presenting a single
    /// sheet is supported"), the presentation fight ate the athlete's taps and the list
    /// disappeared on him. This step renders the list INLINE and needs no sheet at all,
    /// so it takes the scan and leaves the presentation flag alone — and latches it down
    /// so nothing else can raise one while paso 3 is up.
    private func searchBelt() {
        Haptics.light()
        hub.treadmill.beginInlineSelection()
        withAnimation(.easeInOut(duration: 0.2)) { step = .picker }
    }

    // MARK: - Paso 3 · Cintas cerca (INLINE — see the note at the top of the file)

    private var pickerStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: 4) {
                LabelText(text: "Elegir cinta")
                Text("Cintas cerca")
                    .font(.system(size: 28, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
            }

            if DeviceBluetoothGuidance.isBlocking(hub.treadmill.bluetooth) {
                // Honest dead-end: the radio can't scan. Same copy as the sheet.
                DeviceBluetoothGuidance(availability: hub.treadmill.bluetooth,
                                        deviceWord: hub.treadmill.title.lowercased())
                Spacer(minLength: 0)
            } else {
                scanLine
                // Only the LIST scrolls. The help note below is pinned outside, so it
                // survives a full list and a short landscape screen alike.
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                        if hub.treadmill.candidates.isEmpty {
                            Text(hub.treadmill.scanHint)
                                .font(Theme.Typography.small)
                                .foregroundStyle(Theme.Color.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        } else {
                            ForEach(hub.treadmill.candidates) { candidate in
                                // requestConnect → the "¿es TU cinta?" confirmation.
                                DeviceCandidateRow(
                                    candidate: candidate,
                                    isRemembered: candidate.id == hub.treadmill.rememberedID
                                ) {
                                    Haptics.light()
                                    hub.treadmill.requestConnect(candidate)
                                }
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            // PERSISTENT — the athlete needs this MOST once names appear, so it is
            // never swapped out for the list.
            if let pickHint = hub.treadmill.pickHint {
                DevicePickHintNote(text: pickHint)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .deviceConnectConfirmation(hub.treadmill)
    }

    /// Live state of the scan: searching, connecting, or dead (with a way back in).
    @ViewBuilder
    private var scanLine: some View {
        switch hub.treadmill.link {
        case .scanning:
            busyLine("Buscando… mantén la cinta cerca y encendida.")
        case .connecting:
            busyLine("Conectando…")
        default:
            // The scan is not running (it ended, or Bluetooth hiccuped). Say so and
            // offer the way back in instead of a spinner that lies.
            HStack(spacing: Theme.Spacing.s) {
                Text("Búsqueda detenida.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                Button("Buscar otra vez") {
                    Haptics.light()
                    hub.treadmill.beginInlineSelection()   // inline list — never a sheet
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                Spacer(minLength: 0)
            }
        }
    }

    private func busyLine(_ text: String) -> some View {
        HStack(spacing: Theme.Spacing.s) {
            ProgressView().tint(Theme.Color.accent).scaleEffect(0.85)
            Text(text)
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
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
                // The belt dropped → say it plainly, ABOVE the how-to. Nothing is
                // recovering it; "Buscar mi cinta" below is the way back, through the
                // list, with the athlete choosing.
                if link == .lost { lostCard }
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

    /// "Se perdió la conexión" — the honest state after a drop. No spinner, because
    /// nothing is running; the athlete reconnects from the list when he wants to.
    private var lostCard: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Theme.Color.warning)
            VStack(alignment: .leading, spacing: 2) {
                Text("Se perdió la conexión con la cinta")
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Puedes seguir corriendo. Si quieres volver a conectarla, búscala y elígela otra vez.")
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.warningTint)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .combine)
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
        case .connecting: return "Conectando…"
        default:          return "Buscando tu cinta…"
        }
    }

    /// `.lost` is deliberately NOT busy: it used to say "Reconectando — sigue corriendo,
    /// la recuperamos sola", which was both a lie and a promise we must never make.
    private var isBusy: Bool {
        switch link {
        case .scanning, .connecting: return true
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
