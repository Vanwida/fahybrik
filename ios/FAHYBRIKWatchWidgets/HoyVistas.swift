import SwiftUI
import WidgetKit

// LO DE HOY EN LA ESFERA Y EN EL SMART STACK — las vistas (P13).
//
// Porta las piezas `Esfera` y `SmartStack` de `reloj-antes-despues/esfera.tsx` del doble:
// la cabecera en gris, el titular, lo de debajo y la tira (el aro de la sesión
// desenrollado: naranja el trabajo, gris lo demás). Pintan SOLO un `ComplicacionHoy`, ya
// leído por la app: no derivan nada, así que no pueden discrepar del brief al que lleva
// el toque.
//
// Familias:
//   · accessoryRectangular  la grande de la esfera Modular y la tarjeta del Smart Stack:
//                           las cuatro líneas de la propuesta.
//   · accessoryCorner       el icono de la sesión y, en curva, su titular.
//   · accessoryInline       «Hoy · 6 × 1000 m», una línea bajo la hora.
//   · accessoryCircular     el aro de la sesión con su icono dentro.
//
// Nada por debajo de 15 pt salvo lo que WidgetKit fija (la etiqueta curva y la línea
// inline). Lo que no cabe se SUELTA por la cola (un dato entero), nunca se encoge ni se
// corta a mitad. Muñeca bajada (`isLuminanceReduced`): sin tinte, tinta al 60 % y la tira
// apagada — el modelo (§3, Always-On). Esta es la extensión: solo se enlaza con lo mínimo
// (`ComplicacionHoy`, `Marca`) y el naranja de fábrica va aquí, como en el widget del iPhone.

/// El acento de fábrica (#F06A2A). Una COPIA a propósito, como en `RunLiveActivityWidget`:
/// traer `WatchTheme` arrastraría la paleta entera a una extensión que debe quedarse
/// pequeña. Al clonar hay que tocarla junto a `WatchTheme` (docs/ios-clonabilidad.md).
private let acentoDeFabrica = Color(red: 0xF0 / 255, green: 0x6A / 255, blue: 0x2A / 255)

/// Medidas de la extensión. Una escala, no números sueltos por las vistas.
private enum Medida {
    static let cabecera: CGFloat = 15
    static let titular: CGFloat = 18
    static let nota: CGFloat = 15
    static let iconoEsquina: CGFloat = 20
    static let iconoCirculo: CGFloat = 18
    static let alturaTira: CGFloat = 5
    static let huecoTira: CGFloat = 1.5
    static let anchoAro: CGFloat = 4
    /// Lo que se recorta de cada arco del aro (fracción de vuelta) para que se lean separados.
    static let huecoAro: Double = 0.012
    /// La muñeca bajada: la tinta al 60 %.
    static let tintaAtenuada: Double = 0.6
    static let arcoApagado: Double = 0.38
}

extension ComplicacionHoy {

    /// El acento del club, o el de fábrica si no hay o no se entiende el hex.
    var colorAcento: Color {
        guard let acento, let rgb = Self.rgb(acento) else { return acentoDeFabrica }
        return Color(.sRGB, red: Double((rgb >> 16) & 0xFF) / 255,
                     green: Double((rgb >> 8) & 0xFF) / 255, blue: Double(rgb & 0xFF) / 255)
    }

    private static func rgb(_ hex: String) -> UInt32? {
        let limpio = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard limpio.count == 6 else { return nil }
        return UInt32(limpio, radix: 16)
    }

    /// El símbolo de cada icono.
    var simbolo: String {
        switch icono {
        case .correr:   return "figure.run"
        case .fuerza:   return "figure.strengthtraining.traditional"
        case .mixto:    return "figure.mixed.cardio"
        case .descanso: return "moon.zzz.fill"
        case .hecha:    return "checkmark.circle.fill"
        case .iphone:   return "iphone.gen3"
        }
    }

    /// La línea de la familia inline: «Hoy · 6 × 1000 m», «Hoy · descanso», «Hoy · hecha».
    var lineaInline: String {
        switch estado {
        case .sesion:   return "Hoy · \(titulo)"
        case .descanso: return "Hoy · descanso"
        case .hecha:    return "Hoy · hecha"
        case .sinPlan:  return "Sin plan de hoy"
        }
    }

    /// El titular curvo de la esquina.
    var etiquetaEsquina: String { estado == .hecha ? "Hecha" : titulo }
}

// MARK: - La vista que elige por familia

struct HoyVista: View {
    let hoy: ComplicacionHoy

    @Environment(\.widgetFamily) private var familia

    var body: some View {
        switch familia {
        case .accessoryCorner:   HoyEsquina(hoy: hoy)
        case .accessoryInline:   HoyInline(hoy: hoy)
        case .accessoryCircular: HoyCirculo(hoy: hoy)
        default:                 HoyRectangular(hoy: hoy)
        }
    }
}

// MARK: - Rectangular: la de la esfera Modular y la del Smart Stack

struct HoyRectangular: View {
    let hoy: ComplicacionHoy

    @Environment(\.isLuminanceReduced) private var atenuado

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(hoy.contexto)
                .font(.system(size: Medida.cabecera, weight: .semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Text(hoy.titulo)
                .font(.system(size: Medida.titular, weight: .bold))
                .foregroundStyle(tinta)
                .lineLimit(1)
                // El titular es una dosis: se ajusta al ancho hasta el suelo de 15 pt.
                .minimumScaleFactor(Medida.nota / Medida.titular)
                .widgetAccentable()
            HoyDetalle(partes: hoy.detalle)
            if !hoy.forma.isEmpty {
                HoyTira(arcos: hoy.forma, acento: hoy.colorAcento)
                    .padding(.top, 3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(etiquetaAccesible)
    }

    private var tinta: Color { atenuado ? Color.primary.opacity(Medida.tintaAtenuada) : Color.primary }

    private var etiquetaAccesible: String {
        ([hoy.contexto, hoy.titulo] + hoy.detalle).joined(separator: ", ")
    }
}

/// Lo de debajo del titular en UNA línea: todos los datos si caben; si no, se suelta el último
/// («a 3:45–3:55 · r 90″ suave» → «a 3:45–3:55»). Nunca se parte un dato ni baja de 15 pt.
struct HoyDetalle: View {
    let partes: [String]

    var body: some View {
        if !partes.isEmpty {
            ViewThatFits(in: .horizontal) {
                ForEach(Array((1...partes.count).reversed()), id: \.self) { n in
                    Text(partes.prefix(n).joined(separator: " · "))
                        .font(.system(size: Medida.nota, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                }
                // Ni el primer dato solo cabe entero: se ajusta hasta donde deja la escala.
                Text(partes[0])
                    .font(.system(size: Medida.nota, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
        }
    }
}

// MARK: - La tira: el aro desenrollado

/// Un arco por tramo, con el ancho de su parte de la sesión (mínimo 1 pt): naranja el
/// trabajo, gris lo demás. La forma de la sesión se reconoce antes de leerla.
struct HoyTira: View {
    let arcos: [ComplicacionHoy.Arco]
    let acento: Color

    @Environment(\.isLuminanceReduced) private var atenuado
    @Environment(\.widgetRenderingMode) private var modo

    var body: some View {
        GeometryReader { geo in
            let anchos = Self.anchos(arcos, total: geo.size.width)
            HStack(spacing: Medida.huecoTira) {
                ForEach(Array(arcos.enumerated()), id: \.offset) { i, arco in
                    Capsule()
                        .fill(relleno(arco.trabajo))
                        .frame(width: anchos[i])
                        .widgetAccentable(arco.trabajo)
                }
            }
        }
        .frame(height: Medida.alturaTira)
        .accessibilityHidden(true)
    }

    private func relleno(_ trabajo: Bool) -> AnyShapeStyle {
        if trabajo {
            // Con color el naranja; en una esfera de un solo tono o con la muñeca bajada, tinta.
            let conColor = modo == .fullColor && !atenuado
            return AnyShapeStyle(conColor ? acento : Color.primary.opacity(atenuado ? Medida.tintaAtenuada : 1))
        }
        return AnyShapeStyle(Color.secondary.opacity(atenuado ? 0.3 : Medida.arcoApagado))
    }

    /// El ancho de cada arco: su parte del ancho útil (sin los huecos), con 1 pt de suelo.
    static func anchos(_ arcos: [ComplicacionHoy.Arco], total: CGFloat) -> [CGFloat] {
        let suma = arcos.reduce(0) { $0 + max(1, $1.peso) }
        let libre = max(0, total - Medida.huecoTira * CGFloat(max(0, arcos.count - 1)))
        return arcos.map { max(1, libre * CGFloat(max(1, $0.peso) / suma)) }
    }
}

// MARK: - Esquina

struct HoyEsquina: View {
    let hoy: ComplicacionHoy

    var body: some View {
        Image(systemName: hoy.simbolo)
            .font(.system(size: Medida.iconoEsquina, weight: .semibold))
            .foregroundStyle(hoy.estado == .sesion ? hoy.colorAcento : Color.primary)
            .widgetAccentable()
            .widgetLabel { Text(hoy.etiquetaEsquina) }
            .accessibilityLabel(hoy.lineaInline)
    }
}

// MARK: - Inline

struct HoyInline: View {
    let hoy: ComplicacionHoy

    var body: some View {
        // Sin sitio para «Hoy · …», el titular solo.
        ViewThatFits(in: .horizontal) {
            Label(hoy.lineaInline, systemImage: hoy.simbolo)
            Label(hoy.titulo, systemImage: hoy.simbolo)
        }
    }
}

// MARK: - Círculo: el aro de la sesión con su icono

struct HoyCirculo: View {
    let hoy: ComplicacionHoy

    @Environment(\.isLuminanceReduced) private var atenuado
    @Environment(\.widgetRenderingMode) private var modo

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            if hoy.forma.isEmpty {
                Circle().stroke(Color.secondary.opacity(Medida.arcoApagado), lineWidth: Medida.anchoAro)
                    .padding(Medida.anchoAro / 2)
            } else {
                ForEach(Array(tramos.enumerated()), id: \.offset) { _, t in
                    Circle()
                        .trim(from: t.desde, to: t.hasta)
                        .stroke(relleno(t.trabajo), style: StrokeStyle(lineWidth: Medida.anchoAro, lineCap: .butt))
                        .rotationEffect(.degrees(-90))
                        .padding(Medida.anchoAro / 2)
                        .widgetAccentable(t.trabajo)
                }
            }
            Image(systemName: hoy.simbolo)
                .font(.system(size: Medida.iconoCirculo, weight: .semibold))
                .foregroundStyle(Color.primary.opacity(atenuado ? Medida.tintaAtenuada : 1))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(hoy.lineaInline)
    }

    private func relleno(_ trabajo: Bool) -> AnyShapeStyle {
        if trabajo {
            let conColor = modo == .fullColor && !atenuado
            return AnyShapeStyle(conColor ? hoy.colorAcento : Color.primary.opacity(atenuado ? Medida.tintaAtenuada : 1))
        }
        return AnyShapeStyle(Color.secondary.opacity(atenuado ? 0.3 : Medida.arcoApagado))
    }

    /// Los arcos como fracciones de vuelta, con un hueco entre vecinos.
    private var tramos: [(desde: Double, hasta: Double, trabajo: Bool)] {
        let suma = hoy.forma.reduce(0) { $0 + max(1, $1.peso) }
        var acumulado = 0.0
        return hoy.forma.map { a in
            let parte = max(1, a.peso) / suma
            defer { acumulado += parte }
            let desde = acumulado + Medida.huecoAro / 2
            let hasta = acumulado + parte - Medida.huecoAro / 2
            return (desde, max(desde + 0.001, hasta), a.trabajo)
        }
    }
}
