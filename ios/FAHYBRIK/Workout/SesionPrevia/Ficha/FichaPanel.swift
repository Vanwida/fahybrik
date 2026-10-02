import SwiftUI

// EL PANEL DE UN BLOQUE — lo que se lee debajo de la ruta: UN bloque, con la forma que le toca a su formato.
//
// Aquí cabe más aire que en una pila de tarjetas porque en pantalla solo hay un bloque. Cada panel lleva encima, si las
// hay, la chapa del formato (solo en una simulación: el reloj y la pista de minutos ya dicen el suyo), qué significa el
// formato para quien no lo conoce, y la nota del coach para ESTE bloque (con su filo); y debajo, el aviso de lo que el
// coach dejó sin dosis. Qué panel pinta cada bloque lo decide su `forma`; lo que dice cada uno, los campos de sus
// movimientos (`LecturaFicha`): la vista no recalcula nada.

struct FichaPanel: View {
    let bloque: BloqueFicha
    let alAbrirTecnica: (WorkoutItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: FichaMedidas.dentroDelPanel) {
            if let etiqueta = bloque.etiquetaFormato {
                InfoPill(text: etiqueta, estilo: .superficie)
            }
            if let explicacion = bloque.explicacion {
                Text(explicacion)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let nota = bloque.nota {
                NotaConFiloDia(nota)
            }
            contenido
            if let aviso = bloque.avisoSinDosis {
                Text(aviso)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var contenido: some View {
        switch bloque.forma {
        case .series:
            FichaPanelSeries(movimientos: bloque.movimientos, alAbrirTecnica: alAbrirTecnica)
        case .superserie:
            FichaPanelSuperserie(bloque: bloque, alAbrirTecnica: alAbrirTecnica)
        case .emom:
            FichaPanelEmom(bloque: bloque, alAbrirTecnica: alAbrirTecnica)
        case .reloj:
            FichaPanelReloj(bloque: bloque, alAbrirTecnica: alAbrirTecnica)
        case .estaciones:
            FichaPanelEstaciones(bloque: bloque, alAbrirTecnica: alAbrirTecnica)
        case .intervalos:
            FichaPanelIntervalos(movimientos: bloque.movimientos, alAbrirTecnica: alAbrirTecnica)
        case .continuo:
            FichaPanelContinuo(movimientos: bloque.movimientos, alAbrirTecnica: alAbrirTecnica)
        case .marco:
            FichaLista(movimientos: bloque.movimientos, compacta: true, alAbrirTecnica: alAbrirTecnica)
        }
    }
}
