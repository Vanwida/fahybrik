import SwiftUI

// Tests guiados — la curva diminuta del hub y el chip de delta. Ambas son piezas puramente visuales: la
// curva dibuja los valores SIN normalizar en dirección (un 5K que mejora BAJA — honesto, como en cualquier
// app de entrenamiento seria) y el chip colorea por la dirección de mejora de la unidad a través de
// `BenchmarkDelta`, así que nunca puede contradecir a la pantalla de resultado.

/// Curva de la historia de una marca. Por debajo de dos puntos no dice nada (una marca suelta es un
/// punto: una curva necesita historia).
///
/// El trazo es la TINTA del tema y no el acento: el acento del club es marca y acción, jamás el color de
/// un dato (CONTRATO-UI §11.1), y así la curva no cambia de carácter según el club.
struct BenchmarkSparkline: View {
    let values: [Double]

    private static let radioDelPunto: CGFloat = 3.5

    var body: some View {
        GeometryReader { geo in
            let puntos = puntosNormalizados(en: geo.size)
            ZStack {
                if puntos.count >= 2 {
                    // Relleno suave bajo la curva: la banda basal de una gráfica del kit.
                    Path { p in
                        guard let primero = puntos.first, let ultimo = puntos.last else { return }
                        p.move(to: CGPoint(x: primero.x, y: geo.size.height))
                        for pt in puntos { p.addLine(to: pt) }
                        p.addLine(to: CGPoint(x: ultimo.x, y: geo.size.height))
                        p.closeSubpath()
                    }
                    .fill(Theme.Color.superficieDeGrafico)

                    Path { p in
                        p.move(to: puntos[0])
                        for pt in puntos.dropFirst() { p.addLine(to: pt) }
                    }
                    .stroke(Theme.Color.foreground, style: StrokeStyle(lineWidth: Theme.Chart.linea, lineCap: .round, lineJoin: .round))
                }
                if let ultimo = puntos.last {
                    Circle()
                        .fill(Theme.Color.foreground)
                        .frame(width: Self.radioDelPunto * 2, height: Self.radioDelPunto * 2)
                        .position(ultimo)
                }
            }
        }
        .accessibilityHidden(true)   // el texto de la fila lleva las cifras
    }

    // Los valores dentro del rectángulo, normalizados min–max con un pequeño margen vertical para que una
    // serie plana no se pegue a un borde. Un solo punto se centra.
    private func puntosNormalizados(en size: CGSize) -> [CGPoint] {
        guard !values.isEmpty else { return [] }
        let margen = Self.radioDelPunto + 1
        let alto = size.height - margen * 2
        let ancho = size.width - margen * 2
        let minimo = values.min() ?? 0
        let maximo = values.max() ?? 1
        let rango = maximo - minimo
        return values.enumerated().map { i, v in
            let x = values.count == 1 ? size.width / 2 : margen + ancho * CGFloat(i) / CGFloat(values.count - 1)
            let norm = rango > 0 ? (v - minimo) / rango : 0.5
            return CGPoint(x: x, y: margen + alto * (1 - CGFloat(norm)))
        }
    }
}

/// «−12 s» / «+2,5 kg», teñido por si el cambio SUPERA la marca anterior (dirección según la unidad). Un
/// delta cero se lee neutro.
///
/// El texto es la tinta del tema y el color de estado va en la MARCA (la flecha y el borde): sobre un tinte
/// del verde o del rojo el color del texto no llega a AA, y un color solo no basta (§4.2), así que además
/// del color va el sentido —sube o baja— en la forma de la flecha y la mejora o empeora en su nombre
/// accesible.
struct BenchmarkDeltaChip: View {
    let unit: String
    let delta: Double

    private var mejora: Bool { BenchmarkDelta.improved(unit: unit, delta: delta) }
    private var color: SwiftUI.Color {
        if delta == 0 { return Theme.Color.muted }
        return mejora ? Theme.Color.ok : Theme.Color.danger
    }

    var body: some View {
        HStack(spacing: Theme.Spacing.xs) {
            if delta != 0 {
                IconoDia(delta > 0 ? .sube : .baja, tam: 14, peso: .heavy)
                    .foregroundStyle(color)
            }
            Text(BenchmarkDelta.deltaLabel(unit: unit, delta: delta))
                .papel(.notaPesada)
                .foregroundStyle(Theme.Color.foreground)
        }
        .padding(.horizontal, Theme.Spacing.m)
        .frame(minHeight: 32)
        .background(Theme.Color.tinte(color, 0.16, sobre: Theme.Color.surface), in: Capsule())
        .overlay(Capsule().strokeBorder(color.opacity(0.4), lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(textoAccesible)
    }

    private var textoAccesible: String {
        let cambio = BenchmarkDelta.deltaLabel(unit: unit, delta: delta)
        if delta == 0 { return "Sin cambio respecto a la marca anterior" }
        return mejora ? "Mejora de \(cambio)" : "Empeora \(cambio)"
    }
}
