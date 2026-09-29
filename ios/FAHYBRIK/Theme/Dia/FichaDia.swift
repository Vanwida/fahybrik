import SwiftUI

// LA FICHA DE ICONO — el cuadrado de 44 pt (radio 14) que abre una fila.
//
// «Contigo», las puertas de Perfil, las próximas carreras: la misma ficha con un glifo dentro. Por
// defecto una cara elevada con contorno; `.realce` la rellena con el acento del club (lo que
// caduca en minutos o ya está empezado); `.peligro` y `.aviso` la tiñen del color de estado, sin
// que el color llegue al glifo (el glifo es la tinta del tema).
//
// Decorativa: el nombre accesible lo lleva la fila que la contiene.

struct FichaDia<Contenido: View>: View {
    enum Tono: CaseIterable {
        case normal, realce, peligro, aviso

        fileprivate var fondo: SwiftUI.Color {
            switch self {
            case .normal:  return Theme.Color.surfaceElevated
            case .realce:  return Theme.Color.accent
            case .peligro: return Theme.Color.tinte(Theme.Color.danger, 0.16, sobre: Theme.Color.surfaceElevated)
            case .aviso:   return Theme.Color.tinte(Theme.Color.warning, 0.18, sobre: Theme.Color.surfaceElevated)
            }
        }

        fileprivate var borde: SwiftUI.Color {
            switch self {
            case .normal:  return Theme.Color.hairlineStrong
            case .realce:  return .clear
            case .peligro: return Theme.Color.danger.opacity(0.40)
            case .aviso:   return Theme.Color.warning.opacity(0.45)
            }
        }

        fileprivate var tinta: SwiftUI.Color {
            self == .realce ? Theme.Color.accentOn : Theme.Color.foreground
        }
    }

    var tono: Tono
    let contenido: Contenido

    static var lado: CGFloat { 44 }

    init(tono: Tono = .normal, @ViewBuilder contenido: () -> Contenido) {
        self.tono = tono
        self.contenido = contenido()
    }

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
        contenido
            .foregroundStyle(tono.tinta)
            .frame(width: Self.lado, height: Self.lado)
            .background(tono.fondo, in: forma)
            .overlay(forma.strokeBorder(tono.borde, lineWidth: 1))
            .accessibilityHidden(true)
    }
}

extension FichaDia where Contenido == IconoDia {
    /// La ficha con un glifo del kit dentro.
    init(_ glifo: GlifoDia, tono: Tono = .normal) {
        self.init(tono: tono, contenido: { IconoDia(glifo, tam: 24, peso: .semibold) })
    }
}

#if DEBUG
#Preview("Ficha · fábrica") { EnAmbasDia { GaleriaDia.Disposicion() } }
#Preview("Ficha · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Disposicion() } }
#endif
