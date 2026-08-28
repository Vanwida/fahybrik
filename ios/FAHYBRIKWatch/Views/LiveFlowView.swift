import SwiftUI

// The live workout shell (variant C · "Auto · 1 botón"). The LIVE screen is
// primary — one big button advances everything, zero navigation during effort.
// A horizontal swipe reaches the peripheral pages: LEFT → Pausar / Terminar,
// RIGHT → the session map. Between blocks the engine parks on the block gate;
// per-set rest overlays the live screen (keeping its state alive).
//
// NOTE (deviation): the map is reached by swipe-right rather than crown. The
// strength screen (SetTableLiveView) claims the crown for ±load (mockup 4d), so
// binding the crown to page navigation too would fight it. Swipe pages keep the
// crown free for load and match the Apple Workout paging model.
struct LiveFlowView: View {
    let session: WorkoutSession

    // 0 = map · 1 = live (default) · 2 = pause/finish. Swipe-left from live lands
    // on pause/finish; swipe-right on the map.
    @State private var page = 1

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
    }

    @ViewBuilder
    private var familyView: some View {
        if session.currentSegment?.usesMultiSetStrength == true {
            SetTableLiveView(session: session)
        } else if session.currentBlockIsStructural {
            ChecklistLiveView(session: session)
        } else {
            LivePicturePage(session: session)
        }
    }
}

private struct LivePicturePage: View {
    let session: WorkoutSession

    var body: some View {
        let pic = session.livePicture
        WatchReloj(
            paginas: {
                var list: [WatchPagina] = [
                    WatchPagina(
                        id: "live",
                        contexto: pic.label,
                        modo: .mando,
                        sujeto: figureText(pic.figure),
                        segundoValor: pic.planLine,
                        accion: actionTitle(pic.primary),
                        onToca: {
                            switch pic.primary {
                            case .startBlock: session.beginBlock()
                            default: session.primaryAdvance(fromAthleteTap: true)
                            }
                        }
                    ),
                ]
                if let score = pic.score.label {
                    list.append(
                        WatchPagina(
                            id: "score",
                            contexto: pic.label,
                            modo: .mando,
                            sujeto: figureText(pic.figure),
                            segundoValor: score,
                            accion: "Toca · \(score.lowercased())",
                            onToca: { session.scoreStrike() }
                        )
                    )
                }
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

    private func figureText(_ figure: LivePicture.Figure) -> String {
        switch figure {
        case .meters(let m): return "\(Int(m.rounded())) m"
        case .calories(let c): return "\(c) cal"
        case .countdown(let s): return WatchFormat.clock(s)
        case .elapsed(let s): return WatchFormat.clock(s)
        case .reps(let n): return "\(n)"
        case .none: return WatchFormat.clock(session.tramoElapsedSeconds)
        }
    }

    private func actionTitle(_ primary: LivePicture.Primary) -> String {
        switch primary {
        case .startBlock: return "Toca · empezar"
        case .skipCountIn: return "Toca · saltar"
        case .dismissRest: return "Toca · seguir"
        case .closeTramo: return "Toca · hecho"
        case .finish: return "Toca · terminar"
        }
    }
}
