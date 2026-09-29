import SwiftUI
import Charts

// LOS GRÁFICOS MENORES — la chispa de una fila (con huecos reales y la banda
// del basal), la barra de reparto al 100 % con la marca del objetivo del coach y
// las barras horizontales del hueco por tramo (espejo de `graficos.tsx#Chispa`,
// `#BarraReparto` y `#BarrasHueco`). La chispa va en Swift Charts (escala real);
// el reparto y los huecos son formas de SwiftUI: no tienen ejes.

private typealias C = AnaliticasColor

// MARK: - Chispa

/// La tendencia de una fila, sin texto (el dato va al lado). Dos puntos con
/// valor como mínimo; un hueco (nulo) corta la línea, nunca se interpola.
struct AnaliticasChispa: View {
    let puntos: [PuntoDeSerie]
    var ancho: CGFloat = 96
    var alto: CGFloat = 30
    /// La franja normal (la basal de la recuperación), en unidades reales.
    var banda: (lo: Double, hi: Double)? = nil
    var color: Color = C.tinta

    private struct Punto: Identifiable {
        let i: Int
        let v: Double
        let tramo: String
        var id: Int { i }
    }

    private var dibujables: [Punto] {
        var out: [Punto] = []
        var tramo = 0, abierto = false
        for (i, p) in puntos.enumerated() {
            guard let v = p.v else { if abierto { tramo += 1; abierto = false }; continue }
            out.append(Punto(i: i, v: v, tramo: "t\(tramo)"))
            abierto = true
        }
        return out
    }

    var body: some View {
        let d = dibujables
        if d.count >= 2 {
            let vals = d.map(\.v)
            let lo = min(vals.min() ?? 0, banda?.lo ?? .infinity)
            let hi = max(vals.max() ?? 1, banda?.hi ?? -.infinity)
            let margen = max(0.5, (hi - lo) * 0.08)
            Chart {
                if let banda {
                    RectangleMark(xStart: .value("desde", -0.5), xEnd: .value("hasta", Double(puntos.count - 1) + 0.5), yStart: .value("lo", banda.lo), yEnd: .value("hi", banda.hi))
                        .foregroundStyle(C.superficie2)
                }
                ForEach(d) { p in
                    LineMark(x: .value("i", Double(p.i)), y: .value("v", p.v), series: .value("tramo", p.tramo))
                        .foregroundStyle(color.opacity(0.9))
                        .lineStyle(StrokeStyle(lineWidth: 1.75, lineCap: .round, lineJoin: .round))
                        .interpolationMethod(.linear)
                }
                if let ultimo = d.last {
                    PointMark(x: .value("i", Double(ultimo.i)), y: .value("v", ultimo.v)).symbolSize(110).foregroundStyle(C.superficie)
                    PointMark(x: .value("i", Double(ultimo.i)), y: .value("v", ultimo.v)).symbolSize(50).foregroundStyle(color)
                }
            }
            .chartXScale(domain: -0.5...(Double(puntos.count - 1) + 0.5))
            .chartYScale(domain: (lo - margen)...(hi + margen))
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .chartLegend(.hidden)
            .frame(width: ancho, height: alto)
            .accessibilityHidden(true)
        }
    }
}

// MARK: - Reparto: una barra apilada al 100 % con la marca del objetivo del coach

struct TramoDeBarra: Identifiable {
    let code: String
    let etiqueta: String
    let pct: Double
    let color: Color
    var id: String { code }
}

struct AnaliticasBarraReparto: View {
    let partes: [TramoDeBarra]
    /// El corte del objetivo del coach, en % desde la izquierda, con su texto.
    var objetivo: (pct: Double, etiqueta: String)? = nil
    var alto: CGFloat = 22

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            GeometryReader { geo in
                let ancho = geo.size.width
                ZStack(alignment: .topLeading) {
                    HStack(spacing: 2) {
                        ForEach(partes) { p in
                            Rectangle().fill(p.color).frame(width: max(0, ancho * CGFloat(max(0, p.pct)) / 100 - 2))
                        }
                    }
                    .frame(width: ancho, height: alto, alignment: .leading)
                    .background(C.carril)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .padding(.top, objetivo == nil ? 0 : 8)
                    if let objetivo {
                        Rectangle().fill(C.tinta).frame(width: 2, height: alto + 12)
                            .offset(x: ancho * CGFloat(objetivo.pct) / 100 - 1)
                    }
                }
            }
            .frame(height: alto + (objetivo == nil ? 0 : 12))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(partes.map { "\($0.etiqueta) \(Int($0.pct.rounded())) %" }.joined(separator: ", "))
            AnaliticasLeyenda(items: partes.map { ItemDeLeyenda(etiqueta: "\($0.etiqueta) \(Int($0.pct.rounded())) %", muestra: .relleno, color: $0.color) }
                + (objetivo.map { [ItemDeLeyenda(etiqueta: $0.etiqueta, muestra: .linea, color: C.tinta)] } ?? []))
        }
    }
}

// MARK: - Barras horizontales: el hueco por tramo (positivo = te falta)

struct FilaDeHueco: Identifiable {
    let id: String
    let etiqueta: String
    /// Nulo = sin marca que sostenga este tramo.
    let valor: Double?
    var nota: String? = nil
}

struct AnaliticasBarrasHueco: View {
    let filas: [FilaDeHueco]
    let formato: (Double) -> String
    var altoFila: CGFloat = 30

    var body: some View {
        let vals = filas.compactMap(\.valor)
        if !vals.isEmpty {
            let lim = max(1, vals.map(abs).max() ?? 1)
            VStack(spacing: 0) {
                ForEach(filas) { f in
                    HStack(spacing: 8) {
                        Text(f.etiqueta)
                            .font(AnaliticasTokens.fuenteEje)
                            .foregroundStyle(C.tinta)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        GeometryReader { geo in
                            let ancho = geo.size.width
                            let cero = ancho / 2
                            ZStack(alignment: .leading) {
                                Rectangle().fill(C.tinta2).frame(width: 1).offset(x: cero)
                                if let v = f.valor {
                                    let largo = max(2, abs(CGFloat(v / lim)) * (cero - 4))
                                    RoundedRectangle(cornerRadius: 3)
                                        .fill(v > 0 ? C.tinta2 : C.tinta)
                                        .frame(width: largo, height: 14)
                                        .offset(x: v >= 0 ? cero : cero - largo)
                                    Text(formato(v))
                                        .font(AnaliticasTokens.fuenteEje)
                                        .foregroundStyle(C.tinta)
                                        .fixedSize()
                                        .offset(x: v >= 0 ? cero + largo + 6 : max(0, cero - largo - 6 - 52))
                                } else {
                                    Text(f.nota ?? "sin dato")
                                        .font(AnaliticasTokens.fuenteEje)
                                        .foregroundStyle(C.tinta2)
                                        .fixedSize()
                                        .offset(x: cero + 6)
                                }
                            }
                            .frame(height: altoFila)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .frame(height: altoFila)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(f.etiqueta): \(f.valor.map(formato) ?? (f.nota ?? "sin dato"))")
                }
            }
        }
    }
}
