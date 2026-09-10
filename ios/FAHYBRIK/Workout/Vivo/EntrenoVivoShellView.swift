import SwiftUI

// LA CÁSCARA GLOBAL DEL LIVE — un solo árbol MarcoVivo + cromo Run para todo.
//
// Outdoor / cinta montan sus propias superficies cuando el entorno de carrera
// ya está elegido; el resto entra aquí. La modalidad solo elige el SUJETO; el
// cromo y el contexto son los mismos componentes que correr al aire.

enum LecturaVivoEntreno {
    case emom
    case fuerza
    case ergo
    case relay
    case structural
    case rest
    case conditioning
    case runHost
}

struct EntrenoVivoShellView: View {
    let session: WorkoutSession
    let lectura: LecturaVivoEntreno
    let accionTitulo: String
    let alTocarAccion: () -> Void
    let alSalir: () -> Void
    let alVerBloques: () -> Void
    let alConectividad: () -> Void
    let alTapPM5: () -> Void
    let alTapHR: () -> Void
    let alPausa: () -> Void
    let pm5: PM5ConnectionStore
    let hrLink: DeviceLink
    var gpsActive: Bool = false
    var muestraConectividad: Bool = true
    var partnerStrip: DoblesLiveStripState? = nil
    @Binding var partnerStripCollapsed: Bool
    var partnerFirstName: String? = nil
    var accionDelHost: AccionDelHost? = nil
    var alSaltarTramo: ((Int) -> Void)? = nil

    private var liveErgRole: ErgMachineRole? {
        guard session.tramoIsErg else { return nil }
        return ErgMachineRole(modality: session.currentTramo.modality)
    }

    var body: some View {
        Group {
            if lectura == .fuerza {
                FuerzaVivoShellScope(session: session,
                                     accionTitulo: accionTitulo,
                                     alTocarAccion: alTocarAccion) {
                    shellBody
                }
            } else {
                shellBody
            }
        }
    }

    private var shellBody: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea().instrumentCanvas()
            Ambiente(zona: session.liveZone)
            marcoGenerico
        }
        .allowsLandscape()
    }

    @ViewBuilder
    private var marcoGenerico: some View {
        MarcoVivo {
            CromoVivoEntreno(session: session,
                             runEnvironment: lectura == .runHost ? session.runEnvironment : nil,
                             muestraConectividad: muestraConectividad,
                             alSalir: alSalir,
                             alVerBloques: alVerBloques,
                             alConectividad: alConectividad,
                             alPausa: alPausa)
        } contexto: {
            contextoGenerico
        } sujeto: {
            BandaSujeto { sujetoGenerico }
        } apoyos: {
            apoyosComunes
        } accion: {
            franjaGenerica
        }
    }

    private var contextoGenerico: some View {
        switch lectura {
        case .emom:
            EmomVivoContextoBand(session: session, hrLink: hrLink, alTapHR: alTapHR)
        case .fuerza:
            FuerzaVivoContextoBand(session: session, hrLink: hrLink, alTapHR: alTapHR)
        default:
            ContextoVivoEntreno(
                session: session,
                titulo: tituloDeContexto,
                subtitulo: subtituloDeContexto,
                pm5: pm5,
                pm5RoleTitle: liveErgRole?.titleES,
                muestraPM5: session.tramoIsErg || liveScanPath.showPM5Chip,
                muestraGPS: lectura == .runHost,
                gpsActive: gpsActive,
                hrLink: hrLink,
                alTapPM5: alTapPM5,
                alTapHR: alTapHR
            )
        }
    }

    private var tituloDeContexto: String {
        if session.tramoIsErg { return session.currentTramo.label }
        return session.currentSegment?.title ?? session.currentTramo.label
    }

    private var subtituloDeContexto: String? {
        if session.currentSegment?.isEMOM == true, session.tramoIsErg {
            return session.currentSegment?.title
        }
        if let nombre = session.currentSegment?.formatScheme?.displayName,
           nombre.caseInsensitiveCompare(tituloDeContexto) != .orderedSame {
            return nombre
        }
        return nil
    }

    private var liveScanPath: LiveDeviceScanPath {
        LiveDeviceScanPath.offer(
            wantsCinta: session.tramoIsRun || session.runEnvironment != nil,
            wantsPM5: session.tramoIsErg,
            treadmillCoverOpen: false,
            treadmillLink: .idle,
            pm5State: pm5.connectionState,
            pm5ConnectionLost: pm5.connectionLost,
            hrLink: hrLink,
            hrSource: session.hrSource
        )
    }

    @ViewBuilder
    private var sujetoGenerico: some View {
        switch lectura {
        case .emom:
            EmomVivoSubjectBand(session: session)
            if session.tramoIsErg, pm5.isConnected {
                ErgLiveStrip(session: session, pm5: pm5)
            }
        case .fuerza:
            FuerzaVivoSubjectHost()
        case .ergo:
            ErgHUDContent(session: session, pm5: pm5)
        case .relay:
            relaySurface
        case .structural:
            structuralWorkSurface
        case .rest:
            RestSubjectBand(session: session)
        case .conditioning:
            sujetoDeConditioning
        case .runHost:
            RunLiveHUD(session: session, gpsActive: gpsActive)
        }
    }

    @ViewBuilder
    private var sujetoDeConditioning: some View {
        VStack(spacing: Theme.Spacing.s) {
            conditioningHUD
            if pm5.isConnected, !session.isStationTramo {
                ErgLiveStrip(session: session, pm5: pm5)
            }
        }
    }

    @ViewBuilder
    private var conditioningHUD: some View {
        switch session.currentSegment?.formatScheme {
        case .amrap:     AmrapLiveHUD(session: session)
        case .tabata, .intervals, .deathBy, .steady:
            ForTimeLiveHUD(session: session)
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim:
            ForTimeLiveHUD(session: session)
        case .emom, .sets, .warmup, .cooldown, .superset, .none:
            EmptyView()
        }
    }

    @ViewBuilder
    private var relaySurface: some View {
        VStack(spacing: 16) {
            if let turn = session.currentSegment?.doblesTurn {
                DoblesTurnHero(turn: turn,
                               next: session.plan.segments.nextDoblesTurn(
                                   after: session.currentSegmentIndex),
                               compact: false,
                               partnerFallback: partnerFirstName)
            }
            Text("Recupera")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
            Text(Formato.clock(session.lapElapsedSeconds, anchoFijo: true))
                .font(.system(size: 52, weight: .heavy, design: .monospaced))
                .foregroundStyle(Theme.Color.foreground)
            if let bpm = session.liveHRBpm {
                HStack(spacing: 6) {
                    Image(systemName: "heart.fill").foregroundStyle(Theme.Color.danger)
                    Text("\(bpm) ppm")
                        .font(.system(size: 16, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Theme.Color.foreground)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Spacing.m)
    }

    @ViewBuilder
    private var structuralWorkSurface: some View {
        if let region = session.currentBlockRegion {
            ScrollView(showsIndicators: false) {
                StructuralBlockChecklist(
                    segments: session.plan.segments(in: region),
                    phaseName: region.phase.displayName
                )
                .padding(.top, 4)
            }
        }
    }

    @ViewBuilder
    private var apoyosComunes: some View {
        VStack(spacing: Theme.Spacing.s) {
            LiveOrientationStrip(orientation: session.liveOrientation)
            switch lectura {
            case .emom:
                EmomVivoApoyosBand(session: session)
            case .fuerza:
                FuerzaVivoApoyosHost(session: session)
            default:
                apoyosGenericos
            }
            Spacer(minLength: 0)
            if !session.isTramoResting {
                SiguienteTramoChip(siguiente: session.nextSegment)
                    .padding(.bottom, 6)
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }

    @ViewBuilder
    private var apoyosGenericos: some View {
        if let strip = partnerStrip {
            DoblesLiveStrip(state: strip, collapsed: $partnerStripCollapsed)
        }
        if session.plan.segments.count > 1, session.tramoRoundTotal <= 1,
           let alSaltarTramo {
            BlockIntervalStrip(
                segments: session.plan.segments,
                currentIndex: session.currentSegmentIndex,
                onTap: alSaltarTramo
            )
        }
        if let turn = session.currentSegment?.doblesTurn,
           !session.currentSegmentIsPartnerRelay, lectura != .relay {
            DoblesTurnHero(turn: turn,
                           next: session.plan.segments.nextDoblesTurn(
                               after: session.currentSegmentIndex),
                           compact: true,
                           partnerFallback: partnerFirstName)
        }
        if session.currentSegmentIsMetcon, lectura != .emom {
            RxScaledToggle(session: session)
        }
    }

    @ViewBuilder
    private var franjaGenerica: some View {
        if lectura == .fuerza {
            FuerzaVivoAccionHost(session: session,
                                 accionTitulo: accionTitulo,
                                 alTocarAccion: alTocarAccion)
        } else if lectura == .emom {
            FranjaAccion(titulo: accionTitulo,
                         unicaSalida: false,
                         nota: EmomVivoAccionNota.de(session),
                         accion: alTocarAccion)
        } else if let host = accionDelHost {
            switch host {
            case let .una(titulo, unica, nota, act):
                FranjaAccion(titulo: titulo, unicaSalida: unica, nota: nota, accion: act)
            case let .deathBy(falle, logre):
                HStack(spacing: Theme.Spacing.s) {
                    Button(action: { Haptics.medium(); falle() }) {
                        Text("FALLÉ")
                            .scaledFont(17, weight: .heavy, relativeTo: .body, italic: true)
                            .tracking(1)
                            .foregroundStyle(Theme.Color.danger)
                            .frame(maxWidth: 120, maxHeight: .infinity)
                            .background(Theme.Color.surface.opacity(0.7))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                                    .stroke(Theme.Color.danger.opacity(0.55), lineWidth: 1.5)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                    }
                    .buttonStyle(PressScaleStyle())
                    BotonVivo(titulo: "LO LOGRÉ", unicaSalida: false, accion: logre)
                }
            }
        } else if lectura == .rest {
            FranjaAccion(titulo: accionTitulo,
                         unicaSalida: false,
                         nota: "el descanso también es dosis",
                         accion: alTocarAccion)
        } else {
            FranjaAccion(titulo: accionTitulo,
                         unicaSalida: session.currentBlockIsStructural,
                         accion: alTocarAccion)
        }
    }
}
