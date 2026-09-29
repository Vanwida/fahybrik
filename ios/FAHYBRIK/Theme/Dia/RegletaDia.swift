import SwiftUI

// LA REGLETA «N DE M» — la posición dentro de algo que tiene cuenta: la semana N de M de un
// plan, los tests hechos de los cuatro, las marcas de las doce.
//
// Hasta doce son SEGMENTOS (cada uno es un hecho que se ve); más, una barra continua, porque
// treinta segmentos de 8 pt no se cuentan, se leen como una barra con dientes. El relleno es
// el acento del club; lo que falta, un velo de la tinta del tema que se lee igual sobre una
// tarjeta y sobre la foto oscura del póster.
//
// Decorativa para VoiceOver: la cifra vive en el texto de al lado («Semana 3 de 8», «0 de 4
// calibrados»). Una regleta que además se lee dos veces es ruido.

struct RegletaDia: View {
    let n: Int
    let de: Int
    var alto: CGFloat = 6
    /// Ancho fijo de cada segmento (la regleta compacta que acompaña a un texto, 14 pt). `nil`,
    /// los segmentos se reparten todo el ancho.
    var anchoSegmento: CGFloat?

    /// Desde cuántos pasos deja de ser una fila de segmentos y pasa a barra continua.
    static let segmentosMaximos = 12
    private static let opacidadVacio: Double = 0.26

    /// Cuántos segmentos van llenos: `n` acotado a `0…de`.
    static func llenos(n: Int, de: Int) -> Int { max(0, min(n, de)) }

    private var vacio: SwiftUI.Color { Theme.Color.foreground.opacity(Self.opacidadVacio) }

    var body: some View {
        Group {
            if de > Self.segmentosMaximos {
                continua
            } else if de > 0 {
                segmentada
            }
        }
        .accessibilityHidden(true)
    }

    private var segmentada: some View {
        let llenos = Self.llenos(n: n, de: de)
        return HStack(spacing: Theme.Spacing.xs) {
            ForEach(0..<de, id: \.self) { i in
                Capsule()
                    .fill(i < llenos ? Theme.Color.accent : vacio)
                    .frame(width: anchoSegmento, height: alto)
                    .frame(maxWidth: anchoSegmento == nil ? .infinity : nil)
            }
        }
    }

    private var continua: some View {
        let fraccion = CGFloat(Self.llenos(n: n, de: de)) / CGFloat(de)
        return Capsule()
            .fill(vacio)
            .frame(height: alto)
            .overlay(alignment: .leading) {
                GeometryReader { proxy in
                    Capsule()
                        .fill(Theme.Color.accent)
                        .frame(width: proxy.size.width * fraccion)
                }
            }
    }
}

#if DEBUG
#Preview("Regleta · fábrica") { EnAmbasDia { GaleriaDia.Teselas() } }
#Preview("Regleta · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Teselas() } }
#endif
