import SwiftUI

// LOS GLIFOS DE «EL DÍA» — todos SF Symbols, con UN nombre por idea.
//
// El doble dibuja sus glifos a mano (`kit-dia/iconos.tsx`) porque en la web no hay SF
// Symbols; en iOS TODOS tienen su equivalente del sistema, así que no se dibuja ninguno:
// un SF Symbol sigue el peso del texto, se adapta a Dynamic Type y a Negrita, y lo pinta
// el sistema con la misma mano que el resto de la app. Lo que sí se fija aquí es cuál
// usa cada idea (chevron, flecha, reintentar…), para que las cuatro pestañas no escojan
// cuatro símbolos distintos para lo mismo.
//
// Son decorativos: el nombre accesible lo lleva el botón o la fila que los contiene.

enum GlifoDia: String, CaseIterable {
    case chevron    = "chevron.right"
    case flecha     = "arrow.right"
    case bandeja    = "tray"
    case chat       = "bubble.left"
    case mas        = "plus"
    case lupa       = "magnifyingglass"
    case calendario = "calendar"
    case diana      = "target"
    case pausa      = "pause.circle"
    case cronometro = "stopwatch"
    case video      = "video"
    case huellas    = "shoeprints.fill"
    case check      = "checkmark"
    case sube       = "arrow.up.right"
    case baja       = "arrow.down.right"
    case reintentar = "arrow.clockwise"
    case cerrar     = "xmark"
    case camara     = "camera"
    case silueta    = "person.fill"
    case lapiz      = "pencil"
    case puntos     = "ellipsis"

    /// El nombre del SF Symbol.
    var simbolo: String { rawValue }
}

/// Un glifo del día, a su tamaño y peso. Decorativo para VoiceOver.
struct IconoDia: View {
    let glifo: GlifoDia
    var tam: CGFloat
    var peso: Font.Weight

    init(_ glifo: GlifoDia, tam: CGFloat = 20, peso: Font.Weight = .semibold) {
        self.glifo = glifo
        self.tam = tam
        self.peso = peso
    }

    var body: some View {
        Image(systemName: glifo.simbolo)
            .font(.system(size: tam, weight: peso))
            .accessibilityHidden(true)
    }
}

// MARK: - El sello de estado de una sesión

/// La marca de estado de una sesión: los mismos cuatro sellos que pinta el Plan (hecha ✓ verde,
/// a medias ½ ámbar, saltada ✕ neutra, por hacer ○ neutra). Con `tinta` los dibuja todos de un
/// solo color, para las superficies donde un verde o un ámbar no se leerían (el bloque del
/// acento): el estado va entonces por la FORMA y por la palabra que lo acompaña.
struct SelloEstadoDia: View {
    enum Estado: CaseIterable {
        case hecha, parcial, saltada, pendiente

        var simbolo: String {
            switch self {
            case .hecha:     return "checkmark.circle.fill"
            case .parcial:   return "circle.lefthalf.filled"
            case .saltada:   return "xmark.circle"
            case .pendiente: return "circle"
            }
        }

        fileprivate var color: SwiftUI.Color {
            switch self {
            case .hecha:     return Theme.Color.ok
            case .parcial:   return Theme.Color.warning
            case .saltada, .pendiente: return Theme.Color.muted
            }
        }
    }

    let estado: Estado
    var tam: CGFloat = 22
    /// Un solo color para los cuatro sellos (sobre el acento). `nil` = el color de cada estado.
    var tinta: SwiftUI.Color?

    var body: some View {
        Image(systemName: estado.simbolo)
            .font(.system(size: tam, weight: .semibold))
            .foregroundStyle(tinta ?? estado.color)
            .accessibilityHidden(true)
    }
}

#if DEBUG
#Preview("Sello y glifos · fábrica") { EnAmbasDia { GaleriaDia.Teselas() } }
#Preview("Sello y glifos · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Teselas() } }
#endif
