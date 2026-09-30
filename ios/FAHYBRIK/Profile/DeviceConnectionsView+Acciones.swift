import SwiftUI

// LAS ACCIONES DE «DISPOSITIVOS Y APPS» contra cada proveedor: leer quién está conectado, conectar (siempre tras un
// toque del atleta), sincronizar y desconectar. Son las mismas de siempre, sacadas de la vista para que el fichero
// del cuerpo se lea de un vistazo; el estado que tocan vive en `DeviceConnectionsView`.

extension DeviceConnectionsView {

    /// Un aviso pasajero de buena noticia: el único aviso de la app (`.avisoDia`).
    func avisa(_ texto: String) {
        aviso = AvisoDia.Contenido(tono: .ok, texto: texto)
    }

    func loadWearables() async {
        guard let bearer else { return }
        guard let resp = try? await WearablesService.fetch(bearer: bearer) else { return }
        polarConnected = resp.providers.first { $0.provider == WearablesService.polar }?.connected ?? false
        corosConnected = resp.providers.first { $0.provider == WearablesService.coros }?.connected ?? false
    }

    // MARK: - Polar

    func connectPolar() async {
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

    func connectCoros() async {
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

    func pullCorosIfConnected() async {
        guard corosConnected, !corosSyncing else { return }
        await syncCoros(userInitiated: false)
    }

    func syncCoros(userInitiated: Bool = true) async {
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

    func disconnectCoros() async {
        guard let bearer else { return }
        do {
            try await WearablesService.corosDisconnect(bearer: bearer)
            corosConnected = false
            corosPendingLink = nil
        } catch {
            corosAlert = "No pudimos desconectar COROS. Inténtalo de nuevo."
        }
    }

    func answerCorosLink(yes: Bool) async {
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

    // MARK: - Apple Salud

    @MainActor
    func connectAppleHealth() async {
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
        avisa("Apple Health conectado")
    }

    @MainActor
    func disconnectAppleHealth() {
        HealthKitSyncService.shared.stop()
        HealthKitSyncService.shared.onBackfillCompleted = nil
        UserDefaults.standard.set(false, forKey: HealthKitConnection.connectedKey)
        healthConnected = false
        healthDenied = false
        healthShowRevokeHint = true
        avisa("Apple Health desconectado")
    }

    // MARK: - Apple Watch

    @MainActor
    func connectWatchWorkouts() async {
        let granted = await watchScheduler.enable(bearer: bearer, week: store.planWeek.value)
        watchWorkoutsDenied = !granted
        if granted {
            avisa("Carreras activadas en el reloj")
        } else {
            aviso = AvisoDia.Contenido(tono: .fallo, texto: "No pudimos activarlo")
        }
    }

    @MainActor
    func disconnectWatchWorkouts() {
        Task {
            await watchScheduler.disable()
            watchWorkoutsDenied = false
            avisa("Carreras quitadas del reloj")
        }
    }
}
