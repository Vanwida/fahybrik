import SwiftUI

// UN SOLO ÁRBOL LIVE — `ActiveWorkoutView` monta solo esta vista.
//
// Carrera al aire, cinta, erg, EMOM, fuerza, descanso, formatos: mismo cromo
// (`CromoVivoEntreno`), mismo marco. Solo cambia la banda sujeto inyectada.
// `OutdoorRunHUDView` / previews son wrappers finos; `TreadmillHUDView` es banda
// sujeto de cinta dentro del shell — no monta cromo ni header propio.

struct RunLiveShellView: View {
    let session: WorkoutSession
    let hrZones: HRZoneProfile?
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

    @State private var outdoorModel: OutdoorRunHUDModel?
    @State private var treadmillModel: TreadmillHUDModel?
    @State private var sinCinta = false

    private var sujeto: SuperficieViva { SuperficieViva.de(session) }
    private var runChrome: RunLiveChrome { RunLiveChrome.de(session) }

    private var liveErgRole: ErgMachineRole? {
        guard session.tramoIsErg else { return nil }
        return ErgMachineRole(modality: session.currentTramo.modality)
    }

    var body: some View {
        Group {
            if sujeto == .fuerza {
                FuerzaVivoShellScope(session: session,
                                     accionTitulo: accionTitulo,
                                     alTocarAccion: alTocarAccion) {
                    shellBody
                }
            } else {
                shellBody
            }
        }
        .onAppear { syncRunModels() }
        .onChange(of: session.currentSegmentIndex) { _, _ in syncRunModels() }
        .onChange(of: session.runEnvironment) { _, _ in syncRunModels() }
        .onChange(of: sujeto) { _, _ in syncRunModels() }
        .onDisappear {
            outdoorModel?.teardown()
            treadmillModel?.teardown()
        }
    }

    private var shellBody: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea().instrumentCanvas()
            Ambiente(zona: session.liveZone)
            MarcoVivo {
                CromoVivoEntreno(session: session,
                                 runEnvironment: session.runEnvironment,
                                 muestraConectividad: muestraConectividad,
                                 muestraVozCoach: session.runEnvironment != nil,
                                 alSalir: alSalir,
                                 alVerBloques: alVerBloques,
                                 alConectividad: alConectividad,
                                 alPausa: alPausa)
            } contexto: {
                contextoBand
            } sujeto: {
                BandaSujeto { sujetoBand }
            } apoyos: {
                apoyosBand
            } accion: {
                accionBand
            }
        }
        .allowsLandscape()
    }

    @ViewBuilder
    private var contextoBand: some View {
        switch sujeto {
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
                muestraGPS: sujeto.esCarrera && runChrome == .outdoor,
                gpsActive: gpsActive,
                hrLink: hrLink,
                alTapPM5: alTapPM5,
                alTapHR: alTapHR
            )
        }
    }

    private var tituloDeContexto: String {
        if session.tramoIsErg { return session.currentTramo.label }
        if sujeto.esCarrera, let m = outdoorModel, m.isStructured {
            return "Tramo \(m.legNumber) de \(m.legTotal) · \(m.currentSegment?.title ?? "Correr")"
        }
        return session.currentSegment?.title ?? session.currentTramo.label
    }

    private var subtituloDeContexto: String? {
        if session.currentSegment?.isEMOM == true {
            if session.tramoIsErg || session.tramoIsRun {
                return session.currentTramo.label
            }
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
            treadmillLink: treadmillModel?.treadmillLink ?? .idle,
            pm5State: pm5.connectionState,
            pm5ConnectionLost: pm5.connectionLost,
            hrLink: hrLink,
            hrSource: session.hrSource
        )
    }

    @ViewBuilder
    private var sujetoBand: some View {
        switch sujeto {
        case .emom:
            if session.isTramoResting {
                RestSubjectBand(session: session)
            } else {
                EmomVivoSubjectBand(session: session)
                if session.tramoIsErg, pm5.isConnected {
                    ErgHUDContent(session: session, pm5: pm5, incluyeContexto: false)
                } else if session.tramoIsRun {
                    emomRunMetrics
                }
            }
        case .fuerza:
            FuerzaVivoSubjectHost()
        case .ergo:
            ErgHUDContent(session: session, pm5: pm5, incluyeContexto: false)
        case .relay:
            relaySubject
        case .structural:
            structuralSubject
        case .rest:
            RestSubjectBand(session: session)
        case .conditioning:
            conditioningSubject
        case .run, .runStructure:
            runSubject
        }
    }

    @ViewBuilder
    private var runSubject: some View {
        switch runChrome {
        case .outdoor:
            if let m = outdoorModel {
                RunOutdoorSubjectBand(model: m)
            } else {
                RunLiveHUD(session: session, gpsActive: gpsActive)
            }
        case .treadmill:
            if let m = treadmillModel {
                TreadmillHUDView(session: session, hrZones: hrZones,
                                 empiezaSinCinta: sinCinta, injectedModel: m)
            } else {
                RunLiveHUD(session: session, gpsActive: gpsActive)
            }
        case .host:
            RunLiveHUD(session: session, gpsActive: gpsActive)
        }
    }

    @ViewBuilder
    private var conditioningSubject: some View {
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
    private var relaySubject: some View {
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
    private var structuralSubject: some View {
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
    private var apoyosBand: some View {
        VStack(spacing: Theme.Spacing.s) {
            LiveOrientationStrip(orientation: session.liveOrientation)
            switch sujeto {
            case .emom:
                EmomVivoApoyosBand(session: session)
                if session.tramoIsRun, runChrome == .outdoor, let m = outdoorModel {
                    RunOutdoorApoyosBand(model: m)
                }
            case .fuerza:
                FuerzaVivoApoyosHost(session: session)
            case .run, .runStructure:
                if runChrome == .outdoor, let m = outdoorModel {
                    RunOutdoorApoyosBand(model: m)
                } else {
                    apoyosGenericos
                }
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
           !session.currentSegmentIsPartnerRelay, sujeto != .relay {
            DoblesTurnHero(turn: turn,
                           next: session.plan.segments.nextDoblesTurn(
                               after: session.currentSegmentIndex),
                           compact: true,
                           partnerFallback: partnerFirstName)
        }
        if session.currentSegmentIsMetcon, sujeto != .emom {
            RxScaledToggle(session: session)
        }
    }

    @ViewBuilder
    private var accionBand: some View {
        if sujeto == .fuerza {
            FuerzaVivoAccionHost(session: session,
                                 accionTitulo: accionTitulo,
                                 alTocarAccion: alTocarAccion)
        } else if sujeto == .emom {
            FranjaAccion(titulo: accionTitulo,
                         unicaSalida: false,
                         nota: EmomVivoAccionNota.de(session),
                         accion: alTocarAccion)
        } else if sujeto.esCarrera, runChrome == .outdoor, let m = outdoorModel {
            RunOutdoorAccionBand(model: m)
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
        } else if sujeto == .rest {
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

    @ViewBuilder
    private var emomRunMetrics: some View {
        switch runChrome {
        case .outdoor:
            if let m = outdoorModel {
                RunOutdoorSubjectBand(model: m)
            } else {
                RunLiveHUD(session: session, gpsActive: gpsActive)
            }
        case .treadmill:
            if let m = treadmillModel {
                TreadmillHUDView(session: session, hrZones: hrZones,
                                 empiezaSinCinta: sinCinta, injectedModel: m)
            } else {
                RunLiveHUD(session: session, gpsActive: gpsActive)
            }
        case .host:
            RunLiveHUD(session: session, gpsActive: gpsActive)
        }
    }

    private func syncRunModels() {
        let needsRun = sujeto.esCarrera || (sujeto == .emom && session.tramoIsRun)
        guard needsRun else {
            outdoorModel?.teardown()
            outdoorModel = nil
            treadmillModel?.teardown()
            treadmillModel = nil
            return
        }
        switch runChrome {
        case .outdoor:
            treadmillModel?.teardown()
            treadmillModel = nil
            if outdoorModel == nil {
                let m = OutdoorRunHUDModel(session: session, hrZones: hrZones)
                outdoorModel = m
                m.start()
            }
        case .treadmill(let empiezaSinCinta):
            sinCinta = empiezaSinCinta
            outdoorModel?.teardown()
            outdoorModel = nil
            if treadmillModel == nil {
                let m = TreadmillHUDModel(session: session, hrZones: hrZones, hub: .shared)
                treadmillModel = m
                m.start()
            }
        case .host:
            outdoorModel?.teardown()
            outdoorModel = nil
            treadmillModel?.teardown()
            treadmillModel = nil
        }
    }
}

