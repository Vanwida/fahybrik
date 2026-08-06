import SwiftUI

// ROTATING — SÓLO EMOM. Tabata/intervals/death by/steady se fueron a
// `RelojDeParedLiveView` (`GuionRelojDePared`), que les da a cada uno el sujeto
// que le toca en vez de un crono compartido para los cuatro.
//
// EMOM se queda aquí, con su lenguaje viejo, porque el guion nuevo que YA
// existe para él (`GuionEmom`) pide tareas alternas por ronda y metros de
// máquina leídos del móvil, y el motor en SOLITARIO no tiene todavía ni el
// enganche a `PM5ConnectionStore` ni una acción de «marcar tarea» —
// `accionEtiqueta`/`accionTap` de esta vista no ofrecen ninguna para EMOM
// porque el motor no la tiene. Portarlo de verdad es una pieza aparte, no una
// sustitución de fichero: se documenta aquí para que no se dé por hecho.
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
            nota: notaProcedencia
        )
    }

    // MARK: - Tinte / bisel

    private var tinteLienzo: Color? {
        if isCountIn { return WatchTheme.orange }
        if phase == .rest { return WatchTheme.zoneGreen }
        return WatchTinte.color(for: session.liveZone)
    }

    private var remainingFraction: Double {
        if isCountIn {
            return min(1, max(0, countInRemaining / 3))
        }
        let total = max(session.emomPhaseRemaining + 0.001, 60)
        let rem = session.emomPhaseRemaining
        if rem <= 0 { return 0 }
        return min(1, max(0, rem / total))
    }

    // MARK: - Status / labels

    private var statusText: String {
        guard let seg = session.currentSegment, let name = seg.formatScheme?.displayName ?? (seg.isEMOM ? "EMOM" : nil)
        else { return "" }
        if seg.isEMOM, let plan = seg.emomPlan {
            return "\(name) · \(session.emomIntervalIndex + 1) / \(plan.intervalCount)"
        }
        return name
    }

    private var contextoFase: String {
        if isCountIn { return statusText }
        if phase == .rest {
            let ultima = isLastEmom
            return ultima ? "Para · se acabó" : "Para · viene la \(session.emomIntervalIndex + 2)"
        }
        return statusText.isEmpty ? "Ronda" : statusText
    }

    private var isLastEmom: Bool {
        guard let plan = session.currentSegment?.emomPlan else { return false }
        return session.emomIntervalIndex + 1 >= plan.intervalCount
    }

    private var modoActual: WatchModo {
        if isCountIn { return .ojeada }
        if phase == .rest { return .mando }
        return .ojeada
    }

    private var isCountIn: Bool { session.emomCountInRemaining > 0 }
    private var countInRemaining: Double { session.emomCountInRemaining }
    private var phase: WorkoutSession.RotatingPhase { session.emomPhase }
    private var phaseKey: String { "\(session.emomIntervalIndex)-\(phase)-\(isCountIn)" }

    private var countdownText: String {
        if isCountIn { return WatchFormat.countdown(countInRemaining) }
        return WatchFormat.countdown(session.emomPhaseRemaining)
    }

    private var countdownColor: Color {
        if isCountIn { return WatchTheme.orange }
        return WatchTinte.urgente(session.emomPhaseRemaining)
    }

    private var nowMovement: String? {
        guard let seg = session.currentSegment, seg.isEMOM, let plan = seg.emomPlan else { return nil }
        return plan.interval(session.emomIntervalIndex)?.movement
    }

    private var nowWork: String? {
        guard let seg = session.currentSegment, seg.isEMOM, let plan = seg.emomPlan else { return nil }
        return plan.interval(session.emomIntervalIndex).flatMap(\.work)
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

    private var segundoEtiqueta: String? {
        phase == .rest && nowMovement != nil ? "Luego" : nil
    }

    private var nextMovement: String? {
        guard let seg = session.currentSegment, seg.isEMOM, let plan = seg.emomPlan else { return nil }
        return plan.interval(session.emomIntervalIndex + 1)?.movement
    }

    private var notaProcedencia: String? {
        guard phase != .rest else { return nil }
        if nowWork == nil, nowMovement != nil { return WatchNota.loDicesTu }
        return nil
    }
}
