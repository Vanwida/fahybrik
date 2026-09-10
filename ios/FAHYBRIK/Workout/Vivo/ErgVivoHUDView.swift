import SwiftUI

// EL ERG EN VIVO — mismo marco que correr al aire (`OutdoorRunHUDView`).
//
// Antes: `HostVivo` + `ErgHUDContent` + `apoyosDelHost`, y el CTA de conectar
// PM5 se apilaba sobre s/min · vatios · pulso en horizontal. Los dispositivos
// viven en el contexto (chips PM5 + pulso) y en la hoja Conectividad — nunca
// encima de las métricas de la máquina (FH-107 / FH-55).

struct ErgVivoHUDView: View {
    let session: WorkoutSession
    let pm5: PM5ConnectionStore
    let hrLink: DeviceLink
    let accionTitulo: String
    let alTocarAccion: () -> Void
    let alSalir: () -> Void
    let alVerBloques: () -> Void
    let alConectividad: () -> Void
    let alTapPM5: () -> Void
    let alTapHR: () -> Void
    var partnerStrip: DoblesLiveStripState? = nil
    @Binding var partnerStripCollapsed: Bool
    var partnerFirstName: String? = nil

    private var liveErgRole: ErgMachineRole? {
        guard session.tramoIsErg else { return nil }
        return ErgMachineRole(modality: session.currentTramo.modality)
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea().instrumentCanvas()
            Ambiente(zona: session.liveZone)
            MarcoVivo {
                cromo
            } contexto: {
                contexto
            } sujeto: {
                BandaSujeto {
                    ErgHUDContent(session: session, pm5: pm5)
                }
            } apoyos: {
                apoyos
            } accion: {
                FranjaAccion(titulo: accionTitulo,
                             unicaSalida: session.currentBlockIsStructural,
                             accion: alTocarAccion)
            }
        }
        .allowsLandscape()
    }

    // MARK: - Cromo

    private var cromo: some View {
        HStack(spacing: 6) {
            BotonConectividad(accion: alConectividad)
            Spacer(minLength: 0)
            BotonVerBloques(accion: alVerBloques)
            botonRedondo(session.isPaused ? "play.fill" : "pause.fill",
                         tono: session.isPaused ? Theme.Color.accentText : Theme.Color.muted,
                         etiqueta: session.isPaused ? "Reanudar" : "Pausa") {
                session.togglePause()
            }
            botonRedondo("xmark", tono: Theme.Color.muted, etiqueta: "Salir del entreno") {
                alSalir()
            }
        }
    }

    private func botonRedondo(_ icono: String,
                              tono: Color,
                              etiqueta: String,
                              accion: @escaping () -> Void) -> some View {
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

    // MARK: - Contexto — tramo + dispositivos (no encima de las métricas)

    private var contexto: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: 2) {
                Text(tituloDeContexto)
                    .scaledFont(13, weight: .heavy, relativeTo: .footnote, italic: true)
                    .tracking(0.6)
                    .foregroundStyle(Theme.Color.accentText)
                    .lineLimit(1)
                if let sub = subtituloDeContexto {
                    Text(sub)
                        .scaledFont(12, weight: .medium, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            Button(action: alTapPM5) {
                DeviceChip(icon: "antenna.radiowaves.left.and.right",
                           text: pm5ChipText,
                           link: pm5Link)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(pm5.isConnected
                ? "\(liveErgRole?.titleES ?? "PM5") conectado"
                : "Conectar \(liveErgRole?.titleES ?? "PM5")")
            Button(action: alTapHR) {
                DeviceChip(icon: "heart.fill", text: hrLabel, link: hrChipLink)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Frecuencia cardiaca")
        }
    }

    private var tituloDeContexto: String { session.currentTramo.label }

    private var subtituloDeContexto: String? {
        if session.currentSegment?.isEMOM == true {
            return session.currentSegment?.title
        }
        if let nombre = session.currentSegment?.formatScheme?.displayName,
           nombre.caseInsensitiveCompare(tituloDeContexto) != .orderedSame {
            return nombre
        }
        return nil
    }

    private var pm5ChipText: String {
        let name = liveErgRole?.titleES ?? "PM5"
        if pm5.isConnected { return name }
        if pm5.connectionLost { return "Se perdió \(name)" }
        return "Conecta \(name)"
    }

    private var pm5Link: DeviceLink {
        if pm5.isConnected, let id = pm5.connectedIdentifier {
            return .connected(name: liveErgRole?.titleES ?? id)
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

    // MARK: - Apoyos — orientación y dobles, sin CTAs de dispositivo

    @ViewBuilder
    private var apoyos: some View {
        VStack(spacing: Theme.Spacing.s) {
            LiveOrientationStrip(orientation: session.liveOrientation)
            if let strip = partnerStrip {
                DoblesLiveStrip(state: strip, collapsed: $partnerStripCollapsed)
            }
            if let turn = session.currentSegment?.doblesTurn,
               !session.currentSegmentIsPartnerRelay {
                DoblesTurnHero(turn: turn,
                               next: session.plan.segments.nextDoblesTurn(
                                   after: session.currentSegmentIndex),
                               compact: true,
                               partnerFallback: partnerFirstName)
            }
            if session.currentSegmentIsMetcon {
                RxScaledToggle(session: session)
            }
            Spacer(minLength: 0)
            if !session.isTramoResting {
                SiguienteTramoChip(siguiente: session.nextSegment)
                    .padding(.bottom, 6)
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }
}
