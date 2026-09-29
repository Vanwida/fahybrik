import SwiftUI
import Charts

// LOS GRÁFICOS DE UN DETALLE — lo que la portada no dibuja: la curva de mejores esfuerzos (eje de distancia logarítmico, con el
// periodo anterior detrás), la curva de una sesión (el eje X es el TIEMPO de la sesión, no una fecha) y las barras de una cantidad
// por fila (los kilómetros de una carrera). Espejo de `web/components/v2/analiticas/graficos/{mejores,tiempo,barras}.tsx`, en Swift
// Charts a escala real, con la misma piel que el resto de la pestaña: texto de ejes en el gris de apoyo a 15 pt (nunca en el color
// de la serie), una rejilla fina y sólida, el trazo discontinuo solo para «lo de antes», y un hueco (nulo) que corta la línea.

private typealias Trazo = Theme.Chart

// MARK: - La curva de mejores esfuerzos

struct PuntoDeCurva: Identifiable, Equatable {
    let metros: Double
    /// Segundos por kilómetro.
    let ritmo: Double
    var id: Double { metros }
}

/// El ritmo de cada esfuerzo por su distancia, con el periodo anterior en trazo discontinuo y el hueco entre las dos curvas —lo que
/// se ha mejorado— sombreado. «Arriba es mejor»: el ritmo menor va arriba. El eje X es logarítmico porque 400 m y 21 km no caben
/// en una escala lineal.
struct AnaliticasCurvaMejores: View {
    let hoy: [PuntoDeCurva]
    let antes: [PuntoDeCurva]
    var alto: CGFloat = 190
    /// Las distancias con marca en el eje, si caben en el rango de los datos.
    var marcas: [Double] = [400, 1000, 5000, 10000]

    private var hayAntes: Bool { antes.count > 1 }

    var body: some View {
        if hoy.count >= 2 {
            let todos = hoy + antes
            let ritmos = todos.map(\.ritmo)
            let escala = AnaliticasEscala.bonita((ritmos.min() ?? 0) - 5, (ritmos.max() ?? 1) + 5, n: 4, pasos: AnaliticasEscala.pasosTiempo)
            let metros = todos.map(\.metros)
            let lo = metros.min() ?? 1, hi = max(metros.max() ?? 2, (metros.min() ?? 1) * 1.01)
            let visibles = marcas.filter { $0 >= lo && $0 <= hi }
            VStack(alignment: .leading, spacing: 8) {
                if hayAntes {
                    AnaliticasLeyenda(items: [
                        ItemDeLeyenda(etiqueta: "Esta ventana", muestra: .linea, color: Theme.Color.foreground),
                        ItemDeLeyenda(etiqueta: "Periodo anterior", muestra: .lineaDiscontinua, color: Theme.Color.muted),
                    ])
                }
                Chart {
                    if hayAntes {
                        ForEach(hoy.filter { p in antes.contains { $0.metros == p.metros } }) { p in
                            if let a = antes.first(where: { $0.metros == p.metros }) {
                                AreaMark(x: .value("distancia", p.metros), yStart: .value("antes", -a.ritmo), yEnd: .value("ahora", -p.ritmo))
                                    .foregroundStyle(Theme.Color.foreground.opacity(0.08))
                            }
                        }
                        ForEach(antes) { p in
                            LineMark(x: .value("distancia", p.metros), y: .value("ritmo", -p.ritmo), series: .value("curva", "antes"))
                                .foregroundStyle(Theme.Color.muted)
                                .lineStyle(StrokeStyle(lineWidth: Trazo.linea, lineCap: .round, lineJoin: .round, dash: Trazo.discontinuo))
                        }
                    }
                    ForEach(hoy) { p in
                        LineMark(x: .value("distancia", p.metros), y: .value("ritmo", -p.ritmo), series: .value("curva", "hoy"))
                            .foregroundStyle(Theme.Color.foreground)
                            .lineStyle(StrokeStyle(lineWidth: Trazo.linea, lineCap: .round, lineJoin: .round))
                        PointMark(x: .value("distancia", p.metros), y: .value("ritmo", -p.ritmo)).symbolSize(120).foregroundStyle(Theme.Color.surface)
                        PointMark(x: .value("distancia", p.metros), y: .value("ritmo", -p.ritmo)).symbolSize(48).foregroundStyle(Theme.Color.foreground)
                    }
                }
                .chartXScale(domain: lo...hi, type: .log)
                .chartYScale(domain: -escala.max...(-escala.min))
                .chartLegend(.hidden)
                .chartYAxis { ejeYDeAnaliticas(ticks: escala.ticks.map { -$0 }, formato: { Formato.clock(-$0) }) }
                .chartXAxis {
                    AxisMarks(values: visibles) { value in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: Trazo.rejilla)).foregroundStyle(Theme.Color.hairlineStrong)
                        if let m = value.as(Double.self) {
                            AxisValueLabel(anchor: Self.ancla(de: m, entre: visibles, en: lo...hi), verticalSpacing: 6) {
                                TextoDeEje(texto: Self.nombre(m))
                            }
                        }
                    }
                }
                .frame(height: alto)
                .accessibilityLabel("Mejores esfuerzos por distancia")
                .accessibilityValue(hoy.map { "\(Self.nombre($0.metros)) a \(Formato.clock($0.ritmo)) por kilómetro" }.joined(separator: ", "))
            }
        }
    }

    /// Dónde se ancla el rótulo de una marca: el primero crece hacia la derecha, el último hacia la izquierda y, si la penúltima está
    /// a menos de un tercio del eje de la última (en escala logarítmica), también hacia la izquierda: centrados no caben.
    static func ancla(de marca: Double, entre marcas: [Double], en rango: ClosedRange<Double>) -> UnitPoint {
        guard let primera = marcas.first, let ultima = marcas.last else { return .top }
        if marca == primera { return .topLeading }
        if marca == ultima { return .topTrailing }
        let ancho = log(rango.upperBound / rango.lowerBound)
        guard marcas.count > 2, marca == marcas[marcas.count - 2], ancho > 0 else { return .top }
        return log(ultima / marca) / ancho < separacionMinimaEntreRotulos ? .topTrailing : .top
    }

    /// Cuánto del eje (0…1) necesitan dos rótulos de distancia centrados para no pisarse a 15 pt en una tarjeta de teléfono.
    private static let separacionMinimaEntreRotulos = 0.33

    /// «400 m» · «1 km».
    static func nombre(_ metros: Double) -> String { metros >= 1000 ? "\(Formato.esDecimal(metros / 1000)) km" : "\(Int(metros)) m" }
}

// MARK: - La curva de una sesión

/// Una curva a lo largo del TIEMPO de la sesión (el ritmo, el pulso). Tocar o arrastrar enseña el instante y su valor.
struct AnaliticasLineaTiempo: View {
    /// Para VoiceOver: «Pulso a lo largo de la sesión».
    let etiqueta: String
    let puntos: [PuntoDeTiempo]
    /// Cuánto dura la sesión, en segundos: el eje X.
    let duracion: Double
    let formato: (Double) -> String
    /// Cómo se rotula el eje Y, si ha de ser más corto que el valor con su unidad («5:20», no «5:20/km»): con la unidad, el rótulo se
    /// come el ancho de la gráfica y los del eje X se pisan. La unidad sigue en lo que se lee al tocar.
    var formatoDeEje: ((Double) -> String)? = nil
    /// «Lo bueno arriba»: un ritmo o un split, con el menor arriba.
    var invertido = false
    var color: Color = Theme.Color.foreground
    var alto: CGFloat = 170

    @State private var seleccion: Double?

    private func plano(_ v: Double) -> Double { invertido ? -v : v }

    private var elegido: PuntoDeTiempo? {
        guard let seleccion else { return nil }
        return puntos.min { abs($0.t - seleccion) < abs($1.t - seleccion) }
    }

    var body: some View {
        if puntos.count >= 2, duracion > 0 {
            let vals = puntos.map(\.v)
            let escala = AnaliticasEscala.bonita(vals.min() ?? 0, vals.max() ?? 1, n: 4, pasos: invertido ? AnaliticasEscala.pasosTiempo : nil)
            let marcas = AnaliticasEscala.marcasDeTiempo(duracion)
            Chart {
                ForEach(Array(puntos.enumerated()), id: \.offset) { _, p in
                    LineMark(x: .value("tiempo", min(p.t, duracion)), y: .value(etiqueta, plano(p.v)))
                        .foregroundStyle(color)
                        .lineStyle(StrokeStyle(lineWidth: Trazo.linea, lineCap: .round, lineJoin: .round))
                        .interpolationMethod(.linear)
                }
                if let e = elegido {
                    RuleMark(x: .value("tiempo", e.t)).foregroundStyle(Theme.Color.muted).lineStyle(StrokeStyle(lineWidth: Trazo.rejilla))
                        .annotation(position: .top, spacing: 4, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                            TextoDeEje(texto: "\(Formato.clock(e.t)) · \(formato(e.v))", tono: Theme.Color.foreground)
                                .padding(.horizontal, 6).padding(.vertical, 3)
                                .background(Theme.Color.surface, in: RoundedRectangle(cornerRadius: 6))
                        }
                    PointMark(x: .value("tiempo", e.t), y: .value(etiqueta, plano(e.v))).symbolSize(70).foregroundStyle(color)
                }
            }
            .chartXScale(domain: 0...duracion)
            .chartYScale(domain: plano(invertido ? escala.max : escala.min)...plano(invertido ? escala.min : escala.max))
            .chartXSelection(value: $seleccion)
            .chartLegend(.hidden)
            .chartYAxis { ejeYDeAnaliticas(ticks: escala.ticks.map(plano), formato: { (formatoDeEje ?? formato)(plano($0)) }) }
            .chartXAxis {
                AxisMarks(values: marcas) { value in
                    if let t = value.as(Double.self) {
                        AxisValueLabel(anchor: t == marcas.first ? .topLeading : t == marcas.last ? .topTrailing : .top, verticalSpacing: 6) {
                            TextoDeEje(texto: Formato.clock(t))
                        }
                    }
                }
            }
            .frame(height: alto)
            .accessibilityLabel(etiqueta)
            .accessibilityValue("De \(formato(vals.min() ?? 0)) a \(formato(vals.max() ?? 0))")
        }
    }
}

// MARK: - Una cantidad por fila

struct FilaDeBarra: Identifiable, Equatable {
    let id: String
    let etiqueta: String
    let valor: Double
    /// El más rápido o el más lento: va en tinta; los demás, atenuados.
    var destacada = true
}

/// Una cantidad por fila, desde cero, con el valor al final: los kilómetros de una carrera.
struct AnaliticasBarrasSimples: View {
    let filas: [FilaDeBarra]
    let formato: (Double) -> String
    var altoFila: CGFloat = 30

    /// Lo que se reserva a los lados de la barra (la etiqueta y el valor): escala con el texto del sistema, como ellos.
    @ScaledMetric(relativeTo: .footnote) private var anchoDeEtiqueta: CGFloat = 62
    @ScaledMetric(relativeTo: .footnote) private var anchoDeValor: CGFloat = 54

    var body: some View {
        let maximo = max(filas.map(\.valor).max() ?? 1, 1)
        VStack(spacing: 0) {
            ForEach(filas) { f in
                HStack(spacing: Theme.Spacing.s) {
                    Text(f.etiqueta).monospacedDigit().papel(.notaFuerte).foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1).frame(width: anchoDeEtiqueta, alignment: .leading)
                    GeometryReader { geo in
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Theme.Color.foreground.opacity(f.destacada ? 1 : 0.5))
                            .frame(width: max(2, geo.size.width * CGFloat(f.valor / maximo)), height: 14)
                            .frame(maxHeight: .infinity, alignment: .center)
                    }
                    Text(formato(f.valor)).monospacedDigit().papel(.notaFuerte)
                        .foregroundStyle(f.destacada ? Theme.Color.foreground : Theme.Color.muted)
                        .lineLimit(1).frame(width: anchoDeValor, alignment: .trailing)
                }
                .frame(height: altoFila)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(f.etiqueta): \(formato(f.valor))")
            }
        }
    }
}
