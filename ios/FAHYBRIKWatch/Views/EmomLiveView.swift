import SwiftUI

// EL EMOM, SIN MÓVIL — el mismo guion (`GuionEmom`) que ya alimenta el espejo,
// leyendo el plan y la fase directamente del motor en vez del tramo por cable.
//
// Sustituye a `RotatingLiveView`, que documentaba dos huecos que ya no existen:
// ni le faltaba el enganche para «marcar tarea» (`session.primaryAdvance()` ya
// hace el roll — es la misma llamada que usa el gesto genérico de avanzar), ni
// le faltaba el guion (`GuionEmom` lleva construido desde esta noche). Lo único
// que faltaba de verdad era el adaptador `estadoSolitario`, que es lo que este
// fichero conecta — la misma pieza que ya tiene `RelojDeParedLiveView` para su
// familia.
struct EmomLiveView: View {
    let session: WorkoutSession

    @State private var destello = WatchDestello()
    @State private var lastRondaKey: String = ""

    var body: some View {
        WatchReloj(
            paginas: paginas,
            tinte: tinte,
            bisel: bisel,
            destello: destello
        )
        .onChange(of: rondaKey) { _, new in
            if !lastRondaKey.isEmpty, new != lastRondaKey {
                destello = WatchDestello(
                    n: destello.n + 1,
                    color: session.emomPhase == .rest ? WatchTheme.zoneGreen : WatchTheme.orangeSoft
                )
            }
            lastRondaKey = new
        }
        .onAppear { lastRondaKey = rondaKey }
    }

    // MARK: - Páginas

    /// El 3-2-1 es del EMOM (`emomCountInRemaining`), un reloj propio y
    /// paralelo al de condicionamiento — no lo toca `GuionEmom.estadoSolitario`
    /// (leería `emomIntervalIndex`/`emomPhase` ya en marcha, que durante el
    /// cuenta atrás no lo están todavía).
    private var paginas: [WatchPagina] {
        if session.emomCountInRemaining > 0 {
            var list: [WatchPagina] = [
                WatchPagina(
                    id: "countin",
                    contexto: statusText,
                    modo: .ojeada,
                    sujeto: WatchFormat.countdown(session.emomCountInRemaining),
                    tono: WatchTheme.orange,
                    segundoValor: primerMovimiento
                ),
            ]
            if let pulso = WatchPaginasComunes.pulso(bpm: session.liveHRBpm, zone: session.liveZone, modo: .ojeada) {
                list.append(pulso)
            }
            return list
        }
        return GuionEmom.paginas(
            GuionEmom.estadoSolitario(session),
            GuionEmom.gestosSolitario(session)
        )
    }

    private var statusText: String {
        guard let plan = session.currentSegment?.emomPlan else { return "EMOM" }
        return "EMOM · \(plan.intervalCount) rondas"
    }

    private var primerMovimiento: String? {
        session.currentSegment?.emomPlan?.interval(0)?.movement
    }

    // MARK: - Tinte / bisel

    private var tinte: Color? {
        if session.emomCountInRemaining > 0 { return WatchTheme.orange }
        return session.emomPhase == .rest ? WatchTheme.zoneGreen : WatchTinte.color(for: session.liveZone)
    }

    /// Continuo, no segmentado por rondas: el aro lleva la VENTANA de la ronda
    /// en curso de un tirón, cruzando trabajo y parada — es lo que dice el
    /// propio guion (`GuionEmom`, cabecera del fichero) y lo que ya hacía la
    /// vista vieja.
    private var bisel: AnyView? {
        guard session.emomCountInRemaining <= 0,
              let plan = session.currentSegment?.emomPlan, plan.intervalSeconds > 0 else { return nil }
        let ventana = Double(plan.intervalSeconds)
        let enVentana = session.emomPhase == .work
            ? Double(plan.workSeconds) - session.emomPhaseRemaining
            : Double(plan.workSeconds) + (Double(plan.restSeconds) - session.emomPhaseRemaining)
        return WatchAroContinuo(remaining: max(0, min(1, 1 - enVentana / ventana))).watchBisel()
    }

    private var rondaKey: String {
        "\(session.emomIntervalIndex)-\(session.emomPhase)-\(session.emomCountInRemaining > 0)"
    }
}
