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
//
// Con el texto del sistema en tamaños de accesibilidad tres columnas no dan para «Entreno» ni «Después» enteras
// (a 35 pt cada una mide más que su tercio, y cortarla con «…» o partirla por la mitad ya no dice en qué paso
// estás): los pasos pasan a una columna, cada uno con su trazo delante. Un nombre no se recorta nunca.

struct LineaDelDia: View {
    let pasos: [String]
    /// El índice del paso en que estás. Fuera de rango = ninguno vivo (todos pasados o todos pendientes).
    let actual: Int
    let etiquetaAccesible: String

    @Environment(\.dynamicTypeSize) private var tamanoDeTexto

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

    private func nombre(_ texto: String, _ f: Fase) -> some View {
        Text(texto)
            .papel(f == .vivo ? .notaPesada : .notaFuerte)
            .foregroundStyle(f == .vivo ? Theme.Color.foreground : Theme.Color.muted)
            .fixedSize(horizontal: false, vertical: true)
    }

    var body: some View {
        Group {
            if tamanoDeTexto.isAccessibilitySize { enColumna } else { enFila }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(etiquetaAccesible)
    }

    /// Tres trazos a lo ancho, cada uno con su nombre debajo.
    private var enFila: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.s - 2) {
            ForEach(Array(pasos.enumerated()), id: \.offset) { i, texto in
                let f = fase(i)
                VStack(alignment: .leading, spacing: 7) {
                    Capsule()
                        .fill(trazo(f))
                        .frame(height: 6)
                    nombre(texto, f)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    /// Un paso por línea: su trazo delante y su nombre entero al lado.
    private var enColumna: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            ForEach(Array(pasos.enumerated()), id: \.offset) { i, texto in
                let f = fase(i)
                HStack(spacing: Theme.Spacing.m - 2) {
                    Capsule()
                        .fill(trazo(f))
                        .frame(width: 32, height: 6)
                    nombre(texto, f)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

#if DEBUG
#Preview("Línea del día · fábrica") { EnAmbasDia { GaleriaDia.Cabecera() } }
#Preview("Línea del día · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Cabecera() } }
#endif
