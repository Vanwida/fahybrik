import SwiftUI

// The live workout shell (variant C · "Auto · 1 botón"). The LIVE screen is
// primary — one big button advances everything, zero navigation during effort.
// A horizontal swipe reaches the peripheral pages.
//
// RODAJE (FH-30): Datos | Vivo | Controles, vivo al centro. No SessionMapView.
// El resto de modalidades se quedan mapa / familia / pause.
// CORRER, FUERZA y ERGO, con la bandera `MunecaBandera` encendida: la pila nueva de la
// muñeca (`Muneca/MunecaSolo`), que se pinta desde `Vivo.CuadroMuneca`.
struct LiveFlowView: View {
    let session: WorkoutSession
    @Binding var page: Int
    // #68 — the structured-run driver lives on the coordinator (workout lifetime); the
    // tramo screen reads it. Pulled from the environment so paging never recreates it.
    @Environment(WatchWorkoutCoordinator.self) private var coordinator
    /// La muñeca bajada: el sistema ignora los deslizamientos, así que corriendo
    /// se vuelve sola a Vivo (la misma regla que el espejo y que `WatchReloj`).
    @Environment(\.isLuminanceReduced) private var atenuado

    var body: some View {
        // La cara nueva de correr (pila de la muñeca) sustituye a Datos | Vivo | Controles
        // mientras la bandera esté encendida. La puerta de bloque sigue siendo del flujo de
        // siempre (sin puertas a mitad de carrera es de otra fase), y apagada la bandera
        // todo vuelve exactamente a lo de hoy.
        if session.isAwaitingFinishDecision {
            // El plan acabó solo: «Sesión completada» y la decisión (Guardar o Seguir), en cualquier cara.
            FinalNaturalView(session: session)
        } else if usaMunecaNueva {
            MunecaSolo(session: session)
        } else {
            flujoDeSiempre
        }
    }

    /// Correr, fuerza o ergo (`Vivo.familiaMuneca`), con la bandera encendida, sin puerta de bloque ni relevo de
    /// dobles delante.
    private var usaMunecaNueva: Bool {
        MunecaBandera.encendida && !session.isAwaitingBlockStart && !session.currentSegmentIsPartnerRelay
            && (esRodaje || MunecaCubierta.cubre(session))
    }

    private var flujoDeSiempre: some View {
        TabView(selection: $page) {
            Group {
                if esRodaje {
                    RodajeDatosPage(session: session, driver: coordinator.runLegDriver)
                } else {
                    SessionMapView(session: session)
                }
            }
            .tag(0)
            liveArea
                .tag(1)
            PauseFinishPage(session: session, driver: esRodaje ? coordinator.runLegDriver : nil)
                .tag(2)
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        // Block gate yank: only for non-rodaje. Rodaje pager is sticky (FH-30).
        .onChange(of: session.isAwaitingBlockStart) { _, awaiting in
            if awaiting, !esRodaje { page = 1 }
        }
        .onChange(of: atenuado) { _, reducida in
            if reducida, esRodaje { page = RodajePagina.vivo.punto }
        }
    }

    /// Continuous `.running` OR street series (`isRunStructureActive`).
    private var esRodaje: Bool {
        session.isRunStructureActive || session.currentSegment?.kind == .running
    }

    // MARK: - Live area (gate · family)

    @ViewBuilder
    private var liveArea: some View {
        if session.isAwaitingBlockStart {
            BlockGateView(session: session)
        } else {
            familyView
        }
    }

    @ViewBuilder
    private var familyView: some View {
        // #23 — HYROX dobles RELAY: the partner works this station while the athlete
        // recovers. Pre-empts the format routing (the athlete performs no work here —
        // nothing is logged); "Relevo ▸" advances to their own next station. Shares
        // the SAME engine flags as the phone (currentSegmentIsPartnerRelay / advanceRelay).
        if session.currentSegmentIsPartnerRelay {
            RelayLiveView(session: session)
        } else if session.isRunStructureActive, let driver = coordinator.runLegDriver {
            // #68 — a folded run block carrying a `structure` runs the tramo HUD (the
            // athlete runs the series from the wrist), regardless of its folded scheme
            // (.intervals / .steady). Falls through to the scalar presentation only if
            // the driver is somehow absent (never during an active session).
            StructuredRunLiveView(session: session, driver: driver)
        } else if session.currentSegment?.kind == .running {
            // CORRIENDO MANDA LO QUE EL RELOJ MIDE, NO CÓMO SE LLAME EL FORMATO.
            //
            // Las fuentes no escriben el mismo esquema para la misma cosa: el
            // constructor libre escribe una serie de correr como `intervals`, el
            // coach como `sets` (plantilla 314, «3x1000m»), y la gramática nativa
            // como `structure`. Repartiendo por presentación, el mismo entreno caía
            // en tres pantallas distintas según quién lo hubiera escrito — y una de
            // las tres era el RELOJ DE PARED, el guion de burpees y planchas
            // («sin GPS que valga, estás en el sitio»): sin metros, sin ritmo y en
            // modo ciego mientras el atleta corría por la calle (8-ago).
            //
            // Por eso la rama de correr se resuelve ENTERA aquí y no deja caer nada
            // al reparto de abajo: con tramos manda la pantalla de tramos (la rama
            // de arriba), y sin ellos el rodaje. Las dos miden GPS, que es lo único
            // que corriendo contesta la pregunta.
            ContinuousLiveView(session: session)
        } else if session.currentSegment?.isEMOM == true {
            // EMOM gana sobre ergo: mismo cromo de reloj durante todo el bloque.
            EmomLiveView(session: session)
        } else if session.currentSegment?.fixedListIsStations == true {
            // Ruta / HYROX: el formato manda sobre la modalidad — un ski de
            // estación es `GuionEstaciones`, no un ergo suelto. Misma regla que
            // `GuionDelEspejo.guionPara`.
            FixedLiveView(session: session)
        } else if let presentation {
            switch presentation {
            // EMOM y las estaciones ya salieron arriba. Lo que queda de la
            // familia rotativa —intervals, tabata, death by, steady
            // funcional— tiene el sujeto que le toca en `RelojDeParedLiveView`.
            case .rotating:   RelojDeParedLiveView(session: session)
            case .fixed:      FixedLiveView(session: session)
            case .continuous: ContinuousLiveView(session: session)
            // La fuerza y el ergo con su ficha son de la pila nueva (`MunecaSolo`); lo que llega aquí
            // no tiene ficha que pintar.
            case .setTable:   GenericLiveView(session: session)
            case .list:       ChecklistLiveView(session: session)
            }
        } else {
            GenericLiveView(session: session)
        }
    }

    // The live HUD family for the current segment — the structured scheme first,
    // then a scalar-kind fallback for a legacy / freeform segment.
    private var presentation: FormatPresentation? {
        if let p = session.currentSegment?.prescription?.scheme.presentation { return p }
        switch session.currentSegment?.kind {
        case .running, .rowOrSki: return .continuous
        case .strength:           return .setTable
        default:                  return nil
        }
    }
}

// MARK: - Dobles relay (standalone wrist)

// #23 — the wrist RELAY screen: the partner works this station; the athlete
// recovers. Mirrors the phone's relay surface, compact for the wrist — status +
// "{partner} hace {station}" + recovery clock + live HR, and a single "Relevo ▸"
// that advances to the athlete's own next station. NOTHING is logged here (the
// relay never counts as the athlete's work volume — see advanceRelay).
private struct RelayLiveView: View {
    let session: WorkoutSession

    private var station: String {
        session.currentSegment?.doblesSplit?.stationLabel
            ?? session.currentSegment?.title ?? "esta estación"
    }
    private var partner: String {
        session.currentSegment?.doblesSplit?.partnerName ?? "Tu compañero"
    }

    var body: some View {
        // Diseño (`watch-dobles`): mientras rema la pareja, el sujeto es TU salida
        // (recuperas / sales en …). Mando — puedes tocar para el relevo.
        WatchReloj(
            paginas: {
                var list: [WatchPagina] = [
                    WatchPagina(
                        id: "relevo",
                        contexto: "\(partner) · \(station)",
                        modo: .mando,
                        sujeto: WatchFormat.clock(session.lapElapsedSeconds),
                        segundoEtiqueta: "Recupera",
                        segundoValor: session.nextSegment.map { "Luego entras · \($0.title)" } ?? "Relevo",
                        accion: "Toca · relevo",
                        onToca: { session.advanceRelay() }
                    ),
                ]
                if let pulso = WatchPaginasComunes.pulso(
                    bpm: session.liveHRBpm,
                    zone: session.liveZone,
                    modo: .mando
                ) {
                    list.append(pulso)
                }
                return list
            }(),
            tinte: WatchTheme.orange
        )
    }
}

// MARK: - Generic fallback

// A legacy / freeform segment with no scheme and no locomotion kind: elapsed +
// the prescribed work line + a single advance. Honest — shows only what the
// segment actually carries.
private struct GenericLiveView: View {
    let session: WorkoutSession

    var body: some View {
        WatchReloj(
            paginas: {
                var list: [WatchPagina] = [
                    WatchPagina(
                        id: "gen",
                        contexto: session.currentSegment?.title ?? "Entreno",
                        modo: .mando,
                        sujeto: WatchFormat.clock(session.lapElapsedSeconds),
                        segundoValor: session.currentSegment?.previewWorkLine,
                        accion: "Toca · hecho",
                        onToca: { session.primaryAdvance() }
                    ),
                ]
                if let pulso = WatchPaginasComunes.pulso(
                    bpm: session.liveHRBpm,
                    zone: session.liveZone,
                    modo: .mando
                ) {
                    list.append(pulso)
                }
                return list
            }(),
            tinte: WatchTinte.color(for: session.liveZone)
        )
    }
}
