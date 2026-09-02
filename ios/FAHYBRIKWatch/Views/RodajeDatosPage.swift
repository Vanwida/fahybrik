import SwiftUI

// DATOS — «la sesión». Única página sin sujeto: cuatro filas de 24 pt.
// Espejo de `pagina_datos` en docs/mocks/tools/reloj-correr.py.

struct RodajeDatosPage: View {
    let session: WorkoutSession
    var driver: WatchRunLegDriver? = nil

    var body: some View {
        RodajeMarco(session: session, driver: driver) {
            VStack(spacing: 0) {
                RodajeVersales(texto: "la sesión", tono: RodajeTipo.contexto)
                VStack(alignment: .leading, spacing: 0) {
                    fila(etiqueta: "tiempo", valor: tiempo, unidad: "")
                    fila(etiqueta: "distancia", valor: distancia.cifra, unidad: distancia.unidad)
                    fila(etiqueta: "ritmo medio", valor: ritmo.cifra, unidad: ritmo.unidad)
                    fila(etiqueta: "pulso", valor: pulso.cifra, unidad: pulso.unidad, chip: pulso.chip)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                if session.liveZone == nil {
                    RodajeVersales(texto: WatchNota.sinAncla, arriba: 2)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
    }

    private var tiempo: String {
        WatchFormat.clock(session.elapsedSeconds)
    }

    private var distancia: (cifra: String, unidad: String) {
        guard let m = session.liveRunDistanceMeters else { return ("—", "") }
        return (WatchDistancia.cifra(m), WatchDistancia.unidad(m))
    }

    private var ritmo: (cifra: String, unidad: String) {
        guard let s = session.liveCoveredPaceSecPerKm else { return ("—", "") }
        return (WatchFormat.pace(s), Formato.UnidadRitmo.porKm.rawValue)
    }

    private var pulso: (cifra: String, unidad: String, chip: String?) {
        guard let bpm = session.liveHRBpm else { return ("—", "", nil) }
        if let z = session.liveZone {
            return ("\(bpm)", "ppm", "\(z.label) \(WatchZonaNombre.de(z))")
        }
        return ("\(bpm)", "ppm", nil)
    }

    private func fila(etiqueta: String, valor: String, unidad: String, chip: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            RodajeVersales(texto: etiqueta)
            HStack(alignment: .lastTextBaseline, spacing: 0) {
                RodajeNumeral(texto: valor, unidad: unidad, alto: RodajeTipo.filaDatos)
                if let chip {
                    Text(chip)
                        .font(.system(size: 11.5, weight: .heavy))
                        .foregroundStyle(WatchTheme.ink)
                        .padding(.leading, 8)
                        .padding(.bottom, 2)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}
