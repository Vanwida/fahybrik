import SwiftUI

// EL RELOJ DE PARED, SIN MÓVIL — intervals, tabata, death by, steady funcional.
//
// Es la mitad de este guion que aún no existía: `GuionDelEspejo` ya lo alimenta
// en modo espejo, pero `RotatingLiveView` seguía tratando estos cuatro formatos
// con su lenguaje viejo (un crono para todo, la tarea en segundo nivel, «Toca ·
// fallé» a plena luz). Aquí el motor está EN EL RELOJ, así que los datos son los
// reales — `formatWorkSeconds`/`formatRestSeconds` dan el total de la ventana
// de verdad, no la estimación de 60 s que hacía falta adivinar por el cable.
//
// EMOM se queda en `EmomLiveView`: enchufarlo aquí pintaría su plan y su fase
// con la regla de otro formato. Ver el comentario de esa vista.
struct RelojDeParedLiveView: View {
    let session: WorkoutSession

    @State private var destello = WatchDestello()
    @State private var lastRondaKey: String = ""

    // MARK: - Páginas

    /// El 3-2-1 es del motor de CONDICIONAMIENTO (`isCondCountIn`), no de la
    /// familia — es el mismo cuenta atrás que ya pinta `FixedLiveView` para
    /// AMRAP/For Time. Sin esto, los cuatro formatos de aquí arrancaban
    /// pintando su contenido en un estado a medio resolver: `steady` decía
    /// «Se acabó» (quedaS en 0), intervals se quedaba en «0:00» fijo y tabata
    /// en la ronda 1 fija — los tres antes de que el bloque empezara.
    private var paginas: [WatchPagina] {
        if session.isCondCountIn {
            var list: [WatchPagina] = [
                WatchPagina(
                    id: "countin",
                    contexto: session.currentSegment?.formatScheme?.displayName ?? "Prepárate",
                    modo: .ojeada,
                    sujeto: WatchFormat.countdown(session.condCountInRemaining),
                    tono: WatchTheme.orange
                ),
            ]
            if let pulso = WatchPaginasComunes.pulso(bpm: session.liveHRBpm, zone: session.liveZone, modo: .ojeada) {
                list.append(pulso)
            }
            return list
        }
        return GuionRelojDePared.paginas(
            GuionRelojDePared.estadoSolitario(session),
            GuionRelojDePared.gestosSolitario(session)
        )
    }

    var body: some View {
        WatchReloj(
            paginas: paginas,
            tinte: session.isCondCountIn ? WatchTheme.orange : WatchTinte.color(for: session.liveZone),
            bisel: session.isCondCountIn ? nil : bisel,
            destello: destello
        )
        .onChange(of: rondaKey) { _, new in
            if !lastRondaKey.isEmpty, new != lastRondaKey {
                destello = WatchDestello(
                    n: destello.n + 1,
                    color: session.isTramoResting ? WatchTheme.zoneGreen : WatchTheme.orangeSoft
                )
            }
            lastRondaKey = new
        }
        .onAppear { lastRondaKey = rondaKey }
    }

    // MARK: - Bisel

    /// El aro SEGMENTADO de verdad: aquí, a diferencia del espejo, sí se conoce
    /// el total de la ventana de trabajo (`formatWorkSeconds`), así que el
    /// segmento en curso se rellena con la fracción real en vez de quedarse
    /// siempre a cero.
    private var bisel: AnyView? {
        let esSegmentable = session.currentSegment?.formatScheme == .intervals
            || session.currentSegment?.formatScheme == .tabata
        guard esSegmentable, session.rotTotalRounds > 1 else { return aroContinuo }
        let total = session.rotTotalRounds
        let hechas = max(0, session.rotRoundIndex)
        let fraccion: Double = {
            guard let work = session.currentSegment?.formatWorkSeconds, work > 0 else { return 0 }
            if session.rotPhase == .rest { return 1 }
            return min(1, max(0, 1 - session.rotPhaseRemaining / Double(work)))
        }()
        return WatchAroSegmentado(total: total, hechas: hechas, fraccion: fraccion).watchBisel()
    }

    private var aroContinuo: AnyView? {
        guard let total = ventanaTotalS, total > 0 else { return nil }
        return WatchAroContinuo(remaining: max(0, min(1, session.rotPhaseRemaining / total))).watchBisel()
    }

    private var ventanaTotalS: Double? {
        if session.rotPhase == .rest {
            return session.currentSegment?.formatRestSeconds.map { Double($0) }
        }
        return session.currentSegment?.formatWorkSeconds.map { Double($0) }
    }

    private var rondaKey: String {
        "\(session.rotRoundIndex)-\(session.rotPhase)"
    }
}
