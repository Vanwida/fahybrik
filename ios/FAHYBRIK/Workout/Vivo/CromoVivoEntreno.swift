import SwiftUI

// UN CROMO PARA TODO EL LIVE — montado por `RunLiveShellView` / `MarcoVivo`.
//
// Antes cada modalidad montaba su propio árbol: `topStrip`, header suelto de
// cinta, o `ErgVivoHUDView`. FH-55 / FH-107: un solo cromo; la modalidad solo
// cambia la LECTURA del sujeto.

/// La banda superior compartida: conectividad, bloques, pausa, salir.
struct CromoVivoEntreno: View {
    let session: WorkoutSession
    /// Cuando el tramo es carrera, el chip calle ↔ cinta. Si nil → icono genérico.
    var runEnvironment: RunEnvironment? = nil
    var muestraConectividad: Bool = true
    /// Avisos de voz — solo en superficies de carrera con coach.
    var muestraVozCoach: Bool = false
    let alSalir: () -> Void
    let alVerBloques: () -> Void
    let alConectividad: () -> Void
    let alPausa: () -> Void

    @AppStorage(AudioCoachSettings.enabledKey) private var voiceCoachEnabled = true

    var body: some View {
        HStack(spacing: 6) {
            if let env = runEnvironment {
                ControlFuenteCarrera(environment: env, accion: alConectividad)
            } else if muestraConectividad {
                BotonConectividad(accion: alConectividad)
            }
            Spacer(minLength: 0)
            BotonVerBloques(accion: alVerBloques)
            if muestraVozCoach {
                BotonRedondoVivo(
                    icono: voiceCoachEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill",
                    tono: voiceCoachEnabled ? Theme.Color.accentText : Theme.Color.muted,
                    etiqueta: voiceCoachEnabled ? "Silenciar avisos de voz" : "Activar avisos de voz"
                ) {
                    voiceCoachEnabled.toggle()
                    if !voiceCoachEnabled { AudioCoach.shared.stopSpeaking() }
                }
            }
            BotonRedondoVivo(
                icono: session.isPaused ? "play.fill" : "pause.fill",
                tono: session.isPaused ? Theme.Color.accentText : Theme.Color.muted,
                etiqueta: session.isPaused ? "Reanudar" : "Pausa",
                accion: alPausa
            )
            BotonRedondoVivo(icono: "xmark", tono: Theme.Color.muted,
                             etiqueta: "Salir del entreno", accion: alSalir)
        }
    }
}

/// Botón circular del cromo compartido (misma medida que `BandaViva.cromo`).
struct BotonRedondoVivo: View {
    let icono: String
    let tono: Color
    let etiqueta: String
    let accion: () -> Void

    var body: some View {
        Button(action: { Haptics.light(); accion() }) {
            Image(systemName: icono)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(tono)
                .frame(width: BandaViva.cromo, height: BandaViva.cromo)
                .background(Theme.Color.surface.opacity(0.8), in: Circle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(etiqueta)
    }
}

/// Contexto compartido: título del tramo + chips de dispositivo en la franja,
/// nunca apilados sobre las métricas del sujeto.
struct ContextoVivoEntreno: View {
    let session: WorkoutSession
    let titulo: String
    var subtitulo: String? = nil
    let pm5: PM5ConnectionStore?
    var pm5RoleTitle: String? = nil
    var muestraPM5: Bool = false
    var muestraGPS: Bool = false
    var gpsActive: Bool = false
    let hrLink: DeviceLink
    var alTapPM5: (() -> Void)? = nil
    let alTapHR: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo)
                    .scaledFont(13, weight: .heavy, relativeTo: .footnote, italic: true)
                    .tracking(0.6)
                    .foregroundStyle(Theme.Color.accentText)
                    .lineLimit(1)
                if let subtitulo {
                    Text(subtitulo)
                        .scaledFont(12, weight: .medium, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if muestraPM5, let pm5, let alTapPM5 {
                Button(action: alTapPM5) {
                    DeviceChip(icon: "antenna.radiowaves.left.and.right",
                               text: pm5ChipText(pm5),
                               link: pm5Link(pm5))
                }
                .buttonStyle(.plain)
            }
            if muestraGPS {
                chipGPS
            }
            Button(action: alTapHR) {
                DeviceChip(icon: "heart.fill", text: hrLabel, link: hrChipLink)
            }
            .buttonStyle(.plain)
        }
    }

    private var chipGPS: some View {
        HStack(spacing: 4) {
            Image(systemName: "location.fill").font(.system(size: 8, weight: .bold))
            Text(gpsActive ? "GPS" : "GPS off")
                .scaledFont(9, weight: .heavy, relativeTo: .caption2, italic: true)
                .uppercaseTracked(0.7)
                .lineLimit(1)
        }
        .foregroundStyle(gpsActive ? Theme.Color.foreground : Theme.Color.muted)
        .padding(.horizontal, Theme.Spacing.s)
        .padding(.vertical, 4)
        .background(Theme.Color.surface.opacity(0.8), in: Capsule())
    }

    private func pm5ChipText(_ pm5: PM5ConnectionStore) -> String {
        let name = pm5RoleTitle ?? "PM5"
        if pm5.isConnected { return name }
        if pm5.connectionLost { return "Se perdió \(name)" }
        return "Conecta \(name)"
    }

    private func pm5Link(_ pm5: PM5ConnectionStore) -> DeviceLink {
        if pm5.isConnected, let id = pm5.connectedIdentifier {
            return .connected(name: pm5RoleTitle ?? id)
        }
        if pm5.connectionLost { return .lost }
        switch pm5.connectionState {
        case .scanning, .connecting: return .scanning
        case .failed(let msg): return .failed(msg)
        default: return .idle
        }
    }

    private var hrLabel: String {
        switch session.hrSource {
        case .strap:     return "HR · Banda"
        case .healthkit: return "HR · Watch"
        case .pm5:       return "HR · PM5"
        case .none:      return hrLink == .lost ? "HR · se perdió" : "HR · conectar"
        }
    }

    private var hrChipLink: DeviceLink {
        switch session.hrSource {
        case .strap:     return hrLink
        case .healthkit: return hrLink.isLive ? hrLink : .connected(name: "Watch")
        case .pm5:       return .connected(name: "PM5")
        case .none:      return hrLink
        }
    }
}
