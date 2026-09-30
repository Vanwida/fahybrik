import Foundation

// EL TOQUE DE LA COMPLICACIÓN — qué abre y a dónde llega (P13: «un toque abre el brief»).
//
// La esfera y el Smart Stack abren la app del reloj con un enlace de la marca
// (`Marca.esquemaURL`, el mismo esquema que registra el teléfono). La app lo lee y pone
// la página de lo de hoy delante: el brief con su «Empezar» (o, hecho el día, «Hecho hoy»),
// no «cómo llegas», que es la primera página del paginador y la que salía al abrir a secas.
// Foundation puro: lo comparten la extensión (que lo emite) y la app (que lo lee).

/// Las dos páginas del paginador vertical de reposo de la muñeca.
enum EntradaHoja: Hashable {
    /// La puntuación de cómo llegas (solo existe con puntuación real).
    case comoLlegas
    /// Lo de hoy: el brief, el descanso o el «hecho hoy».
    case dia
}

enum ComplicacionEnlace {

    /// El enlace que lleva la complicación: `fahybrid://hoy`.
    static var hoy: URL { URL(string: "\(Marca.esquemaURL)://\(destinoHoy)")! }

    private static let destinoHoy = "hoy"

    /// La página a la que lleva un enlace, o nil si no es de la complicación (otra marca,
    /// otro destino): un enlace que no se entiende no mueve nada.
    static func pagina(_ url: URL) -> EntradaHoja? {
        guard url.scheme == Marca.esquemaURL, url.host == destinoHoy else { return nil }
        return .dia
    }
}
