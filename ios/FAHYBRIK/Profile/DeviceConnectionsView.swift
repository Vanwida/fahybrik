import SwiftUI
import HealthKit

/// Pantalla «Dispositivos y apps» — agrupa Health, Watch, Polar, COROS, Garmin,
/// PM5 y la nota Amazfit. Patrón TrainingPeaks: una puerta en Perfil, marcas dentro.
struct DeviceConnectionsView: View {
    let bearer: String?

    @Environment(AppDataStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase

    @State private var toast: String? = nil

    @State private var healthConnected: Bool = HealthKitConnection.isConnected
    @State private var healthRequesting: Bool = false
    @State private var healthDenied: Bool = false
    private let healthAvailable: Bool = HKHealthStore.isHealthDataAvailable()
    @State private var showHealthDisconnectConfirm: Bool = false
    @State private var healthShowRevokeHint: Bool = false

    private var watchScheduler: AppleWatchWorkoutScheduler { AppleWatchWorkoutScheduler.shared }
    @State private var watchWorkoutsDenied: Bool = false
    @State private var showWatchWorkoutsDisconnectConfirm: Bool = false

    @State private var polarConnected: Bool = false
    @State private var polarConnecting: Bool = false
    @State private var polarSafari: SafariURL? = nil
    @State private var polarAlert: String? = nil

    @State private var corosConnected: Bool = false
    @State private var corosConnecting: Bool = false
    @State private var corosSyncing: Bool = false
    @State private var corosSafari: SafariURL? = nil
    @State private var corosAlert: String? = nil
    @State private var showCorosDisconnectConfirm: Bool = false
    @State private var corosPendingLink: WearablePendingLink? = nil
    @State private var showCorosLinkAsk: Bool = false

    var body: some View {
        ZStack(alignment: .top) {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    headerBlock
                    devicesContent
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xxl)
                .clampedToContainerWidth()
            }
            if let toast {
                ToastBanner(text: toast)
                    .padding(.top, Theme.Spacing.l)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .navigationTitle("Dispositivos y apps")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadWearables()
            await pullCorosIfConnected()
            await watchScheduler.refreshAuthorization()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await pullCorosIfConnected() }
        }
        .sheet(item: $polarSafari, onDismiss: { Task { await loadWearables() } }) { item in
            SafariView(url: item.url).ignoresSafeArea()
        }
        .sheet(item: $corosSafari, onDismiss: { Task { await loadWearables(); await pullCorosIfConnected() } }) { item in
            SafariView(url: item.url).ignoresSafeArea()
        }
        .alert("Polar", isPresented: polarAlertBinding, presenting: polarAlert) { _ in
            Button("Entendido", role: .cancel) {}
        } message: { message in
            Text(message)
        }
        .alert("COROS", isPresented: corosAlertBinding, presenting: corosAlert) { _ in
            Button("Entendido", role: .cancel) {}
        } message: { message in
            Text(message)
        }
        .confirmationDialog(
            "¿Desconectar COROS?",
            isPresented: $showCorosDisconnectConfirm,
            titleVisibility: .visible
        ) {
            Button("Desconectar", role: .destructive) { Task { await disconnectCoros() } }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Revocamos el acceso a tu cuenta COROS. El historial ya importado se conserva.")
        }
        .confirmationDialog(
            "¿Esto es el entreno?",
            isPresented: $showCorosLinkAsk,
            titleVisibility: .visible
        ) {
            Button("Sí") { Task { await answerCorosLink(yes: true) } }
            Button("No") { Task { await answerCorosLink(yes: false) } }
            Button("Ahora no", role: .cancel) {}
        } message: {
            Text("Hay un entreno previsto hoy y una actividad nueva en COROS. Si dices que no, la actividad queda en el historial y el plan no se toca.")
        }
        .confirmationDialog(
            "¿Desconectar Apple Salud?",
            isPresented: $showHealthDisconnectConfirm,
            titleVisibility: .visible
        ) {
            Button("Desconectar", role: .destructive) { disconnectAppleHealth() }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Dejaremos de leer y sincronizar tus datos de salud. Podrás volver a conectarlos cuando quieras.")
        }
        .confirmationDialog(
            "¿Quitar tus carreras del reloj?",
            isPresented: $showWatchWorkoutsDisconnectConfirm,
            titleVisibility: .visible
        ) {
            Button("Quitar", role: .destructive) { disconnectWatchWorkouts() }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Las quitaremos de la app Entrenamiento del reloj. Seguirás teniéndolas aquí, en \(Marca.nombre).")
        }
    }

    private var headerBlock: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text("Conecta tus dispositivos y apps")
                .scaledFont(16, weight: .semibold, relativeTo: .headline)
                .foregroundStyle(Theme.Color.foreground)
            Text("Elige qué integración quieres activar. Cada marca hace una cosa distinta: algunas reciben tu entreno, otras solo leen lo que haces.")
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Device groups (moved from ProfileView)

    private var devicesContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            deviceGroup(
                title: "Reciben tu entreno",
                caption: "El plan te aparece en el reloj. No necesitas el móvil para entrenar."
            ) {
                appleWatchWorkoutsRow
                Hairline()
                NavigationLink {
                    GarminSetupView(bearer: bearer)
                } label: {
                    deviceRowContent(
                        icon: "watch.analog",
                        title: "Garmin",
                        subtitle: "Cómo poner tu entreno en el reloj",
                        statusText: "ver cómo",
                        statusColor: Theme.Color.accentText
                    )
                }
                .buttonStyle(.plain)
            }

            deviceGroup(
                title: "Solo leen lo que haces",
                caption: "Tus entrenos llegan a tu entrenador, pero el plan no baja al reloj."
            ) {
                appleHealthRow
                Hairline()
                polarRow
                Hairline()
                corosRow
                Hairline()
                deviceRowContent(
                    icon: "figure.run.circle",
                    title: "Amazfit",
                    subtitle: "Activa «Apple Salud» en la app Zepp › Más ajustes",
                    statusText: "vía Salud",
                    statusColor: Theme.Color.muted
                )
            }

            deviceGroup(
                title: "En el gimnasio",
                caption: "Se conectan por Bluetooth en el momento. La banda de pulso y la cinta se buscan al empezar el entreno."
            ) {
                NavigationLink {
                    PM5SettingsView(store: PM5ConnectionStore.shared)
                } label: {
                    deviceRowContent(
                        icon: "antenna.radiowaves.left.and.right",
                        title: "Concept2 PM5",
                        subtitle: PM5ConnectionStore.shared.rememberedDeviceName ?? "Sin emparejar",
                        statusText: PM5ConnectionStore.shared.rememberedDeviceName == nil ? nil : "pareado",
                        statusColor: Theme.Color.ok
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func deviceGroup<Rows: View>(
        title: String,
        caption: String,
        @ViewBuilder rows: @escaping () -> Rows
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text(title)
                .scaledFont(12, weight: .semibold, relativeTo: .caption)
                .foregroundStyle(Theme.Color.foreground)
            Text(caption)
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 2)
            CardSurface(padding: 0) {
                VStack(spacing: 0) { rows() }
            }
        }
    }

    private func deviceRowContent(
        icon: String,
        title: String,
        subtitle: String,
        statusText: String?,
        statusColor: Color
    ) -> some View {
        let spokenStatus = statusText.map { ", \($0)" } ?? ""
        return HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                Text(subtitle)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            if let statusText {
                Text(statusText)
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(statusColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(statusColor.opacity(0.15))
                    .clipShape(Capsule())
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.faint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(subtitle)\(spokenStatus)")
        .accessibilityAddTraits(.isButton)
    }

    // MARK: - Polar

    private var polarRow: some View {
        Button {
            guard !polarConnected, !polarConnecting else { return }
            Haptics.light()
            Task { await connectPolar() }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "heart.circle")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(width: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Polar")
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(polarConnected
                         ? "Sincroniza tus entrenos automáticamente"
                         : "Conecta tu cuenta para sincronizar tus entrenos")
                        .scaledFont(11, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(2)
                }
                Spacer()
                if polarConnecting {
                    ProgressView().tint(Theme.Color.accentText)
                } else {
                    Text(polarConnected ? "conectada" : "conectar")
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(1.2)
                        .foregroundStyle(polarConnected ? Theme.Color.ok : Theme.Color.accentText)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background((polarConnected ? Theme.Color.ok : Theme.Color.accentText).opacity(0.15))
                        .clipShape(Capsule())
                    if !polarConnected {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.Color.faint)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
        }
        .buttonStyle(.plain)
        .disabled(polarConnected || polarConnecting || bearer == nil)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Polar, \(polarConnected ? "conectada" : "conectar")")
        .accessibilityHint(polarConnected ? "" : "Toca para conectar tu cuenta Polar")
        .accessibilityAddTraits(polarConnected ? [] : .isButton)
    }

    private var polarAlertBinding: Binding<Bool> {
        Binding(get: { polarAlert != nil }, set: { if !$0 { polarAlert = nil } })
    }

    private func loadWearables() async {
        guard let bearer else { return }
        guard let resp = try? await WearablesService.fetch(bearer: bearer) else { return }
        polarConnected = resp.providers.first { $0.provider == WearablesService.polar }?.connected ?? false
        corosConnected = resp.providers.first { $0.provider == WearablesService.coros }?.connected ?? false
    }

    private func connectPolar() async {
        guard let bearer, !polarConnecting else { return }
        polarConnecting = true
        defer { polarConnecting = false }
        do {
            polarSafari = SafariURL(url: try await WearablesService.polarConnectURL(bearer: bearer))
        } catch let APIError.http(status, _) where status == 503 {
            polarAlert = "Polar no está disponible todavía. Vuelve a intentarlo más adelante."
        } catch {
            polarAlert = "No pudimos conectar con Polar. Revisa tu conexión e inténtalo de nuevo."
        }
    }

    // MARK: - COROS

    @ViewBuilder
    private var corosRow: some View {
        if corosConnected {
            NavigationLink {
                CorosConnectionDetailView(
                    bearer: bearer,
                    corosConnected: $corosConnected,
                    corosSyncing: $corosSyncing,
                    onSync: { await syncCoros(userInitiated: true) },
                    onDisconnectRequest: { showCorosDisconnectConfirm = true }
                )
            } label: {
                corosRowLabel
            }
            .buttonStyle(.plain)
        } else {
            Button {
                guard !corosConnecting else { return }
                Haptics.light()
                Task { await connectCoros() }
            } label: {
                corosRowLabel
            }
            .buttonStyle(.plain)
            .disabled(corosConnecting || corosSyncing || bearer == nil)
        }
    }

    private var corosRowLabel: some View {
        HStack(spacing: 12) {
            Image(systemName: "watch.analog")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text("COROS")
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                Text(corosRowSubtitle)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(2)
            }
            Spacer()
            if corosConnecting || corosSyncing {
                ProgressView().tint(Theme.Color.accentText)
            } else {
                Text(corosConnected ? "conectada" : "conectar")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(corosConnected ? Theme.Color.ok : Theme.Color.accentText)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background((corosConnected ? Theme.Color.ok : Theme.Color.accentText).opacity(0.15))
                    .clipShape(Capsule())
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("COROS, \(corosConnected ? "conectada" : "conectar")")
        .accessibilityHint(corosConnected ? "Ver opciones de sincronización" : "Toca para conectar tu cuenta COROS")
        .accessibilityAddTraits(.isButton)
    }

    private var corosRowSubtitle: String {
        if corosSyncing { return "Sincronizando tus entrenos…" }
        if corosConnected { return "Lee tus entrenos. El plan no baja al reloj." }
        return "Conecta tu cuenta para sincronizar tus entrenos"
    }

    private var corosAlertBinding: Binding<Bool> {
        Binding(get: { corosAlert != nil }, set: { if !$0 { corosAlert = nil } })
    }

    private func connectCoros() async {
        guard let bearer, !corosConnecting else { return }
        corosConnecting = true
        defer { corosConnecting = false }
        do {
            corosSafari = SafariURL(url: try await WearablesService.corosConnectURL(bearer: bearer))
        } catch let APIError.http(status, _) where status == 503 {
            corosAlert = "COROS no está disponible todavía. Vuelve a intentarlo más adelante."
        } catch {
            corosAlert = "No pudimos conectar con COROS. Revisa tu conexión e inténtalo de nuevo."
        }
    }

    private func pullCorosIfConnected() async {
        guard corosConnected, !corosSyncing else { return }
        await syncCoros(userInitiated: false)
    }

    private func syncCoros(userInitiated: Bool = true) async {
        guard let bearer, !corosSyncing else { return }
        corosSyncing = true
        defer { corosSyncing = false }
        do {
            let resp = try await WearablesService.corosSync(bearer: bearer)
            corosConnected = resp.providers.first { $0.provider == WearablesService.coros }?.connected ?? corosConnected
            if let next = resp.pendingLinks.first(where: { $0.provider == WearablesService.coros }) {
                corosPendingLink = next
                showCorosLinkAsk = true
                return
            }
            corosPendingLink = nil
            let shouldAlert = userInitiated
                || (resp.imported ?? 0) > 0
                || resp.skipReason != nil
                || (resp.errored ?? 0) > 0
            if shouldAlert {
                corosAlert = WearablesService.corosSyncResultMessage(resp)
            }
        } catch {
            corosAlert = WearablesService.corosSyncErrorMessage(error)
            await loadWearables()
        }
    }

    private func disconnectCoros() async {
        guard let bearer else { return }
        do {
            try await WearablesService.corosDisconnect(bearer: bearer)
            corosConnected = false
            corosPendingLink = nil
        } catch {
            corosAlert = "No pudimos desconectar COROS. Inténtalo de nuevo."
        }
    }

    private func answerCorosLink(yes: Bool) async {
        guard let bearer, let link = corosPendingLink else { return }
        do {
            try await WearablesService.corosConfirm(
                bearer: bearer,
                confirmationId: link.confirmationId,
                yes: yes
            )
            corosPendingLink = nil
            await loadWearables()
        } catch {
            corosAlert = "No pudimos guardar tu respuesta. Inténtalo de nuevo."
        }
    }

    // MARK: - Apple Health

    private var appleHealthRow: some View {
        HStack(spacing: 12) {
            Image(systemName: "heart.text.square")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text("Apple Health")
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                Text(healthSubtitle)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(healthSubtitleColor)
                    .lineLimit(2)
            }
            Spacer()
            appleHealthTrailing
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
    }

    @ViewBuilder
    private var appleHealthTrailing: some View {
        if healthRequesting {
            ProgressView().tint(Theme.Color.accentText)
        } else {
            Toggle("", isOn: healthToggle)
                .labelsHidden()
                .tint(Theme.Color.accent)
                .disabled(!healthAvailable)
                .accessibilityLabel("Apple Health")
                .accessibilityValue(healthConnected ? "conectado" : "desconectado")
                .accessibilityHint(healthAvailable
                    ? "Conecta o desconecta la sincronización de tus datos de salud"
                    : "No disponible en este dispositivo")
        }
    }

    private var healthToggle: Binding<Bool> {
        Binding(
            get: { healthConnected },
            set: { turnOn in
                Haptics.light()
                if turnOn {
                    Task { await connectAppleHealth() }
                } else {
                    showHealthDisconnectConfirm = true
                }
            }
        )
    }

    private var healthSubtitle: String {
        if !healthAvailable { return "No disponible en este dispositivo" }
        if healthConnected { return "Sincroniza en segundo plano" }
        if healthRequesting { return "Pidiendo permiso…" }
        if healthDenied { return "No pudimos activar Apple Salud. Inténtalo de nuevo." }
        if healthShowRevokeHint {
            return "Desconectado. Para revocar el acceso por completo, ábrelo en la app Salud."
        }
        return "HR, sueño, peso y tu histórico de entrenos"
    }

    private var healthSubtitleColor: Color {
        if healthConnected { return Theme.Color.ok }
        if healthDenied { return Theme.Color.danger }
        return Theme.Color.muted
    }

    @MainActor
    private func connectAppleHealth() async {
        guard healthAvailable, !healthRequesting else { return }
        healthRequesting = true
        defer { healthRequesting = false }

        do {
            try await HealthKitPermissions.request()
        } catch {
            healthConnected = false
            healthDenied = true
            return
        }

        HealthKitSyncService.shared.configure(
            bearer: bearer,
            athleteId: AuthState.persistedAthleteId()
        )
        let dataStore = store
        HealthKitSyncService.shared.onBackfillCompleted = {
            Task { @MainActor in await dataStore.refreshReadiness(force: true) }
        }
        do {
            try await HealthKitSyncService.shared.connect()
        } catch {
            healthConnected = false
            healthDenied = true
            return
        }
        let athleteId = AuthState.persistedAthleteId()
        HealthKitHistoryImporter.shared.rebind(athleteId: athleteId)
        HealthKitHistoryImporter.shared.consentAndStart()
        UserDefaults.standard.set(true, forKey: HealthKitConnection.connectedKey)
        healthConnected = true
        healthDenied = false
        healthShowRevokeHint = false
        showToast("Apple Health conectado")
    }

    @MainActor
    private func disconnectAppleHealth() {
        HealthKitSyncService.shared.stop()
        HealthKitSyncService.shared.onBackfillCompleted = nil
        UserDefaults.standard.set(false, forKey: HealthKitConnection.connectedKey)
        healthConnected = false
        healthDenied = false
        healthShowRevokeHint = true
        showToast("Apple Health desconectado")
    }

    // MARK: - Apple Watch

    private var appleWatchWorkoutsRow: some View {
        HStack(spacing: 12) {
            Image(systemName: "figure.run.circle")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text("Apple Watch")
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                Text(watchWorkoutsSubtitle)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(watchWorkoutsSubtitleColor)
                    .lineLimit(3)
            }
            Spacer()
            watchWorkoutsTrailing
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
    }

    @ViewBuilder
    private var watchWorkoutsTrailing: some View {
        if watchScheduler.isWorking {
            ProgressView().tint(Theme.Color.accentText)
        } else {
            Toggle("", isOn: watchWorkoutsToggle)
                .labelsHidden()
                .tint(Theme.Color.accent)
                .disabled(!watchScheduler.isSupported)
                .accessibilityLabel("Carreras en el Apple Watch")
                .accessibilityValue(watchScheduler.isEnabled ? "activado" : "desactivado")
                .accessibilityHint(watchScheduler.isSupported
                    ? "Envía tus carreras a la app Entrenamiento del reloj"
                    : "No disponible en este dispositivo")
        }
    }

    private var watchWorkoutsToggle: Binding<Bool> {
        Binding(
            get: { watchScheduler.isEnabled },
            set: { turnOn in
                Haptics.light()
                if turnOn {
                    Task { await connectWatchWorkouts() }
                } else {
                    showWatchWorkoutsDisconnectConfirm = true
                }
            }
        )
    }

    private var watchWorkoutsSubtitle: String {
        if !watchScheduler.isSupported { return "No disponible en este dispositivo" }
        if watchWorkoutsDenied {
            return "No diste permiso. Actívalo en Ajustes → \(Marca.nombre) para ver tus carreras en el reloj."
        }
        if watchScheduler.isEnabled {
            if let count = watchScheduler.scheduledCount {
                if count == 0 {
                    return "Activado. No hay carreras en los próximos días — el resto de sesiones se hacen en la app."
                }
                return count == 1
                    ? "1 carrera lista en la app Entrenamiento del reloj"
                    : "\(count) carreras listas en la app Entrenamiento del reloj"
            }
            return "Activado. Sincronizando tus próximas carreras…"
        }
        return "Envía tus carreras a la app Entrenamiento del reloj y empieza sin sacar el móvil"
    }

    private var watchWorkoutsSubtitleColor: Color {
        if watchWorkoutsDenied { return Theme.Color.danger }
        if watchScheduler.isEnabled { return Theme.Color.ok }
        return Theme.Color.muted
    }

    @MainActor
    private func connectWatchWorkouts() async {
        let granted = await watchScheduler.enable(bearer: bearer, week: store.planWeek.value)
        watchWorkoutsDenied = !granted
        showToast(granted ? "Carreras activadas en el reloj" : "No pudimos activarlo")
    }

    @MainActor
    private func disconnectWatchWorkouts() {
        Task {
            await watchScheduler.disable()
            watchWorkoutsDenied = false
            showToast("Carreras quitadas del reloj")
        }
    }

    private func showToast(_ text: String) {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            toast = text
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) {
            withAnimation(.easeOut(duration: 0.25)) {
                toast = nil
            }
        }
    }
}

// MARK: - COROS detail (sync visible when connected)

struct CorosConnectionDetailView: View {
    let bearer: String?
    @Binding var corosConnected: Bool
    @Binding var corosSyncing: Bool
    let onSync: () async -> Void
    let onDisconnectRequest: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text("COROS")
                        .scaledFont(18, weight: .semibold, relativeTo: .title3)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Lee tus entrenos desde tu cuenta COROS. El plan no baja al reloj — solo importamos lo que haces.")
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Button {
                    Haptics.light()
                    Task { await onSync() }
                } label: {
                    HStack(spacing: 8) {
                        if corosSyncing {
                            ProgressView().tint(Theme.Color.accentOn)
                        } else {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        Text(corosSyncing ? "Sincronizando…" : "Sincronizar ahora")
                            .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                    }
                    .foregroundStyle(Theme.Color.accentOn)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Theme.Color.accent)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(corosSyncing || bearer == nil)
                .accessibilityLabel(corosSyncing ? "Sincronizando COROS" : "Sincronizar ahora")

                Button {
                    Haptics.light()
                    onDisconnectRequest()
                } label: {
                    Text("Desconectar COROS")
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.danger)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Theme.Spacing.s)
                }
                .buttonStyle(.plain)
                .disabled(corosSyncing)
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.l)
            .padding(.bottom, Theme.Spacing.xxl)
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .navigationTitle("COROS")
        .navigationBarTitleDisplayMode(.inline)
    }
}
