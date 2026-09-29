import SwiftUI
import UIKit

// CONTRASTE WCAG — se mide, no se estima (CONTRATO-UI §4.2).
//
// La misma matemática que `contrastRatio` de `shared/domain/coach/club-accent.ts`
// (luminancia relativa de WCAG 2.x), para poder afirmar en un test que el texto de
// una pieza pasa AA sobre el fondo REAL que le toca — con el acento del club que
// sea — y para que una pieza decida en tiempo de ejecución hacia dónde mover una
// decoración (ver `TonoDia`: las tiras del sujeto aclaran u oscurecen según la
// tinta que lleva encima).
enum Contraste {

    /// Mínimo AA del texto normal.
    static let aaTexto: Double = 4.5
    /// Mínimo AA del texto grande (≥ 24 pt, o ≥ 19 pt en negrita) y de lo no textual que porta significado.
    static let aaGrande: Double = 3.0

    /// Componentes sRGB de un color, resueltos para una apariencia. Un color dinámico
    /// (`Theme.Color.*`) vale una cosa en claro y otra en oscuro: sin apariencia no hay número.
    static func rgba(
        _ color: SwiftUI.Color,
        en estilo: UIUserInterfaceStyle
    ) -> (r: Double, g: Double, b: Double, a: Double) {
        let resuelto = UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: estilo))
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        resuelto.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b), Double(a))
    }

    private static func linealizado(_ canal: Double) -> Double {
        canal <= 0.04045 ? canal / 12.92 : pow((canal + 0.055) / 1.055, 2.4)
    }

    /// Luminancia relativa (0 negro … 1 blanco). Ignora el alfa: el llamante compone antes.
    static func luminancia(_ color: SwiftUI.Color, en estilo: UIUserInterfaceStyle) -> Double {
        let c = rgba(color, en: estilo)
        return 0.2126 * linealizado(c.r) + 0.7152 * linealizado(c.g) + 0.0722 * linealizado(c.b)
    }

    /// Razón de contraste (1…21) del `texto` sobre un `fondo` opaco. Un texto translúcido se
    /// compone primero sobre el fondo, que es lo que el ojo ve.
    static func razon(
        texto: SwiftUI.Color,
        fondo: SwiftUI.Color,
        en estilo: UIUserInterfaceStyle
    ) -> Double {
        let t = rgba(texto, en: estilo)
        let f = rgba(fondo, en: estilo)
        func mezcla(_ sobre: Double, _ base: Double) -> Double { sobre * t.a + base * (1 - t.a) }
        let visible = (r: mezcla(t.r, f.r), g: mezcla(t.g, f.g), b: mezcla(t.b, f.b))
        let lt = 0.2126 * linealizado(visible.r) + 0.7152 * linealizado(visible.g) + 0.0722 * linealizado(visible.b)
        let lf = 0.2126 * linealizado(f.r) + 0.7152 * linealizado(f.g) + 0.0722 * linealizado(f.b)
        return (max(lt, lf) + 0.05) / (min(lt, lf) + 0.05)
    }
}
