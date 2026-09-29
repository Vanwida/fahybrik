import SwiftUI

// LA LÍNEA DEL DÍA — en qué instante estás, en tres trazos y una palabra.
//
// «Antes · Entreno · Después»: cada paso es un trazo y su nombre debajo; el actual va en el
// acento y en peso fuerte, los pasados en gris y los que faltan en el hilo. Es sobria a
// propósito: dice DÓNDE estás sin inventar horarios que el plan no tiene, para que el sujeto
// de debajo sea lo único que grita.
//
// Genérica: recibe los nombres de los pasos y cuál es el actual; no sabe qué son. Qué instante
// es lo decide quien la monta (en Hoy, del ESTADO de las sesiones y no de la hora del reloj).
//
// VoiceOver lo lee como UNA frase (`etiquetaAccesible`: «Tu día. Ahora: Antes, 1 de 3 sesiones
// cerradas»), no como tres trazos mudos y tres palabras sueltas.

struct LineaDelDia: View {
    let pasos: [String]
    /// El índice del paso en que estás. Fuera de rango = ninguno vivo (todos pasados o todos pendientes).
    let actual: Int
    let etiquetaAccesible: String

    private enum Fase { case pasado, vivo, pendiente }

    private func fase(_ i: Int) -> Fase {
        i < actual ? .pasado : (i == actual ? .vivo : .pendiente)
    }

    private func trazo(_ f: Fase) -> SwiftUI.Color {
        switch f {
        case .vivo:      return Theme.Color.accent
        case .pasado:    return Theme.Color.muted
        case .pendiente: return Theme.Color.hairlineStrong
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.s - 2) {
            ForEach(Array(pasos.enumerated()), id: \.offset) { i, nombre in
                let f = fase(i)
                VStack(alignment: .leading, spacing: 7) {
                    Capsule()
                        .fill(trazo(f))
                        .frame(height: 6)
                    Text(nombre)
                        .papel(f == .vivo ? .notaPesada : .notaFuerte)
                        .foregroundStyle(f == .vivo ? Theme.Color.foreground : Theme.Color.muted)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(etiquetaAccesible)
    }
}

#if DEBUG
#Preview("Línea del día · fábrica") { EnAmbasDia { GaleriaDia.Cabecera() } }
#Preview("Línea del día · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Cabecera() } }
#endif
