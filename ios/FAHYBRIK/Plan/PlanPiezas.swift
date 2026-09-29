import SwiftUI

// LAS PIEZAS PEQUEÑAS DE «PLAN» que el kit del día no trae y que comparten varias vistas de la pestaña:
// la pastilla que enseña un dato DENTRO del sujeto, el título que baja de escalón, la muesca que ata el
// día elegido del carril con la card, y los glifos propios de esta pestaña.
//
// Se quedan en la carpeta de Plan y no en `Theme/Dia/` a propósito (CONTRATO-UI §0: si otra pestaña
// las necesita, se suben al kit desde aquí): las hizo falta esta pantalla, y el kit compartido no se
// toca por adelantado. Ninguna lleva un color clavado: todo sale de `Theme.Color` y de los papeles del tono.

// MARK: - Los glifos de la pestaña (todos SF Symbols, decorativos)

enum GlifoPlan: String {
    case compartir = "square.and.arrow.up"
    case ciclo = "square.stack.3d.up"
    case empezar = "play.fill"
    case atras = "chevron.left"
    case adelante = "chevron.right"
    case candado = "lock"
    case cronometro = "stopwatch"
}

/// Un SF Symbol de la pestaña a su tamaño y peso. Decorativo: el nombre accesible lo lleva el botón.
struct SimboloPlan: View {
    let glifo: GlifoPlan
    var tam: CGFloat = 20
    var peso: Font.Weight = .semibold

    var body: some View {
        Image(systemName: glifo.rawValue)
            .font(.system(size: tam, weight: peso))
            .accessibilityHidden(true)
    }
}

// MARK: - La pastilla que enseña un dato dentro del sujeto

/// Una pastilla que ENSEÑA un dato dentro del sujeto (la franja, «Libre», «Test», el formato, la duración, el
/// estado). Lee el tono del sujeto en que está: sobre el bloque del acento va transparente con la tinta de la
/// marca (un velo del color del tema no se leería sobre el acento); en los demás tonos, un velo de la tinta.
///
/// No es un `InfoPill`: sus estilos son planos (un color, sin borde propio por tono) y no llevan un sello de
/// estado delante; esta lleva las dos cosas. Es la `Pastilla` de `kit-dia/piezas.tsx` con `estiloPastilla`.
struct PastillaPlan: View {
    /// Qué papel juega en el sujeto: un dato («50 min», «Libre») o el estado de la sesión.
    enum Papel { case dato, estado }

    let texto: String
    var papel: Papel = .dato
    var sello: SelloEstadoDia.Estado?
    var glifo: GlifoPlan?
    /// Una cifra pesa más que una razón («Dura lo que tardes» no es un dato).
    var enfasis = false

    @Environment(\.tonoDia) private var tono

    private var sobreAccion: Bool { tono == .accion }

    var body: some View {
        HStack(spacing: Theme.Spacing.xs + 2) {
            if let sello { SelloEstadoDia(estado: sello, tam: 18) }
            if let glifo { SimboloPlan(glifo: glifo, tam: 16, peso: .semibold) }
            Text(texto)
                .papel(enfasis ? .notaPesada : .rotulo)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(sobreAccion ? Theme.Color.accentOn : Theme.Color.foreground)
        .padding(.horizontal, Theme.Spacing.m)
        .frame(minHeight: 32)
        .background(fondo, in: Capsule())
        .overlay(Capsule().strokeBorder(borde, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    private var fondo: SwiftUI.Color {
        if sobreAccion { return .clear }
        return Theme.Color.foreground.opacity(papel == .estado ? 0.09 : 0.07)
    }

    private var borde: SwiftUI.Color {
        if sobreAccion { return papel == .estado ? .clear : Theme.Color.accentOn.opacity(0.55) }
        return papel == .estado ? .clear : Theme.Color.foreground.opacity(0.18)
    }
}

// MARK: - El título que baja de escalón

/// El título del sujeto: el papel `.sujeto` (display de marca, pesado e inclinado) que BAJA de escalón cuando
/// es largo en vez de partirse en cinco líneas (`EscalonDeTitulo`: 44 · 36 · 30). El más pequeño sigue siendo
/// el sujeto: manda sobre todo lo demás. Sigue el suelo y el tope de los papeles grandes: crece con el texto
/// del sistema, nunca baja de su medida base y no pasa de ×1,3.
struct TituloPlan: View {
    let texto: String
    var escalon: EscalonDeTitulo = .grande

    @Environment(\.tonoDia) private var tono
    @ScaledMetric(relativeTo: .largeTitle) private var unidad: CGFloat = 1

    var body: some View {
        let m = Theme.Typography.Papel.sujeto.medidas
        let base = escalon.rawValue
        let tamano = min(max(base * unidad, base), base * Theme.Typography.Papel.topeDeLosGrandes)
        let natural = UIFont.systemFont(ofSize: tamano, weight: .regular).lineHeight
        Text(texto)
            .font(ScaledFontModifier.fuente(size: tamano, weight: m.peso, italic: m.cursiva, tabular: m.tabular))
            .tracking(m.tracking * tamano)
            .lineSpacing(m.interlineado * tamano - natural)
            .lineLimit(3)
            .foregroundStyle(tono.papeles.tinta)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - La muesca

/// LA MUESCA: el hilo que ata el día elegido del carril con la card, para que se lea «esto es ese día, visto de
/// cerca». Un rombo del color de la card asomando por arriba hacia el chip elegido; vive FUERA del bloque
/// recortado (se pone en un `.overlay` del sujeto). Con el acento sólido no lleva borde (el bloque tampoco).
///
/// Los siete chips del carril son siete columnas iguales con 4 pt de hueco: el centro del `indice` cae en
/// `indice · (ancho de columna + 4) + ancho de columna / 2`.
struct MuescaPlan: View {
    let indice: Int
    let tono: TonoDia

    static let lado: CGFloat = 16
    static let hueco: CGFloat = 4

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static func centro(indice: Int, ancho: CGFloat, columnas: Int = 7) -> CGFloat {
        let columna = (ancho - hueco * CGFloat(columnas - 1)) / CGFloat(columnas)
        return CGFloat(indice) * (columna + hueco) + columna / 2
    }

    var body: some View {
        let p = tono.papeles
        GeometryReader { geo in
            Rombo()
                .fill(p.fondo)
                .overlay(Rombo.Bordes().stroke(p.borde, lineWidth: 1))
                .frame(width: Self.lado, height: Self.lado)
                .rotationEffect(.degrees(45))
                .position(x: Self.centro(indice: indice, ancho: geo.size.width), y: 0)
                .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.88), value: indice)
        }
        .frame(height: 0)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// Un cuadrado con solo la esquina de arriba a la izquierda redondeada: girado 45° es la punta hacia arriba.
    private struct Rombo: Shape {
        func path(in rect: CGRect) -> Path {
            UnevenRoundedRectangle(topLeadingRadius: 4).path(in: rect)
        }

        /// Los bordes de arriba y de la izquierda: los dos que asoman fuera de la card.
        struct Bordes: Shape {
            func path(in rect: CGRect) -> Path {
                var p = Path()
                p.move(to: CGPoint(x: rect.minX, y: rect.maxY))
                p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + 4))
                p.addQuadCurve(to: CGPoint(x: rect.minX + 4, y: rect.minY), control: CGPoint(x: rect.minX, y: rect.minY))
                p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
                return p
            }
        }
    }
}

// MARK: - Las líneas dentro del sujeto

extension TonoDia {
    /// El color de una línea fina dentro de la card: sobre el acento sólido, un velo de su tinta; en el resto,
    /// de la tinta del tema.
    var lineaInterior: SwiftUI.Color {
        self == .accion ? Theme.Color.accentOn.opacity(0.30) : Theme.Color.foreground.opacity(0.14)
    }
}

// MARK: - La tarjeta

extension View {
    /// La tarjeta del día: la superficie con su filete, a radio 22 (`Theme.Radius.tarjeta`). Es la cara de
    /// `TeselaDia` sin lo demás: las tarjetas del Plan sin coach llevan filas y textos dentro, no una cifra.
    func tarjetaPlan(realce: Bool = false) -> some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
        return self
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .background(realce ? Theme.Color.accentTint(sobre: Theme.Color.surface) : Theme.Color.surface, in: forma)
            .overlay(forma.strokeBorder(realce ? Theme.Color.accentTintBorde : Theme.Color.hairline, lineWidth: 1))
            .clipShape(forma)
    }
}

// MARK: - El «···»

#if DEBUG
private struct EnCapturaKey: EnvironmentKey { static let defaultValue = false }

extension EnvironmentValues {
    /// Estamos pintando una CAPTURA (`ImageRenderer`, la galería de pruebas). El renderizador no dibuja los controles
    /// que respalda UIKit —un `Menu`, un `ScrollView`— y los sustituye por un aviso amarillo; con esto el «···» se
    /// pinta como lo que es para el atleta: su etiqueta. Solo existe en DEBUG: la app no lo lee.
    var enCaptura: Bool {
        get { self[EnCapturaKey.self] }
        set { self[EnCapturaKey.self] = newValue }
    }
}
#endif

/// Un menú «···»: un `Menu` del sistema con su etiqueta (los tres puntos de la acción anclada, los de cada fila).
struct MenuPlan<Etiqueta: View, Opciones: View>: View {
    let etiqueta: String
    let opciones: () -> Opciones
    let boton: () -> Etiqueta
    #if DEBUG
    @Environment(\.enCaptura) private var enCaptura
    #endif

    init(etiqueta: String, @ViewBuilder opciones: @escaping () -> Opciones, @ViewBuilder boton: @escaping () -> Etiqueta) {
        self.etiqueta = etiqueta
        self.opciones = opciones
        self.boton = boton
    }

    var body: some View {
        #if DEBUG
        if enCaptura {
            boton().accessibilityLabel(etiqueta)
        } else {
            menu
        }
        #else
        menu
        #endif
    }

    private var menu: some View {
        Menu { opciones() } label: { boton() }
            .accessibilityLabel(etiqueta)
    }
}

// MARK: - El pie solo cuando hay una acción

extension View {
    /// `.anchoredAction` cuando hay algo que anclar. Sin acción (un vacío que no tiene salida, y lo dice) no hay pie:
    /// un pie vacío deja una barra muerta con su filete. El margen de las pantallas del día es 20 y el pie ancla con
    /// 16: los 4 restantes van dentro.
    @ViewBuilder
    func anclando<C: View>(si hay: Bool, @ViewBuilder _ contenido: () -> C) -> some View {
        if hay {
            anchoredAction { contenido().padding(.horizontal, Theme.Spacing.pantalla - Theme.Spacing.l) }
        } else {
            self
        }
    }
}
