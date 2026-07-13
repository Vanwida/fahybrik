import SwiftUI

// The "Dispositivos" card shown BEFORE a workout starts — in the pre-workout brief
// and in the free builder's final step. One tappable chip per device the session
// will use (from `PreWorkoutDeviceEligibility`), each with an honest live state
// (conectar / buscando / conectando / listo). Nothing is required: the athlete can
// start without connecting, exactly as before — connecting here just means the
// belt / strap / erg is already streaming the moment the clock starts (Zwift /
// KinoMap standard), instead of scanning mid-run.
//
// The chips read the SHARED device layer (`DeviceHub.shared` for cinta + banda,
// `PM5ConnectionStore.shared` for remo), so whatever is connected here stays
// connected into the live workout — no re-scan.
struct DeviceConnectCard: View {
    /// The devices to offer, already filtered + ordered by the caller (brief:
    /// from the session's segments; free builder: from the chosen modality).
    let devices: [PreWorkoutDevice]

    @State private var hub = DeviceHub.shared
    @State private var pm5 = PM5ConnectionStore.shared
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
        .sheet(isPresented: $showPM5Sheet) {
            PM5LiveStreamView(store: pm5)
        }
    }

    @ViewBuilder
    private func chip(for device: PreWorkoutDevice) -> some View {
        let link = link(for: device)
        Button {
            connect(device)
        } label: {
            DeviceChip(icon: device.icon, text: chipText(device, link: link), link: link)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(PressScaleStyle())
        .disabled(isBusy(link))
        .accessibilityLabel("\(device.titleES), \(stateWord(link))")
        .accessibilityHint(link.isLive ? "" : "Toca para conectar")
    }

    // MARK: - Per-device live link

    private func link(for device: PreWorkoutDevice) -> DeviceLink {
        switch device {
        case .treadmill: return hub.treadmillLink
        case .heartRate: return hub.hrLink
        case .pm5:       return pm5.connectionState.deviceLink
        }
    }

    // MARK: - Connect intent

    private func connect(_ device: PreWorkoutDevice) {
        Haptics.light()
        switch device {
        case .treadmill:
            hub.connectTreadmill()
        case .heartRate:
            hub.connectHR()
        case .pm5:
            // The erg can have several units in one box → reuse the proven picker
            // sheet, unless we already remember one (then reconnect straight away).
            if pm5.hasRememberedDevice {
                pm5.reconnectIfPossible()
            } else {
                showPM5Sheet = true
            }
        }
    }

    // MARK: - Presentation

    private func chipText(_ device: PreWorkoutDevice, link: DeviceLink) -> String {
        "\(device.titleES) · \(stateWord(link))"
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
