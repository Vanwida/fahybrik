import SwiftUI

// LO QUE SOLO ES DE PERFIL — qué glifo lleva cada puerta y de qué tono es la ficha de su estado.
// Todo lo genérico (glifos, tarjeta, chevron que gira) vive en el kit del día (`Theme/Dia/`).

extension ClavePuerta {
    var glifo: GlifoDia {
        switch self {
        case .identidad: return .perfil
        case .entreno: return .mancuerna
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
    var ficha: FichaDia<IconoDia>.Tono {
        switch self {
        case .aviso: return .aviso
        case .peligro: return .peligro
        case .neutro, .ok, .invita: return .normal
        }
    }
}
