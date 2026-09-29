import SwiftUI

// LAS PIEZAS PROPIAS DE PERFIL — lo que el kit del día no trae y esta pestaña necesita.
//
// Son genéricas (una tarjeta plana, un glifo, un chevron que gira): las nombra el kit
// (`Theme/Dia/`) y el orquestador puede subirlas sin cambiar nada. No están allí porque las cuatro
// pestañas se portan en paralelo sobre el mismo kit y dos agentes tocando el mismo fichero es como
// se pierde trabajo.

// MARK: - Glifos

/// Los SF Symbols que Perfil necesita y `GlifoDia` aún no tiene, con UN símbolo por idea.
enum GlifoPerfil: String, CaseIterable {
    /// «Con {coach}».
    case coach      = "person.fill.checkmark"
    /// «Dobles · con {pareja}».
    case pareja     = "person.2"
    case identidad  = "person.crop.circle"
    /// Entrenar: una mancuerna.
    case entreno    = "dumbbell"
    case reloj      = "applewatch"
    /// Cuenta: tres controles deslizantes.
    case ajustes    = "slider.horizontal.3"
    /// Privacidad: un escudo con cerradura.
    case escudo     = "lock.shield"
    case ayuda      = "questionmark.circle"
    case tarjeta    = "creditcard"
    case invitar    = "person.badge.plus"
    /// El pulso: una actividad nueva del reloj.
    case actividad  = "waveform.path.ecg"

    var simbolo: String { rawValue }
}

/// Un glifo de Perfil, a su tamaño y peso. Decorativo para VoiceOver: el nombre accesible lo lleva
/// el botón o la fila que lo contiene.
struct IconoPerfil: View {
    let glifo: GlifoPerfil
    var tam: CGFloat
    var peso: Font.Weight

    init(_ glifo: GlifoPerfil, tam: CGFloat = 24, peso: Font.Weight = .semibold) {
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

extension ClavePuerta {
    var glifo: GlifoPerfil {
        switch self {
        case .identidad: return .identidad
        case .entreno: return .entreno
        case .dispositivos: return .reloj
        case .cuenta: return .ajustes
        case .privacidad: return .escudo
        case .ayuda: return .ayuda
        }
    }
}

// MARK: - La marca de una puerta

extension TonoMarca {
    /// El color de la MARCA (un punto y el tinte de la fila). Nunca el del texto. `neutro` no tiene:
    /// una decisión del atleta no es ni buena ni mala noticia.
    var color: SwiftUI.Color? {
        switch self {
        case .neutro: return nil
        case .ok: return Theme.Color.ok
        case .invita: return Theme.Color.accentText
        case .aviso: return Theme.Color.warning
        case .peligro: return Theme.Color.danger
        }
    }

    /// El tono de la ficha de la puerta: solo lo que pide al atleta la tiñe.
    var ficha: FichaDia<IconoPerfil>.Tono {
        switch self {
        case .aviso: return .aviso
        case .peligro: return .peligro
        case .neutro, .ok, .invita: return .normal
        }
    }
}

// MARK: - La tarjeta plana

extension View {
    /// La superficie de una sección de Perfil: plana, con su hairline, radio de tarjeta. No es
    /// `CardSurface` (degradado y sombra de instrumento): las pantallas del día son planas y el
    /// sujeto es lo único que pesa. `realce` la tiñe del acento del club.
    func tarjetaPerfil(realce: Bool = false) -> some View {
        modifier(TarjetaPerfilModifier(realce: realce))
    }
}

private struct TarjetaPerfilModifier: ViewModifier {
    let realce: Bool

    func body(content: Content) -> some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
        content
            .background(realce ? Theme.Color.accentTint(sobre: Theme.Color.surface) : Theme.Color.surface, in: forma)
            .overlay(forma.strokeBorder(realce ? Theme.Color.accentTintBorde : Theme.Color.hairline, lineWidth: 1))
            .clipShape(forma)
    }
}

// MARK: - Un chevron que gira

/// El chevron de un pliegue: apunta abajo cerrado y arriba abierto. Con Reducir movimiento, sin giro animado.
struct GiroPerfil: View {
    let abierto: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        IconoDia(.chevron, tam: 18)
            .rotationEffect(.degrees(abierto ? -90 : 90))
            .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: abierto)
    }
}
