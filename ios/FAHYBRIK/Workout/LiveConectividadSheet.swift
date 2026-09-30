import SwiftUI

// FH-94 — live device hub. Reuses the existing pickers;
// run-environment change lives here, never as mid-HUD CORRER EN CINTA/FUERA walls.

struct LiveConectividadSheet: View {
    @Bindable var session: WorkoutSession
    let devices: [PreWorkoutDevice]
    let pool: PM5Pool
    let treadmillLink: DeviceLink
    let hrLink: DeviceLink
    let onTapErg: (PM5ConnectionStore, String) -> Void
    let onTapTreadmill: () -> Void
    let onTapHR: () -> Void
    let onDismiss: () -> Void

    /// El reloj tal como lo dice Apple; informativo, sin botones. Sin Apple Watch
    /// emparejado no se le habla de un reloj que no tiene.
    private var relojFrase: String? {
        let estado = PhoneLiveSession.shared.watchStatus
        guard WatchPresence.shared.appAvailable || estado == .recording else { return nil }
        return estado.frase
    }

    private var involvesRun: Bool {
        session.plan.segments.contains { $0.involvesRun }
    }

    var body: some View {
        MarcoDeHojaDia("Conectividad", cerrar: onDismiss) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                if involvesRun {
                    VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                        SubtituloDia("Dónde corres")
                        RunEnvironmentOptions(elegido: session.runEnvironment) { entorno in
                            session.switchRunEnvironment(to: entorno)
                        }
                    }
                }
                if let frase = relojFrase {
                    VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                        SubtituloDia("Reloj")
                        Text(frase)
                            .papel(.cuerpo)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if !devices.isEmpty {
                    VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                        SubtituloDia("Dispositivos del entreno")
                        LiveDeviceRows(
                            devices: devices,
                            pool: pool,
                            treadmillLink: treadmillLink,
                            hrLink: hrLink,
                            onTapErg: onTapErg,
                            onTapTreadmill: onTapTreadmill,
                            onTapHR: onTapHR
                        )
                    }
                }
                Text("Toca un dispositivo para buscarlo o cambiarlo. El entreno sigue en marcha.")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Live recipe device rows
//
// Every device the session recipe needs, one row each — not only the current tramo. Disconnect
// mid-workout → the row stays tappable; reconnect must not reset block/set cursor (pickers
// only, never `beginBlock`). The row says, in plain words, how each one is doing.

struct LiveDeviceRows: View {
    let devices: [PreWorkoutDevice]
    let pool: PM5Pool
    let treadmillLink: DeviceLink
    let hrLink: DeviceLink
    let onTapErg: (PM5ConnectionStore, String) -> Void
    let onTapTreadmill: () -> Void
    let onTapHR: () -> Void

    @State private var watch = WatchPresence.shared

    var body: some View {
        ListaDia {
            ForEach(devices) { device in
                fila(for: device)
            }
        }
    }

    @ViewBuilder
    private func fila(for device: PreWorkoutDevice) -> some View {
        if device == .heartRate, hrPresentation == .appleWatch {
            FilaDia(
                ficha: FichaDia { icono("applewatch") },
                titulo: "Pulso · Apple Watch",
                etiqueta: "Pulso por Apple Watch, automático",
                pista: "Toca para conectar una banda de pecho",
                altoMinimo: 72,
                alTocar: onTapHR
            ) {
                detalle("Listo · Apple Watch")
            }
        } else {
            let link = link(for: device)
            FilaDia(
                ficha: FichaDia { icono(device.icon) },
                titulo: device.titleES,
                etiqueta: "\(device.titleES), \(link.statePhrase)",
                pista: "Toca para conectar o cambiar",
                altoMinimo: 72,
                alTocar: { tap(device) }
            ) {
                detalle(link.statePhrase)
            }
        }
    }

    private func icono(_ simbolo: String) -> some View {
        Image(systemName: simbolo).font(.system(size: 22, weight: .semibold))
    }

    private func detalle(_ texto: String) -> some View {
        Text(texto)
            .papel(.nota)
            .foregroundStyle(Theme.Color.muted)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var hrPresentation: HRChipPresentation {
        HRChipPresentation.resolve(bandLink: hrLink, watchAvailable: watch.appAvailable)
    }

    private func link(for device: PreWorkoutDevice) -> DeviceLink {
        switch device {
        case .treadmill: return treadmillLink
        case .heartRate: return hrLink
        case .erg, .ergAny:
            guard let store = pool.store(for: device) else { return .idle }
            if case .streaming = store.connectionState {
                return .connected(name: store.connectedDeviceName ?? device.titleES)
            }
            var mapped = store.connectionState.deviceLink
            if case .connected = mapped, store.connectedDeviceName == nil {
                mapped = .connected(name: device.titleES)
            }
            if store.connectionLost, !store.isConnected {
                return .lost
            }
            return mapped
        }
    }

    private func tap(_ device: PreWorkoutDevice) {
        switch device {
        case .treadmill: onTapTreadmill()
        case .heartRate: onTapHR()
        case .erg, .ergAny:
            guard let store = pool.store(for: device) else { return }
            onTapErg(store, device.titleES)
        }
    }
}
