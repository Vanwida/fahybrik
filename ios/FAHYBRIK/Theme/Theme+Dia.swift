import SwiftUI
import UIKit

// LOS TOKENS DE «EL DÍA» — por PAPEL, no por tono ni por pestaña.
//
// Cuelgan de los mismos espacios de nombres de siempre (`Theme.Radius`,
// `Theme.Size`, `Theme.Spacing`, `Theme.Color`, `Theme.Typography`): el diseño
// nuevo no abre un sistema paralelo, añade los papeles que le faltaban a éste.
// Espejo de `web/components/design-twin/kit-dia/tokens.ts`; si allí cambia una
// medida, cambia aquí en el mismo lote.
//
// La escala tipográfica vive en `Theme+Tipo.swift` (es una tabla de papeles, no
// de números sueltos) y las piezas que la consumen en `Theme/Dia/`.

// MARK: - Radios por papel

extension Theme.Radius {
    /// El sujeto y el póster: las dos únicas piezas grandes de una pantalla.
    static let sujeto: CGFloat = 28
    /// Tarjetas y teselas.
    static let tarjeta: CGFloat = 22
    /// Filas resaltadas dentro de una tarjeta y paneles translúcidos sobre foto.
    static let fila: CGFloat = 16
    // La ficha de icono (44 pt) usa `Theme.Radius.l` (14), que ya casaba.
}

// MARK: - Medidas por papel

extension Theme.Size {
    /// Área táctil mínima. Sobre los 44 pt de la HIG: el cromo del diseño es de 48.
    static let toque: CGFloat = 48
    /// Alto de la pastilla de acción del sujeto: se toca con una mano, sudando.
    static let accion: CGFloat = 52
    /// Alto de la acción que ancla una pantalla o cierra una hoja, a todo el ancho: un punto más que la del sujeto.
    static let accionAnclada: CGFloat = 56
    /// Alto mínimo de una tesela de dato: cabe el peor caso (un dato de 32, un pie de dos líneas y su cabecera).
    static let tesela: CGFloat = 128
}

extension Theme.Spacing {
    /// Margen lateral de las pantallas del día. El de la app antigua es `l` (16); estas respiran más.
    static let pantalla: CGFloat = 20
}

extension Theme.Typography {
    /// El suelo tipográfico del iPhone (CONTRATO-UI §4.1): nada por debajo de 15 pt.
    /// Es la única fuente del número; el resto de escalas que lo repetían tiran de aquí.
    static let suelo: CGFloat = 15
}

// MARK: - Color: el tinte del acento del club y la mezcla sobre superficie

extension Theme.Color {

    /// El color de un texto de acción destructiva. El rojo de estado sobre la superficie elevada da 4,5:1, justo por
    /// debajo de AA; mezclado un poco con la tinta del tema (un token sobre un token, nunca un hex) pasa con holgura
    /// en los dos temas y sigue leyéndose rojo.
    static var peligroTexto: SwiftUI.Color {
        tinte(danger, 0.72, sobre: foreground)
    }

    /// Alfa del tinte suave cuando NO hay club: el que el servidor manda para el lienzo
    /// oscuro (`SOFT_ALPHA_DARK` en `shared/domain/coach/club-accent.ts`). Un atleta sin
    /// coach ve exactamente el tinte que vería con un coach que no tocó su color.
    static let alfaSuaveDeFabrica: Double = 0.14

    /// El borde de una superficie tintada vale el tinte por este factor (0,14 → 0,42, que es
    /// el del doble). Va en función del alfa del club y no como un segundo número: si el
    /// servidor sube el tinte, sube el borde con él.
    private static let factorBordeDelTinte: Double = 3

    /// Alfa del tinte suave del acento: el `softAlpha` del club si lo hay (ya resuelto por el
    /// servidor, iOS no lo recalcula), el de fábrica si no.
    static var accentSoftAlpha: Double {
        ClubThemeStore.current?.accent?.softAlphaSeguro ?? alfaSuaveDeFabrica
    }

    /// Tinte suave del acento del club: el relleno con su alfa. TRANSLÚCIDO, así que compone
    /// sobre cualquier superficie (tarjeta, sujeto, fila). Para medir contraste, o para una
    /// capa que no debe dejar ver lo de debajo, `accentTint(sobre:)`.
    static var accentTint: SwiftUI.Color { accent.opacity(accentSoftAlpha) }

    /// El mismo tinte ya COMPUESTO sobre una superficie concreta: un color opaco por apariencia.
    static func accentTint(sobre superficie: SwiftUI.Color) -> SwiftUI.Color {
        tinte(accent, accentSoftAlpha, sobre: superficie)
    }

    /// Borde de una superficie tintada con el acento.
    static var accentTintBorde: SwiftUI.Color {
        accent.opacity(min(1, accentSoftAlpha * factorBordeDelTinte))
    }

    /// Un color mezclado con una superficie en la proporción `fraccion` (0…1): el `color-mix` del
    /// doble. Devuelve un color OPACO y dinámico — cada apariencia mezcla contra SU superficie —,
    /// que es lo que hay que medir cuando se comprueba un contraste y lo que no deja ver la foto
    /// o la sombra de debajo como sí haría un `.opacity`.
    static func tinte(
        _ color: SwiftUI.Color,
        _ fraccion: Double,
        sobre base: SwiftUI.Color
    ) -> SwiftUI.Color {
        SwiftUI.Color(UIColor { trait in
            var c = (r: CGFloat(0), g: CGFloat(0), b: CGFloat(0), a: CGFloat(0))
            var s = (r: CGFloat(0), g: CGFloat(0), b: CGFloat(0), a: CGFloat(0))
            UIColor(color).resolvedColor(with: trait).getRed(&c.r, green: &c.g, blue: &c.b, alpha: &c.a)
            UIColor(base).resolvedColor(with: trait).getRed(&s.r, green: &s.g, blue: &s.b, alpha: &s.a)
            let f = CGFloat(min(max(fraccion, 0), 1)) * c.a
            return UIColor(
                red: c.r * f + s.r * (1 - f),
                green: c.g * f + s.g * (1 - f),
                blue: c.b * f + s.b * (1 - f),
                alpha: s.a
            )
        })
    }
}
