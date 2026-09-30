import SwiftUI

// FH-95 — ONE pre-live Devices screen. Every machine today's session needs is
// visible at once: Run (calle / cinta FTMS / cinta tonta), each erg role, HR.
// The athlete connects in any order, skips what they want, and taps Continuar.
// No sequential "Conecta el remo" → "Conecta el ski" gates.

struct PreWorkoutDevicesHubView: View {
    let sessionTitle: String
    let devices: [PreWorkoutDevice]
    let segments: [WorkoutSegment]
    let isBenchmark: Bool
    @Binding var answers: SessionStartAnswers
    let onContinue: () -> Void
    let onBack: () -> Void

    @State private var hub = DeviceHub.shared
    @State private var pool = PM5Pool.shared
    @State private var watch = WatchPresence.shared
    @State private var openPM5DeviceId: String? = nil
    @State private var treadmillPickerOpen = false
    @State private var runChoice: RunEnvironment? = nil

    private var needsRun: Bool {
        PreWorkoutDeviceEligibility.startRecipe(
            segments: segments, calentamientoRun: false
        ).needsRunLocation
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    header
                    ForEach(devices) { device in
                        deviceRow(device)
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .layoutPriority(1)
            footer
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .onAppear {
            syncRunChoiceFromAnswers()
            startErgScansIfNeeded()
        }
        .onDisappear { stopErgScans() }
        .onChange(of: pool.epoch) { _, _ in }
        .sheet(isPresented: pickerBinding(hub.treadmill, enabled: devices.contains(.treadmill))) {
            DevicePickerSheet(channel: hub.treadmill)
        }
        .sheet(isPresented: pickerBinding(hub.heartRate, enabled: devices.contains(.heartRate))) {
            DevicePickerSheet(channel: hub.heartRate,
                              watchHint: watch.appAvailable,
                              batteryPercent: hub.hrBatteryPercent)
        }
        .sheet(isPresented: pm5SheetBinding) {
            if let id = openPM5DeviceId,
               let device = devices.first(where: { $0.id == id }),
               let store = pool.store(for: device) {
                PM5LiveStreamView(
                    store: store,
                    roleTitle: device.isPM5 ? device.titleES : nil,
                    startsScanOnAppear: false
                )
                .id(device.id)
            }
        }
        .onChange(of: openPM5DeviceId) { _, newId in
            guard let newId,
                  let device = devices.first(where: { $0.id == newId }) else { return }
            beginPM5Scan(for: device)
        }
    }

    // MARK: - Chrome

    private var topBar: some View {
        HStack(spacing: Theme.Spacing.m) {
            BotonCromoDia(.atras, etiqueta: "Atrás", accion: onBack)
            Text(sessionTitle)
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.m)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Dispositivos")
                .papel(.seccion)
                .foregroundStyle(Theme.Color.foreground)
            Text("Conecta lo que quieras — en cualquier orden — o sigue sin monitor.")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var footer: some View {
        BotonAccionDia("Continuar", completa: true, alto: Theme.Size.accionAnclada, impacto: .medio) {
            commitRunChoice()
            onContinue()
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.m)
        .padding(.bottom, Theme.Spacing.l)
    }

    // MARK: - Rows

    private func tarjeta<Contenido: View>(@ViewBuilder _ contenido: () -> Contenido) -> some View {
        contenido()
            .padding(Theme.Spacing.m)
            .tarjetaDia(alAncho: true)
    }

    @ViewBuilder
    private func deviceRow(_ device: PreWorkoutDevice) -> some View {
        switch device {
        case .treadmill:
            runRow
        case .erg(let role):
            ergRoleRow(role)
        case .ergAny:
            ergAnyRow
        case .heartRate:
            hrRow
        }
    }

    private var runRow: some View {
        tarjeta {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                rowHeader(icon: "figure.run", title: "Correr", link: hub.treadmill.link)
                Text("¿Dónde corres hoy?")
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                RunEnvironmentOptions(elegido: runChoice) { entorno in
                    runChoice = entorno
                    if entorno != .treadmill { treadmillPickerOpen = false }
                }
                if runChoice == .treadmill {
                    treadmillConnectBlock
                }
            }
        }
    }

    @ViewBuilder
    private var treadmillConnectBlock: some View {
        if treadmillPickerOpen {
            inlineTreadmillPicker
        } else {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                statusLine(for: hub.treadmill.link)
                FilaAdaptableDia(alineacion: .center) {
                    BotonAccionDia(hub.treadmill.link.isLive ? "Cambiar cinta" : "Conectar cinta",
                                   relleno: .apagado, alto: Theme.Size.toque) {
                        if hub.treadmill.link.isLive {
                            hub.treadmill.openPicker()
                        } else {
                            hub.treadmill.beginInlineSelection()
                            treadmillPickerOpen = true
                        }
                    }
                } derecha: {
                    if !hub.treadmill.link.isLive {
                        BotonTextoDia("Sin cinta", tono: .suave) { runChoice = .indoor }
                    }
                }
            }
        }
    }

    private var inlineTreadmillPicker: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack {
                Text("Cintas cerca")
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer()
                BotonTextoDia("Cerrar", tono: .suave) {
                    hub.treadmill.endInlineSelection()
                    treadmillPickerOpen = false
                }
            }
            if DeviceBluetoothGuidance.isBlocking(hub.treadmill.bluetooth) {
                DeviceBluetoothGuidance(availability: hub.treadmill.bluetooth,
                                        deviceWord: hub.treadmill.title.lowercased())
            } else if hub.treadmill.candidates.isEmpty {
                HStack(spacing: Theme.Spacing.s) {
                    ProgressView().tint(Theme.Color.accent).scaleEffect(0.85)
                    Text(hub.treadmill.scanHint)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                }
            } else {
                ForEach(hub.treadmill.candidates) { candidate in
                    DeviceCandidateRow(
                        candidate: candidate,
                        isRemembered: candidate.id == hub.treadmill.rememberedID
                    ) {
                        hub.treadmill.requestConnect(candidate)
                    }
                }
            }
            if let pickHint = hub.treadmill.pickHint {
                DevicePickHintNote(text: pickHint)
            }
        }
        .deviceConnectConfirmation(hub.treadmill)
        .onChange(of: hub.treadmill.isConnected) { _, connected in
            guard connected else { return }
            Haptics.medium()
            runChoice = .treadmill
            treadmillPickerOpen = false
            hub.treadmill.endInlineSelection()
        }
    }

    private func ergRoleRow(_ role: ErgMachineRole) -> some View {
        let store = pool.store(for: role)
        let device = PreWorkoutDevice.erg(role)
        let skipped = answers.skippedErgRoleWires.contains(role.rawValue)
        return tarjeta {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                rowHeader(icon: role.icon, title: role.titleES, link: ergLink(store, device: device))
                statusLine(for: ergLink(store, device: device))
                FilaAdaptableDia(alineacion: .center) {
                    BotonAccionDia(store.isConnected ? "Gestionar" : "Conectar",
                                   relleno: .apagado, alto: Theme.Size.toque) { openPM5(device) }
                } derecha: {
                    if !isBenchmark, !store.isConnected {
                        BotonTextoDia("Continuar sin monitor", tono: .suave) {
                            answers.skippedErgRoleWires.insert(role.rawValue)
                        }
                    }
                }
                if skipped && !store.isConnected {
                    Text("Lo apuntarás tú en este \(role.machineWord)")
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }

    private var ergAnyRow: some View {
        let store = pool.any
        let device = PreWorkoutDevice.ergAny
        return tarjeta {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                rowHeader(icon: device.icon, title: device.titleES, link: ergLink(store, device: device))
                statusLine(for: ergLink(store, device: device))
                FilaAdaptableDia(alineacion: .center) {
                    BotonAccionDia(store.isConnected ? "Gestionar" : "Conectar",
                                   relleno: .apagado, alto: Theme.Size.toque) { openPM5(device) }
                } derecha: {
                    if !isBenchmark, !store.isConnected {
                        BotonTextoDia("Continuar sin monitor", tono: .suave) {
                            answers.skippedUnscopedErg = true
                        }
                    }
                }
            }
        }
    }

    private var hrRow: some View {
        let presentation = HRChipPresentation.resolve(
            bandLink: hub.heartRate.link, watchAvailable: watch.appAvailable
        )
        return tarjeta {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                if presentation == .appleWatch {
                    rowHeader(icon: "applewatch", title: "Pulso · Apple Watch",
                              link: .connected(name: "Apple Watch"))
                    Text("El reloj firmará pulso al empezar. Puedes añadir banda de pecho.")
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                } else {
                    rowHeader(icon: deviceIcon(.heartRate), title: "Banda de pulso",
                              link: hub.heartRate.link)
                    statusLine(for: hub.heartRate.link)
                }
                BotonAccionDia(hub.heartRate.link.isLive ? "Gestionar" : "Conectar",
                               relleno: .apagado, alto: Theme.Size.toque) {
                    hub.heartRate.reconnectSessionMachineOrOpenPicker()
                }
            }
        }
    }

    private func rowHeader(icon: String, title: String, link: DeviceLink) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
            Text(title)
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
            Spacer(minLength: 0)
            linkDot(link)
        }
    }

    private func statusLine(for link: DeviceLink) -> some View {
        Text(link.statePhrase)
            .papel(.nota)
            .foregroundStyle(Theme.Color.muted)
    }

    @ViewBuilder
    private func linkDot(_ link: DeviceLink) -> some View {
        Circle()
            .fill(link.isLive ? Theme.Color.ok : Theme.Color.faint)
            .frame(width: 8, height: 8)
    }

    // MARK: - PM5 / scans

    private func openPM5(_ device: PreWorkoutDevice) {
        Haptics.light()
        if let role = device.ergRole {
            answers.skippedErgRoleWires.remove(role.rawValue)
        }
        if case .ergAny = device {
            answers.skippedUnscopedErg = false
        }
        beginPM5Scan(for: device)
        guard let store = pool.store(for: device) else {
            openPM5DeviceId = device.id
            return
        }
        store.reconnectSessionMachineOrOpenSheet { openPM5DeviceId = device.id }
    }

    /// Explicit scan before sheet present — remount without onAppear must still see PM5s.
    private func beginPM5Scan(for device: PreWorkoutDevice) {
        for d in devices where d.isPM5 {
            pool.store(for: d)?.stopScan()
        }
        guard let store = pool.store(for: device) else { return }
        store.excludePeripheralIds = pool.occupiedPeripheralIds
            .subtracting([store.connectedIdentifier].compactMap { $0 })
        store.startScan()
    }

    private func startErgScansIfNeeded() {
        for device in devices where device.isPM5 {
            guard let store = pool.store(for: device) else { continue }
            store.excludePeripheralIds = pool.occupiedPeripheralIds
                .subtracting([store.connectedIdentifier].compactMap { $0 })
            store.startScan()
        }
    }

    private func stopErgScans() {
        for device in devices where device.isPM5 {
            pool.store(for: device)?.stopScan()
        }
    }

    private func ergLink(_ store: PM5ConnectionStore, device: PreWorkoutDevice) -> DeviceLink {
        if case .streaming = store.connectionState {
            return .connected(name: store.connectedDeviceName ?? device.titleES)
        }
        return store.connectionState.deviceLink
    }

    private func deviceIcon(_ device: PreWorkoutDevice) -> String { device.icon }

    private func syncRunChoiceFromAnswers() {
        if let env = answers.runEnvironment { runChoice = env }
        else if needsRun { runChoice = nil }
    }

    private func commitRunChoice() {
        if let runChoice { answers.runEnvironment = runChoice }
        else if needsRun, hub.treadmill.isConnected { answers.runEnvironment = .treadmill }
    }

    private var pm5SheetBinding: Binding<Bool> {
        Binding(get: { openPM5DeviceId != nil }, set: { if !$0 { openPM5DeviceId = nil } })
    }

    private func pickerBinding(_ channel: DeviceChannel, enabled: Bool) -> Binding<Bool> {
        Binding(get: { enabled && channel.isPresentingPicker },
                set: { if enabled { channel.isPresentingPicker = $0 } })
    }
}
