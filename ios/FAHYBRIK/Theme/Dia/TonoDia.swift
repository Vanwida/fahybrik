import SwiftUI

// EL TONO DE UN MOMENTO — qué color dice «qué toca ahora».
//
// Cada sujeto de «El día» tiene su tinte. `accion` (el ACENTO DEL CLUB, sólido) es la
// familia de «haz esto ahora»: sesión, retomar, montar. El resto son tintes suaves de un
// color de estado sobre la superficie: el color dice el momento y JAMÁS lleva el texto (el
// texto es siempre la tinta del tema, o la del acento sobre el acento).
//
// MULTI-TENANT. Todo lo que en el diseño es «naranja» es el acento del club, y aquí sale de
// `Theme.Color.accent*` — nunca un hex. Los colores de estado (info, ok, peligro) y el de
// soporte (la modalidad de movilidad) son SEMÁNTICOS: no los toca el tenant.
//
// Espejo de `TONOS` en `web/components/design-twin/kit-dia/hero.tsx`.

enum TonoDia: CaseIterable {
    /// «Haz esto ahora»: el acento del club, sólido.
    case accion
    /// Información: un momento que espera tu respuesta (el check-in).
    case info
    /// Hecho: lo registrado hoy.
    case ok
    /// Soporte: descanso, movilidad. El día que no toca apretar.
    case soporte
    /// A medias: ni aplauso ni alarma. Una sesión terminada antes de tiempo no es un ✓ (afirmaría un
    /// trabajo completo que no ocurrió) ni un fallo. Ámbar suave.
    case aviso
    /// La marca en suave: un momento que invita sin apremiar (primer día, tu perfil).
    case acento
    /// Sin momento: cargando, en pausa.
    case neutro
    /// Algo no salió y hay que leerlo.
    case peligro

    /// Una decoración: color y forma de componerse con lo que tiene debajo.
    struct Deco {
        let color: SwiftUI.Color
        let mezcla: BlendMode
    }

    /// Los cuatro papeles de un tono. Son computados y no `static let`: el acento cambia con el
    /// club y no se cachea.
    struct Papeles {
        /// El fondo del bloque (opaco).
        let fondo: SwiftUI.Color
        let borde: SwiftUI.Color
        /// Título y texto fuerte: SIEMPRE sólido, jamás un gris. Sobre un tinte y sobre las tiras
        /// el gris de apoyo medía 3,6-4,4:1; la tinta del tema pasa de 10:1. La jerarquía la dan
        /// el peso y el tamaño frente al título, no un contraste más bajo.
        let tinta: SwiftUI.Color
        /// Las tiras oblicuas de marca.
        let deco: Deco
    }

    /// Cuánto tiñe cada color de estado: fondo, borde y tiras (como fracción sobre la superficie).
    private struct Receta {
        let fondo: Double
        let borde: Double
        let deco: Double
    }

    private var receta: Receta {
        switch self {
        case .info:    return Receta(fondo: 0.16, borde: 0.30, deco: 0.12)
        case .ok:      return Receta(fondo: 0.15, borde: 0.30, deco: 0.12)
        case .soporte: return Receta(fondo: 0.15, borde: 0.30, deco: 0.12)
        case .aviso:   return Receta(fondo: 0.13, borde: 0.36, deco: 0.10)
        case .peligro: return Receta(fondo: 0.11, borde: 0.34, deco: 0.10)
        case .accion, .acento, .neutro: return Receta(fondo: 0, borde: 0, deco: 0)
        }
    }

    /// El color de estado que tiñe (nil = no tiñe con un estado: acento y neutro tienen su propia receta).
    private var matiz: SwiftUI.Color? {
        switch self {
        case .info:    return Theme.Color.info
        case .ok:      return Theme.Color.ok
        case .soporte: return Theme.Color.modalitySupport
        case .aviso:   return Theme.Color.warning
        case .peligro: return Theme.Color.danger
        case .accion, .acento, .neutro: return nil
        }
    }

    var papeles: Papeles {
        let elevada = Theme.Color.surfaceElevated
        switch self {
        case .accion:
            return Papeles(
                fondo: Theme.Color.accent,
                borde: .clear,
                tinta: Theme.Color.accentOn,
                deco: Self.tirasSobreElAcento
            )
        case .acento:
            return Papeles(
                fondo: Theme.Color.accentTint(sobre: elevada),
                borde: Theme.Color.accentTintBorde,
                tinta: Theme.Color.foreground,
                deco: Deco(color: Theme.Color.accentTint, mezcla: .normal)
            )
        case .neutro:
            return Papeles(
                fondo: Theme.Color.surface,
                borde: Theme.Color.hairlineStrong,
                tinta: Theme.Color.foreground,
                deco: Deco(color: Theme.Color.faint.opacity(0.12), mezcla: .normal)
            )
        case .info, .ok, .soporte, .aviso, .peligro:
            let color = matiz ?? Theme.Color.neutral
            return Papeles(
                fondo: Theme.Color.tinte(color, receta.fondo, sobre: elevada),
                borde: color.opacity(receta.borde),
                tinta: Theme.Color.foreground,
                deco: Deco(color: color.opacity(receta.deco), mezcla: .normal)
            )
        }
    }

    /// Las tiras del sujeto de acción ACLARAN lo que tienen debajo (o lo OSCURECEN) según la tinta
    /// que lleva encima. Sobre el naranja de fábrica la tinta es marrón: una tira más oscura le
    /// bajaba el contraste de 4,57 a 4,0:1 y una más clara lo sube. Pero un club con un acento
    /// oscuro (un azul marino) trae la tinta CLARA, y ahí la misma tira clara se lo bajaría: el
    /// sentido lo decide la tinta, no el diseño con naranja. Aclarar es sumar un 12 % del propio
    /// color (`plusLighter`, lo que en la web es `brightness(1.12)`); oscurecer, multiplicar por 0,88.
    private static var tirasSobreElAcento: Deco {
        let tintaOscura = Contraste.luminancia(Theme.Color.accentOn, en: .light) < 0.5
        return tintaOscura
            ? Deco(color: Theme.Color.accent.opacity(0.12), mezcla: .plusLighter)
            : Deco(color: SwiftUI.Color.black.opacity(0.12), mezcla: .normal)
    }
}
