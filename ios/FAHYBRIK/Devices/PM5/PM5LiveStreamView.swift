import CoreBluetooth
import SwiftUI

// Sheet shown from ActiveWorkoutView when the current segment is row/ski_erg
// and we're not yet connected. Handles the four pairing states:
//   - bluetooth off / unauthorized → guidance + Settings deep-link
//   - scanning + empty → spinner + tip
//   - scanning + list → tap to connect
//   - connected → success summary + dismiss
//
// La piel es la del kit de «El día»: el marco de hoja, filas `FilaDia`, la acción anclada al conectar.
struct PM5LiveStreamView: View {
    @Bindable var store: PM5ConnectionStore
    var onDone: () -> Void = {}
    /// When set (Remo / SkiErg / BikeErg), the sheet titles the role so binding
    /// two monitors in one session is unambiguous.
    var roleTitle: String? = nil
    /// FH-95: hub calls `startScan()` before present — skip duplicate onAppear scan.
    var startsScanOnAppear: Bool = true

    @Environment(\.dismiss) private var dismiss
    @State private var ayudaAbierta = false
    @State private var diagnosticoAbierto = false

    private var useButtonTitle: String {
        if let roleTitle { return "Usar este · \(roleTitle)" }
        return "Usar este erg"
    }

    var body: some View {
        // Alcanzable en apaisado (el CTA de conectar del entreno en vivo y el gate de
        // ergo abren esta hoja con el landscape ya permitido): el marco hace scroll del
        // estado variable y deja clavados el cierre y la acción.
        MarcoDeHojaDia(roleTitle ?? "Tu erg", cerrar: { dismiss() }, conAccion: store.isConnected) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                Text(roleTitle.map { "Elige el monitor de \($0) en la sala" }
                     ?? "Conecta tu erg para ver potencia y paladas en directo")
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                content
            }
        } accion: {
            BotonAccionDia(useButtonTitle, relleno: .acento, completa: true, alto: Theme.Size.accionAnclada, impacto: .medio) {
                onDone()
                dismiss()
            }
            BotonTextoDia("Desconectar", tono: .suave, centrado: true) {
                store.disconnect()
                dismiss()
            }
        }
        .onAppear {
            if startsScanOnAppear { store.startScan() }
        }
        .onChange(of: store.isConnected) { _, connected in
            // Tras conectar, relanza el escaneo por debajo para que "Cambiar de erg"
            // siga viendo los demás monitores de la sala.
            if connected { store.startScan() }
        }
        .onDisappear { store.stopScan() }
    }

    @ViewBuilder
    private var content: some View {
        let disponibilidad = store.bluetoothState.availability
        if DeviceBluetoothGuidance.isBlocking(disponibilidad) {
            DeviceBluetoothGuidance(availability: disponibilidad, deviceWord: "erg")
        } else {
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
                if store.hasRememberedDevice {
                    BotonTextoDia("Olvidar dispositivo", tono: .suave, centrado: true) {
                        store.forgetPaired()
                    }
                }
            }
            if let err = store.lastError {
                AvisoEnLineaDia(err)
            }
            csafeDiagnosticsSection
        }
    }

    /// The illustrated guide, folded away — the persistent "never vanishes" form
    /// used once ergs are listed or one is already connected.
    private var collapsedConnectHelp: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            BotonTextoDia("Cómo conectar", tono: .suave, expandido: ayudaAbierta, accion: { ayudaAbierta.toggle() },
                          icono: { IconoDia(.ayuda, tam: 20) }, derecha: { GiroDia(abierto: ayudaAbierta) })
            if ayudaAbierta {
                PM5ConnectGuide()
                    .padding(.horizontal, Theme.Spacing.l)
            }
        }
    }

    /// Hex TX/RX ring of the workout-programming exchange — collapsed by default,
    /// only for physical debugging at the gym. Hidden until something was sent.
    @ViewBuilder
    private var csafeDiagnosticsSection: some View {
        if !store.csafeDiagnostics.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                BotonTextoDia("Diagnóstico del erg", tono: .suave, expandido: diagnosticoAbierto, accion: { diagnosticoAbierto.toggle() },
                              icono: { EmptyView() }, derecha: { GiroDia(abierto: diagnosticoAbierto) })
                if diagnosticoAbierto {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(Array(store.csafeDiagnostics.enumerated()), id: \.offset) { _, line in
                            Text(line)
                                .papel(.nota)
                                .monospaced()
                                .foregroundStyle(Theme.Color.muted)
                                .lineLimit(2)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Theme.Spacing.l)
                }
            }
        }
    }

    /// The OTHER discovered monitors while one is connected — one tap swaps ergs
    /// (drops the current, connects the tapped). Always present so the remembered
    /// erg can never hide the rest of the room; while empty it says it's looking.
    private var changeErgSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SubtituloDia("Cambiar de erg")
            let others = store.discoveredForDisplay.filter { $0.id != store.connectedIdentifier }
            if others.isEmpty {
                HStack(spacing: Theme.Spacing.s) {
                    ProgressView()
                        .tint(Theme.Color.accent)
                        .scaleEffect(0.85)
                    Text("Buscando otros ergs cercanos…")
                        .papel(.nota)
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
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
            Spacer()
        }
    }

    private var scanningLabel: String {
        switch store.connectionState {
        case .connecting:           return "Conectando…"
        case .discoveringServices:  return "Preparando la conexión…"
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
                lostNote
                Text("Asegúrate de que el erg está encendido y mostrando la pantalla principal del monitor.")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                PM5ConnectGuide()
                if store.hasRememberedDevice, let name = store.rememberedDeviceName {
                    Text("Último usado: \(name). Tócalo en la lista cuando aparezca.")
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                lostNote
                VStack(spacing: Theme.Spacing.s) {
                    // Remembered erg first + badged; tapping is what connects.
                    ForEach(store.discoveredForDisplay) { dev in
                        deviceRow(dev, isRemembered: dev.id == store.rememberedIdentifier) {
                            store.connect(dev.id)
                        }
                    }
                }
                collapsedConnectHelp
            }
        }
    }

    /// After a drop: if THIS session chose a machine, the note is the CTA
    /// (`retrievePeripherals` + `connect`). The list below stays as FH-59.
    @ViewBuilder
    private var lostNote: some View {
        if store.connectionLost, !store.isConnected {
            let frase = "Se perdió la conexión con el erg."
            if let id = store.sessionIdentifier {
                FilaDia(
                    ficha: FichaDia(.alerta, tono: .aviso),
                    titulo: frase,
                    etiqueta: "\(frase) Toca para volver a conectarlo.",
                    altoMinimo: 72,
                    enTarjeta: true,
                    alTocar: { store.connect(id) }
                ) {
                    Text("Toca para volver a conectarlo, o elígelo abajo.")
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                DevicePickHintNote(text: "\(frase) Elígelo otra vez abajo para volver a conectarlo.", glifo: .alerta)
            }
        }
    }

    // ErgData-style discovered row: erg icon + "ID <serial>" (the number on the
    // monitor is how an athlete tells ergs apart in a full gym) + a plain-Spanish
    // action line. The raw advertised name stays as secondary info when it says
    // more than "PM5 <serial>". RSSI dropped on purpose — it means nothing here.
    private func deviceRow(_ dev: PM5Discovered, isRemembered: Bool = false,
                           action: @escaping () -> Void) -> some View {
        let nombre = Self.pm5Serial(dev.name).map { "ID \($0)" } ?? dev.name
        return FilaDia(
            ficha: FichaDia(.remo),
            titulo: nombre,
            etiqueta: "Erg \(nombre), \(isRemembered ? "último usado, " : "")toca para conectar",
            altoMinimo: 72,
            enTarjeta: true,
            alTocar: action
        ) {
            // A label, not an action — same contract as the belt/strap list.
            DeviceRowDetail(text: deviceRowSubtitle(dev), isRemembered: isRemembered)
        }
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
        ListaDia {
            HStack(spacing: Theme.Spacing.m) {
                Circle().fill(Theme.Color.ok).frame(width: 10, height: 10)
                    .accessibilityHidden(true)
                Text(store.connectedDeviceName ?? "Erg")
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            lectura("Potencia", valor: store.live.powerWatts.map { "\($0) W" })
            lectura("Paladas", valor: store.live.strokeRate.map { "\($0)" })
            lectura("Distancia", valor: store.live.distanceMeters.map { Formato.entero($0, "m") })
        }
    }

    /// Acabas de conectar y el monitor todavía no ha dicho nada. Eso NO son tres
    /// guiones: es que falta la primera palada, y decirlo es lo que hace que el
    /// atleta la dé en vez de pensar que la conexión ha fallado (§7).
    private static let sinLecturaMotivo = "Esperando la primera palada"

    /// `valor` nil = no hay medida: se pinta el porqué. Mismo contrato que `ApoyoVivo`
    /// (Theme/LenguajeVivoUI.swift), en la voz de esta hoja.
    private func lectura(_ rotulo: String, valor: String?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
            Text(rotulo)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.muted)
            Spacer(minLength: Theme.Spacing.s)
            if let valor {
                Text(valor)
                    .papel(.cifra)
                    .foregroundStyle(Theme.Color.foreground)
            } else {
                Text(Self.sinLecturaMotivo)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.trailing)
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

extension PM5BluetoothState {
    /// El mismo estado de la radio, con el vocabulario que entiende la guía compartida de Bluetooth.
    var availability: BluetoothAvailability {
        switch self {
        case .unknown:      return .unknown
        case .unauthorized: return .unauthorized
        case .poweredOff:   return .poweredOff
        case .poweredOn:    return .poweredOn
        case .unsupported:  return .unsupported
        }
    }
}
