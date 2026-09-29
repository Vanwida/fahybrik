import SwiftUI
import UIKit

// LA ESCALA TIPOGRÁFICA DE «EL DÍA» — una tabla de PAPELES, no de números sueltos.
//
// Es la del CONTRATO-UI §4.1 hecha código: etiqueta 15 · cuerpo 17 · sección 24 ·
// dato 32 · sujeto 44 · cuenta 80. Nace de `kit-dia/tokens.ts` (`TAM` + `fuente()`):
// las dos únicas cosas que cambian entre papeles son el tamaño y el peso, y por eso
// se piden por su NOMBRE — `.papel(.seccion)` — y no escribiendo `fontSize: 24`.
//
// Convive con `Theme.Typography.body/small/caption…` (16/13/12/11 pt) que usan las
// pantallas que aún no se han rehecho: aquella escala CHOCA con el suelo de 15 pt y no
// se borra porque hay pantallas ajenas que la leen; las pestañas rehechas usan ésta.
//
// SUELO GARANTIZADO. Un papel escala con el tamaño de texto del sistema (Dynamic Type)
// HACIA ARRIBA y nunca por debajo de su medida base: con el texto del sistema en
// «Pequeño» un `SwiftUI.Font` escalado bajaría una etiqueta a 13 pt, y el contrato no
// tiene excepciones por debajo de 15 (se lee de pie, con el móvil a un brazo).

extension Theme.Typography {

    /// Un papel tipográfico. La tabla entera está en `medidas`; nada más la repite.
    enum Papel: CaseIterable {
        /// Etiqueta en mayúsculas de una tarjeta: «CÓMO LLEGAS HOY».
        case etiqueta
        /// La etiqueta que abre un sujeto (un peso más): «HOY · CARRERA».
        case kicker
        /// Rótulo de una tesela o de una pastilla, en minúsculas: el texto lo pone el dato.
        case rotulo
        /// Apoyo, unidad, pie, detalle.
        case nota
        /// Nota que lleva un icono al lado o una línea de estado.
        case notaFuerte
        /// Un dato pequeño en línea (la señal que suma a tu cifra, el globito de un contador, el paso en el que estás).
        case notaPesada
        /// Cuerpo y texto de lista.
        case cuerpo
        /// Título de una fila.
        case cuerpoFuerte
        /// La voz de la acción: la pastilla de tinta invertida.
        case accion
        /// Título de sección.
        case seccion
        /// El saludo y el título de una pantalla.
        case saludo
        /// Un dato del día: una marca, unos pasos.
        case dato
        /// El sujeto de la pantalla: display de marca, cursiva pesada.
        case sujeto
        /// «Hoy» en el póster el día de la carrera: una palabra, no una cifra.
        case cuentaHoy
        /// La cuenta atrás del póster.
        case cuenta

        /// Las medidas de un papel. `tracking` va en em (como el diseño) y se convierte a
        /// puntos con el tamaño ya escalado, para que el aire entre letras crezca con ellas.
        struct Medidas {
            let tamano: CGFloat
            let peso: Font.Weight
            var cursiva = false
            /// Interlineado como múltiplo del tamaño (`line-height` del doble).
            let interlineado: CGFloat
            var tracking: CGFloat = 0
            var mayusculas = false
            /// Cifras de ancho fijo: que 39 no baile al pasar a 38.
            var tabular = false
            /// El estilo de texto contra el que escala con Dynamic Type.
            let estilo: Font.TextStyle
            /// Cuánto puede crecer como máximo, como múltiplo de su tamaño. Sólo los papeles GRANDES lo llevan:
            /// a «Accesibilidad 3» un 44 pt llegaría a ~80 y «descansas» dejaría de caber en una línea y se
            /// partiría por la mitad de la palabra. El texto de lectura (15-17 pt) crece sin tope: es el que
            /// el atleta ha pedido más grande.
            var tope: CGFloat?
        }

        /// Hasta dónde crece un papel grande con el texto del sistema (×1,3: el 44 llega a 57).
        static let topeDeLosGrandes: CGFloat = 1.3

        /// El tamaño con que se pinta ya escalado por Dynamic Type: hacia arriba con el texto del sistema,
        /// NUNCA por debajo de la medida base del papel (el suelo, §4.1) y, si es un papel grande, sin
        /// pasar de su tope.
        func tamanoEfectivo(escalado: CGFloat) -> CGFloat {
            let m = medidas
            let subido = max(escalado, m.tamano)
            return m.tope.map { min(subido, m.tamano * $0) } ?? subido
        }

        var medidas: Medidas {
            switch self {
            case .etiqueta:
                return Medidas(tamano: Theme.Typography.suelo, peso: .bold, interlineado: 1.2, tracking: 0.08, mayusculas: true, estilo: .subheadline)
            case .kicker:
                return Medidas(tamano: Theme.Typography.suelo, peso: .heavy, interlineado: 1.2, tracking: 0.08, mayusculas: true, estilo: .subheadline)
            case .rotulo:
                return Medidas(tamano: Theme.Typography.suelo, peso: .bold, interlineado: 1.2, estilo: .subheadline)
            case .nota:
                return Medidas(tamano: Theme.Typography.suelo, peso: .medium, interlineado: 1.3, estilo: .subheadline)
            case .notaFuerte:
                return Medidas(tamano: Theme.Typography.suelo, peso: .semibold, interlineado: 1.25, estilo: .subheadline)
            case .notaPesada:
                return Medidas(tamano: Theme.Typography.suelo, peso: .heavy, interlineado: 1.2, tabular: true, estilo: .subheadline)
            case .cuerpo:
                return Medidas(tamano: 17, peso: .medium, interlineado: 1.35, estilo: .body)
            case .cuerpoFuerte:
                return Medidas(tamano: 17, peso: .bold, interlineado: 1.25, estilo: .body)
            case .accion:
                return Medidas(tamano: 17, peso: .heavy, cursiva: true, interlineado: 1, tracking: 0.01, estilo: .body)
            case .seccion:
                return Medidas(tamano: 24, peso: .heavy, cursiva: true, interlineado: 1.15, tracking: -0.01, estilo: .title2, tope: Self.topeDeLosGrandes)
            case .saludo:
                return Medidas(tamano: 30, peso: .heavy, cursiva: true, interlineado: 1.1, tracking: -0.015, estilo: .title, tope: Self.topeDeLosGrandes)
            case .dato:
                return Medidas(tamano: 32, peso: .heavy, cursiva: true, interlineado: 1, tracking: -0.02, tabular: true, estilo: .title, tope: Self.topeDeLosGrandes)
            case .sujeto:
                return Medidas(tamano: 44, peso: .heavy, cursiva: true, interlineado: 1.02, tracking: -0.025, estilo: .largeTitle, tope: Self.topeDeLosGrandes)
            case .cuentaHoy:
                return Medidas(tamano: 64, peso: .heavy, cursiva: true, interlineado: 0.95, tracking: -0.04, tabular: true, estilo: .largeTitle, tope: Self.topeDeLosGrandes)
            case .cuenta:
                return Medidas(tamano: 80, peso: .heavy, cursiva: true, interlineado: 0.95, tracking: -0.04, tabular: true, estilo: .largeTitle, tope: Self.topeDeLosGrandes)
            }
        }
    }
}

extension View {
    /// Pone al texto un papel de la escala del día: tamaño, peso, cursiva, interlineado, aire
    /// entre letras y mayúsculas, todo junto y escalando con el texto del sistema (sin bajar
    /// nunca del suelo de su papel). El color NO va aquí: es del sitio donde se pone.
    func papel(_ papel: Theme.Typography.Papel) -> some View {
        modifier(PapelModifier(papel: papel))
    }
}

/// Backs `.papel(_:)`. El `@ScaledMetric` recalcula el tamaño efectivo cuando cambia Dynamic Type.
private struct PapelModifier: ViewModifier {
    let papel: Theme.Typography.Papel
    @ScaledMetric private var escalado: CGFloat

    init(papel: Theme.Typography.Papel) {
        self.papel = papel
        _escalado = ScaledMetric(wrappedValue: papel.medidas.tamano, relativeTo: papel.medidas.estilo)
    }

    func body(content: Content) -> some View {
        let m = papel.medidas
        let tamano = papel.tamanoEfectivo(escalado: escalado)
        // `lineSpacing` es EXTRA sobre el alto natural de la línea (≈1,2 del cuerpo en SF); el
        // interlineado del diseño es un múltiplo del tamaño, así que el extra puede ser negativo
        // (un título de 44 pt a 1,02 va más apretado que el natural).
        let natural = UIFont.systemFont(ofSize: tamano, weight: .regular).lineHeight
        return content
            .font(ScaledFontModifier.fuente(size: tamano, weight: m.peso, italic: m.cursiva, tabular: m.tabular))
            .tracking(m.tracking * tamano)
            .lineSpacing(m.interlineado * tamano - natural)
            .textCase(m.mayusculas ? .uppercase : nil)
    }
}
