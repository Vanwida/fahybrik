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
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Atrás")
            Text(sessionTitle)
                .font(Theme.Typography.caption)
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
                .scaledFont(22, weight: .heavy, relativeTo: .title2, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Text("Conecta lo que quieras — en cualquier orden — o sigue sin monitor.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var footer: some View {
        ExpertPrimaryButton(title: "Continuar") {
            commitRunChoice()
            onContinue()
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.m)
        .padding(.bottom, Theme.Spacing.l)
    }

    // MARK: - Rows

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
        CardSurface(padding: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                rowHeader(icon: "figure.run", title: "Correr", link: hub.treadmill.link)
                Text("¿Dónde corres hoy?")
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                VStack(spacing: Theme.Spacing.s) {
                    runEnvButton(.outdoor, icon: "location.fill", title: "Calle",
                                 subtitle: SessionStartPolicy.meterAuthoritySubtitle(for: .outdoor))
                    runEnvButton(.treadmill, icon: "figure.run", title: "Cinta con conexión",
                                 subtitle: SessionStartPolicy.meterAuthoritySubtitle(for: .treadmill))
                    runEnvButton(.indoor, icon: "applewatch", title: "Cinta sin conexión",
                                 subtitle: SessionStartPolicy.meterAuthoritySubtitle(for: .indoor))
                }
                if runChoice == .treadmill {
                    treadmillConnectBlock
                }
            }
        }
    }

    private func runEnvButton(_ env: RunEnvironment, icon: String, title: String, subtitle: String) -> some View {
        let selected = runChoice == env
        return Button {
            Haptics.light()
            runChoice = env
            if env != .treadmill { treadmillPickerOpen = false }
        } label: {
            HStack(spacing: Theme.Spacing.m) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.accentText)
                    .frame(width: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(Theme.Typography.bodyEmph)
                        .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.foreground)
                    Text(subtitle)
                        .font(Theme.Typography.caption)
                        .foregroundStyle(selected ? Theme.Color.accentOn.opacity(0.85) : Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Theme.Color.accentOn)
                }
            }
            .padding(Theme.Spacing.m)
            .background(selected ? Theme.Color.accent : Theme.Color.surfaceSunken)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var treadmillConnectBlock: some View {
        if treadmillPickerOpen {
            inlineTreadmillPicker
        } else {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                statusLine(for: hub.treadmill.link, deviceName: "Cinta")
                HStack(spacing: Theme.Spacing.s) {
                    SecondaryButton(title: hub.treadmill.link.isLive ? "Cambiar cinta" : "Conectar cinta") {
                        Haptics.light()
                        if hub.treadmill.link.isLive {
                            hub.treadmill.openPicker()
                        } else {
                            hub.treadmill.beginInlineSelection()
                            treadmillPickerOpen = true
                        }
                    }
                    if !hub.treadmill.link.isLive {
                        Button("Sin cinta") {
                            Haptics.light()
                            runChoice = .indoor
                        }
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
        }
    }

    private var inlineTreadmillPicker: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack {
                Text("Cintas cerca")
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer()
                Button("Cerrar") {
                    hub.treadmill.endInlineSelection()
                    treadmillPickerOpen = false
                }
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
            }
            if DeviceBluetoothGuidance.isBlocking(hub.treadmill.bluetooth) {
                DeviceBluetoothGuidance(availability: hub.treadmill.bluetooth,
                                        deviceWord: hub.treadmill.title.lowercased())
            } else if hub.treadmill.candidates.isEmpty {
                HStack(spacing: Theme.Spacing.s) {
                    ProgressView().tint(Theme.Color.accent).scaleEffect(0.85)
                    Text(hub.treadmill.scanHint)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                }
            } else {
                ForEach(hub.treadmill.candidates) { candidate in
                    DeviceCandidateRow(
                        candidate: candidate,
                        isRemembered: candidate.id == hub.treadmill.rememberedID
                    ) {
                        Haptics.light()
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
        return CardSurface(padding: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                rowHeader(icon: role.icon, title: role.titleES, link: ergLink(store, device: device))
                statusLine(for: ergLink(store, device: device), deviceName: role.titleES)
                HStack(spacing: Theme.Spacing.s) {
                    SecondaryButton(title: store.isConnected ? "Gestionar" : "Conectar") {
                        openPM5(device)
                    }
                    if !isBenchmark, !store.isConnected {
                        Button("Continuar sin monitor") {
                            Haptics.light()
                            answers.skippedErgRoleWires.insert(role.rawValue)
                        }
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                    }
                }
                if skipped && !store.isConnected {
                    Text("Lo apuntarás tú en este \(role.machineWord)")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }

    private var ergAnyRow: some View {
        let store = pool.any
        let device = PreWorkoutDevice.ergAny
        return CardSurface(padding: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                rowHeader(icon: device.icon, title: device.titleES, link: ergLink(store, device: device))
                statusLine(for: ergLink(store, device: device), deviceName: device.titleES)
                HStack(spacing: Theme.Spacing.s) {
                    SecondaryButton(title: store.isConnected ? "Gestionar" : "Conectar") {
                        openPM5(device)
                    }
                    if !isBenchmark, !store.isConnected {
                        Button("Continuar sin monitor") {
                            Haptics.light()
                            answers.skippedUnscopedErg = true
                        }
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
        }
    }

    private var hrRow: some View {
        let presentation = HRChipPresentation.resolve(
            bandLink: hub.heartRate.link, watchAvailable: watch.appAvailable
        )
        return CardSurface(padding: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                if presentation == .appleWatch {
                    rowHeader(icon: "applewatch", title: "Pulso · Apple Watch",
                              link: .connected(name: "Apple Watch"))
                    Text("El reloj firmará pulso al empezar. Puedes añadir banda de pecho.")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                } else {
                    rowHeader(icon: deviceIcon(.heartRate), title: "Banda de pulso",
                              link: hub.heartRate.link)
                    statusLine(for: hub.heartRate.link, deviceName: "Banda")
                }
                SecondaryButton(title: hub.heartRate.link.isLive ? "Gestionar" : "Conectar") {
                    Haptics.light()
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
                .font(Theme.Typography.bodyEmph)
                .foregroundStyle(Theme.Color.foreground)
            Spacer(minLength: 0)
            linkDot(link)
        }
    }

    private func statusLine(for link: DeviceLink, deviceName: String) -> some View {
        Text(statusPhrase(link, deviceName: deviceName))
            .font(Theme.Typography.caption)
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

    private func statusPhrase(_ link: DeviceLink, deviceName: String) -> String {
        switch link {
        case .connected(let name): return "Listo · \(name)"
        case .connecting:          return "Conectando…"
        case .scanning:            return "Buscando…"
        case .lost:                return "Se perdió · vuelve a conectar"
        case .failed:              return "Reintentar"
        case .unavailable:         return "Sin señal Bluetooth"
        case .idle:                return "Sin conectar"
        }
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
