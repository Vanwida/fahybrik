import SwiftUI

// Las piezas propias del resumen de una carrera. Todo lo demás (Ambiente,
// Numeral, MarcoVivo, FranjaAccion, ApoyoVivo) sale de `LenguajeVivoUI`: esta
// pantalla no reinventa el lenguaje del entreno, lo continúa.
//
// Port de `web/components/design-twin/screens/resumen-carrera/piezas.tsx`.

// MARK: - EL PEINE — la refutación de la media, dibujada

/// Una barra por tramo, ancha como su duración y alta como su VELOCIDAD.
///
/// Alta como la velocidad y no como el ritmo, aunque lo que se lea sea el ritmo:
/// el ritmo es un inverso, y con él la barra del tramo LENTO sería la más alta.
/// «Más rápido, más alto» es la única lectura que no hay que explicar.
///
/// Y encima, la línea de la media: discontinua, cruzando el peine por un sitio
/// donde no hay ninguna barra. Ahí está el argumento entero de esta pantalla — la
/// media es una raya que no toca nada.
struct PeineDeTramos: View {
    let tramos: [FormaDeCarrera.Tramo]
    let mediaSkm: Double?

    private static let alto: CGFloat = 116
    /// Suelo de la barra: un tramo suave sigue teniendo que verse, no desaparecer.
    private static let altoMinimo: Double = 0.24
    /// Aire por encima y por debajo del rango, para que nada toque el borde.
    private static let margen: Double = 0.08
    private static let hueco: CGFloat = 2
    private static let anchoMinimo: CGFloat = 2

    /// La escala vertical: de velocidad (m/s) a fracción del alto del peine.
    private struct Escala {
        let suelo: Double
        let techo: Double

        init(velocidades: [Double]) {
            let bajo = velocidades.min() ?? 0
            let alto = velocidades.max() ?? 0
            let span = alto - bajo
            suelo = bajo - span * PeineDeTramos.margen
            techo = alto + span * PeineDeTramos.margen
        }

        func fraccion(_ v: Double) -> Double {
            guard techo > suelo else { return 1 }
            let base = PeineDeTramos.altoMinimo
            return base + (1 - base) * ((v - suelo) / (techo - suelo))
        }
    }

    private var mediaV: Double? { mediaSkm.map { 1000 / $0 } }

    private var escala: Escala? {
        let velocidades = tramos.compactMap { $0.ritmoSkm.map { 1000 / $0 } }
        guard !velocidades.isEmpty else { return nil }
        return Escala(velocidades: velocidades + (mediaV.map { [$0] } ?? []))
    }

    var body: some View {
        if let escala {
            GeometryReader { geo in
                ZStack(alignment: .bottomLeading) {
                    HStack(alignment: .bottom, spacing: Self.hueco) {
                        ForEach(Array(tramos.enumerated()), id: \.offset) { _, t in
                            Barra(tramo: t,
                                  alto: t.ritmoSkm.map { escala.fraccion(1000 / $0) } ?? Self.altoMinimo)
                                .frame(width: ancho(de: t, en: geo.size.width))
                        }
                    }
                    .frame(height: Self.alto, alignment: .bottom)
                    if let mediaV, let mediaSkm {
                        LineaDeLaMedia(mediaSkm: mediaSkm)
                            .frame(width: geo.size.width)
                            .padding(.bottom, Self.alto * escala.fraccion(mediaV))
                    }
                }
                .frame(width: geo.size.width, height: Self.alto, alignment: .bottomLeading)
            }
            .frame(height: Self.alto)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(vozDelPeine)
        }
    }

    /// Cada barra ocupa lo que DURÓ su tramo: el peine es la carrera a escala, no
    /// una lista de barras iguales.
    private func ancho(de tramo: FormaDeCarrera.Tramo, en total: CGFloat) -> CGFloat {
        let suma = tramos.reduce(0.0) { $0 + Swift.max(1, $1.duracionS) }
        guard suma > 0, tramos.count > 0 else { return Self.anchoMinimo }
        let huecos = Self.hueco * CGFloat(tramos.count - 1)
        let util = Swift.max(0, total - huecos)
        return Swift.max(Self.anchoMinimo, util * CGFloat(Swift.max(1, tramo.duracionS) / suma))
    }

    private var vozDelPeine: String {
        let fuertes = tramos.filter { $0.tipo == .fuerte }.count
        let suaves = tramos.filter { $0.tipo == .suave }.count
        var partes = ["\(fuertes) tramos fuertes", "\(suaves) suaves"]
        if let mediaSkm { partes.append("media \(Formato.ritmo(mediaSkm, .porKm))") }
        return partes.joined(separator: ", ")
    }

    private struct Barra: View {
        let tramo: FormaDeCarrera.Tramo
        let alto: Double

        var body: some View {
            let forma = RoundedRectangle(cornerRadius: 3, style: .continuous)
            forma
                // El naranja de marca NO es un color de dato: lo fuerte manda por
                // tinta y por altura, nunca por color de acento.
                .fill(relleno)
                .overlay {
                    if tramo.tipo == .parado {
                        forma.strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                            .foregroundStyle(Theme.Color.hairlineStrong)
                    }
                }
                .frame(height: PeineDeTramos.alto * CGFloat(alto))
        }

        private var relleno: Color {
            switch tramo.tipo {
            case .fuerte: return Theme.Color.foreground.opacity(0.95)
            case .suave:  return Theme.Color.muted.opacity(0.42)
            case .parado: return .clear
            }
        }
    }

    /// La media, cruzando el peine por donde no hay barra.
    private struct LineaDeLaMedia: View {
        let mediaSkm: Double

        var body: some View {
            HStack(spacing: 6) {
                Rayado()
                    .stroke(style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    .foregroundStyle(Theme.Color.faint)
                    .frame(height: 1)
                Text("media \(Formato.ritmo(mediaSkm, .porKm))")
                    .font(.system(size: 10, weight: .semibold))
                    .uppercaseTracked(1)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
                    // La etiqueta cae por definición sobre las barras: sin fondo
                    // propio se lee encima del blanco de un fuerte y no se entiende
                    // ninguno de los dos.
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(Theme.Color.background,
                                in: RoundedRectangle(cornerRadius: 4, style: .continuous))
            }
            .allowsHitTesting(false)
        }
    }

    private struct Rayado: Shape {
        func path(in rect: CGRect) -> Path {
            var p = Path()
            p.move(to: CGPoint(x: rect.minX, y: rect.midY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
            return p
        }
    }
}

// MARK: - El aguante y la honestidad

/// Lo que de verdad juzga una sesión de calidad. El veredicto sale de comparar
/// mitades, pero lo que se enseña son los dos HECHOS —la primera y la última—,
/// porque son los que el atleta puede reconocer.
struct AguanteDeLaCarrera: View {
    let aguante: FormaDeCarrera.Aguante

    private var frase: String {
        switch aguante.veredicto {
        case .aguantaste:   return ""
        case .deMenosAMas:  return ""
        case .seTeFue:      return ""
        }
    }

    private var tono: Color {
        // Bajar de ritmo NO es un fallo: es negativo, y los coaches lo persiguen.
        // Por eso sólo `se te fue` va en ámbar.
        aguante.veredicto == .seTeFue ? Theme.Color.warning : Theme.Color.ok
    }

    var body: some View {
        LineaDeclarada {
            Text(frase)
                .scaledFont(15, weight: .heavy, relativeTo: .subheadline, italic: true)
                .foregroundStyle(tono)
            Text("la primera a \(Formato.ritmo(aguante.primeraSkm, .porKm)), "
                 + "la última a \(Formato.ritmo(aguante.ultimaSkm, .porKm))")
                .scaledFont(12, weight: .medium, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
        }
    }
}

/// Un tramo inferido no puede leerse igual que uno medido. Y va escrito.
struct NotaDeCerteza: View {
    let certeza: FormaDeCarrera.Certeza

    private var texto: String {
        switch certeza {
        case .marcados:   return "Tramos marcados: los cerró el entreno, no se han inferido."
        case .detectados: return "Tramos detectados del ritmo, no marcados. Dato inferido."
        case .estimados:  return "Tramos estimados del ritmo: la separación entre fuerte y suave va justa."
        }
    }

    var body: some View {
        Text(texto)
            .scaledFont(11, weight: .medium, relativeTo: .caption2)
            .foregroundStyle(Theme.Color.faint)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
    }
}

/// EL HUECO DECLARADO — y se declara porque hay un acto concreto que lo llena. No
/// para esta carrera, que ya pasó, pero sí para la siguiente: con el reloj
/// conectado las vueltas llegan reales.
struct SinTramosQueSeparar: View {
    /// El coach mandó contraste: entonces el hueco tiene culpable y se nombra.
    let prescrito: Bool

    var body: some View {
        LineaDeclarada {
            Text(prescrito ? "No se guardaron los tramos" : "Una sola lectura de toda la sesión")
                .scaledFont(15, weight: .heavy, relativeTo: .subheadline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Text(prescrito
                 ? "Se guardó un ritmo para toda la sesión. Con el reloj conectado llegan las vueltas y sus ritmos."
                 : "Sin marcas ni serie de ritmo no hay tramos que separar.")
                .scaledFont(12, weight: .medium, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
        }
    }
}

/// La superficie de las dos declaraciones de arriba. Translúcida como los apoyos:
/// el tinte de zona tiene que verse debajo, o el ambiente se corta en una línea
/// recta a media pantalla.
struct LineaDeclarada<Content: View>: View {
    @ViewBuilder var contenido: Content

    var body: some View {
        VStack(spacing: 3) {
            contenido
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, Theme.Spacing.s)
        .background(Theme.Color.surface.opacity(0.78),
                    in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }
}
