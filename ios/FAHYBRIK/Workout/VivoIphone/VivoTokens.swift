import SwiftUI

// LOS TOKENS DEL VIVO DEL IPHONE — docs/vivo-iphone/modelo.md (I8, I9, §3);
// espejo de `kit-iphone-vivo/tokens.ts`. Un token por PAPEL, no por tono.
// Ninguna pantalla del vivo escribe un `fontSize` ni un hex a mano: tira de
// aquí. El color es el MISMO que el de la muñeca (`Vivo.C`, hex compartido):
// fondo negro, tinta, tinta2, naranja SOLO acción (el del club si lo hay),
// espectro de zonas del coach. Lo que cambia es el LIENZO y la ESCALA (el
// héroe se lee a 2–3 m).
//
// ── EL NUMERAL (I9, §10.2) ─────────────────────────────────────────────────
// UN token para toda cifra del vivo: SF con cifras de ancho fijo y recto,
// como la muñeca. La cara (recto o la itálica de marca) es decisión de Alex
// (§7 del modelo): se toma en `VivoNumeral.estilo`, en un solo sitio.
//
// ── LA ESCALA (suelo 15 pt, CONTRATO-UI §4.1) ──────────────────────────────
//   sujeto     72–176 pt   trabajo 40   dato 30   datoTexto 20   posicion 22 bold
//   crono 22   cuerpo 17   etiqueta 15 semibold (EL SUELO)   nota 15   botón 64

enum VivoTokens {

    // MARK: - Lienzo

    /// Margen lateral del contenido. El de la app (Theme.Spacing) es 16; aquí 20: el vivo respira más.
    static let margen: CGFloat = 20
    /// Aire entre filas de la anatomía.
    static let hueco: CGFloat = 10
    static let anchoMin: CGFloat = 390
    static let anchoMax: CGFloat = 430

    static func anchoUtil(_ anchoLienzo: CGFloat) -> CGFloat { anchoLienzo - 2 * margen }

    // MARK: - El numeral — UN token (I9)

    enum Numeral {
        /// `false` = SF recto (propuesto). `true` = la itálica de marca. Decide Alex (§7).
        static let italica = false
        static let peso: Font.Weight = .semibold
        /// Un pelín más apretado por encima de 60 pt: las cifras grandes de SF abren demasiado.
        static let trackingGrande: CGFloat = -0.02
        static let umbralTrackingGrande: CGFloat = 60

        static func fuente(_ cuerpo: CGFloat, peso: Font.Weight = peso) -> Font {
            let f = Font.system(size: cuerpo, weight: peso, design: .default).monospacedDigit()
            return italica ? f.italic() : f
        }
    }

    // MARK: - La escala

    enum TI {
        static let sujeto = Vivo.EscalaHeroe(min: 72, max: 176, peso: 600, caja: 0.84)
        static let etiquetaSujeto: (cuerpo: CGFloat, alto: CGFloat) = (17, 22)
        static let trabajo: CGFloat = 40
        static let dato: CGFloat = 30
        static let datoTexto: CGFloat = 20
        static let posicion: CGFloat = 22
        static let crono: CGFloat = 22
        static let cuerpo: CGFloat = 17
        static let etiqueta: CGFloat = 15
        static let nota: CGFloat = 15
        static let boton: (alto: CGFloat, cuerpo: CGFloat) = (64, 20)
        static let botonMenor: (alto: CGFloat, cuerpo: CGFloat) = (44, 17)
        static let chip: (alto: CGFloat, cuerpo: CGFloat) = (30, 15)
        static let banda: (pista: CGFloat, rotulo: CGFloat, palabra: CGFloat) = (10, 15, 17)
        /// El suelo absoluto (CONTRATO-UI §4.1). Nada se pinta por debajo.
        static let suelo: CGFloat = 15
    }

    /// El alto de cada franja de la anatomía (I5), en pt. La banda del sujeto es
    /// FIJA: su centro óptico cae a la misma altura en todas las familias. El
    /// sobrante del lienzo lo absorbe la rejilla, nunca una cola vacía.
    enum Alto {
        static let cabecera: CGFloat = 64
        static let puntos: CGFloat = 12
        static let sujeto: CGFloat = 196
        static let banda: CGFloat = 48
        static let trabajo: CGFloat = 52
        static let luego: CGFloat = 40
        static let tira: CGFloat = 20
        static let accion: CGFloat = 64
        static let pieAccion: CGFloat = 12
    }

    enum Celda {
        static let minAlto: CGFloat = 76
        static let compacta: CGFloat = 52
        static let radio: CGFloat = 18
        static let padding: CGFloat = 10
        /// A partir de esta altura de celda el valor crece (30 → 40 pt).
        static let alta: CGFloat = 132
        /// Horizontal (§3): la rejilla comparte la columna derecha con «Luego», la
        /// tira y la acción; la celda se aprieta y el valor baja un punto de escala.
        static let paddingApretada: CGFloat = 8
        static let datoApretado: CGFloat = 26
    }

    enum Radio {
        static let boton: CGFloat = 32
        static let chip: CGFloat = 15
        static let superficie: CGFloat = 18
        static let hoja: CGFloat = 28
    }

    // MARK: - Lo que dura cada cosa (mecanismo, no método)

    enum Duracion {
        /// Mantener pulsado Terminar (estándar Apple Fitness / Strava).
        static let terminar: TimeInterval = 1
        static let destello: TimeInterval = 0.38
        static let vuelta: TimeInterval = 4
        static let deshacer: TimeInterval = Vivo.deshacerMs / 1000
        /// «GO» a pantalla completa al entrar en trabajo (espejo de `goHasta` del kit: 1 s).
        static let go: TimeInterval = Vivo.duracionGoS
        /// Cada cuánto se mira si toca el preaviso (10 s / 100 m).
        static let miraPreaviso: TimeInterval = 0.5
    }
}

// MARK: - Color: lo que el iPhone añade a `Vivo.C` (sin significados nuevos)

enum VivoColor {
    static func hex(_ rgb: UInt32, _ opacidad: Double = 1) -> Color {
        Color(.sRGB, red: Double((rgb >> 16) & 0xFF) / 255, green: Double((rgb >> 8) & 0xFF) / 255, blue: Double(rgb & 0xFF) / 255, opacity: opacidad)
    }

    static let fondo = hex(Vivo.C.fondo)
    static let superficie = hex(Vivo.C.superficie)
    static let superficie2 = hex(Vivo.C.superficie2)
    static let carril = hex(Vivo.C.carril)
    static let tinta = hex(Vivo.C.tinta)
    static let tinta2 = hex(Vivo.C.tinta2)
    /// Naranja de marca, o el acento del club si lo hay. SOLO acción.
    static var accion: Color { Theme.Color.accent }
    static var accionPulsada: Color { Theme.Color.accentPress }
    /// Texto sobre un botón naranja: negro (6,5:1).
    static let sobreAccion = hex(Vivo.C.sobreAccion)
    /// El velo de la pausa y de la hoja de terminar.
    static let velo = Color.black.opacity(0.72)
    /// Un botón que no se puede pulsar todavía.
    static let desactivadoFondo = superficie2
    static let desactivadoTinta = tinta2
    static let celda = superficie
    static let tira = carril

    static func zona(_ z: Vivo.ZonaVista) -> Color { hex(z.color) }
    static func zona(_ n: Int, de total: Int) -> Color { hex(Vivo.colorZona(n, total)) }

    /// El tinte de zona de fondo (I8): un ambiente radial, SOLO cuando el paso va a zona.
    static func tinteAmbiente(_ color: Color) -> some View {
        RadialGradient(colors: [color.opacity(Vivo.tinteZonaPct / 100), fondo], center: UnitPoint(x: 0.5, y: 0.28), startRadius: 0, endRadius: 520)
    }
}
