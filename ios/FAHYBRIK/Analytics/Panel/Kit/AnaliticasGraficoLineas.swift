import SwiftUI
import Charts

// LÍNEAS Y DIVERGENTE — forma/fatiga con la proyección discontinua hasta la
// carrera, y la frescura en barras alrededor de cero (espejo de
// `kit-analiticas/graficos.tsx#Lineas` y `#Divergente`), con Swift Charts a
// escala REAL y ejes de verdad (fuera las series 0..1, P21).
//
// LO QUE CUMPLEN (skill dataviz + CONTRATO-UI §4):
//   · El texto del gráfico (ejes, leyenda, rótulos) va en tinta2, NUNCA en el
//     color de la serie. Cuerpo: 15 pt (el suelo).
//   · Rejilla y ejes: una línea fina, SÓLIDA. El trazo discontinuo se reserva a
//     la proyección; el punteado corto, a la marca de «hoy».
//   · Un dato a nulo es un HUECO: la línea se corta (cada tramo es una serie de
//     Charts distinta), la barra no se pinta. Nunca se interpola.
//   · Rótulo directo SOLO en el último punto de la serie que manda.
//   · Leyenda siempre que haya ≥ 2 series.

private typealias C = AnaliticasColor
private typealias Trazo = AnaliticasTokens.Trazo

struct SerieDeLinea: Identifiable {
    let id: String
    let etiqueta: String
    let puntos: [PuntoDeSerie]
    let color: Color
    /// La continuación futura: mismo color, trazo discontinuo.
    var proyeccion: [PuntoDeSerie]? = nil
    /// Rótulo directo al final.
    var rotuloFinal = false
}

struct MarcaVertical: Identifiable, Equatable {
    enum Tipo { case hoy, evento }
    let t: String
    let etiqueta: String
    /// `hoy` separa pasado de proyección; `evento` es la carrera o un test.
    let tipo: Tipo
    var id: String { t }
}

/// Un punto ya fechado y con su tramo (los huecos parten la serie en tramos).
private struct PuntoDibujable: Identifiable {
    let id: String
    let fecha: Date
    let v: Double
    let serie: String
}

/// Parte una serie en tramos contiguos: un `v` nulo cierra el tramo.
private func tramos(_ puntos: [PuntoDeSerie], serie: String) -> [PuntoDibujable] {
    var out: [PuntoDibujable] = []
    var tramo = 0
    var abierto = false
    for p in puntos {
        guard let v = p.v, let fecha = AnaliticasFechas.fecha(p.t) else {
            if abierto { tramo += 1; abierto = false }
            continue
        }
        out.append(PuntoDibujable(id: "\(serie)#\(p.t)", fecha: fecha, v: v, serie: "\(serie)#\(tramo)"))
        abierto = true
    }
    return out
}

/// Qué fechas rotular en X y con qué anclaje (la primera al inicio, la última al final).
struct RotuloDeEje: Identifiable {
    let fecha: Date
    let texto: String
    let anclaje: UnitPoint
    var id: Date { fecha }
}

func rotulosDeEje(_ fechas: [String], ancho: CGFloat) -> [RotuloDeEje] {
    let rotulos = AnaliticasEscala.rotulosX(fechas, ancho: ancho, cuerpo: AnaliticasTokens.TA.etiqueta)
    return rotulos.compactMap { r in
        guard let fecha = AnaliticasFechas.fecha(fechas[r.i]) else { return nil }
        let anclaje: UnitPoint = r.i == 0 ? .topLeading : r.i == fechas.count - 1 ? .topTrailing : .top
        return RotuloDeEje(fecha: fecha, texto: r.texto, anclaje: anclaje)
    }
}

// MARK: - Líneas

struct AnaliticasGraficoLineas: View {
    let series: [SerieDeLinea]
    var marcas: [MarcaVertical] = []
    let formatoY: (Double) -> String
    var alto: CGFloat = 190
    var desdeCero = false
    var leyenda = true

    private var fechas: [String] {
        var todas = Set<String>()
        for s in series {
            for p in s.puntos { todas.insert(p.t) }
            for p in s.proyeccion ?? [] { todas.insert(p.t) }
        }
        return todas.sorted()
    }

    private var escala: EscalaEje {
        let vals = series.flatMap { ($0.puntos + ($0.proyeccion ?? [])).compactMap(\.v) }
        return AnaliticasEscala.bonita(vals.min() ?? 0, vals.max() ?? 1, n: 4, desdeCero: desdeCero)
    }

    private var hayProyeccion: Bool { series.contains { !($0.proyeccion ?? []).isEmpty } }

    var body: some View {
        let fechas = fechas
        if fechas.count >= 2, let t0 = AnaliticasFechas.fecha(fechas[0]), let t1 = AnaliticasFechas.fecha(fechas[fechas.count - 1]) {
            VStack(alignment: .leading, spacing: 8) {
                if leyenda, series.count + (hayProyeccion ? 1 : 0) >= 2 {
                    AnaliticasLeyenda(items: series.map { ItemDeLeyenda(etiqueta: $0.etiqueta, muestra: .linea, color: $0.color) }
                        + (hayProyeccion ? [ItemDeLeyenda(etiqueta: "Proyección", muestra: .lineaDiscontinua, color: C.proyeccion)] : []))
                }
                GeometryReader { geo in
                    grafico(t0: t0, t1: t1, rotulos: rotulosDeEje(fechas, ancho: max(1, geo.size.width - 52)))
                }
                .frame(height: alto)
            }
        }
    }

    private func grafico(t0: Date, t1: Date, rotulos: [RotuloDeEje]) -> some View {
        let escala = escala
        return Chart {
            ForEach(series) { s in
                let hecho = tramos(s.puntos, serie: s.id)
                ForEach(hecho) { p in
                    LineMark(x: .value("día", p.fecha), y: .value(s.etiqueta, p.v), series: .value("serie", p.serie))
                        .foregroundStyle(s.color)
                        .lineStyle(StrokeStyle(lineWidth: Trazo.linea, lineCap: .round, lineJoin: .round))
                        .interpolationMethod(.linear)
                }
                if let proyeccion = s.proyeccion, !proyeccion.isEmpty, let ultimo = s.puntos.last(where: { $0.v != nil }) {
                    ForEach(tramos([ultimo] + proyeccion, serie: "\(s.id)~proy")) { p in
                        LineMark(x: .value("día", p.fecha), y: .value(s.etiqueta, p.v), series: .value("serie", p.serie))
                            .foregroundStyle(s.color)
                            .lineStyle(StrokeStyle(lineWidth: Trazo.linea, lineCap: .round, lineJoin: .round, dash: Trazo.discontinuo))
                            .interpolationMethod(.linear)
                    }
                }
                if let ultimo = hecho.last {
                    PointMark(x: .value("día", ultimo.fecha), y: .value(s.etiqueta, ultimo.v))
                        .symbolSize(140)
                        .foregroundStyle(C.superficie)
                    PointMark(x: .value("día", ultimo.fecha), y: .value(s.etiqueta, ultimo.v))
                        .symbolSize(64)
                        .foregroundStyle(s.color)
                        .annotation(position: .leading, spacing: 6) {
                            if s.rotuloFinal {
                                Text(formatoY(ultimo.v))
                                    .font(.system(size: AnaliticasTokens.TA.etiqueta, weight: .bold).monospacedDigit())
                                    .foregroundStyle(C.tinta)
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(C.superficie, in: RoundedRectangle(cornerRadius: 4))
                            }
                        }
                }
            }
            ForEach(marcas) { m in
                if let fecha = AnaliticasFechas.fecha(m.t) {
                    RuleMark(x: .value("marca", fecha))
                        .foregroundStyle(m.tipo == .evento ? C.tinta : C.tinta2)
                        .lineStyle(StrokeStyle(lineWidth: m.tipo == .evento ? Trazo.contorno : Trazo.rejilla, dash: m.tipo == .hoy ? Trazo.hoyDiscontinuo : []))
                        .annotation(position: .overlay, alignment: m.tipo == .hoy ? .bottomTrailing : .topTrailing, spacing: 5) {
                            Text(m.etiqueta)
                                .font(AnaliticasTokens.fuenteEje)
                                .foregroundStyle(m.tipo == .evento ? C.tinta : C.tinta2)
                                .fixedSize()
                        }
                }
            }
        }
        .chartXScale(domain: t0...t1)
        .chartYScale(domain: escala.min...escala.max)
        .chartLegend(.hidden)
        .chartYAxis {
            AxisMarks(position: .leading, values: escala.ticks) { value in
                AxisGridLine(stroke: StrokeStyle(lineWidth: Trazo.rejilla)).foregroundStyle(C.rejilla)
                AxisValueLabel(horizontalSpacing: 6) {
                    if let v = value.as(Double.self) {
                        Text(formatoY(v)).font(AnaliticasTokens.fuenteEje).foregroundStyle(C.tinta2)
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: rotulos.map(\.fecha)) { value in
                if let d = value.as(Date.self), let r = rotulos.first(where: { abs($0.fecha.timeIntervalSince(d)) < 3600 }) {
                    AxisValueLabel(anchor: r.anclaje, verticalSpacing: 6) {
                        Text(r.texto).font(AnaliticasTokens.fuenteEje).foregroundStyle(C.tinta2).fixedSize()
                    }
                }
            }
        }
        .accessibilityLabel(series.map(\.etiqueta).joined(separator: ", "))
    }
}

// MARK: - Divergente: la frescura alrededor de cero, con la proyección en trazo fino

struct AnaliticasGraficoDivergente: View {
    let puntos: [PuntoDeSerie]
    var proyeccion: [PuntoDeSerie]? = nil
    var marcas: [MarcaVertical] = []
    let formato: (Double) -> String
    var alto: CGFloat = 92

    private var todos: [PuntoDeSerie] { puntos + (proyeccion ?? []) }

    var body: some View {
        let hecho = puntos.compactMap { p -> (Date, Double, Bool)? in
            guard let v = p.v, let f = AnaliticasFechas.fecha(p.t) else { return nil }
            return (f, v, p.t == puntos.last?.t)
        }
        let previsto = (proyeccion ?? []).compactMap { p -> (Date, Double)? in
            guard let v = p.v, let f = AnaliticasFechas.fecha(p.t) else { return nil }
            return (f, v)
        }
        let fechas = todos.map(\.t).sorted()
        if fechas.count >= 2, let t0 = AnaliticasFechas.fecha(fechas[0]), let t1 = AnaliticasFechas.fecha(fechas[fechas.count - 1]) {
            let lim = max(10, (hecho.map { abs($0.1) } + previsto.map { abs($0.1) }).max() ?? 10)
            let escala = AnaliticasEscala.bonita(-lim, lim, n: 3)
            Chart {
                ForEach(Array(hecho.enumerated()), id: \.offset) { _, p in
                    BarMark(x: .value("día", p.0, unit: .day), y: .value("frescura", p.1))
                        .foregroundStyle(p.2 ? C.tinta : C.tinta2.opacity(0.55))
                }
                ForEach(Array(previsto.enumerated()), id: \.offset) { _, p in
                    RuleMark(x: .value("día", p.0), yStart: .value("cero", 0), yEnd: .value("frescura prevista", p.1))
                        .foregroundStyle(C.proyeccion.opacity(0.8))
                        .lineStyle(StrokeStyle(lineWidth: 1))
                }
                RuleMark(y: .value("cero", 0)).foregroundStyle(C.tinta2).lineStyle(StrokeStyle(lineWidth: Trazo.rejilla))
                ForEach(marcas) { m in
                    if let fecha = AnaliticasFechas.fecha(m.t) {
                        RuleMark(x: .value("marca", fecha))
                            .foregroundStyle(m.tipo == .evento ? C.tinta : C.tinta2)
                            .lineStyle(StrokeStyle(lineWidth: m.tipo == .evento ? Trazo.contorno : Trazo.rejilla, dash: m.tipo == .hoy ? Trazo.hoyDiscontinuo : []))
                    }
                }
            }
            .chartXScale(domain: t0...t1)
            .chartYScale(domain: escala.min...escala.max)
            .chartXAxis(.hidden)
            .chartLegend(.hidden)
            .chartYAxis {
                AxisMarks(position: .leading, values: escala.ticks) { value in
                    AxisGridLine(stroke: StrokeStyle(lineWidth: Trazo.rejilla)).foregroundStyle(C.rejilla)
                    AxisValueLabel(horizontalSpacing: 6) {
                        if let v = value.as(Double.self) {
                            Text(formato(v)).font(AnaliticasTokens.fuenteEje).foregroundStyle(C.tinta2)
                        }
                    }
                }
            }
            .frame(height: alto)
            .accessibilityLabel("Frescura día a día")
        }
    }
}
