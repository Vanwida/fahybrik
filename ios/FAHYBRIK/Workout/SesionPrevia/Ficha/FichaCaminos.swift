import SwiftUI

// LOS CAMINOS A MANO — «¿Ya lo entrenaste sin la app? Regístralo», al final de la página y discretos.
//
// Son la salida honesta de quien entrenó sin el cronómetro (lo apunta a mano) o con otra app (trae el resultado en una
// captura). No van en la acción anclada: la única puerta de empezar es una. Una PRUEBA no los tiene: lo que la app no
// midió no cuenta como marca, y se dice en una línea, sin asustar. Solo en la primera pasada; en la segunda manda el
// reloj y no hay caminos a mano. Qué caminos hay lo decide `LecturaSesionPrevia`.

struct FichaCaminos: View {
    let prueba: Bool
    let caminos: [LecturaSesionPrevia.Secundaria]
    let alRegistrarAMano: () -> Void
    let alRegistrarConCaptura: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            if prueba {
                Text("Una prueba se mide con la app: no se registra a mano.")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            // El botón de texto del kit lleva su propio margen: se compensa para que la frase empiece donde la página.
            VStack(spacing: 0) {
                ForEach(caminos, id: \.titulo) { camino in
                    let aMano = camino == .yaLoHice
                    BotonTextoDia(
                        camino.titulo,
                        tono: aMano ? .tinta : .suave,
                        accion: aMano ? alRegistrarAMano : alRegistrarConCaptura
                    ) {
                        IconoDia(aMano ? .check : .camara, tam: 17)
                    }
                }
            }
            .padding(.horizontal, -Theme.Spacing.l)
        }
    }
}
