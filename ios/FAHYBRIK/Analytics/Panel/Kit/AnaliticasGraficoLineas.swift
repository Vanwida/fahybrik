import SwiftUI
import Charts

// LÍNEAS Y DIVERGENTE — forma/fatiga con la proyección discontinua hasta la
// carrera, y la frescura en barras alrededor de cero (espejo de
// `kit-analiticas/graficos.tsx#Lineas` y `#Divergente`), con Swift Charts a
// escala REAL y ejes de verdad (fuera las series 0..1, P21).
//
// LO QUE CUMPLEN (skill dataviz + CONTRATO-UI §4):
//   · El texto del gráfico (ejes, leyenda, rótulos) va en el gris de apoyo, NUNCA
//     en el color de la serie. Cuerpo: `.papel(.notaFuerte)` (15 pt, el suelo, y
//     escala con el texto del sistema).
//   · Los trazos que portan significado, a ≥ 3:1 sobre la tarjeta en claro y en
//     oscuro (`AnaliticasPielTests` lo mide); el tema decide, ninguna serie lleva un hex.
//   · Rejilla y ejes: una línea fina, SÓLIDA. El trazo discontinuo se reserva a
//     la proyección; el punteado corto, a la marca de «hoy».
//   · Un dato a nulo es un HUECO: la línea se corta (cada tramo es una serie de
//     Charts distinta), la barra no se pinta. Nunca se interpola.
//   · Rótulo directo SOLO en el último punto de la serie que manda, con halo.
//   · Leyenda siempre que haya ≥ 2 series.
//
// LOS RÓTULOS NO CHOCAN CON LOS DATOS. Las marcas verticales («hoy», la carrera)
// se rotulan en una franja PROPIA fuera del rango de los datos (la carrera arriba,
// «hoy» abajo): la escala reserva ese aire con `plotDimension`, así que ninguna
// serie puede pasar por debajo de un rótulo, y cada rótulo se acota al gráfico.
// El valor del último punto se pone del lado contrario a la otra serie.

private typealias Trazo = Theme.Chart

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

/// El texto de un eje o de una leyenda: el suelo de 15 pt, en el gris de apoyo, con cifras tabulares.
struct TextoDeEje: View {
    let texto: String
    var tono: Color = Theme.Color.muted
    var body: some View {
        Text(texto).monospacedDigit().papel(.notaFuerte).foregroundStyle(tono).fixedSize()
    }
}

/// Qué fechas rotular en X y con qué anclaje (la primera al inicio, la última al final).
struct RotuloDeEje: Identifiable {
    let fecha: Date
    let texto: String
    let anclaje: UnitPoint
    var id: Date { fecha }
}

func rotulosDeEje(_ fechas: [String], ancho: CGFloat) -> [RotuloDeEje] {
    let rotulos = AnaliticasEscala.rotulosX(fechas, ancho: ancho, cuerpo: Theme.Typography.suelo)
    return rotulos.compactMap { r in
        guard let fecha = AnaliticasFechas.fecha(fechas[r.i]) else { return nil }
        let anclaje: UnitPoint = r.i == 0 ? .topLeading : r.i == fechas.count - 1 ? .topTrailing : .top
        return RotuloDeEje(fecha: fecha, texto: r.texto, anclaje: anclaje)
    }
}

/// El eje Y de una gráfica: rejilla fina y sólida y el rótulo de cada marca en el gris de apoyo.
func ejeYDeAnaliticas(ticks: [Double], formato: @escaping (Double) -> String, tono: Color = Theme.Color.muted) -> some AxisContent {
    AxisMarks(position: .leading, values: ticks) { value in
        AxisGridLine(stroke: StrokeStyle(lineWidth: Theme.Chart.rejilla)).foregroundStyle(Theme.Color.hairlineStrong)
        AxisValueLabel(horizontalSpacing: 6) {
            if let v = value.as(Double.self) { TextoDeEje(texto: formato(v), tono: tono) }
        }
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
    /// «Lo bueno arriba» para ritmos y tiempos: el número menor queda arriba (un ritmo que baja es un ritmo que mejora).
    var invertido = false
    /// El eje es un tiempo (un ritmo, un split, un tiempo de carrera): marcas a 15 s, 30 s, 1 min… y no a 2:30 · 3:20 · 4:10.
    var escalaTiempo = false

    /// El aire que se reserva sobre el rango de los datos para rotular la carrera (arriba) y «hoy» (abajo).
    private static let franjaSuperior: CGFloat = 26
    private static let franjaInferior: CGFloat = 26

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
        return AnaliticasEscala.bonita(vals.min() ?? 0, vals.max() ?? 1, n: 4, desdeCero: desdeCero, pasos: escalaTiempo ? AnaliticasEscala.pasosTiempo : nil)
    }

    /// Lo que se le da a Charts: con la escala invertida el eje es el mismo y el número, su negativo (los rótulos
    /// deshacen el signo). Así el menor va arriba sin escribir un segundo gráfico.
    private func plano(_ v: Double) -> Double { invertido ? -v : v }

    private var hayProyeccion: Bool { series.contains { !($0.proyeccion ?? []).isEmpty } }
    private var hayEvento: Bool { marcas.contains { $0.tipo == .evento } }
    private var hayHoy: Bool { marcas.contains { $0.tipo == .hoy } }

    var body: some View {
        let fechas = fechas
        if fechas.count >= 2, let t0 = AnaliticasFechas.fecha(fechas[0]), let t1 = AnaliticasFechas.fecha(fechas[fechas.count - 1]) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                if leyenda, series.count + (hayProyeccion ? 1 : 0) >= 2 {
                    AnaliticasLeyenda(items: series.map { ItemDeLeyenda(etiqueta: $0.etiqueta, muestra: .linea, color: $0.color) }
                        + (hayProyeccion ? [ItemDeLeyenda(etiqueta: "Proyección", muestra: .lineaDiscontinua, color: Theme.Color.muted)] : []))
                }
                GeometryReader { geo in
                    grafico(t0: t0, t1: t1, rotulos: rotulosDeEje(fechas, ancho: max(1, geo.size.width - 52)))
                }
                .frame(height: alto + (hayEvento ? Self.franjaSuperior : 0) + (hayHoy ? Self.franjaInferior : 0))
            }
        }
    }

    /// El valor del último punto de una serie del lado contrario a la otra (encima si ella va por encima).
    private func lado(de s: SerieDeLinea, ultimo: PuntoDibujable) -> AnnotationPosition {
        let otras = series.filter { $0.id != s.id }.compactMap { o -> Double? in
            o.puntos.first { $0.t == AnaliticasFechas.iso(ultimo.fecha) }?.v
        }
        guard let otra = otras.first else { return .top }
        return ultimo.v >= otra ? .top : .bottom
    }

    private func grafico(t0: Date, t1: Date, rotulos: [RotuloDeEje]) -> some View {
        let escala = escala
        let arriba = hayEvento ? Self.franjaSuperior : 0
        let abajo = hayHoy ? Self.franjaInferior : 0
        return Chart {
            // Las marcas van PRIMERO: la línea y el valor del último punto se dibujan por encima, y ninguna
            // marca cruza un número. Cada una llega hasta donde llegan los datos: su rótulo vive en la
            // franja de fuera (la carrera arriba, «hoy» abajo), donde no hay serie ni línea que lo cruce.
            ForEach(marcas) { m in
                if let fecha = AnaliticasFechas.fecha(m.t) {
                    RuleMark(x: .value("marca", fecha), yStart: .value("mínimo", plano(escala.min)), yEnd: .value("máximo", plano(escala.max)))
                        .foregroundStyle(m.tipo == .evento ? Theme.Color.foreground : Theme.Color.muted)
                        .lineStyle(StrokeStyle(lineWidth: m.tipo == .evento ? Trazo.contorno : Trazo.rejilla, dash: m.tipo == .hoy ? Trazo.hoyDiscontinuo : []))
                        .annotation(position: m.tipo == .hoy ? .bottom : .top, alignment: .center, spacing: 4,
                                    overflowResolution: .init(x: .fit(to: .plot), y: .disabled)) {
                            TextoDeEje(texto: m.etiqueta, tono: m.tipo == .evento ? Theme.Color.foreground : Theme.Color.muted)
                        }
                }
            }
            ForEach(series) { s in
                let hecho = tramos(s.puntos, serie: s.id)
                ForEach(hecho) { p in
                    LineMark(x: .value("día", p.fecha), y: .value(s.etiqueta, plano(p.v)), series: .value("serie", p.serie))
                        .foregroundStyle(s.color)
                        .lineStyle(StrokeStyle(lineWidth: Trazo.linea, lineCap: .round, lineJoin: .round))
                        .interpolationMethod(.linear)
                }
                if let proyeccion = s.proyeccion, !proyeccion.isEmpty, let ultimo = s.puntos.last(where: { $0.v != nil }) {
                    ForEach(tramos([ultimo] + proyeccion, serie: "\(s.id)~proy")) { p in
                        LineMark(x: .value("día", p.fecha), y: .value(s.etiqueta, plano(p.v)), series: .value("serie", p.serie))
                            .foregroundStyle(s.color)
                            .lineStyle(StrokeStyle(lineWidth: Trazo.linea, lineCap: .round, lineJoin: .round, dash: Trazo.discontinuo))
                            .interpolationMethod(.linear)
                    }
                }
                if let ultimo = hecho.last {
                    PointMark(x: .value("día", ultimo.fecha), y: .value(s.etiqueta, plano(ultimo.v)))
                        .symbolSize(140)
                        .foregroundStyle(Theme.Color.surface)
                    PointMark(x: .value("día", ultimo.fecha), y: .value(s.etiqueta, plano(ultimo.v)))
                        .symbolSize(64)
                        .foregroundStyle(s.color)
                        .annotation(position: lado(de: s, ultimo: ultimo), spacing: 6, overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))) {
                            if s.rotuloFinal {
                                // El halo es la tarjeta misma: la línea que pase por debajo no cruza el número.
                                TextoDeEje(texto: formatoY(ultimo.v), tono: Theme.Color.foreground)
                                    .padding(.horizontal, 4)
                                    .background(Theme.Color.surface.opacity(0.9), in: RoundedRectangle(cornerRadius: 4))
                            }
                        }
                }
            }
        }
        .chartXScale(domain: t0...t1)
        .chartYScale(domain: plano(invertido ? escala.max : escala.min)...plano(invertido ? escala.min : escala.max), range: .plotDimension(startPadding: abajo, endPadding: arriba))
        .chartLegend(.hidden)
        .chartYAxis { ejeYDeAnaliticas(ticks: escala.ticks.map(plano), formato: { formatoY(plano($0)) }) }
        .chartXAxis {
            AxisMarks(values: rotulos.map(\.fecha)) { value in
                if let d = value.as(Date.self), let r = rotulos.first(where: { abs($0.fecha.timeIntervalSince(d)) < 3600 }) {
                    AxisValueLabel(anchor: r.anclaje, verticalSpacing: 6) { TextoDeEje(texto: r.texto) }
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
            // El gris de apoyo un paso más fuerte: las barras pasadas van atenuadas y con el gris del tema
            // quedaban en 2,65:1; con este pasan de 3:1 en claro y en oscuro.
            let apoyo = Theme.Color.apoyoFuerte
            Chart {
                ForEach(Array(hecho.enumerated()), id: \.offset) { _, p in
                    BarMark(x: .value("día", p.0, unit: .day), y: .value("frescura", p.1))
                        .foregroundStyle(p.2 ? Theme.Color.foreground : apoyo.opacity(0.55))
                }
                ForEach(Array(previsto.enumerated()), id: \.offset) { _, p in
                    RuleMark(x: .value("día", p.0), yStart: .value("cero", 0), yEnd: .value("frescura prevista", p.1))
                        .foregroundStyle(apoyo.opacity(0.8))
                        .lineStyle(StrokeStyle(lineWidth: 1))
                }
                RuleMark(y: .value("cero", 0)).foregroundStyle(apoyo).lineStyle(StrokeStyle(lineWidth: Trazo.rejilla))
                ForEach(marcas) { m in
                    if let fecha = AnaliticasFechas.fecha(m.t) {
                        RuleMark(x: .value("marca", fecha))
                            .foregroundStyle(m.tipo == .evento ? Theme.Color.foreground : Theme.Color.muted)
                            .lineStyle(StrokeStyle(lineWidth: m.tipo == .evento ? Trazo.contorno : Trazo.rejilla, dash: m.tipo == .hoy ? Trazo.hoyDiscontinuo : []))
                    }
                }
            }
            .chartXScale(domain: t0...t1)
            .chartYScale(domain: escala.min...escala.max)
            .chartXAxis(.hidden)
            .chartLegend(.hidden)
            .chartYAxis { ejeYDeAnaliticas(ticks: escala.ticks, formato: formato, tono: apoyo) }
            .frame(height: alto)
            .accessibilityLabel("Frescura día a día")
        }
    }
}
