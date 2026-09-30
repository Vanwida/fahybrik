import Foundation

// DÓNDE ESTÁ LO GUARDADO — el lenguaje del móvil, dicho en la muñeca (DECISIONS 25-09, acuses del reloj).
//
// El sobre de una sesión terminada sigue en el reloj hasta que el móvil acusa: «Guardado» solo cuando el servidor
// dijo que sí; nunca «en el iPhone» mientras solo esté en su cola. Puro: del buzón al texto.

extension Vivo {

    enum EstadoGuardado: Equatable {
        case enReloj, enCola, guardado, enMovil

        /// La línea corta de la primera página del resumen.
        var corto: String {
            switch self {
            case .enReloj: return "En tu reloj"
            case .enCola: return "En cola · sin conexión"
            case .guardado: return "Guardado"
            case .enMovil: return "Guardado en tu móvil"
            }
        }

        var detalle: String {
            switch self {
            case .enReloj: return "Pasa al móvil cuando lo tengas cerca"
            case .enCola: return "Sube al tener conexión"
            case .guardado: return "Ya lo tiene tu coach"
            case .enMovil: return "No se ha podido subir. Lo estamos revisando; no tienes que hacer nada."
            }
        }

        var glifo: String {
            switch self {
            case .enReloj: return "applewatch"
            case .enCola: return "icloud.and.arrow.up"
            case .guardado: return "checkmark"
            case .enMovil: return "iphone"
            }
        }
    }

    /// El estado de un sobre según el buzón de la muñeca. Un sobre que ya no está es que el servidor lo confirmó
    /// (`saved` lo borra); quien pregunta solo lo hace por sobres que llegaron a estar.
    static func estadoDeGuardado(_ entrada: WatchSaveLedger.Entry?) -> EstadoGuardado {
        guard let entrada else { return .guardado }
        switch entrada.state {
        case .held: return .enCola
        case .rejected: return .enMovil
        case .pending, .staged, .handed: return .enReloj
        }
    }
}
