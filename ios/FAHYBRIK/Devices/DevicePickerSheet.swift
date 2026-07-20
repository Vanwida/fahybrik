import SwiftUI

// The device selection sheet for the two generic BLE devices (cinta, banda) — the
// direct fix for the gym failure: instead of silently grabbing the first machine it
// found, the app now LISTS what it found BY NAME (with signal strength) and the
// athlete taps the one that's theirs. When already connected it shows the connected
// device's real name and a clear DESCONECTAR action. Mirrors the PM5 picker so all
// three devices read as one instrument panel.
//
// USED BY: the heart-rate chip (`DeviceConnectCard`) and the treadmill HUD's in-run
// "Elegir" — both presented from a plain screen, where a modal is safe. The run
// PRE-START flow does NOT use this sheet: there the same list is an inline STEP
// (`RunPreStartFlow`), because a sheet presented from inside a fullScreenCover and
// bound to channel-owned state dismissed itself under the athlete. The rows, the
// signal bars, the persistent pick hint and the Bluetooth guidance are the SHARED
// components in DevicePickerComponents.swift, so the two hosts never drift.
struct DevicePickerSheet: View {
    @Bindable var channel: DeviceChannel
    /// When true (HR channel + a paired Apple Watch), a banner explains the pulse is
    /// already automatic — the belt list stays below for whoever prefers a chest strap.
    /// Default false leaves the belt / PM5 sheets and the mid-workout HUD unchanged.
    var watchHint: Bool = false
    /// Strap battery percentage shown beside the connected device's name (HR channel
    /// only). Default nil → the belt / PM5 sheets and any non-battery source show
    /// nothing, exactly as before.
    var batteryPercent: Int? = nil
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
        .deviceConnectConfirmation(channel)
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
        if DeviceBluetoothGuidance.isBlocking(channel.bluetooth) {
            DeviceBluetoothGuidance(availability: channel.bluetooth,
                                    deviceWord: channel.title.lowercased())
        } else if channel.isConnected {
            connectedState
        } else {
            scanningState
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
                    if let batteryPercent {
                        Text("· batería \(batteryPercent) %")
                            .font(Theme.Typography.small)
                            .foregroundStyle(Theme.Color.muted)
                    }
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
                Text(channel.scanHint)
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                // A LABEL, and the copy says what will happen: it appears in the list
                // and he taps it. Nothing here reconnects to it on its own.
                if channel.hasRemembered, let name = channel.rememberedName {
                    Text("Último usado: \(name) — tócalo en la lista cuando aparezca.")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                }
            } else {
                VStack(spacing: Theme.Spacing.s) {
                    ForEach(channel.candidates) { candidate in
                        // requestConnect, never connect: for a belt this raises the
                        // "¿es TU cinta?" confirmation first. The athlete's finger is
                        // the only thing that ever opens a link.
                        DeviceCandidateRow(candidate: candidate,
                                           isRemembered: candidate.id == channel.rememberedID) {
                            Haptics.light()
                            channel.requestConnect(candidate)
                        }
                    }
                }
            }
            // Persistent help — how to pick YOUR machine + which are supported. Stays
            // visible even once devices appear (the old hint vanished with the list, so
            // a lost athlete had nothing to go on).
            if let pickHint = channel.pickHint {
                DevicePickHintNote(text: pickHint)
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

}
