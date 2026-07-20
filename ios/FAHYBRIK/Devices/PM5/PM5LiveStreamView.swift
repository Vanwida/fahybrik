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
                    SecondaryButton(title: "Desconectar") {
                        store.disconnect()
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
            // SIEMPRE buscar al abrir — aunque haya un erg recordado o ya conectado.
            // El remo recordado no puede esconder el SKI de al lado: la lista de
            // ergs cercanos tiene que estar visible desde el primer segundo.
            store.startScan()
            if store.hasRememberedDevice && !store.isConnected {
                store.reconnectIfPossible()
            }
        }
        .onChange(of: store.isConnected) { _, connected in
            // Conectar (tap o auto-reconexión) para el escaneo por debajo; relánzalo
            // para que "Cambiar de erg" siga viendo los demás PM5 de la sala.
            if connected { store.startScan() }
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
                changeErgSection
                collapsedConnectHelp
            } else {
                scanningHeader
                deviceList
            }
            if let err = store.lastError {
                Text(err)
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.danger)
            }
            csafeDiagnosticsSection
        }
    }

    /// The illustrated guide, folded away — the persistent "never vanishes" form
    /// used once ergs are listed or one is already connected.
    private var collapsedConnectHelp: some View {
        DisclosureGroup {
            PM5ConnectGuide()
                .padding(.top, Theme.Spacing.s)
        } label: {
            Text("CÓMO CONECTAR")
                .font(.system(size: 10, weight: .heavy))
                .tracking(0.8)
                .foregroundStyle(Theme.Color.muted)
        }
        .tint(Theme.Color.muted)
    }

    /// Hex TX/RX ring of the workout-programming exchange — collapsed by default,
    /// only for physical debugging at the gym. Hidden until something was sent.
    @ViewBuilder
    private var csafeDiagnosticsSection: some View {
        if !store.csafeDiagnostics.isEmpty {
            DisclosureGroup {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(store.csafeDiagnostics.enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(.system(size: 9, weight: .regular, design: .monospaced))
                            .foregroundStyle(Theme.Color.muted)
                            .lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 4)
            } label: {
                Text("DIAGNÓSTICO PM5")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(0.8)
                    .foregroundStyle(Theme.Color.muted)
            }
            .tint(Theme.Color.muted)
        }
    }

    /// The OTHER discovered PM5s while one is connected — one tap swaps ergs
    /// (drops the current, connects the tapped). Always present so the remembered
    /// erg can never hide the rest of the room; while empty it says it's looking.
    private var changeErgSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            LabelText(text: "CAMBIAR DE ERG", size: 11)
            let others = store.discovered.filter { $0.id != store.connectedIdentifier }
            if others.isEmpty {
                HStack(spacing: Theme.Spacing.s) {
                    ProgressView()
                        .tint(Theme.Color.accent)
                        .scaleEffect(0.85)
                    Text("Buscando otros ergs cercanos…")
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                }
            } else {
                VStack(spacing: Theme.Spacing.s) {
                    ForEach(others) { dev in
                        deviceRow(dev) { store.switchTo(dev.id) }
                    }
                }
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
            // Nothing found yet → the illustrated guide carries the whole state
            // (ErgData's move): show WHAT to press on the monitor, not a spinner.
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                Text("Asegúrate de que el PM5 está encendido y mostrando la pantalla principal.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                PM5ConnectGuide()
                if store.hasRememberedDevice, let name = store.rememberedDeviceName {
                    Text("Último emparejado: \(name)")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                VStack(spacing: Theme.Spacing.s) {
                    ForEach(store.discovered) { dev in
                        deviceRow(dev) { store.connect(dev.id) }
                    }
                }
                collapsedConnectHelp
            }
        }
    }

    // ErgData-style discovered row: erg icon + "ID <serial>" (the number on the
    // monitor is how an athlete tells ergs apart in a full gym) + a plain-Spanish
    // action line. The raw advertised name stays as secondary info when it says
    // more than "PM5 <serial>". RSSI dropped on purpose — it means nothing here.
    private func deviceRow(_ dev: PM5Discovered, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.m) {
                Image(systemName: "figure.rower")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(width: 38, height: 38)
                    .background(Theme.Color.surfaceSunken)
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(Self.pm5Serial(dev.name).map { "ID \($0)" } ?? dev.name)
                        .font(Theme.Typography.bodyEmph)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(deviceRowSubtitle(dev))
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
        .accessibilityLabel("Erg \(Self.pm5Serial(dev.name).map { "ID \($0)" } ?? dev.name), toca para conectar")
    }

    /// The PM5 advertises "PM5 <serial>" (sometimes with extra tokens). The longest
    /// digit run IS the ID shown on the monitor's own screen; nil when the name
    /// carries no usable number (then the raw name is shown untouched).
    static func pm5Serial(_ name: String) -> String? {
        let runs = name.split(whereSeparator: { !$0.isNumber })
        guard let best = runs.max(by: { $0.count < $1.count }), best.count >= 4 else { return nil }
        return String(best)
    }

    private func deviceRowSubtitle(_ dev: PM5Discovered) -> String {
        guard let serial = Self.pm5Serial(dev.name) else { return "Toca para conectar" }
        // Anything the name says beyond "PM5 <serial>" (e.g. "Row"/"Ski") is worth
        // keeping — it tells machines apart. Pure "PM5 <serial>" adds nothing.
        let leftover = dev.name
            .replacingOccurrences(of: serial, with: "")
            .replacingOccurrences(of: "PM5", with: "", options: .caseInsensitive)
            .trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        return leftover.isEmpty ? "Toca para conectar" : "Toca para conectar · \(dev.name)"
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
