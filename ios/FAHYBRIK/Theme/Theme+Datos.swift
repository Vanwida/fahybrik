import SwiftUI
import UIKit

// LOS COLORES DE DATO — lo que el tema del día no trae y una gráfica necesita.
//
// El fondo, las superficies, la tinta, el acento y los colores de estado son del tema
// (`Theme.swift`, `Theme+Dia.swift`) y siguen al atleta en claro y en oscuro. Lo único que
// ninguno de ellos puede ser es el color de una SERIE: las cuatro familias de entreno y las
// zonas del coach. Viven aquí, una vez por apariencia, y no en la pestaña que primero los
// necesitó (Analíticas): los detalles de familia, la sesión y cualquier gráfico futuro tiran
// de los mismos. Espejo de `kit-analiticas/tokens.ts` (`FAMILIA_HEX`, `ZONAS_HEX`,
// `SUPERFICIE2`, `TINTA2_FUERTE`, `chispaDe`).
//
// ── POR QUÉ NO SON LOS TONOS DE MODALIDAD ────────────────────────────────────
// Los tonos de modalidad de `Theme.Color.modality*` fallan el validador de la skill dataviz
// (separación para daltónicos ΔE 2,3): sirven para un punto decorativo con su nombre al lado,
// no para distinguir series en una barra apilada. Las cuatro familias de abajo pasan el
// validador (OKLab ×100, Machado a severidad 1: visión normal ≥ 15 y daltónica ≥ 8 en todos los
// pares) en cada apariencia y sobre SU superficie; `AnaliticasPielTests` lo vuelve a medir.
//
// ── EL ACENTO NO ES UN COLOR DE DATO ─────────────────────────────────────────
// El acento es el del club: marca y acción. Una familia o una zona nunca lo usan (un club
// puede tener cualquier acento: el gráfico no se rompe ni se confunde con una acción).

extension Theme.Color {

    private static func hex(_ rgb: UInt32) -> UIColor {
        UIColor(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }

    // MARK: - Las cuatro familias de entreno

    /// Correr (la espina del HYROX). Oscuro sobre `#141416`, claro sobre `#F6F7F9`: ≥ 3:1 en las dos.
    static let familiaCorrer = dyn(light: hex(0x237DEE), dark: hex(0x3F9DDA))
    /// Ergómetros: remo, ski y bici.
    static let familiaErgo = dyn(light: hex(0x1D661B), dark: hex(0x41AB77))
    static let familiaFuerza = dyn(light: hex(0x7625A0), dark: hex(0x764EC7))
    /// Estaciones y WOD.
    static let familiaEstaciones = dyn(light: hex(0xD1598C), dark: hex(0x9D466A))

    // MARK: - Las zonas del coach

    /// El espectro de zonas, de Z1 a Z9 (azul pizarra → azul → cian → turquesa → verde → lima →
    /// amarillo → ámbar → rojo): la misma tabla que el vivo (`Vivo.espectroZonas`) para el oscuro y su
    /// equivalente OSCURECIDO para el claro, con ≥ 3:1 sobre la superficie clara. Las cinco de siempre
    /// (pizarra, azul, verde, ámbar, rojo) son las validadas en el doble; las otras cuatro solo salen
    /// con un coach de 6 a 9 zonas. Z1 nunca es el gris de la tinta (no se leería como «una zona»).
    private static let espectroClaro: [UInt32] = [
        0x5F86B3, // pizarra
        0x1A62B5, // azul
        0x0B7A94, // cian
        0x0A8A6A, // turquesa
        0x0F6E3C, // verde
        0x5B8A0A, // lima
        0x9C8F00, // amarillo
        0xB36B00, // ámbar
        0xBC2A2A, // rojo
    ]

    /// Las posiciones del espectro que usa un coach con `n` zonas (3–9): el mismo reparto que el vivo.
    private static let eleccionDeZonas: [Int: [Int]] = [
        3: [0, 4, 8], 4: [0, 4, 7, 8], 5: [0, 1, 4, 7, 8], 6: [0, 1, 4, 6, 7, 8],
        7: [0, 1, 2, 4, 6, 7, 8], 8: [0, 1, 2, 3, 4, 6, 7, 8], 9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    ]

    /// El color de la zona `z` (1…n) de un coach con `n` zonas. Fuera de rango cae al extremo: jamás
    /// al acento ni a un gris.
    static func zona(_ z: Int, de n: Int) -> SwiftUI.Color {
        let k = min(9, max(3, n))
        let posiciones = eleccionDeZonas[k] ?? eleccionDeZonas[5]!
        let i = min(posiciones.count, max(1, z)) - 1
        return dyn(light: hex(espectroClaro[posiciones[i]]), dark: hex(Vivo.colorZona(i + 1, k)))
    }

    // MARK: - Derivados del tema para una gráfica

    /// Una superficie un paso por encima de la tarjeta que se ve en claro Y en oscuro: la banda basal de
    /// una gráfica y el fondo de una etiqueta con halo. `surfaceElevated` no vale: en claro es blanco
    /// sobre una tarjeta casi blanca y la banda «gris» desaparece. Un velo de la tinta del tema sobre la
    /// superficie es gris en las dos.
    static var superficieDeGrafico: SwiftUI.Color { tinte(foreground, 0.08, sobre: surface) }

    /// El gris de apoyo un paso más fuerte, para la gráfica de frescura: sus barras pasadas se dibujan
    /// atenuadas y con el gris del tema quedaban en 2,65:1. Mezclado un 55 % con la tinta, pasan de 3:1
    /// en claro y en oscuro y el texto de sus ejes sigue por encima de 4,5:1.
    static var apoyoFuerte: SwiftUI.Color { tinte(foreground, 0.55, sobre: muted) }

    /// El color de la chispa de una fila: la familia un 12 % hacia la tinta, para que el trazo atenuado
    /// no baje de 3:1 (en oscuro el violeta y el rosa quedaban en 2,8 y 2,7).
    static func chispa(_ color: SwiftUI.Color) -> SwiftUI.Color { tinte(color, 0.88, sobre: foreground) }
}

// MARK: - La geometría de una gráfica

extension Theme {

    /// Grosores y trazos de una gráfica. Hecho = RELLENO o línea sólida, plan = CONTORNO, proyección =
    /// DISCONTINUA: se distinguen sin color.
    enum Chart {
        /// Una línea de dato.
        static let linea: CGFloat = 2
        /// El contorno del plan.
        static let contorno: CGFloat = 1.5
        /// La rejilla y los ejes: una sola línea fina y sólida.
        static let rejilla: CGFloat = 1
        /// La proyección.
        static let discontinuo: [CGFloat] = [5, 4]
        /// La marca de «hoy».
        static let hoyDiscontinuo: [CGFloat] = [2, 3]
    }
}
