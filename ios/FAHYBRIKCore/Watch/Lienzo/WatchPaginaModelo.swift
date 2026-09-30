import SwiftUI

// EL LIENZO DE LA MUÑECA — la mitad que es MODELO.
//
// Aquí vive lo que una pantalla del reloj DECLARA (el modo, la página, el tinte,
// la altura del sujeto); el pintado —`WatchReloj`— se queda en el target del reloj,
// en `FAHYBRIKWatch/Lienzo/WatchLienzo.swift`. Hoy lo declara la pantalla de resumen
// (`SummaryView`); el entreno en vivo es de la pila de la muñeca (`Vivo.CuadroMuneca`).

// MARK: - Modo

/// Lo que el atleta PUEDE hacer ahora mismo — manda sobre el formato.
enum WatchModo {
    /// Ni mirar ni tocar: el reloj enuncia y espera. Oferta atenuada, jamás petición.
    case ciego
    /// Mirar sin tocar: un dato a sangre. Gesto latente sin franja anunciada.
    case ojeada
    /// Mirar y tocar: aquí van la decisión y la franja a plena luz.
    case mando

    var pintaFranja: Bool {
        switch self {
        case .ciego, .mando: return true
        case .ojeada: return false
        }
    }

    var franjaAtenuada: Bool {
        switch self {
        case .ciego: return true
        case .ojeada, .mando: return false
        }
    }
}

// MARK: - Página

/// Una página del reloj. Lo que no cabe no encoge: se va a la siguiente.
struct WatchPagina: Identifiable {
    let id: String
    /// Banda superior de una línea: dónde estás.
    let contexto: String
    let modo: WatchModo
    /// El numeral a sangre.
    let sujeto: String
    var unidad: String? = nil
    var tono: Color = WatchTheme.ink
    /// Segundo nivel — y no hay tercero.
    var segundoEtiqueta: String? = nil
    var segundoValor: String? = nil
    var segundoTono: Color? = nil
    /// Franja de acción. En `ojeada` el lienzo no la pinta (gesto latente).
    var accion: String? = nil
    var onToca: (() -> Void)? = nil
    /// Versales al pie: procedencia u honestidad.
    var nota: String? = nil
}

// MARK: - Tinte del lienzo

enum WatchTinte {
    /// Tope del tinte de zona. Por encima el aro y las versales pierden contraste.
    static let maxOpacity: Double = 0.38
}

// MARK: - Altura del sujeto (ancho manda)

enum WatchSujeto {
    /// Techo / suelo del numeral (pt de cifra), espejo del kit-watch.
    static let techo: CGFloat = 110
    static let suelo: CGFloat = 44

    /// Altura de cifra por número de glifos. En la muñeca limita el ANCHO, no el alto.
    static func alto(para texto: String) -> CGFloat {
        let n = max(1, texto.count)
        let porAncho: CGFloat
        switch n {
        case 1: porAncho = techo
        case 2: porAncho = 96
        case 3: porAncho = 72
        case 4: porAncho = 56
        default: porAncho = suelo
        }
        return porAncho
    }
}
