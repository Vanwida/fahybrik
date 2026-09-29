import SwiftUI

// DATOS — «la sesión». Única página sin sujeto: cuatro filas de 24 pt.
// Espejo de `pagina_datos` en docs/mocks/tools/reloj-correr.py. Los datos los
// decide `RodajeDatos` (FAHYBRIKCore), común a las dos vías.

/// Los tres puntos de la lámina (6 pt, hueco 3, activo blanco / 28 %).
/// TabView pagina; el índice del sistema se apaga en rodaje para no duplicarlos.
struct RodajePuntos: View {
    let activa: Int
    var total: Int = 3

    @Environment(\.isLuminanceReduced) private var atenuado

    var body: some View {
        if atenuado {
            Color.clear.frame(height: RodajeTipo.filaPuntos)
        } else {
            HStack(spacing: 3) {
                ForEach(0..<total, id: \.self) { n in
                    Circle()
                        .fill(n == activa ? Color.white : Color.white.opacity(0.28))
                        .frame(width: 6, height: 6)
                }
            }
            .frame(height: RodajeTipo.filaPuntos)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)
        }
    }
}

/// EL CUERPO DE DATOS, UNA SOLA VEZ: las cuatro filas y, si no hay zona, la
/// razón. QUÉ dice cada fila lo decide `RodajeDatos.lectura` (el mismo dato para
/// el reloj sin móvil y para el espejo); esto sólo lo dibuja.
struct RodajeDatosCuerpo: View {
    let lectura: RodajeDatos.Lectura

    var body: some View {
        VStack(spacing: 0) {
            RodajeVersales(texto: "la sesión", tono: RodajeTipo.contexto)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(lectura.filas, id: \.etiqueta) { fila($0) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            if let nota = lectura.nota {
                RodajeVersales(texto: nota, arriba: 2, compacta: true)
            }
            RodajePuntos(activa: RodajePagina.datos.punto)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func fila(_ f: RodajeDatos.Fila) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            RodajeVersales(texto: f.etiqueta)
            HStack(alignment: .lastTextBaseline, spacing: 0) {
                RodajeNumeral(texto: f.cifra, unidad: f.unidad, alto: RodajeTipo.filaDatos)
                if let chip = f.chip {
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

/// Sin móvil: el motor alimenta a `RodajeDatos`. En espejo lo alimenta la trama
/// (`MirrorRodajeDatosPage`), con el mismo cuerpo y la misma lectura.
struct RodajeDatosPage: View {
    let session: WorkoutSession
    var driver: WatchRunLegDriver? = nil

    var body: some View {
        RodajeMarco(session: session, driver: driver) {
            RodajeDatosCuerpo(lectura: RodajeDatos.lectura(.init(sesion: session)))
        }
    }
}
