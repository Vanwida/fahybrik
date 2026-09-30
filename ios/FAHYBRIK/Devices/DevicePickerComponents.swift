import SwiftUI

// The SHARED presentation pieces of "choose your device": the row the athlete taps,
// the signal bars, the persistent "which one is mine?" note and the Bluetooth-blocked
// guidance.
//
// WHY THEY LIVE HERE. The athlete meets the same list in two structurally different
// hosts:
//   • `DevicePickerSheet` — a MODAL, used by the heart-rate chip and by the treadmill
//     HUD's in-run "Elegir" (both presented from a plain screen).
//   • `RunPreStartFlow`'s INLINE "Cintas cerca" STEP — where a modal proved unsafe:
//     presented from inside a fullScreenCover, bound to observable channel state that
//     the channel itself mutates, the sheet tore itself down while the athlete was
//     reading the list ("veo el nombre de mi cinta y desaparece sola").
// Extracting the pieces keeps ONE definition of the row and of the guidance copy, so
// the two hosts can differ in chrome without ever drifting in substance.
//
// La piel es la del kit de «El día»: filas `FilaDia`, tarjetas `tarjetaDia`, fichas `FichaDia`.

/// RSSI → the plain word a non-technical athlete understands. One definition: the
/// row's label and any voice-over description read the same scale.
enum DeviceProximity {
    static func label(_ rssi: Int) -> String {
        switch rssi {
        case ...(-80): return "Señal débil"
        case (-79)...(-65): return "Señal media"
        default: return "Señal fuerte"
        }
    }
}

extension DeviceLink {
    /// The plain sentence for a device's link state: one table for the pre-start screen and the live sheet.
    var statePhrase: String {
        switch self {
        case .connected(let name): return "Listo · \(name)"
        case .connecting:          return "Conectando…"
        case .scanning:            return "Buscando…"
        case .lost:                return "Se perdió · vuelve a conectar"
        case .failed:              return "Reintentar"
        case .unavailable:         return "Sin señal Bluetooth"
        case .idle:                return "Sin conectar"
        }
    }
}

// MARK: - Signal strength bars

/// Four rising bars filled by RSSI — how the athlete tells their own (close, strong)
/// machine from a distant stranger's in the list. They live in the row's badge.
struct SignalBars: View {
    let rssi: Int

    private var level: Int {
        switch rssi {
        case ...(-85): return 1
        case (-84)...(-72): return 2
        case (-71)...(-58): return 3
        default: return 4
        }
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(1...4, id: \.self) { i in
                RoundedRectangle(cornerRadius: 1, style: .continuous)
                    .fill(i <= level ? Theme.Color.foreground : Theme.Color.hairlineStrong)
                    .frame(width: 4, height: CGFloat(5 + i * 3))
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - One found device

/// A single discovered device: its advertised NAME (the only thing the athlete can
/// recognise), an "Último usado" pill when it's the remembered one, the proximity word
/// and, in the row's badge, the signal bars. Tapping connects to THIS device — never "the first one found".
///
/// The pill is the ONLY thing "remembered" buys a device: it sorts to the top and says
/// so, to be found in one glance. It never connects on its own. Machines rotate — the
/// belt you used last is very likely somebody else's right now.
struct DeviceCandidateRow: View {
    let candidate: DeviceCandidate
    /// True when this is the device the athlete used last (badged + sorted first, so
    /// it's obvious). A LABEL, never an action.
    let isRemembered: Bool
    let onTap: () -> Void

    var body: some View {
        FilaDia(
            ficha: FichaDia { SignalBars(rssi: candidate.rssi) },
            titulo: candidate.name,
            etiqueta: "\(candidate.name)\(isRemembered ? ", último usado" : ""), \(DeviceProximity.label(candidate.rssi))",
            pista: "Toca para conectar",
            altoMinimo: 72,
            enTarjeta: true,
            alTocar: onTap
        ) {
            DeviceRowDetail(text: DeviceProximity.label(candidate.rssi), isRemembered: isRemembered)
        }
    }
}

/// What a found-device row says under its name: the «Último usado» pill (when it is) and one line of help.
/// Shared by the belt / strap row and the erg row, so both lists read the same.
struct DeviceRowDetail: View {
    let text: String
    let isRemembered: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if isRemembered { InfoPill(text: "Último usado", estilo: .acento) }
            Text(text)
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - "¿Es TU cinta?" — the confirmation before we touch a machine we can drive

/// The confirmation a treadmill row raises before connecting. Belts only: this app can
/// set their speed and incline and start/stop them, so connecting to the wrong one
/// reaches into a machine somebody else may be running on. Straps and ergs connect on
/// the tap alone — they can't hurt anybody.
///
/// Attached by every host that lists belts (the picker sheet and the run pre-start's
/// inline step) off the SAME channel state, so neither can forget it.
extension View {
    func deviceConnectConfirmation(_ channel: DeviceChannel) -> some View {
        alert("¿Conectar con \(channel.pendingConfirmation?.name ?? "esta cinta")?",
              isPresented: Binding(get: { channel.pendingConfirmation != nil },
                                   set: { if !$0 { channel.cancelPendingConnect() } })) {
            Button("Conectar") { Haptics.medium(); channel.confirmPendingConnect() }
            Button("Cancelar", role: .cancel) { channel.cancelPendingConnect() }
        } message: {
            Text("Asegúrate de que es TU cinta — la que tienes delante. La app puede cambiarle la velocidad y la inclinación.")
        }
    }
}

// MARK: - Persistent "which one is mine?" note

/// Guidance that stays on screen EVEN ONCE DEVICES APPEAR. The scan hint used to
/// vanish the moment the list populated, which is exactly when a lost athlete needs
/// it: a raw BLE name means nothing to them (the founder didn't recognise his own
/// treadmill's). Never gate this on `candidates.isEmpty`.
struct DevicePickHintNote: View {
    let text: String
    var glifo: GlifoDia = .ayuda

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            IconoDia(glifo, tam: 20)
                .foregroundStyle(Theme.Color.muted)
            Text(text)
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Theme.Spacing.m)
        .tarjetaDia(alAncho: true)
    }
}

// MARK: - Bluetooth unavailable

/// The honest states: the radio is off, the app was denied, or the phone has no BLE.
/// Shown INSTEAD of a list that would spin forever. Same copy in the sheet and in the
/// inline step.
struct DeviceBluetoothGuidance: View {
    let availability: BluetoothAvailability
    /// "cinta" / "banda de pulso" — named in the unauthorized copy so the athlete
    /// knows what they're unblocking.
    let deviceWord: String

    /// True when the radio state makes scanning impossible, so the host renders this
    /// instead of the scanning UI.
    static func isBlocking(_ availability: BluetoothAvailability) -> Bool {
        switch availability {
        case .poweredOff, .unauthorized, .unsupported: return true
        case .unknown, .poweredOn: return false
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                FichaDia(glifo, tono: .aviso)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(detail)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if availability == .unauthorized, let url = URL(string: UIApplication.openSettingsURLString) {
                BotonAccionDia("Abrir Ajustes", alto: Theme.Size.toque) { UIApplication.shared.open(url) }
            }
        }
        .padding(Theme.Spacing.m)
        .tarjetaDia(alAncho: true)
    }

    private var glifo: GlifoDia {
        switch availability {
        case .poweredOff:   return .sinSenal
        case .unauthorized: return .escudo
        default:            return .alerta
        }
    }

    private var title: String {
        switch availability {
        case .poweredOff:   return "Bluetooth apagado"
        case .unauthorized: return "Bluetooth bloqueado"
        default:            return "Sin Bluetooth compatible"
        }
    }

    private var detail: String {
        switch availability {
        case .poweredOff:   return "Actívalo desde el Centro de Control y vuelve aquí."
        case .unauthorized: return "Permite Bluetooth para \(Marca.nombre) en Ajustes para conectar tu \(deviceWord)."
        default:            return "Este iPhone no tiene Bluetooth compatible."
        }
    }
}
