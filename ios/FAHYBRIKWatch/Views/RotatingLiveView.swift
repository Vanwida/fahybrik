import SwiftUI

// ROTATING — el reloj manda (EMOM, Tabata, Intervals, Death By).
//
// Diseño (`watch-emom` + kit): el sujeto es la cuenta atrás del minuto/fase;
// la tarea va en segundo nivel; el bisel drena la ventana; al marcar (si aplica)
// el tinte pasa a recuperación. Página del cuerpo aparte.
//
// El modo lo pone el MOMENTO: en trabajo ojeada (gesto latente si hay que marcar);
// en descanso/cambio, mando.
struct RotatingLiveView: View {
    let session: WorkoutSession

    @State private var destello = WatchDestello()
    @State private var lastPhaseKey: String = ""

    var body: some View {
        WatchReloj(
            paginas: paginas,
            tinte: tinteLienzo,
            bisel: WatchAroContinuo(remaining: remainingFraction).watchBisel(),
            destello: destello
        )
        .onChange(of: phaseKey) { _, new in
            if !lastPhaseKey.isEmpty, new != lastPhaseKey {
                destello = WatchDestello(
                    n: destello.n + 1,
                    color: phase == .rest ? WatchTheme.zoneGreen : WatchTheme.orangeSoft
                )
            }
            lastPhaseKey = new
        }
        .onAppear { lastPhaseKey = phaseKey }
    }

    // MARK: - Páginas

    private var paginas: [WatchPagina] {
        var list: [WatchPagina] = [paginaPrincipal]
        if let pulso = WatchPaginasComunes.pulso(
            bpm: session.liveHRBpm,
            zone: session.liveZone,
            modo: modoActual
        ) {
            list.append(pulso)
        }
        return list
    }

    private var paginaPrincipal: WatchPagina {
        if isCountIn {
            return WatchPagina(
                id: "countin",
                contexto: statusText,
                modo: .ojeada,
                sujeto: WatchFormat.countdown(countInRemaining),
                tono: WatchTheme.orange,
                segundoValor: nowMovement
            )
        }

        return WatchPagina(
            id: "fase",
            contexto: contextoFase,
            modo: modoActual,
            sujeto: countdownText,
            tono: countdownColor,
            segundoEtiqueta: segundoEtiqueta,
            segundoValor: segundoValor,
            accion: accionEtiqueta,
            onToca: accionTap,
            nota: notaProcedencia
        )
    }

    // MARK: - Tinte / bisel

    private var tinteLienzo: Color? {
        if isCountIn { return WatchTheme.orange }
        if phase == .rest { return WatchTheme.zoneGreen }
        // Marcado Tabata / intervalo hecho: verde suave de “tuyo el resto”.
        return WatchTinte.color(for: session.liveZone)
    }

    private var remainingFraction: Double {
        if isCountIn {
            return min(1, max(0, countInRemaining / 3))
        }
        let total: Double = {
            if session.currentSegment?.isEMOM == true {
                // Ventana típica 60 s; si hay plan, usa la fase.
                return max(session.emomPhaseRemaining + 0.001, phaseTotalHint)
            }
            return max(session.rotPhaseRemaining + 0.001, phaseTotalHint)
        }()
        let rem = session.currentSegment?.isEMOM == true
            ? session.emomPhaseRemaining
            : session.rotPhaseRemaining
        if rem <= 0 { return 0 }
        return min(1, max(0, rem / total))
    }

    /// Mejor esfuerzo para el total de la fase (el engine expone remaining, no total).
    private var phaseTotalHint: Double {
        if session.currentSegment?.isEMOM == true {
            return 60
        }
        // Tabata / intervals: si remaining es pequeño al final, el aro casi vacío ya basta.
        return max(session.rotPhaseRemaining, 20)
    }

    // MARK: - Status / labels

    private var statusText: String {
        guard let seg = session.currentSegment else { return "" }
        guard let name = seg.formatScheme?.displayName ?? (seg.isEMOM ? "EMOM" : nil) else { return "" }
        if seg.isEMOM, let plan = seg.emomPlan {
            return "\(name) · \(session.emomIntervalIndex + 1) / \(plan.intervalCount)"
        }
        if session.rotTotalRounds > 0 {
            return "\(name) · \(session.rotRoundIndex + 1) / \(session.rotTotalRounds)"
        }
        return name
    }

    private var contextoFase: String {
        if isCountIn { return statusText }
        if session.currentSegment?.isEMOM == true {
            if phase == .rest {
                let ultima = isLastEmom
                return ultima ? "Para · se acabó" : "Para · viene la \(session.emomIntervalIndex + 2)"
            }
            return statusText.isEmpty ? "Ronda" : statusText
        }
        return phase == .rest ? "Descanso" : statusText
    }

    private var isLastEmom: Bool {
        guard let plan = session.currentSegment?.emomPlan else { return false }
        return session.emomIntervalIndex + 1 >= plan.intervalCount
    }

    private var modoActual: WatchModo {
        if isCountIn { return .ojeada }
        if phase == .rest { return .mando }
        // Death By / Tabata piden toque → mando; EMOM trabajo → ojeada (gesto latente si hay).
        switch session.currentSegment?.formatScheme {
        case .tabata, .intervals, .deathBy: return .mando
        default: return .ojeada
        }
    }

    private var isCountIn: Bool {
        session.emomCountInRemaining > 0 || session.isCondCountIn
    }

    private var countInRemaining: Double {
        session.emomCountInRemaining > 0 ? session.emomCountInRemaining : session.condCountInRemaining
    }

    private var phase: WorkoutSession.RotatingPhase {
        session.currentSegment?.isEMOM == true ? session.emomPhase : session.rotPhase
    }

    private var phaseKey: String {
        "\(session.emomIntervalIndex)-\(session.rotRoundIndex)-\(phase)-\(isCountIn)"
    }

    private var countdownText: String {
        if isCountIn { return WatchFormat.countdown(countInRemaining) }
        if session.currentSegment?.isEMOM == true {
            return WatchFormat.countdown(session.emomPhaseRemaining)
        }
        if session.rotPhaseRemaining <= 0 { return WatchFormat.clock(session.lapElapsedSeconds) }
        return WatchFormat.countdown(session.rotPhaseRemaining)
    }

    private var countdownColor: Color {
        if isCountIn { return WatchTheme.orange }
        let remaining = session.currentSegment?.isEMOM == true
            ? session.emomPhaseRemaining
            : session.rotPhaseRemaining
        return WatchTinte.urgente(remaining)
    }

    private var nowMovement: String? {
        guard let seg = session.currentSegment else { return nil }
        if seg.isEMOM, let plan = seg.emomPlan {
            return plan.interval(session.emomIntervalIndex)?.movement
        }
        return seg.primaryMovement
    }

    private var nowWork: String? {
        guard let seg = session.currentSegment else { return nil }
        if seg.isEMOM, let plan = seg.emomPlan {
            return plan.interval(session.emomIntervalIndex).flatMap(\.work)
        }
        if seg.formatScheme == .deathBy { return "Objetivo \(session.deathByTarget)" }
        if seg.formatScheme == .tabata { return "Reps \(session.rotRepsThisRound)" }
        return nil
    }

    private var segundoEtiqueta: String? {
        if phase == .rest { return nowMovement != nil ? "Luego" : nil }
        return nowWork != nil ? nil : nil
    }

    private var segundoValor: String? {
        if phase == .rest {
            if let next = nextMovement { return next }
            return nowMovement
        }
        if let work = nowWork, let mov = nowMovement {
            return "\(mov) · \(work)"
        }
        return nowWork ?? nowMovement
    }

    private var nextMovement: String? {
        guard let seg = session.currentSegment, seg.isEMOM, let plan = seg.emomPlan else { return nil }
        return plan.interval(session.emomIntervalIndex + 1)?.movement
    }

    private var accionEtiqueta: String? {
        switch session.currentSegment?.formatScheme {
        case .tabata: return "Toca · + rep"
        case .intervals: return "Toca · serie hecha"
        case .deathBy: return "Toca · fallé"
        default: return nil
        }
    }

    private var accionTap: (() -> Void)? {
        switch session.currentSegment?.formatScheme {
        case .tabata: return { session.tabataAddRep(1) }
        case .intervals: return { session.intervalsBoutDone() }
        case .deathBy: return { session.deathByFail() }
        default: return nil
        }
    }

    private var notaProcedencia: String? {
        // EMOM a pulso (burpees etc.): lo dices tú. Sin inventar máquina.
        guard session.currentSegment?.isEMOM == true, phase != .rest else { return nil }
        if nowWork == nil, nowMovement != nil { return WatchNota.loDicesTu }
        return nil
    }
}
