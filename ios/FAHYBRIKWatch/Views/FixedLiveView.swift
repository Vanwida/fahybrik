import SwiftUI

// FIXED — AMRAP, For Time, Chipper, Ladder, HYROX sim.
//
// Diseño (`watch-amrap` / `watch-fortime`):
//   · AMRAP  → sujeto = rondas (a toque); bisel = ventana que drena; mando.
//   · For Time → sujeto = crono (puntuación); segundo = estación/ronda; mando.
//   · HYROX  → sujeto = estación actual; crono en segundo; transición a destello.
// Página del cuerpo aparte. La pantalla ES el botón (+ ronda / ronda hecha).
struct FixedLiveView: View {
    let session: WorkoutSession

    @State private var transitionKey: Int? = nil
    @State private var destello = WatchDestello()

    var body: some View {
        ZStack {
            WatchReloj(
                paginas: paginas,
                tinte: tinteLienzo,
                bisel: bisel,
                destello: destello
            )
            if let key = transitionKey, let comp = component(at: key) {
                TransitionScreen(
                    eyebrow: "Entras a",
                    title: comp.name,
                    subtitle: comp.work,
                    footer: "RUN ▸ ESTACIÓN",
                    onTap: { transitionKey = nil }
                )
                .task(id: key) {
                    try? await Task.sleep(nanoseconds: UInt64(WatchTheme.transitionDwell * 1_000_000_000))
                    if transitionKey == key { transitionKey = nil }
                }
            }
        }
        .onChange(of: session.fixedRoundsDone) { _, newValue in
            destello = WatchDestello(n: destello.n + 1, color: WatchTheme.orangeSoft)
            guard isHyroxSim, newValue > 0, newValue < session.fixedListTotal else { return }
            transitionKey = newValue
            WatchHaptics.transition()
        }
    }

    // MARK: - Páginas

    private var paginas: [WatchPagina] {
        var list: [WatchPagina] = []
        if session.isCondCountIn {
            list.append(WatchPagina(
                id: "countin",
                contexto: statusText,
                modo: .ojeada,
                sujeto: WatchFormat.countdown(session.condCountInRemaining),
                tono: WatchTheme.orange
            ))
        } else if session.currentSegment?.formatScheme == .amrap {
            list.append(paginaAmrap)
        } else if isHyroxSim {
            list.append(paginaHyrox)
        } else {
            list.append(paginaForTime)
        }
        if let pulso = WatchPaginasComunes.pulso(
            bpm: session.liveHRBpm,
            zone: session.liveZone,
            modo: session.isCondCountIn ? .ojeada : .mando
        ) {
            list.append(pulso)
        }
        return list
    }

    private var paginaAmrap: WatchPagina {
        let queda = session.condRemaining
        return WatchPagina(
            id: "amrap",
            contexto: statusText,
            modo: .mando,
            sujeto: "\(session.fixedRoundsDone)",
            segundoEtiqueta: "Queda",
            segundoValor: WatchFormat.countdown(queda),
            segundoTono: WatchTinte.urgente(queda),
            accion: "Toca · + ronda",
            onToca: { session.bumpAmrapRound() }
        )
    }

    private var paginaForTime: WatchPagina {
        let ronda = min(session.fixedRoundsDone + 1, max(1, session.fixedListTotal))
        let total = max(1, session.fixedListTotal)
        return WatchPagina(
            id: "fortime",
            contexto: statusText,
            modo: .mando,
            sujeto: WatchFormat.clock(session.condElapsed),
            segundoEtiqueta: "Ronda",
            segundoValor: "\(ronda) / \(total)",
            accion: "Toca · ronda hecha",
            onToca: { session.markRoundDone() }
        )
    }

    private var paginaHyrox: WatchPagina {
        let name = currentComponent?.name ?? "Estación"
        let work = currentComponent?.work
        // El crono es la puntuación (no se va); la estación va en contexto/segundo.
        return WatchPagina(
            id: "hyrox",
            contexto: name,
            modo: .mando,
            sujeto: WatchFormat.clock(session.condElapsed),
            segundoEtiqueta: work != nil ? "Trabajo" : hyroxStatus,
            segundoValor: work ?? hyroxStatus,
            accion: "Toca · hecho",
            onToca: { session.markRoundDone() }
        )
    }

    // MARK: - Tinte / bisel

    private var tinteLienzo: Color? {
        if session.isCondCountIn { return WatchTheme.orange }
        return WatchTinte.color(for: session.liveZone)
    }

    private var bisel: AnyView? {
        if session.currentSegment?.formatScheme == .amrap,
           let total = session.currentSegment?.formatTotalSeconds, total > 0 {
            let rem = max(0, session.condRemaining / Double(total))
            return WatchAroContinuo(remaining: rem).watchBisel()
        }
        if isHyroxSim, session.fixedListTotal > 0 {
            return WatchAroSegmentado(
                total: session.fixedListTotal,
                hechas: session.fixedRoundsDone,
                fraccion: 0
            ).watchBisel()
        }
        return nil
    }

    // MARK: - Derived

    private var isHyroxSim: Bool { session.currentSegment?.formatScheme == .hyroxSim }

    private var currentComponent: WorkComponent? {
        component(at: session.fixedRoundsDone)
    }

    private func component(at index: Int) -> WorkComponent? {
        let comps = session.currentSegment?.components ?? []
        guard !comps.isEmpty else { return nil }
        return comps[min(max(0, index), comps.count - 1)]
    }

    private var statusText: String {
        guard let seg = session.currentSegment, let scheme = seg.formatScheme else { return "" }
        if scheme == .amrap, let total = seg.formatTotalSeconds {
            return "AMRAP · \(WatchFormat.clock(Double(total)))"
        }
        if let rounds = seg.formatRounds {
            return "\(scheme.displayName) · \(rounds) rondas"
        }
        return scheme.displayName
    }

    private var hyroxStatus: String {
        "HYROX · \(min(session.fixedRoundsDone + 1, session.fixedListTotal)) / \(session.fixedListTotal)"
    }
}
