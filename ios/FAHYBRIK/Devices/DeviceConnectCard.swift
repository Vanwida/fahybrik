import SwiftUI

// The "Dispositivos" card shown BEFORE a workout starts — in the pre-workout brief
// and in the free builder's final step. One tappable chip per device the session
// will use (from `PreWorkoutDeviceEligibility`).
//
// Tapping a chip NEVER blindly connects: it opens the device's picker so the athlete
// chooses their OWN machine by name (the gym fix). Once connected, the chip shows the
// connected device's real name; tapping it again re-opens the picker (to disconnect
// or switch), and a long-press disconnects straight away. Nothing is required — the
// athlete can start without connecting.
//
// The chips read the SHARED device layer (`DeviceHub.shared` channels for cinta +
// banda, `PM5ConnectionStore.shared` for remo), so whatever is connected here stays
// connected into the live workout — no re-scan.
struct DeviceConnectCard: View {
    /// The devices to offer, already filtered + ordered by the caller.
    let devices: [PreWorkoutDevice]

    @State private var hub = DeviceHub.shared
    @State private var pm5 = PM5ConnectionStore.shared
    @State private var watch = WatchPresence.shared
    @State private var showPM5Sheet = false

    var body: some View {
        CardSurface(padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Dispositivos")
                Text("Conecta antes de empezar — opcional")
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 132), spacing: 8, alignment: .leading)],
                    alignment: .leading,
                    spacing: 8
                ) {
                    ForEach(devices) { device in
                        chip(for: device)
                    }
                }
            }
        }
        // The generic picker for the two channel devices; presented off each channel's
        // own `isPresentingPicker` (set by a tap OR by the scan needing a choice).
        .sheet(isPresented: pickerBinding(hub.treadmill)) {
            DevicePickerSheet(channel: hub.treadmill)
        }
        .sheet(isPresented: pickerBinding(hub.heartRate)) {
            // The picker carries the watch hint so, when the athlete is wearing an
            // Apple Watch, the sheet explains HR is already automatic (belts stay
            // listed below for whoever prefers a chest strap).
            DevicePickerSheet(channel: hub.heartRate, watchHint: watch.appAvailable)
        }
        .sheet(isPresented: $showPM5Sheet) {
            PM5LiveStreamView(store: pm5)
        }
        // A remembered STRAP is a personal device → reconnect it silently on appear.
        // Machines (belt/PM5) stay an explicit choice; never auto-grab in a gym.
        .onAppear { autoReconnectPersonalHR() }
    }

    @ViewBuilder
    private func chip(for device: PreWorkoutDevice) -> some View {
        // The heart-rate chip is watch-aware: with an Apple Watch and no active strap
        // it becomes a positive "Apple Watch" state instead of a "connect a belt" CTA.
        if device == .heartRate, hrPresentation == .appleWatch {
            appleWatchChip()
        } else {
            standardChip(device)
        }
    }

    /// The unchanged tappable chip for the belt / PM5, and for the HR strap whenever a
    /// strap is active or no watch is present.
    private func standardChip(_ device: PreWorkoutDevice) -> some View {
        let link = link(for: device)
        return Button {
            tap(device, link: link)
        } label: {
            DeviceChip(icon: device.icon, text: chipText(device, link: link), link: link)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(PressScaleStyle())
        // Long-press disconnects a live device straight away (the fast path); the sheet
        // has an explicit DESCONECTAR button for discoverability.
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.5).onEnded { _ in
                if link.isLive { Haptics.medium(); disconnect(device) }
            }
        )
        .accessibilityLabel("\(device.titleES), \(link.isLive ? "conectado a \(link.deviceName ?? device.titleES)" : stateWord(link))")
        .accessibilityHint(link.isLive ? "Toca para gestionar o desconectar" : "Toca para elegir dispositivo")
        .accessibilityAction(named: link.isLive ? "Desconectar" : "Conectar") {
            link.isLive ? disconnect(device) : tap(device, link: link)
        }
    }

    /// Positive, non-CTA HR chip shown when the athlete wears an Apple Watch and no
    /// strap is active: the pulse arrives on its own at start. Tap still opens the
    /// picker (to optionally add a chest belt) — it's an escape hatch, not a prompt.
    private func appleWatchChip() -> some View {
        Button {
            Haptics.light()
            hub.heartRate.openPicker()
        } label: {
            DeviceChip(icon: "applewatch", text: "Pulso · Apple Watch",
                       link: .connected(name: "Apple Watch"))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Pulso por Apple Watch, automático")
        .accessibilityHint("Toca para conectar una banda de pecho")
    }

    private var hrPresentation: HRChipPresentation {
        HRChipPresentation.resolve(bandLink: hub.heartRate.link,
                                   watchAvailable: watch.appAvailable)
    }

    private func autoReconnectPersonalHR() {
        guard devices.contains(.heartRate) else { return }
        let ch = hub.heartRate
        guard ch.hasRemembered, !ch.isConnected, !isBusy(ch.link) else { return }
        ch.beginConnect(autoPresentPicker: false)
    }

    // MARK: - Per-device live link

    private func link(for device: PreWorkoutDevice) -> DeviceLink {
        switch device {
        case .treadmill: return hub.treadmill.link
        case .heartRate: return hub.heartRate.link
        case .pm5:
            if case .streaming = pm5.connectionState {
                return .connected(name: pm5.connectedDeviceName ?? "Remo")
            }
            return pm5.connectionState.deviceLink
        }
    }

    private func channel(for device: PreWorkoutDevice) -> DeviceChannel? {
        switch device {
        case .treadmill: return hub.treadmill
        case .heartRate: return hub.heartRate
        case .pm5:       return nil
        }
    }

    // MARK: - Tap intent

    private func tap(_ device: PreWorkoutDevice, link: DeviceLink) {
        Haptics.light()
        if let ch = channel(for: device) {
            if link.isLive || isBusy(link) {
                ch.openPicker()                            // manage / disconnect / see progress
            } else {
                ch.beginConnect(autoPresentPicker: true)   // scan → list → pick (may auto-connect the remembered one)
            }
            return
        }
        // PM5 keeps its own richer sheet (shows live erg data). Reconnect straight to a
        // remembered erg, else open the picker.
        if pm5.isConnected {
            showPM5Sheet = true
        } else if pm5.hasRememberedDevice {
            pm5.reconnectIfPossible()
            showPM5Sheet = true
        } else {
            showPM5Sheet = true
        }
    }

    private func disconnect(_ device: PreWorkoutDevice) {
        if let ch = channel(for: device) { ch.disconnect() }
        else { pm5.disconnect() }
    }

    private func pickerBinding(_ channel: DeviceChannel) -> Binding<Bool> {
        Binding(get: { channel.isPresentingPicker },
                set: { channel.isPresentingPicker = $0 })
    }

    // MARK: - Presentation

    private func chipText(_ device: PreWorkoutDevice, link: DeviceLink) -> String {
        if let name = link.deviceName { return "\(device.titleES) · \(name)" }
        return "\(device.titleES) · \(stateWord(link))"
    }

    /// The honest one-word state, shown after the device name in the chip.
    private func stateWord(_ link: DeviceLink) -> String {
        switch link {
        case .connected:    return "listo"
        case .connecting:   return "conectando"
        case .scanning:     return "buscando"
        case .reconnecting: return "reconectando"
        case .idle:         return "conectar"
        case .unavailable:  return "sin señal"
        case .failed:       return "reintentar"
        }
    }

    private func isBusy(_ link: DeviceLink) -> Bool {
        switch link {
        case .connecting, .scanning, .reconnecting: return true
        default:                                    return false
        }
    }
}
