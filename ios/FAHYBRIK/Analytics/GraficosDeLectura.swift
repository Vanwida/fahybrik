import SwiftUI

// LOS GRÁFICOS DE UNA LECTURA — la curva, el reparto y las contribuciones.
//
// Viven aparte de los BLOQUES por el mismo motivo por el que `GraficosDeCarrera`
// vive aparte de `AnaliticasCorrerView`: un bloque decide QUÉ se enseña y en qué
// orden, y un gráfico solo sabe dibujar una forma con la tinta de la casa. Mezclar
// las dos cosas es lo que convierte un fichero de vistas en uno de 900 líneas
// donde nadie encuentra el trazo.
//
// LOS TRES COMPARTEN LA TINTA CON EL RESTO DE LA FAMILIA: el trazo, el fantasma y
// el punto de hoy salen de `dibujaSerie`, y los rótulos de `etiqueta`. Si cada uno
// dibujara el suyo, dos gráficos de la misma pantalla estarían contando lo mismo
// con dos tintas distintas.
//
// Y CADA UNO DECLARA SU CASO DEGENERADO devolviendo `EmptyView`: menos de dos
// medidas, un reparto entero a cero, cero partes. Nunca un eje roto, nunca un NaN.

/// LA CURVA DE UNA LECTURA. Comparte trazo, fantasma y punto de hoy con el resto
/// de gráficos de analíticas (`dibujaSerie`): si divergieran, dos gráficos de la
/// misma pantalla estarían contando lo mismo con dos tintas distintas.
///
/// Los ejes son dos cifras diminutas —el mejor y el peor valor— escritas con la
/// grafía de SU unidad, no con un formateador propio.
struct LineaDeLectura: View {
    let serie: SerieDeLectura
    /// La altura del fantasma. Nula = el fantasma marca de dónde salió la serie.
    var referencia: Double?
    var mejorEsMenor: Bool = false
    var alto: CGFloat = 120
    /// A escala de renglón los ejes no caben sin taparle el paso al trazo, y la
    /// fila ya lleva el número encima. Lo que NO se pierde nunca es el fantasma:
    /// ahí está la comparación, que es lo único que el gráfico va a enseñar.
    var conEjes: Bool = true

    /// Con ejes, sitio para dos cifras a la izquierda; sin ellos, solo el aire que
    /// impide que el halo del punto de hoy se recorte contra el borde.
    private var margen: (arriba: Double, abajo: Double, izquierda: Double, derecha: Double) {
        conEjes ? (10, 10, 46, 6) : (9, 9, 9, 9)
    }

    private var valores: [Double?] { serie.puntos.map(\.v) }

    var body: some View {
        if valores.compactMap({ $0 }).count < 2 {
            EmptyView()
        } else {
            Canvas(rendersAsynchronously: false) { ctx, size in
                dibuja(ctx, size: size)
            }
            .frame(height: alto)
            .accessibilityElement()
            .accessibilityLabel(etiquetaAccesible)
        }
    }

    private var etiquetaAccesible: String {
        let conValor = valores.compactMap { $0 }
        guard let primero = conValor.first, let ultimo = conValor.last,
              let a = GrafiaDeLectura.escribe(primero, serie.unidad),
              let b = GrafiaDeLectura.escribe(ultimo, serie.unidad) else { return "" }
        return "De \(a.cifra) a \(b.cifra)"
    }

    private func dibuja(_ ctx: GraphicsContext, size: CGSize) {
        let m = margen
        let caja = CGRect(
            x: m.izquierda, y: m.arriba,
            width: max(0, size.width - m.izquierda - m.derecha),
            height: max(0, size.height - m.arriba - m.abajo)
        )
        guard let p = dibujaSerie(ctx, caja: caja, valores: valores, referencia: referencia,
                                  mejorEsMenor: mejorEsMenor,
                                  grosor: conEjes ? 2 : 1.6,
                                  radioUltimo: conEjes ? 4 : 2.8)
        else { return }
        guard conEjes else { return }
        // Los ejes: dos cifras nada más, a la altura exacta del mejor y del peor
        // valor, escritas con la grafía de SU unidad y pegadas al borde del lienzo.
        for valor in [p.minV, p.maxV] {
            guard let escrito = GrafiaDeLectura.escribe(valor, serie.unidad) else { continue }
            etiqueta(ctx, escrito.cifra, at: CGPoint(x: 0, y: p.y(valor)), anchor: .leading)
        }
    }
}

/// EL REPARTO PROPORCIONAL, en una barra apilada y su leyenda.
///
/// SIN COLOR SEMÁNTICO, Y ES LO HONESTO. El color es dato cuando lo que se mide ES
/// una zona (ahí manda `BarraDeReparto`, con la paleta de zonas). Aquí las partes
/// son lo que sean —cuánto de tu entrenamiento se midió, qué terreno pisaste— y el
/// contrato no manda ningún color, así que se usa una rampa neutra por ORDEN: la
/// primera parte sólida, las siguientes cada vez más tenues. Inventar una paleta
/// de significados sería pintar un juicio que nadie sirvió.
struct BarraDeRepartoNeutra: View {
    let reparto: RepartoDeLectura

    private static let altoBarra = 12.0
    private static let opacidades: [Double] = [1, 0.42, 0.2, 0.12]

    private var partes: [ParteDeReparto] {
        reparto.partes.filter { ($0.pct ?? 0) > 0 }
    }

    var body: some View {
        if partes.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                barra
                leyenda
            }
        }
    }

    private var barra: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                ForEach(Array(partes.enumerated()), id: \.element.code) { i, parte in
                    Rectangle()
                        .fill(Theme.Color.foreground.opacity(Self.opacidad(i)))
                        .frame(width: geo.size.width * (parte.pct ?? 0) / 100)
                }
            }
        }
        .frame(height: Self.altoBarra)
        .accessibilityHidden(true)
    }

    /// La leyenda ES el dato: sin ella una rampa de grises no dice qué es cada
    /// tramo. Etiqueta del servidor + su porcentaje, en la misma tinta que su
    /// tramo para que el ojo los empareje sin buscar.
    private var leyenda: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(partes.enumerated()), id: \.element.code) { i, parte in
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                    Rectangle()
                        .fill(Theme.Color.foreground.opacity(Self.opacidad(i)))
                        .frame(width: 8, height: 8)
                    Text(parte.etiquetaEs)
                        .scaledFont(11, weight: .medium, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.muted)
                    Spacer(minLength: Theme.Spacing.s)
                    if let escrito = GrafiaDeLectura.escribe(parte.pct ?? 0, .pct) {
                        Text(escrito.cifra + " %")
                            .font(.system(size: 11, weight: .bold, design: .monospaced).monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                    }
                }
            }
        }
    }

    private static func opacidad(_ i: Int) -> Double {
        opacidades[min(i, opacidades.count - 1)]
    }
}

/// EL REPARTO QUE NO REPARTE NADA — las contribuciones sueltas de una lectura.
///
/// La curva de esfuerzos sobre la que se ajustó la velocidad crítica es esto: cada
/// parte es un esfuerzo REAL del atleta, no un trozo de un total, y por eso llega
/// sin porcentaje. Se leen como pastillas porque lo que dicen es «de aquí sale el
/// número», que es la procedencia que hace el dato discutible en vez de creíble.
///
/// Se escribe la ETIQUETA del servidor y no el valor: la etiqueta ya ES el valor
/// escrito («1000 m»), y pintar los dos diría lo mismo dos veces.
struct ChipsDeReparto: View {
    let reparto: RepartoDeLectura

    var body: some View {
        if reparto.partes.isEmpty {
            EmptyView()
        } else {
            FlowLayout(spacing: 6) {
                ForEach(reparto.partes, id: \.code) { parte in
                    Text(parte.etiquetaEs)
                        .font(.system(size: 11, weight: .bold, design: .monospaced).monospacedDigit())
                        .foregroundStyle(Theme.Color.muted)
                        .padding(.horizontal, Theme.Spacing.s)
                        .padding(.vertical, 4)
                        .overlay(
                            Capsule().stroke(Theme.Color.hairlineStrong, lineWidth: 1)
                        )
                }
            }
        }
    }
}
