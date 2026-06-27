import CoreBluetooth
import SwiftUI

// Sheet shown from ActiveWorkoutView when the current segment is row/ski_erg
// and we're not yet connected. Handles the four pairing states:
//   - bluetooth off / unauthorized → guidance + Settings deep-link
//   - scanning + empty → spinner + tip
//   - scanning + list → tap to connect
//   - connected → success summary + dismiss
struct PM5LiveStreamView: View {
    @Bindable var store: PM5ConnectionStore
    var onDone: () -> Void = {}

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.l) {
                header
                Divider().background(Theme.Color.hairline)
                content
                Spacer(minLength: 0)
                if store.isConnected {
                    ExpertPrimaryButton(title: "USAR ESTE PM5") {
                        onDone()
                        dismiss()
                    }
                } else if store.hasRememberedDevice {
                    SecondaryButton(title: "Olvidar dispositivo") {
                        store.forgetPaired()
                    }
                }
            }
            .padding(Theme.Spacing.l)
        }
        .onAppear {
            if store.hasRememberedDevice && !store.isConnected {
                store.reconnectIfPossible()
            } else if !store.isConnected {
                store.startScan()
            }
        }
        .onDisappear { store.stopScan() }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Concept2 PM5")
                    .font(Theme.Typography.headlineS)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Conecta tu erg para potencia y SPM en directo")
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

    @ViewBuilder
    private var content: some View {
        switch store.bluetoothState {
        case .unauthorized:
            stateMessage(
                icon: "lock.shield",
                title: "Bluetooth bloqueado",
                detail: "Activa Bluetooth para FAHYBRID en Ajustes para conectar tu PM5."
            ) {
                openSettingsButton
            }
        case .poweredOff:
            stateMessage(
                icon: "antenna.radiowaves.left.and.right.slash",
                title: "Bluetooth apagado",
                detail: "Activa Bluetooth desde el Centro de Control y vuelve aquí."
            ) {
                EmptyView()
            }
        case .unsupported:
            stateMessage(
                icon: "exclamationmark.triangle",
                title: "Dispositivo sin Bluetooth LE",
                detail: "Este iPhone no soporta Bluetooth Low Energy."
            ) {
                EmptyView()
            }
        case .unknown, .poweredOn:
            scannerBody
        }
    }

    private var scannerBody: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            if store.isConnected {
                connectedCard
            } else {
                scanningHeader
                deviceList
            }
            if let err = store.lastError {
                Text(err)
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.danger)
            }
        }
    }

    private var scanningHeader: some View {
        HStack(spacing: Theme.Spacing.s) {
            ProgressView()
                .tint(Theme.Color.accent)
                .scaleEffect(0.85)
            Text(scanningLabel)
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
            Spacer()
        }
    }

    private var scanningLabel: String {
        switch store.connectionState {
        case .connecting:           return "Conectando…"
        case .discoveringServices:  return "Descubriendo servicios…"
        case .scanning:             return "Buscando ergs cercanos…"
        case .streaming:            return "Conectado"
        case .disconnecting:        return "Desconectando…"
        case .failed(let m):        return m
        case .idle:                 return "Listo para buscar"
        }
    }

    @ViewBuilder
    private var deviceList: some View {
        if store.discovered.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Asegúrate de que el PM5 está encendido y mostrando la pantalla principal.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                if store.hasRememberedDevice, let name = store.rememberedDeviceName {
                    Text("Último emparejado: \(name)")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        } else {
            VStack(spacing: Theme.Spacing.s) {
                ForEach(store.discovered) { dev in
                    Button(action: { store.connect(dev.id) }) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(dev.name)
                                    .font(Theme.Typography.bodyEmph)
                                    .foregroundStyle(Theme.Color.foreground)
                                Text("RSSI \(dev.rssi) dBm")
                                    .font(Theme.Typography.caption)
                                    .foregroundStyle(Theme.Color.muted)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(Theme.Color.muted)
                        }
                        .padding(Theme.Spacing.m)
                        .background(Theme.Color.surface)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var connectedCard: some View {
        CardSurface(padding: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                HStack(spacing: Theme.Spacing.s) {
                    Circle().fill(Theme.Color.ok).frame(width: 8, height: 8)
                    Text(store.connectedDeviceName ?? "PM5")
                        .font(Theme.Typography.bodyEmph)
                        .foregroundStyle(Theme.Color.foreground)
                    Spacer()
                }
                HStack(spacing: 6) {
                    livePill(label: "PWR", value: store.live.powerWatts.map { "\($0) W" } ?? "—")
                    livePill(label: "SPM", value: store.live.strokeRate.map { "\($0)" } ?? "—")
                    livePill(label: "DIST", value: store.live.distanceMeters.map { String(format: "%.0f m", $0) } ?? "—")
                }
            }
        }
    }

    private func livePill(label: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .uppercaseTracked()
                .foregroundStyle(Theme.Color.muted)
            Text(value)
                .font(.system(size: 14, weight: .heavy, design: .default).italic().monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
    }

    private func stateMessage<CTA: View>(
        icon: String,
        title: String,
        detail: String,
        @ViewBuilder cta: () -> CTA
    ) -> some View {
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
    private var openSettingsButton: some View {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            SecondaryButton(title: "Abrir Ajustes") {
                UIApplication.shared.open(url)
            }
        }
    }
}

// Profile sub-page: shows currently paired PM5 (if any) and offers to forget.
struct PM5SettingsView: View {
    @Bindable var store: PM5ConnectionStore
    @State private var showScanner: Bool = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                Text("Concept2 PM5")
                    .font(Theme.Typography.headlineM)
                    .foregroundStyle(Theme.Color.foreground)
                CardSurface(padding: Theme.Spacing.l) {
                    VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                        Text(store.hasRememberedDevice ? "Dispositivo emparejado" : "Sin dispositivo emparejado")
                            .font(Theme.Typography.dataLabel)
                            .uppercaseTracked()
                            .foregroundStyle(Theme.Color.muted)
                        Text(store.rememberedDeviceName ?? "—")
                            .font(Theme.Typography.bodyEmph)
                            .foregroundStyle(Theme.Color.foreground)
                        if store.isConnected {
                            HStack(spacing: 6) {
                                Circle().fill(Theme.Color.ok).frame(width: 8, height: 8)
                                Text("Streaming en directo")
                                    .font(Theme.Typography.small)
                                    .foregroundStyle(Theme.Color.muted)
                            }
                        }
                    }
                }
                if store.hasRememberedDevice {
                    SecondaryButton(title: "Olvidar este PM5") {
                        store.forgetPaired()
                    }
                }
                ExpertPrimaryButton(title: "Buscar y emparejar") {
                    showScanner = true
                }
                Spacer()
            }
            .padding(Theme.Spacing.l)
        }
        .sheet(isPresented: $showScanner) {
            PM5LiveStreamView(store: store)
        }
    }
}
