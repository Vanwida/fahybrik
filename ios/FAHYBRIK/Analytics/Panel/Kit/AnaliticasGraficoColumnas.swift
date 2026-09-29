import SwiftUI
import Charts

// COLUMNAS — por semana: el plan en CONTORNO frente a lo hecho en RELLENO,
// apilado por familia o por zona (espejo de `kit-analiticas/graficos.tsx#Columnas`).
// Swift Charts pinta las barras; el contorno del plan se dibuja encima con las
// posiciones REALES del gráfico (`ChartProxy`), nunca a ojo. El cubo en curso
// lleva el contorno discontinuo. Un cubo sin plan no lleva contorno; sin hecho,
// no lleva barra: los huecos son huecos.

private typealias Trazo = Theme.Chart

struct ParteDeCubo: Identifiable {
    let code: String
    let etiqueta: String
    let valor: Double
    let color: Color
    var id: String { code }
}

struct CuboDeColumna: Identifiable {
    /// El lunes (o el primer día) del cubo, ISO.
    let t: String
    /// El plan del cubo, en la unidad del eje. Nulo = sin plan.
    let plan: Double?
    /// Lo hecho, por partes apiladas (familias o zonas), en orden de apilado.
    let partes: [ParteDeCubo]
    /// True si el cubo es el actual (en curso).
    var enCurso = false
    var id: String { t }

    var total: Double { partes.reduce(0) { $0 + $1.valor } }
}

/// Una parte ya colocada en su pila.
private struct Tramo: Identifiable {
    let cubo: String
    let parte: ParteDeCubo
    let desde: Double
    let hasta: Double
    let ultima: Bool
    var id: String { "\(cubo)/\(parte.code)" }
}

struct AnaliticasGraficoColumnas: View {
    let cubos: [CuboDeColumna]
    /// Las partes (familias o zonas) para la leyenda, en orden de apilado.
    let leyenda: [ItemDeLeyenda]
    let formatoY: (Double) -> String
    var etiquetaPlan = "Plan"
    var alto: CGFloat = 200
    /// La escala se hace «bonita» en la unidad dividida (3600 para horas desde
    /// segundos): marcas a 0, 3, 6, 9 h y no a 2,78 h.
    var divisor: Double = 1
    /// Cuántos días cubre cada cubo (7 por semana; 28 si agrupa de cuatro en cuatro).
    var diasPorCubo: Int = 7

    private var hayPlan: Bool { cubos.contains { ($0.plan ?? 0) > 0 } }

    private var escala: EscalaEje {
        let maximo = max(cubos.map(\.total).max() ?? 0, cubos.compactMap(\.plan).max() ?? 0, divisor)
        let bonita = AnaliticasEscala.bonita(0, maximo / divisor, n: 4, desdeCero: true)
        return EscalaEje(min: bonita.min * divisor, max: bonita.max * divisor, ticks: bonita.ticks.map { $0 * divisor })
    }

    /// El centro de un cubo en el eje de fechas.
    private func centro(_ t: String) -> Date? {
        AnaliticasFechas.fecha(t).map { $0.addingTimeInterval(Double(diasPorCubo) * 86_400 / 2) }
    }

    var body: some View {
        if !cubos.isEmpty, let t0 = AnaliticasFechas.fecha(cubos[0].t), let t1 = AnaliticasFechas.fecha(cubos[cubos.count - 1].t) {
            VStack(alignment: .leading, spacing: 8) {
                AnaliticasLeyenda(items: (hayPlan ? [ItemDeLeyenda(etiqueta: etiquetaPlan, muestra: .contorno, color: Theme.Color.muted)] : []) + leyenda)
                GeometryReader { geo in
                    let ancho = max(1, geo.size.width - 52)
                    let ranura = ancho / CGFloat(cubos.count)
                    let anchoBarra = min(24, max(4, ranura * 0.62))
                    grafico(t0: t0, t1: t1.addingTimeInterval(Double(diasPorCubo) * 86_400), anchoBarra: anchoBarra, rotulos: rotulos(ancho: ancho))
                }
                .frame(height: alto)
            }
        }
    }

    private func rotulos(ancho: CGFloat) -> [RotuloDeEje] {
        let base = rotulosDeEje(cubos.map(\.t), ancho: ancho)
        // Los rótulos se centran en la barra, no en el lunes.
        return base.map { RotuloDeEje(fecha: $0.fecha.addingTimeInterval(Double(diasPorCubo) * 86_400 / 2), texto: $0.texto, anclaje: $0.anclaje) }
    }

    private var tramos: [Tramo] {
        cubos.flatMap { c -> [Tramo] in
            var acumulado = 0.0
            let visibles = c.partes.filter { $0.valor > 0 }
            return visibles.enumerated().map { i, p in
                let t = Tramo(cubo: c.t, parte: p, desde: acumulado, hasta: acumulado + p.valor, ultima: i == visibles.count - 1)
                acumulado += p.valor
                return t
            }
        }
    }

    private func grafico(t0: Date, t1: Date, anchoBarra: CGFloat, rotulos: [RotuloDeEje]) -> some View {
        let escala = escala
        return Chart {
            ForEach(tramos) { t in
                if let x = centro(t.cubo) {
                    BarMark(x: .value("semana", x), yStart: .value("de", t.desde), yEnd: .value("a", t.hasta), width: .fixed(anchoBarra))
                        .foregroundStyle(t.parte.color)
                        .cornerRadius(t.ultima ? 4 : 0)
                }
            }
        }
        .chartXScale(domain: t0...t1)
        .chartYScale(domain: escala.min...escala.max)
        .chartLegend(.hidden)
        .chartYAxis { ejeYDeAnaliticas(ticks: escala.ticks, formato: formatoY) }
        .chartXAxis {
            AxisMarks(values: rotulos.map(\.fecha)) { value in
                if let d = value.as(Date.self), let r = rotulos.first(where: { abs($0.fecha.timeIntervalSince(d)) < 3600 }) {
                    AxisValueLabel(anchor: r.anclaje, verticalSpacing: 6) { TextoDeEje(texto: r.texto) }
                }
            }
        }
        // EL CONTORNO DEL PLAN, con las posiciones reales del gráfico: dos puntos más ancho que la barra y
        // redondeado; discontinuo en el cubo en curso. `ChartProxy` da posiciones RELATIVAS AL ÁREA DE TRAZADO,
        // no al gráfico entero (que incluye el eje Y): sin sumar el origen del área el contorno se corría
        // un eje a la izquierda de su barra.
        .chartOverlay { proxy in
            GeometryReader { geo in
                if let marco = proxy.plotFrame {
                    let origen = geo[marco].origin
                    Canvas { ctx, _ in
                        guard let y0 = proxy.position(forY: 0.0) else { return }
                        for c in cubos {
                            guard let plan = c.plan, plan > 0, let x = centro(c.t), let px = proxy.position(forX: x), let py = proxy.position(forY: plan) else { continue }
                            let rect = CGRect(x: origen.x + px - anchoBarra / 2 - 2, y: origen.y + py, width: anchoBarra + 4, height: max(0, y0 - py))
                            let path = Path(roundedRect: rect, cornerRadius: 4)
                            ctx.stroke(path, with: .color(Theme.Color.muted), style: StrokeStyle(lineWidth: Trazo.contorno, dash: c.enCurso ? [3, 3] : []))
                        }
                    }
                    .allowsHitTesting(false)
                }
            }
        }
        .accessibilityLabel("\(cubos.count) periodos, \(hayPlan ? "plan frente a hecho" : "hecho")")
    }
}
