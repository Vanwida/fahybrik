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
// EMOM se queda en `RotatingLiveView`: enchufarlo aquí pintaría su plan y su
// fase con la regla de otro formato. Ver el comentario de esa vista.
struct RelojDeParedLiveView: View {
    let session: WorkoutSession

    @State private var destello = WatchDestello()
    @State private var lastRondaKey: String = ""

    var body: some View {
        WatchReloj(
            paginas: GuionRelojDePared.paginas(
                GuionRelojDePared.estadoSolitario(session),
                GuionRelojDePared.gestosSolitario(session)
            ),
            tinte: WatchTinte.color(for: session.liveZone),
            bisel: bisel,
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
