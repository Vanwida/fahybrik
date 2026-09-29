import SwiftUI

// LOS TOKENS DE LAS ANALÍTICAS — espejo de `kit-analiticas/tokens.ts` (la piel
// del iPhone) sobre el lenguaje del vivo firmado el 28-09: negro, SF tabular,
// tinta y tinta2, naranja SOLO acción, suelo 15 pt en TODO (ejes incluidos).
// Ninguna pieza ni gráfico del panel escribe un hex ni un cuerpo: tira de aquí.
//
// ── EL COLOR ─────────────────────────────────────────────────────────────────
// · Los grises son los del vivo (`VivoColor`, hex compartidos con la muñeca).
// · Familias: UNA paleta para las dos superficies, elegida por MEDIDA (el
//   validador de dataviz sobre #141414: CVD peor 15,6 · normal 16,3 · ≥ 3:1).
//   Los tonos de modalidad de Theme.swift fallan ese validador y no se usan.
// · Zonas: el espectro del coach (`Vivo.colorZona`), el mismo que el vivo.
// · Plan = CONTORNO (tinta2, 1,5 pt); hecho = RELLENO; proyección = DISCONTINUA.
//   Se distinguen sin color. El veredicto NO cambia de color: cambia ▲▼ y la palabra.

enum AnaliticasColor {
    static let fondo = VivoColor.fondo
    static let superficie = VivoColor.superficie
    static let superficie2 = VivoColor.superficie2
    /// El carril apagado, la pista de una barra.
    static let carril = VivoColor.carril
    /// La rejilla y los ejes: una sola línea fina, sólida, un paso por encima de la superficie.
    static let rejilla = VivoColor.hex(0x26262A)
    static let tinta = VivoColor.tinta
    static let tinta2 = VivoColor.tinta2
    /// SOLO acción (el naranja de marca o el del club).
    static var accion: Color { VivoColor.accion }
    static let sobreAccion = VivoColor.sobreAccion
    static let ok = VivoColor.hex(0x34C759)
    static let aviso = VivoColor.hex(0xFFB340)
    /// Lo hecho (relleno), el plan (contorno) y la proyección (discontinua).
    static let hecho = VivoColor.tinta
    static let plan = VivoColor.tinta2
    static let proyeccion = VivoColor.tinta2

    /// El color de una familia GRANDE (validado). `otro` es neutro: no compite con las cuatro.
    static func familia(_ f: FamiliaGrande) -> Color {
        switch f {
        case .correr: return VivoColor.hex(0x3F9DDA)
        case .ergo: return VivoColor.hex(0x41AB77)
        case .fuerza: return VivoColor.hex(0x764EC7)
        case .estacionesWod: return VivoColor.hex(0x9D466A)
        case .otro: return VivoColor.tinta2
        }
    }

    /// El color de una familia fina es el de su familia grande.
    static func familia(_ f: FamiliaLectura?) -> Color { familia(FamiliaGrande(f)) }

    /// Z1…ZN del coach: fuera de rango cae al extremo (nunca al naranja, nunca a gris de tinta).
    static func zona(_ n: Int, de total: Int) -> Color { VivoColor.zona(n, de: total) }
}

/// Las cuatro familias GRANDES: las que caben en una barra apilada (≤ 4 series),
/// más `otro` (calentamiento, core, movilidad: cuenta el tiempo, no tiene «¿mejoro?»).
enum FamiliaGrande: String, CaseIterable, Equatable {
    case correr, ergo, fuerza, estacionesWod, otro

    init(_ f: FamiliaLectura?) {
        switch f {
        case .correr: self = .correr
        case .remo, .ski, .bici: self = .ergo
        case .fuerza: self = .fuerza
        case .estaciones, .wod: self = .estacionesWod
        case .otro, .desconocida, nil: self = .otro
        }
    }

    var nombre: String {
        switch self {
        case .correr: return "Correr"
        case .ergo: return "Ergo"
        case .fuerza: return "Fuerza"
        case .estacionesWod: return "Estaciones y WOD"
        case .otro: return "Otro"
        }
    }

    /// El orden de apilado: correr abajo (la espina del HYROX), luego ergo, fuerza, estaciones y otro.
    static let ordenApilado: [FamiliaGrande] = [.correr, .ergo, .fuerza, .estacionesWod, .otro]
}

extension FamiliaLectura {
    /// Cómo se llama delante del atleta. Un solo sitio.
    var nombre: String {
        switch self {
        case .correr: return "Correr"
        case .remo: return "Remo"
        case .ski: return "SkiErg"
        case .bici: return "BikeErg"
        case .fuerza: return "Fuerza"
        case .estaciones: return "Estaciones"
        case .wod: return "WOD"
        case .otro: return "Otro"
        case .desconocida: return ""
        }
    }
}

/// La escala del iPhone, por papel (suelo 15 pt).
enum AnaliticasTokens {
    enum TA {
        /// El título de la pestaña: por encima del de sección, por debajo del gran título de iOS para que el Estado fijo quepa.
        static let pantalla: (cuerpo: CGFloat, peso: Font.Weight) = (28, .bold)
        /// Título de sección (§4.1: 24 pt, peso fuerte).
        static let titulo: (cuerpo: CGFloat, peso: Font.Weight) = (24, .bold)
        /// La palabra del Estado: categórica, texto, no numeral.
        static let palabra: (cuerpo: CGFloat, peso: Font.Weight) = (26, .bold)
        /// Un dato (§4.1: 28 pt); el del vivo, 30.
        static let dato: CGFloat = VivoTokens.TI.dato
        /// El dato de una fila de progreso o de una celda pequeña.
        static let datoMenor: CGFloat = 22
        static let cuerpo: CGFloat = VivoTokens.TI.cuerpo
        static let etiqueta: CGFloat = VivoTokens.TI.etiqueta
        static let nota: CGFloat = VivoTokens.TI.nota
        static let chip: (alto: CGFloat, cuerpo: CGFloat) = (34, 15)
        static let boton: (alto: CGFloat, cuerpo: CGFloat) = (52, 17)
        static let botonMenor: CGFloat = 44
        /// El suelo absoluto. Nada se pinta por debajo, ejes incluidos.
        static let suelo: CGFloat = VivoTokens.TI.suelo
    }

    /// Márgenes del lienzo: los del vivo (20) para que la pestaña respire igual.
    static let margen: CGFloat = VivoTokens.margen
    static let hueco: CGFloat = 12
    /// Aire entre bloques.
    static let entreBloques: CGFloat = 28

    enum Radio {
        static let celda: CGFloat = 18
        static let chip: CGFloat = 17
        static let hoja: CGFloat = 28
    }

    /// Grosor de una línea de dato, del contorno del plan y de la rejilla.
    enum Trazo {
        static let linea: CGFloat = 2
        static let contorno: CGFloat = 1.5
        static let rejilla: CGFloat = 1
        /// La proyección: trazo discontinuo.
        static let discontinuo: [CGFloat] = [5, 4]
        static let hoyDiscontinuo: [CGFloat] = [2, 3]
    }

    /// El numeral: UN token para toda cifra (SF, tabular, recto).
    static func numeral(_ cuerpo: CGFloat, peso: Font.Weight = VivoTokens.Numeral.peso) -> Font {
        VivoTokens.Numeral.fuente(cuerpo, peso: peso)
    }

    /// El texto de un eje o una leyenda: 15 pt semibold tabular (el suelo).
    static var fuenteEje: Font { .system(size: TA.etiqueta, weight: .semibold).monospacedDigit() }
}
