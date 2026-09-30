import SwiftUI

// LO QUE DICE CADA FILA DE «DISPOSITIVOS Y APPS» — las frases y su marca de estado, sin pintar nada.
//
// Antes cada fila componía su frase dentro de la vista y el color del estado era el del TEXTO (verde, rojo).
// Ahora la decisión vive aquí, en funciones puras que se prueban con los casos de cada proveedor, y el color va
// en la MARCA (un punto) de la fila, nunca en el texto: el texto es la tinta del tema.

/// El punto de color que acompaña a lo que dice una fila. Sin marca, una frase neutra.
enum MarcaDeDispositivo: Equatable {
    case ok
    case peligro

    var color: SwiftUI.Color {
        switch self {
        case .ok: return Theme.Color.ok
        case .peligro: return Theme.Color.danger
        }
    }
}

/// Una frase de fila y su marca.
struct DichoDeDispositivo: Equatable {
    let texto: String
    var marca: MarcaDeDispositivo?
}

enum TextosDeDispositivos {

    // MARK: Apple Salud

    static func salud(disponible: Bool, conectado: Bool, pidiendo: Bool, denegado: Bool, pistaDeRevocar: Bool) -> DichoDeDispositivo {
        if !disponible { return DichoDeDispositivo(texto: "No disponible en este dispositivo") }
        if conectado { return DichoDeDispositivo(texto: "Sincroniza en segundo plano", marca: .ok) }
        if pidiendo { return DichoDeDispositivo(texto: "Pidiendo permiso…") }
        if denegado { return DichoDeDispositivo(texto: "No pudimos activar Apple Salud. Inténtalo de nuevo.", marca: .peligro) }
        if pistaDeRevocar {
            return DichoDeDispositivo(texto: "Desconectado. Para revocar el acceso por completo, ábrelo en la app Salud.")
        }
        return DichoDeDispositivo(texto: "HR, sueño, peso y tu histórico de entrenos")
    }

    // MARK: Apple Watch

    /// `programadas` es cuántas carreras hay ya en la app Entrenamiento del reloj (nil = aún sin saber).
    static func reloj(soportado: Bool, denegado: Bool, activado: Bool, programadas: Int?) -> DichoDeDispositivo {
        if !soportado { return DichoDeDispositivo(texto: "No disponible en este dispositivo") }
        if denegado {
            return DichoDeDispositivo(
                texto: "No diste permiso. Actívalo en Ajustes → \(Marca.nombre) para ver tus carreras en el reloj.",
                marca: .peligro
            )
        }
        if activado {
            guard let programadas else { return DichoDeDispositivo(texto: "Activado. Sincronizando tus próximas carreras…", marca: .ok) }
            if programadas == 0 {
                return DichoDeDispositivo(
                    texto: "Activado. No hay carreras en los próximos días — el resto de sesiones se hacen en la app.", marca: .ok
                )
            }
            return DichoDeDispositivo(
                texto: programadas == 1
                    ? "1 carrera lista en la app Entrenamiento del reloj"
                    : "\(programadas) carreras listas en la app Entrenamiento del reloj",
                marca: .ok
            )
        }
        return DichoDeDispositivo(texto: "Envía tus carreras a la app Entrenamiento del reloj y empieza sin sacar el móvil")
    }

    // MARK: Polar y COROS

    static func polar(conectado: Bool) -> String {
        conectado ? "Sincroniza tus entrenos automáticamente" : "Conecta tu cuenta para sincronizar tus entrenos"
    }

    static func coros(sincronizando: Bool, conectado: Bool) -> String {
        if sincronizando { return "Sincronizando tus entrenos…" }
        if conectado { return "Lee tus entrenos. El plan no baja al reloj." }
        return "Conecta tu cuenta para sincronizar tus entrenos"
    }
}
