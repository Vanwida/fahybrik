import Foundation

// LOS TOKENS COMPARTIDOS DEL VIVO — lo que decide QUÉ COLOR y QUÉ TAMAÑO sin
// pintar nada (espejo de `kit-reloj/tokens.ts`, la parte pura). El color va en
// hex para compilar en el reloj sin UIKit; el pintor lo convierte.
//
// ── COLOR (P6) ─────────────────────────────────────────────────────────────
// Un color, un significado. Naranja de marca SOLO para acción. Zonas por
// espectro del coach (3–9 zonas), Z1 azul pizarra y nunca el gris de tinta2.
// Recuperación y descanso, monocromos. El veredicto NO cambia de color: cambia
// la marca (▲▼) y la palabra.

extension Vivo {

    enum C {
        static let fondo: UInt32 = 0x000000
        static let superficie: UInt32 = 0x141414
        static let superficie2: UInt32 = 0x1F1F1F
        /// El carril apagado de una banda o una tira.
        static let carril: UInt32 = 0x2A2A2C
        static let tinta: UInt32 = 0xFFFFFF
        static let tinta2: UInt32 = 0xA1A1A6
        /// Naranja de marca. SOLO acción. (El club puede traer el suyo: el pintor lo resuelve.)
        static let accion: UInt32 = 0xF06A2A
        static let accionPulsada: UInt32 = 0xD85A20
        /// Texto sobre un botón naranja: negro (6,5:1).
        static let sobreAccion: UInt32 = 0x000000
    }

    /// EL ESPECTRO DE ZONAS — azul → verde → ámbar → rojo, con las N zonas del
    /// coach (3–9). Z1 es azul pizarra, nunca el gris de tinta2.
    private static let espectro: [UInt32] = [
        0x8FB3D9, // pizarra
        0x2F7BFF, // azul
        0x2EC4E6, // cian
        0x2ED3A0, // turquesa
        0x34C759, // verde
        0xA6DC3A, // lima
        0xFFD43B, // amarillo
        0xFFB340, // ámbar
        0xFF4D4D, // rojo
    ]

    private static let eleccion: [Int: [Int]] = [
        3: [0, 4, 8],
        4: [0, 4, 7, 8],
        5: [0, 1, 4, 7, 8],
        6: [0, 1, 4, 6, 7, 8],
        7: [0, 1, 2, 4, 6, 7, 8],
        8: [0, 1, 2, 3, 4, 6, 7, 8],
        9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    ]

    /// Los colores de las N zonas de un coach, de Z1 a ZN. N fuera de 3–9 se acota.
    static func espectroZonas(_ n: Int) -> [UInt32] {
        let k = Swift.min(9, Swift.max(3, n))
        return (eleccion[k] ?? eleccion[5]!).map { espectro[$0] }
    }

    /// El color de la zona `z` (1..n) de un coach con `n` zonas.
    static func colorZona(_ z: Int, _ n: Int) -> UInt32 {
        let e = espectroZonas(n)
        return e[Swift.min(e.count, Swift.max(1, z)) - 1]
    }

    /// Cuánto tinte de zona se permite de fondo. Por encima, tinta2 pierde contraste.
    static let tinteZonaPct: Double = 30

    /// Los 5 s para deshacer un cierre a mano (P4): el mismo en muñeca y móvil.
    static let deshacerMs: Double = 5000

    // MARK: - El RPE en palabras — DATO del coach con valor por defecto

    static let rpePalabraDefecto: [Int: String] = [
        0: "nada", 1: "muy suave", 2: "muy suave", 3: "suave", 4: "suave", 5: "moderado",
        6: "moderado", 7: "fuerte", 8: "fuerte", 9: "muy fuerte", 10: "máximo",
    ]

    // MARK: - Medir texto sin pintar — con métricas de SF Pro

    private static let avanceFijo: [Character: Double] = [
        ":": 0.29, ",": 0.26, ".": 0.26, " ": 0.26, "\u{00A0}": 0.26, "·": 0.3, "/": 0.36, "-": 0.36,
        "–": 0.52, "—": 0.84, "′": 0.26, "″": 0.42, "%": 0.86, "×": 0.6, "+": 0.62, "▲": 0.72, "▼": 0.72,
        "↓": 0.6, "↑": 0.6, "«": 0.5, "»": 0.5, "¿": 0.52, "?": 0.52, "(": 0.34, ")": 0.34,
    ]
    private static let estrechas: Set<Character> = ["i", "l", "j", "í", "ì", "I", "1"]
    private static let medias: Set<Character> = ["f", "r", "t"]
    private static let anchas: Set<Character> = ["m", "w", "M", "W"]

    private static func avance(_ ch: Character) -> Double {
        if let f = avanceFijo[ch] { return f }
        if ch.isNumber { return 0.6 }
        if estrechas.contains(ch) { return 0.27 }
        if medias.contains(ch) { return 0.37 }
        if anchas.contains(ch) { return 0.86 }
        if ch.isUppercase { return 0.68 }
        return 0.56
    }

    /// Ancho estimado de un texto en SF Pro, en pt. Determinista.
    static func anchoTexto(_ texto: String, _ cuerpo: Double, peso: Int = 600) -> Double {
        var em = 0.0
        for ch in texto { em += avance(ch) }
        let factor = peso >= 700 ? 1.03 : peso <= 500 ? 0.98 : 1.0
        return em * cuerpo * factor
    }

    // MARK: - El héroe ajustado al ancho (P7)

    static let huecoUnidad: Double = 3
    /// La unidad pegada al héroe: un 28 % de su cuerpo, nunca por debajo del suelo (15).
    static let unidadFactor: Double = 0.28
    static let suelo: Double = 15

    struct EscalaHeroe: Equatable {
        var min: Double
        var max: Double
        var peso: Int
        var caja: Double
    }

    /// El rango del héroe en la muñeca (44–96). El iPhone pasa el suyo.
    static let escalaMuneca = EscalaHeroe(min: 44, max: 96, peso: 600, caja: 0.84)

    struct TallaHeroe: Equatable {
        var cuerpo: Double
        var cuerpoUnidad: Double
        var ancho: Double
    }

    /// El cuerpo del héroe: el mayor de la escala que cabe en `ancho` con su
    /// unidad y en `altoMax` de caja. Si ni al suelo cabe, se escala lo justo.
    static func tallaHeroe(_ texto: String, unidad: String? = nil, ancho: Double, altoMax: Double = .infinity, escala: EscalaHeroe = escalaMuneca) -> TallaHeroe {
        let techoAlto = altoMax.isFinite ? (altoMax / escala.caja).rounded(.down) : escala.max
        let tope = Swift.max(1, Swift.min(escala.max, techoAlto))
        func medir(_ c: Double) -> TallaHeroe {
            let cu = unidad != nil ? Swift.max(suelo, (c * unidadFactor).rounded()) : 0
            var w = anchoTexto(texto, c, peso: escala.peso)
            if let u = unidad { w += huecoUnidad + anchoTexto(u, cu, peso: 600) }
            return TallaHeroe(cuerpo: c, cuerpoUnidad: cu, ancho: w)
        }
        let sueloEscala = Swift.min(escala.min, tope)
        var c = tope
        while c >= sueloEscala {
            let m = medir(c)
            if m.ancho <= ancho { return m }
            c -= 1
        }
        let m = medir(sueloEscala)
        let k = Swift.min(1, ancho / Swift.max(1, m.ancho))
        return TallaHeroe(cuerpo: m.cuerpo * k, cuerpoUnidad: Swift.max(suelo, m.cuerpoUnidad * k), ancho: m.ancho * k)
    }

    /// Cuerpo de una línea de texto que tiene que caber en `ancho`, sin bajar de 15 pt.
    static func cuerpoQueCabe(_ texto: String, _ cuerpo: Double, ancho: Double, peso: Int = 600) -> Double {
        let w = anchoTexto(texto, cuerpo, peso: peso)
        if w <= ancho { return cuerpo }
        return Swift.max(suelo, (cuerpo * (ancho / w) * 10).rounded(.down) / 10)
    }
}
