import SwiftUI

// The "Dispositivos" card shown BEFORE a workout starts — in the pre-workout brief
// and in the free builder's final step. One tappable chip per device the session
// will use (from `PreWorkoutDeviceEligibility`).
//
// Multi-machine functional (2026-08-04): chips are per ROLE (Remo · SkiErg · BikeErg
// · Cinta · Banda). Each PM5 role opens its own picker bound to that role's store
// in `PM5Pool`, so two Concept2 monitors can stay connected at once.
//
// Tapping a chip NEVER blindly connects: it opens the device's picker so the athlete
// chooses their OWN machine by name (the gym fix). Once connected, the chip shows the
// connected device's real name; tapping it again re-opens the picker (to disconnect
// or switch), and a long-press disconnects straight away. Nothing is required — the
// athlete can start without connecting.
struct DeviceConnectCard: View {
    /// The devices to offer, already filtered + ordered by the caller.
    let devices: [PreWorkoutDevice]

    @State private var hub = DeviceHub.shared
    @State private var pool = PM5Pool.shared
    @State private var watch = WatchPresence.shared
    /// Which PM5 role sheet is open (nil = closed). Uses the device id so
    /// Remo and Ski each present their own store.
    @State private var openPM5DeviceId: String? = nil

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
        // The generic picker for the two channel devices, presented off each channel's
        // own `isPresentingPicker` — which ONLY a chip tap on this card can raise
        // (the channel never raises it by itself; see `DeviceChannel`).
        //
        // ATTACHED ONLY FOR A DEVICE THIS CARD ACTUALLY OFFERS. It used to bind both
        // sheets unconditionally, so the pre-workout brief — which offers the HR strap
        // alone — still carried a live TREADMILL presenter. When the athlete tapped
        // "Buscar mi cinta" inside the run pre-start `.fullScreenCover`, that orphan
        // presenter, sitting on the screen UNDERNEATH, tried to present the picker and
        // UIKit refused ("only presenting a single sheet is supported"). A presenter
        // for a chip that isn't on screen has no reason to exist.
        .sheet(isPresented: pickerBinding(hub.treadmill, enabled: devices.contains(.treadmill))) {
            DevicePickerSheet(channel: hub.treadmill)
        }
        .sheet(isPresented: pickerBinding(hub.heartRate, enabled: devices.contains(.heartRate))) {
            // The picker carries the watch hint so, when the athlete is wearing an
            // Apple Watch, the sheet explains HR is already automatic (belts stay
            // listed below for whoever prefers a chest strap). It also surfaces the
            // connected strap's battery level when the strap reports one.
            DevicePickerSheet(channel: hub.heartRate,
                              watchHint: watch.appAvailable,
                              batteryPercent: hub.hrBatteryPercent)
        }
        .sheet(isPresented: pm5SheetBinding) {
            if let id = openPM5DeviceId,
               let device = devices.first(where: { $0.id == id }),
               let store = pool.store(for: device) {
                PM5LiveStreamView(store: store, roleTitle: device.isPM5 ? device.titleES : nil)
            }
        }
        // NO .onAppear CONNECT. This card used to silently reconnect a remembered HR
        // strap the moment it appeared ("it's personal, it's safe"). It isn't: straps
        // move between people too, and one exception is all it takes for the invariant
        // to stop being auditable. Every device here waits for a tap.
    }

    private var pm5SheetBinding: Binding<Bool> {
        Binding(
            get: { openPM5DeviceId != nil },
            set: { if !$0 { openPM5DeviceId = nil } }
        )
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

    // MARK: - Per-device live link

    private func link(for device: PreWorkoutDevice) -> DeviceLink {
        switch device {
        case .treadmill: return hub.treadmill.link
        case .heartRate: return hub.heartRate.link
        case .erg, .ergAny:
            guard let store = pool.store(for: device) else { return .idle }
            if case .streaming = store.connectionState {
                return .connected(name: store.connectedDeviceName ?? device.titleES)
            }
            var link = store.connectionState.deviceLink
            // Prefer role title over generic "PM5" when streaming name is unknown.
            if case .connected = link, store.connectedDeviceName == nil {
                link = .connected(name: device.titleES)
            }
            return link
        }
    }

    private func channel(for device: PreWorkoutDevice) -> DeviceChannel? {
        switch device {
        case .treadmill: return hub.treadmill
        case .heartRate: return hub.heartRate
        case .erg, .ergAny: return nil
        }
    }

    // MARK: - Tap intent

    private func tap(_ device: PreWorkoutDevice, link: DeviceLink) {
        Haptics.light()
        if let ch = channel(for: device) {
            // ONE intent for every state: the tap opens the sheet now and the scan runs
            // behind it (live → manage/disconnect, busy → watch progress, idle/lost →
            // scan → list → pick). It scans; it never connects.
            ch.openPicker()
            return
        }
        // PM5: open the role's own sheet. Hide peripherals already claimed by
        // another role so one monitor cannot be bound to Remo and Ski at once.
        if let store = pool.store(for: device) {
            store.excludePeripheralIds = pool.occupiedPeripheralIds
                .subtracting([store.connectedIdentifier].compactMap { $0 })
        }
        openPM5DeviceId = device.id
    }

    private func disconnect(_ device: PreWorkoutDevice) {
        if let ch = channel(for: device) { ch.disconnect() }
        else { pool.store(for: device)?.disconnect() }
    }

    /// `enabled == false` pins the binding to false, so a card that doesn't show this
    /// device's chip can never present its picker (see the note on the modifiers).
    private func pickerBinding(_ channel: DeviceChannel, enabled: Bool) -> Binding<Bool> {
        Binding(get: { enabled && channel.isPresentingPicker },
                set: { if enabled { channel.isPresentingPicker = $0 } })
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
        // Honest, and it points at the only way back in: the athlete taps and chooses.
        // It never says "reconectando", because nothing is reconnecting.
        case .lost:         return "se perdió · conectar"
        case .idle:         return "conectar"
        case .unavailable:  return "sin señal"
        case .failed:       return "reintentar"
        }
    }
}
