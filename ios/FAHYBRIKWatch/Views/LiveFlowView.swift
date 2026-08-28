import SwiftUI

// The live workout shell (variant C · "Auto · 1 botón"). The LIVE screen is
// primary — one big button advances everything, zero navigation during effort.
// Pausar y Terminar viven EN el vivo (un control cada uno, card 176). El
// deslizamiento a la página de controles se queda; ya no es el único camino.
// A horizontal swipe still reaches the session map. Between blocks the engine
// parks on the block gate; per-set rest overlays the live screen.
//
// NOTE (deviation): the map is reached by swipe-right rather than crown. The
// strength screen (SetTableLiveView) claims the crown for ±load (mockup 4d), so
// binding the crown to page navigation too would fight it. Swipe pages keep the
// crown free for load and match the Apple Workout paging model.
struct LiveFlowView: View {
    let session: WorkoutSession
    // #68 — the structured-run driver lives on the coordinator (workout lifetime); the
    // tramo screen reads it. Pulled from the environment so paging never recreates it.
    @Environment(WatchWorkoutCoordinator.self) private var coordinator

    // 0 = map · 1 = live (default) · 2 = pause/finish. Swipe-left from live lands
    // on pause/finish; swipe-right on the map.
    @State private var page = 1
    @Environment(\.isLuminanceReduced) private var atenuado

    var body: some View {
        TabView(selection: $page) {
            SessionMapView(session: session)
                .tag(0)
            liveArea
                .tag(1)
            PauseFinishPage(session: session)
                .tag(2)
        }
        .tabViewStyle(.page)
        // Parking on a block gate (auto block end, or "Siguiente bloque" fired from
        // the pause page) pulls the athlete back to the live area so the gate — and
        // the next block's Empezar — is what they see, not a stale side page.
        .onChange(of: session.isAwaitingBlockStart) { _, awaiting in
            if awaiting { page = 1 }
        }
    }

    // MARK: - Live area (gate · family · rest overlay)

    @ViewBuilder
    private var liveArea: some View {
        Group {
            if session.isAwaitingBlockStart {
                BlockGateView(session: session)
            } else {
                familyView
            }
        }
        .overlay {
            if session.restRemainingSeconds > 0 {
                RestBannerView(session: session)
            }
        }
        .overlay(alignment: .topTrailing) {
            if WatchLiveSessionActs.offersControls(isEnding: session.isFinished),
               !atenuado {
                WatchLiveSessionControls(
                    style: .compact,
                    paused: session.isPaused,
                    onPauseResume: { coordinator.togglePause() },
                    onFinish: { session.finish(completeness: .partial) }
                )
            }
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
        } else if let presentation {
            switch presentation {
            // EMOM lleva su plan y su fase propia (`EmomLiveView`); el resto
            // de la familia rotativa —intervals, tabata, death by, steady
            // funcional— tiene el sujeto que le toca en `RelojDeParedLiveView`
            // (`GuionRelojDePared`). Ver el comentario de cada vista para el
            // porqué del reparto.
            case .rotating:
                if session.currentSegment?.isEMOM == true {
                    EmomLiveView(session: session)
                } else {
                    RelojDeParedLiveView(session: session)
                }
            case .fixed:      FixedLiveView(session: session)
            case .continuous: ContinuousLiveView(session: session)
            case .setTable:   SetTableLiveView(session: session)
            case .list:       ChecklistLiveView(session: session)
            case .unknown:    GenericLiveView(session: session)
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
