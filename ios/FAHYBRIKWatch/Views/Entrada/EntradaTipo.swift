import SwiftUI

// LA ENTRADA DEL RELOJ, EN EL LENGUAJE DEL LIENZO.
//
// Lo que se ve al abrir la app (el brief de hoy, el día de descanso, el entreno ya
// hecho, la oferta de retomar, cómo llegas) habla el mismo idioma que el vivo:
// SF nativo de cifras de ancho fijo, una escala por papel, el naranja de marca SOLO
// para la acción y el trabajo, y el resto en tinta y gris. Nada de títulos pesados,
// pastillas ni negro liso con etiquetas de 10 pt.
//
// Espejo de `web/components/design-twin/kit-reloj/tokens.ts` (T, FILA, C): la
// propuesta del doble (`reloj-antes-despues`) es el diseño; esto lo porta. El COLOR
// sale de `WatchTheme` (una sola paleta); aquí solo viven las medidas.

enum EntradaTipo {
    /// El suelo del modelo: nada por debajo de 15 pt. Si una frase no cabe, la frase
    /// es larga (se ajusta el contenido, nunca el cuerpo a ilegible).
    static let suelo: CGFloat = 15

    static let contexto: CGFloat = 16
    static let linea: CGFloat = 16
    static let nota: CGFloat = 15
    static let segundo: CGFloat = 30
    static let tercero: CGFloat = 22
    /// El héroe de una pantalla de estado (la puntuación de cómo llegas).
    static let heroe: CGFloat = 76
    static let boton: CGFloat = 17
    static let altoBoton: CGFloat = 44

    /// Cuánto puede encogerse una línea de 16 pt antes de tocar el suelo.
    static let escalaSuelo: CGFloat = suelo / contexto
    /// El héroe se ajusta al ancho: hasta la mitad de su cuerpo, que sigue por encima de 38 pt.
    static let escalaHeroe: CGFloat = 0.5
    /// Y al alto de la caja: qué parte del lienzo puede ocupar el cuerpo del héroe.
    static let heroeFraccion: CGFloat = 0.30

    /// La marca a la izquierda de una fila del brief: naranja el trabajo, gris lo demás.
    static let marcaAncho: CGFloat = 3
    static let marcaRadio: CGFloat = 2
    static let marcaApagada: Double = 0.38

    static let hueco: CGFloat = 4
    static let huecoFilas: CGFloat = 8
    static let lado: CGFloat = 10
    /// El safe de abajo del modelo (§3): 12 pt. El de arriba NO se fija: lo marca la hora
    /// del sistema (arriba a la derecha, en toda app de entreno) y cambia con la caja.
    static let safeAbajo: CGFloat = 12
    /// Lo que se funde entre las filas que pasan y la barra fija de abajo.
    static let fundido: CGFloat = 8

    /// Muñeca bajada: la tinta baja al 60 % (el modelo, §3 Always-On).
    static let tintaAtenuada: Double = 0.6

    /// El contorno del botón con la muñeca bajada (sin relleno grande, solo el trazo).
    static let contornoAtenuado: CGFloat = 1.5

    static let selloTalla: CGFloat = 40
    static let selloTrazo: CGFloat = 2
}

extension Font {
    /// SF del sistema con cifras de ancho fijo: la misma cara que el vivo.
    static func entrada(_ cuerpo: CGFloat, _ peso: Font.Weight = .semibold) -> Font {
        .system(size: cuerpo, weight: peso).monospacedDigit()
    }
}

extension View {
    /// El marco de una pantalla de estado: por debajo de la hora del sistema, hasta 12 pt
    /// del borde de abajo y con el fondo negro a sangre. Sin ignorar el safe de abajo, un
    /// 40 mm se queda sin sitio.
    func entradaMarco() -> some View {
        padding(.horizontal, EntradaTipo.lado)
            .padding(.bottom, EntradaTipo.safeAbajo)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(WatchTheme.bg.ignoresSafeArea())
            .ignoresSafeArea(.container, edges: .bottom)
    }
}

/// Una pantalla de estado: el contenido centrado en el lienzo con la versión abajo o, si
/// en una caja pequeña (40 mm) no cabe, el mismo contenido en un scroll de la corona.
/// Nada se corta ni se solapa con la hora del sistema.
struct EntradaPagina<Contenido: View>: View {
    var espacio: CGFloat = EntradaTipo.hueco
    var conVersion = true
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        ViewThatFits(in: .vertical) {
            VStack(spacing: espacio) {
                Spacer(minLength: 0)
                contenido()
                Spacer(minLength: 0)
                if conVersion { EntradaVersion() }
            }
            .entradaMarco()
            ScrollView {
                VStack(spacing: espacio) {
                    contenido()
                    if conVersion { EntradaVersion() }
                }
                .padding(.horizontal, EntradaTipo.lado)
                .padding(.bottom, EntradaTipo.safeAbajo)
            }
            .background(WatchTheme.bg.ignoresSafeArea())
        }
    }
}

/// La tinta principal: blanca, o al 60 % con la muñeca bajada.
func entradaTinta(atenuado: Bool) -> Color {
    WatchTheme.ink.opacity(atenuado ? EntradaTipo.tintaAtenuada : 1)
}

// MARK: - Contexto

/// La línea de arriba de cada pantalla («Hoy · desde 55 min», «Hecho hoy»): 16 pt
/// semibold en gris. Si no cabe en una línea encoge hasta el suelo (15 pt) y, si ni
/// así, pasa a dos líneas: nunca cortada con «…».
struct EntradaContexto: View {
    let partes: [String]
    var alineacion: Alignment = .center

    var body: some View {
        ViewThatFits(in: .horizontal) {
            texto(EntradaTipo.contexto).lineLimit(1)
            texto(EntradaTipo.suelo).lineLimit(1)
            texto(EntradaTipo.contexto).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: alineacion)
        .accessibilityAddTraits(.isHeader)
    }

    private func texto(_ cuerpo: CGFloat) -> some View {
        Text(partes.joined(separator: " · "))
            .font(.entrada(cuerpo))
            .foregroundStyle(WatchTheme.dim)
            .multilineTextAlignment(alineacion == .center ? .center : .leading)
    }
}

// MARK: - Botón

/// El botón de la entrada: 44 pt de alto, cápsula, naranja para la acción y gris
/// para lo demás. Texto NEGRO sobre el naranja (6,5:1; el blanco se queda en 3,1:1).
/// Con la muñeca bajada no hay relleno grande: queda el contorno y el texto atenuado.
struct EntradaBoton: View {
    enum Estilo { case accion, superficie }

    let titulo: String
    var estilo: Estilo = .accion
    /// Con el gesto de doble toque (Series 9 / Ultra 2 en adelante) también sale.
    var dobleToque = false
    var etiquetaAccesible: String? = nil
    let accion: () -> Void

    @Environment(\.isLuminanceReduced) private var atenuado

    var body: some View {
        let boton = Button {
            WatchHaptics.tap()
            accion()
        } label: {
            Text(titulo)
                .font(.entrada(EntradaTipo.boton))
                .lineLimit(1)
                .minimumScaleFactor(EntradaTipo.escalaSuelo)
                .frame(maxWidth: .infinity, minHeight: EntradaTipo.altoBoton)
        }
        .buttonStyle(EntradaBotonEstilo(estilo: estilo, atenuado: atenuado))
        .accessibilityLabel(etiquetaAccesible ?? titulo)
        if dobleToque {
            boton.handGestureShortcut(.primaryAction)
        } else {
            boton
        }
    }
}

private struct EntradaBotonEstilo: ButtonStyle {
    let estilo: EntradaBoton.Estilo
    let atenuado: Bool

    func makeBody(configuration: Configuration) -> some View {
        let esAccion = estilo == .accion
        configuration.label
            .foregroundStyle(color(esAccion))
            .background {
                if atenuado {
                    Capsule().strokeBorder(esAccion ? WatchTheme.orange : WatchTheme.dim, lineWidth: EntradaTipo.contornoAtenuado)
                } else {
                    Capsule().fill(fondo(esAccion, pulsado: configuration.isPressed))
                }
            }
    }

    private func color(_ esAccion: Bool) -> Color {
        if atenuado { return entradaTinta(atenuado: true) }
        return esAccion ? WatchTheme.bg : WatchTheme.ink
    }

    private func fondo(_ esAccion: Bool, pulsado: Bool) -> Color {
        guard esAccion else { return pulsado ? WatchTheme.surface : WatchTheme.surfaceRaised }
        return pulsado ? WatchTheme.orangePress : WatchTheme.orange
    }
}

// MARK: - Versión y sello

/// La versión y la build de ESTE binario, discreta y solo en reposo.
///
/// La app del reloj viaja dentro de la del iPhone y watchOS decide cuándo la empuja:
/// con el mismo número de build a menudo NO la actualiza y deja la muñeca en la
/// versión anterior, sin avisar. Es la forma de saber qué binario lleva la muñeca sin
/// cables. Va al final de cada pantalla de entrada (el vivo no cede ni un píxel), y a
/// 15 pt: el suelo del modelo también vale aquí. Misma lectura del Bundle que el
/// Perfil del iPhone.
struct EntradaVersion: View {
    var body: some View {
        if let version = AppBundleMetadata.displayVersion {
            Text(version)
                .font(.entrada(EntradaTipo.nota, .medium))
                .foregroundStyle(WatchTheme.dim)
                .lineLimit(1)
                .minimumScaleFactor(EntradaTipo.escalaSuelo)
                .frame(maxWidth: .infinity)
                .accessibilityLabel("Versión \(version)")
        }
    }
}

/// El sello de una sesión hecha: un anillo y su marca, en tinta. Completa = la marca;
/// parcial = medio anillo. Sin color: la palabra de debajo dice cuál es.
struct EntradaSello: View {
    let parcial: Bool

    var body: some View {
        ZStack {
            Circle().stroke(WatchTheme.dim, lineWidth: EntradaTipo.selloTrazo)
            if parcial {
                Circle()
                    .trim(from: 0, to: 0.5)
                    .stroke(WatchTheme.ink, style: StrokeStyle(lineWidth: EntradaTipo.selloTrazo + 1, lineCap: .round))
                    .rotationEffect(.degrees(90))
            } else {
                Image(systemName: "checkmark")
                    .font(.system(size: EntradaTipo.contexto + 2, weight: .semibold))
                    .foregroundStyle(WatchTheme.ink)
            }
        }
        .frame(width: EntradaTipo.selloTalla, height: EntradaTipo.selloTalla)
        .accessibilityHidden(true)
    }
}
