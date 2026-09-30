import SwiftUI

// LA TARJETA DEL DÍA — la cara plana de una sección, y la lista de filas que vive dentro de una.
//
// Es la superficie de todo lo que NO es el sujeto: «Cómo llegas», «Contigo», las próximas carreras,
// los ajustes, un gráfico. Radio 22, la superficie y un filete de un punto; sin la sombra ni el brillo
// de `CardSurface` (la del instrumento): en «El día» el sujeto es lo único que pesa. Es la cara de
// `TeselaDia` sin lo demás, para las tarjetas que llevan filas y textos dentro y no una cifra.
//
// `realce` la tiñe del acento del club: lo que pide un acto o ya está en marcha. Sobre ese tinte el
// texto es la tinta del tema (CONTRATO-UI §11.2), no `muted`.
//
//     VStack(alignment: .leading) { … }
//         .padding(18)
//         .tarjetaDia(alAncho: true)

extension View {
    /// Cara de tarjeta plana: superficie, filete y esquinas recortadas.
    /// - Parameter alAncho: la tarjeta ocupa todo el ancho y su contenido queda arriba a la izquierda
    ///   (lo que hace `TeselaDia`). Sin él, mide lo que mida su contenido.
    func tarjetaDia(realce: Bool = false, alAncho: Bool = false) -> some View {
        modifier(TarjetaDiaModifier(realce: realce, alAncho: alAncho))
    }
}

private struct TarjetaDiaModifier: ViewModifier {
    let realce: Bool
    let alAncho: Bool

    func body(content: Content) -> some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
        cara(content)
            .background(realce ? Theme.Color.accentTint(sobre: Theme.Color.surface) : Theme.Color.surface, in: forma)
            .clipShape(forma)
            .overlay(forma.strokeBorder(realce ? Theme.Color.accentTintBorde : Theme.Color.hairline, lineWidth: 1))
    }

    @ViewBuilder
    private func cara(_ content: Content) -> some View {
        if alAncho {
            content.frame(maxWidth: .infinity, alignment: .topLeading)
        } else {
            content
        }
    }
}

/// Una tarjeta con filas separadas por un filete. El toque de cada fila es suyo. Las filas pueden venir de
/// un `ForEach` o de condicionales: el filete se pone ENTRE las que de verdad se pintan, ni una de más
/// delante ni una de menos detrás.
struct ListaDia<Contenido: View>: View {
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        VStack(spacing: 0) {
            Group(subviews: contenido()) { filas in
                ForEach(Array(filas.enumerated()), id: \.offset) { i, fila in
                    if i > 0 { Hairline() }
                    fila
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaDia()
    }
}

#if DEBUG
#Preview("Tarjeta · fábrica") { EnAmbasDia { GaleriaDia.Tarjetas() } }
#Preview("Tarjeta · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Tarjetas() } }
#endif
