import SwiftUI

// LA CARA POR RONDAS de los formatos count-up — la lista mientras quepa, el
// contador cuando no. Porta la propuesta aprobada del doble
// (`design-twin/screens/vivo-rondas`, docs/DECISIONS.md 2026-08-10/11
// «Rondas ≠ estaciones»).
//
// LA DISTINCIÓN QUE LO GOBIERNA: una lista de N ESTACIONES es heterogénea y
// colapsarla destruye información (eso lo resuelve la ruta de estaciones de
// `ForTimeLiveHUD`); una lista de N RONDAS es homogénea — la fila 7 repite la
// fila 6 — así que colapsarla no quita información: la CONCENTRA. El contador
// no es otra metáfora, es LA MISMA LISTA CON EL CURSOR ABIERTO: la que
// cerraste arriba (tachada, con su parcial), la que haces en el numeral, la
// que viene abajo.
//
// EL UMBRAL NO ES UNA CONSTANTE: `ViewThatFits` prueba la lista contra el
// marco REAL del dispositivo y cae al contador cuando la lista no cabe. Es la
// aritmética del marco calculada por el motor de layout — el doble la tuvo que
// estimar a mano (213 pt de apoyos, fila de 35 → cinco rondas) porque el HTML
// no sabe medirse; Swift sí. En apaisado la superficie scrollea (la acción va
// clavada debajo) y la propuesta de alto es infinita, así que la lista gana
// siempre — que es lo correcto: ahí no hay nada que empuje.
//
// El trabajo de la ronda se escribe UNA VEZ (§10.6): la lista de dos líneas
// por fila gastaba 681 pt en repetir el mismo trabajo doce veces, y fue lo que
// el 10-ago dejó un EMPEZAR fuera de pantalla.

// MARK: - Las lecturas puras (espejo de vivo-rondas/data.ts)

// MARK: - El HUD

// MARK: - El cromo compartido de las dos caras

// MARK: - Los dos sujetos

// MARK: - El hilo

// MARK: - Las filas (la cara de pocas rondas)

// MARK: - La cara de los rotativos (y del continuo)

// MARK: - FH-107 orientation chrome

struct LiveOrientationStrip: View {
    let orientation: WorkoutSession.LiveOrientation

    var body: some View {
        if orientation.roundLine == nil && orientation.stationLine == nil { EmptyView() }
        else {
            HStack(spacing: 8) {
                if let round = orientation.roundLine {
                    orientationChip(round, accent: true)
                }
                if let station = orientation.stationLine {
                    orientationChip(station, accent: false)
                }
                Spacer(minLength: 0)
                if let rest = orientation.restKind.labelES {
                    Text(rest.uppercased())
                        .font(.system(size: 9, weight: .heavy)).tracking(0.6)
                        .foregroundStyle(Theme.Color.info)
                        .lineLimit(1)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func orientationChip(_ text: String, accent: Bool) -> some View {
        Text(text.uppercased())
            .font(.system(size: 10, weight: .heavy, design: .default).italic())
            .tracking(0.5)
            .foregroundStyle(accent ? Theme.Color.accentText : Theme.Color.foreground)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }
}
