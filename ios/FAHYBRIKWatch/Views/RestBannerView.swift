import SwiftUI

// DESCANSO DE FUERZA — pantalla completa, modo mando.
//
// Ya no es un banner verde encima del live: es la situación diseñada en
// `watch-fuerza` (descanso): cuenta atrás como sujeto, serie que viene debajo,
// bisel que drena, tinte verde de recuperación. Toque = empezar ya (salta el resto).
struct RestBannerView: View {
    let session: WorkoutSession

    var body: some View {
        WatchReloj(
            paginas: [
                WatchPagina(
                    id: "descanso",
                    contexto: "Descanso",
                    modo: .mando,
                    sujeto: WatchFormat.countdown(session.restRemainingSeconds),
                    tono: WatchTinte.urgente(session.restRemainingSeconds),
                    segundoEtiqueta: nextLabel != nil ? "Luego" : nil,
                    segundoValor: nextLabel,
                    accion: "Toca · empezar ya",
                    onToca: { session.dismissRest() }
                ),
            ],
            tinte: WatchTheme.zoneGreen,
            bisel: WatchAroContinuo(remaining: remainingFraction).watchBisel()
        )
        .onChange(of: session.restRemainingSeconds) { old, new in
            if old > 0 && new <= 0 { WatchHaptics.start() }
        }
    }

    private var nextLabel: String? {
        session.currentSegment?.title
    }

    private var remainingFraction: Double {
        // El engine no expone el total del rest; usamos el prescrito del set si hay,
        // si no un techo razonable para que el aro no quede vacío al instante.
        let total = prescribedRestTotal ?? max(session.restRemainingSeconds, 1)
        return min(1, max(0, session.restRemainingSeconds / total))
    }

    private var prescribedRestTotal: Double? {
        guard let sets = session.currentSegment?.prescription?.sets else { return nil }
        let maxRest = sets.compactMap(\.restS).max() ?? 0
        return maxRest > 0 ? Double(maxRest) : nil
    }
}
