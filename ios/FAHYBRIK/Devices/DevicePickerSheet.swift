import SwiftUI

// The device selection sheet for the two generic BLE devices (cinta, banda) — the
// direct fix for the gym failure: instead of silently grabbing the first machine it
// found, the app now LISTS what it found BY NAME (with signal strength) and the
// athlete taps the one that's theirs. When already connected it shows the connected
// device's real name and a clear DESCONECTAR action. Mirrors the PM5 picker so all
// three devices read as one instrument panel.
struct DevicePickerSheet: View {
    @Bindable var channel: DeviceChannel
    /// When true (HR channel + a paired Apple Watch), a banner explains the pulse is
    /// already automatic — the belt list stays below for whoever prefers a chest strap.
    /// Default false leaves the belt / PM5 sheets and the mid-workout HUD unchanged.
    var watchHint: Bool = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                header
                Divider().background(Theme.Color.hairline)
                content
                Spacer(minLength: 0)
            }
            .padding(Theme.Spacing.l)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        // Dismissing without connecting stops the scan (battery); a live link stays.
        .onDisappear { channel.cancelConnect() }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(channel.title)
                    .font(Theme.Typography.headlineS)
                    .foregroundStyle(Theme.Color.foreground)
                Text(channel.isConnected ? "Conectado" : "Elige tu dispositivo")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer()
            Button(action: { dismiss() }) {
                Image(systemName: "xmark")
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cerrar")
        }
    }

    // MARK: - Content by state

    @ViewBuilder
    private var content: some View {
        switch channel.bluetooth {
        case .poweredOff:
            guidance(icon: "antenna.radiowaves.left.and.right.slash",
                     title: "Bluetooth apagado",
                     detail: "Actívalo desde el Centro de Control y vuelve aquí.") { EmptyView() }
        case .unauthorized:
            guidance(icon: "lock.shield",
                     title: "Bluetooth bloqueado",
                     detail: "Permite Bluetooth para FAHYBRID en Ajustes para conectar tu \(channel.title.lowercased()).") {
                settingsButton
            }
        case .unsupported:
            guidance(icon: "exclamationmark.triangle",
                     title: "Sin Bluetooth LE",
                     detail: "Este iPhone no soporta Bluetooth Low Energy.") { EmptyView() }
        case .unknown, .poweredOn:
            if channel.isConnected {
                connectedState
            } else {
                scanningState
            }
        }
    }

    // MARK: - Connected → name + disconnect

    private var connectedState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            CardSurface(padding: Theme.Spacing.m) {
                HStack(spacing: Theme.Spacing.s) {
                    Circle().fill(Theme.Color.ok).frame(width: 8, height: 8)
                    Text(channel.connectedName ?? channel.title)
                        .font(Theme.Typography.bodyEmph)
                        .foregroundStyle(Theme.Color.foreground)
                    Spacer()
                }
            }
            ExpertPrimaryButton(title: "DESCONECTAR") {
                Haptics.medium()
                channel.disconnect()
                dismiss()
            }
            SecondaryButton(title: "Olvidar este dispositivo") {
                channel.forget()
                dismiss()
            }
        }
    }

    // MARK: - Scanning → list of candidates

    private var scanningState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            watchHintBanner
            HStack(spacing: Theme.Spacing.s) {
                ProgressView().tint(Theme.Color.accent).scaleEffect(0.85)
                Text("Buscando dispositivos cercanos…")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                Spacer()
            }
            if channel.candidates.isEmpty {
                Text("Enciende tu \(channel.title.lowercased()) y acércate. Aparecerá aquí en cuanto la encuentre.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                if channel.hasRemembered, let name = channel.rememberedName {
                    Text("Último usado: \(name)")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                }
            } else {
                VStack(spacing: Theme.Spacing.s) {
                    ForEach(channel.candidates) { candidate in
                        candidateRow(candidate)
                    }
                }
            }
            if channel.hasRemembered {
                SecondaryButton(title: "Olvidar dispositivo recordado") {
                    channel.forget()
                }
            }
        }
    }

    /// "You're wearing an Apple Watch — HR is automatic" banner, above the belt list.
    @ViewBuilder
    private var watchHintBanner: some View {
        if watchHint {
            HStack(alignment: .top, spacing: Theme.Spacing.s) {
                Image(systemName: "applewatch")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                Text("Llevas Apple Watch: el pulso llega solo al empezar el entreno. Conecta una banda solo si prefieres el pecho.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Theme.Spacing.m)
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
    }

    private func candidateRow(_ candidate: DeviceCandidate) -> some View {
        Button(action: {
            Haptics.light()
            channel.connect(candidate.id)
        }) {
            HStack(spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(candidate.name)
                            .font(Theme.Typography.bodyEmph)
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                        if candidate.id == channel.rememberedID {
                            Text("ÚLTIMO")
                                .font(.system(size: 8, weight: .heavy, design: .default).italic())
                                .tracking(0.6)
                                .foregroundStyle(Theme.Color.accentText)
                        }
                    }
                    Text(proximityLabel(candidate.rssi))
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                }
                Spacer()
                SignalBars(rssi: candidate.rssi)
                Image(systemName: "chevron.right").foregroundStyle(Theme.Color.muted)
            }
            .padding(Theme.Spacing.m)
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(candidate.name), \(proximityLabel(candidate.rssi))")
        .accessibilityHint("Toca para conectar")
    }

    private func proximityLabel(_ rssi: Int) -> String {
        switch rssi {
        case ...(-80): return "Señal débil"
        case (-79)...(-65): return "Señal media"
        default: return "Señal fuerte"
        }
    }

    // MARK: - Bluetooth guidance

    private func guidance<CTA: View>(icon: String, title: String, detail: String,
                                     @ViewBuilder cta: () -> CTA) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(spacing: Theme.Spacing.m) {
                Image(systemName: icon)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(Theme.Typography.bodyEmph)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(detail)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            cta()
        }
    }

    @ViewBuilder
    private var settingsButton: some View {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            SecondaryButton(title: "Abrir Ajustes") { UIApplication.shared.open(url) }
        }
    }
}

// MARK: - Signal strength bars

/// Four rising bars filled by RSSI — how the athlete tells their own (close, strong)
/// machine from a distant stranger's in the list.
struct SignalBars: View {
    let rssi: Int

    private var level: Int {
        switch rssi {
        case ...(-85): return 1
        case (-84)...(-72): return 2
        case (-71)...(-58): return 3
        default: return 4
        }
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(1...4, id: \.self) { i in
                RoundedRectangle(cornerRadius: 1, style: .continuous)
                    .fill(i <= level ? Theme.Color.accent : Theme.Color.outline)
                    .frame(width: 3, height: CGFloat(4 + i * 3))
            }
        }
        .accessibilityHidden(true)
    }
}
