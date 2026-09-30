import SwiftUI

// EL DETALLE DE FUERZA, PINTADO — el «¿mejoro?» de la fuerza: el 1RM estimado por ejercicio con la fórmula de tu coach y su
// tendencia, lo más pesado que has movido para cada número de repeticiones, el tonelaje y las series de cada semana, el reparto por
// patrón de movimiento y si clavas el RIR que te piden.
//
// El 1RM «estimado» es del servidor con la fórmula del coach (Epley o Brzycki): esta pantalla no lo calcula ni lo recalcula por reps.

struct AnaliticasCuerpoDeFuerza: View {
    let lectura: LecturaDeFuerza
    let rir: LoQueTePiden
    /// La holgura del coach para el RIR, en repeticiones: la nota de «el RIR que te piden».
    var holguraRir: Double? = nil
    let ancho: CGFloat
    /// El ejercicio de la tabla por repeticiones al abrir; sin él, el primero que la tenga.
    var ejercicioInicial: String? = nil

    @State private var elegido: String?

    private var hoy: String { lectura.hoy }
    private var conTabla: [EjercicioDeFuerza] { lectura.ejercicios.filter { !$0.porReps.isEmpty } }
    private var ejercicioDeLaTabla: EjercicioDeFuerza? {
        conTabla.first { $0.id == (elegido ?? ejercicioInicial) } ?? conTabla.first
    }

    var body: some View {
        if lectura.estado != .vacio {
            ejercicios
            porRepeticiones
            tonelaje
            patrones
            loQueTePiden
        }
    }

    // MARK: 1RM estimado

    @ViewBuilder
    private var ejercicios: some View {
        if !lectura.ejercicios.isEmpty {
            AnaliticasSeccion(titulo: "1RM estimado", pregunta: "Por ejercicio · con la fórmula de tu coach") {
                ListaDia {
                    ForEach(lectura.ejercicios) { e in
                        AnaliticasFilaProgreso(
                            familia: .fuerza, metrica: e.metrica, valor: e.lectura.dato?.valor, unidad: e.lectura.dato?.unidad ?? .kg,
                            delta: AnaliticasDerivados.delta(de: e.lectura), tendencia: e.lectura.serie?.puntos,
                            nota: Self.notaDeComparacion(e.lectura), nombre: e.nombre,
                            onAbrir: e.porReps.isEmpty ? nil : { elegido = e.id }
                        )
                    }
                }
                AnaliticasNota(texto: "Estimado desde tu mejor serie hecha (kg × reps anotados en la sesión). Un 1RM real pesa más que una estimación: si haces un test, manda.")
            }
        }
    }

    /// Un número sin comparación dice por qué: aún no hay un periodo anterior con el que compararlo.
    static func notaDeComparacion(_ l: LecturaAnalitica) -> String? {
        guard l.estado == .medida, l.comparacion == nil, !l.esViejo else { return nil }
        switch l.cobertura.falta {
        case .historia?, .ocasion?: return "sin periodo anterior con el que comparar"
        default: return nil
        }
    }

    // MARK: Mejores por repeticiones

    @ViewBuilder
    private var porRepeticiones: some View {
        if let e = ejercicioDeLaTabla {
            AnaliticasSeccion(titulo: "Mejores por repeticiones", pregunta: e.nombre) {
                if conTabla.count > 1 {
                    SegmentoDia(items: conTabla.map { ($0.id, $0.nombre) }, valor: Binding(get: { e.id }, set: { elegido = $0 }), etiqueta: "Ejercicio")
                }
                AnaliticasTabla(
                    etiqueta: "Mejores por repeticiones · \(e.nombre)",
                    columnas: [ColumnaDeTabla(cabecera: "Repeticiones"), ColumnaDeTabla(cabecera: "Mejor", alinear: .trailing)],
                    filas: e.porReps
                ) { fila, columna in
                    if columna == 0 { Text(fila.etiqueta) } else { Text(AnaliticasFormato.formatear(fila.kg, .kg)) }
                }
                AnaliticasNota(texto: "Lo más pesado que has movido para cada número de repeticiones: una serie de 5 cuenta también para 3. Levantado, no estimado.")
            }
        }
    }

    // MARK: Tonelaje y series

    @ViewBuilder
    private var tonelaje: some View {
        if let t = lectura.tonelaje, t.estado == .medida, let d = t.dato {
            let cubos = cubosDeTonelaje(t)
            AnaliticasSeccion(titulo: "Tonelaje por semana", pregunta: "Σ reps × kg, semana a semana") {
                if !cubos.cubos.isEmpty {
                    AnaliticasSuperficie {
                        VStack(alignment: .leading, spacing: 8) {
                            AnaliticasGraficoColumnas(
                                cubos: cubos.cubos, leyenda: AnaliticasDerivados.leyenda(de: cubos.cubos),
                                formatoY: { "\(AnaliticasFormato.entero($0 / 1000)) t" }, divisor: 1000, diasPorCubo: 7 * cubos.agrupar
                            )
                            if cubos.agrupar > 1 { AnaliticasNota(texto: "Cada columna suma \(cubos.agrupar) semanas: a este ancho una por semana no se lee.") }
                        }
                    }
                }
                AnaliticasRejilla {
                    AnaliticasCelda(etiqueta: "Tonelaje", valor: d.valor, unidad: d.unidad, delta: AnaliticasDerivados.delta(de: t), nota: "en la ventana")
                    if let s = lectura.series, s.estado == .medida, let ds = s.dato {
                        AnaliticasCelda(etiqueta: "Series", valor: ds.valor, unidad: ds.unidad, delta: AnaliticasDerivados.delta(de: s), nota: "de trabajo")
                    }
                }
                AnaliticasNota(texto: t.procedencia.explicaEs)
            }
        }
    }

    private func cubosDeTonelaje(_ t: LecturaAnalitica) -> (cubos: [CuboDeColumna], agrupar: Int) {
        guard let s = t.serie else { return ([], 1) }
        let agrupar = AnaliticasEscala.agrupacion(puntos: s.puntos.count, ancho: ancho - 60)
        return (AnaliticasDerivados.cubosDeSerie(s, color: Theme.Color.familiaFuerza, hoy: hoy, agrupar: agrupar), agrupar)
    }

    // MARK: Por patrón

    @ViewBuilder
    private var patrones: some View {
        if !lectura.patrones.isEmpty {
            AnaliticasSeccion(titulo: "Por patrón", pregunta: "Series y tonelaje de la ventana") {
                AnaliticasTabla(
                    etiqueta: "Series y tonelaje por patrón de movimiento",
                    columnas: [ColumnaDeTabla(cabecera: "Patrón"), ColumnaDeTabla(cabecera: "Series", alinear: .trailing), ColumnaDeTabla(cabecera: "Tonelaje", alinear: .trailing)],
                    filas: lectura.patrones
                ) { p, columna in
                    switch columna {
                    case 0: Text(p.nombre)
                    case 1: Text(Self.seriesConCambio(p))
                    default: Text(p.tonelajeKg.map { "\(AnaliticasFormato.conMillar($0)) kg" } ?? "sin kg").foregroundStyle(p.tonelajeKg == nil ? Theme.Color.muted : Theme.Color.foreground)
                    }
                }
                AnaliticasNota(texto: "Entre paréntesis, las series frente al periodo anterior. Los acarreos no suman tonelaje: se cuentan por series.")
            }
        }
    }

    /// «14 (+2)»: las series y, solo si cambiaron, cuánto contra el periodo anterior.
    static func seriesConCambio(_ p: PatronDeFuerza) -> String {
        let base = AnaliticasFormato.entero(p.series)
        guard let c = p.cambioDeSeries else { return base }
        return "\(base) (\(c > 0 ? "+" : "\u{2212}")\(abs(c)))"
    }

    // MARK: El RIR que te piden

    @ViewBuilder
    private var loQueTePiden: some View {
        switch rir {
        case .sinCargar:
            EmptyView()
        case .sinSeries:
            AnaliticasSeccion(titulo: "El RIR que te piden", pregunta: "Cada serie con RIR pedido, un punto") {
                AnaliticasNota(texto: "Todavía sin series con RIR pedido en esta ventana. Cuando tu coach te lo pida, aquí sale si vas al esfuerzo que toca.")
            }
        case .series(let p):
            AnaliticasSeccion(titulo: "El RIR que te piden", pregunta: "Cada serie con RIR pedido, un punto") {
                AnaliticasPuntosCumplimiento(pedido: p)
                AnaliticasNota(texto: notaDelRir(p))
            }
        }
    }

    private func notaDelRir(_ p: PedidoDeSeries) -> String {
        let holgura = holguraRir.map { "a ±\(Formato.esDecimal($0)) del RIR pedido" } ?? "en el RIR que pidió tu coach"
        return "\(p.series) \(p.series == 1 ? "serie" : "series") con RIR pedido · dentro = \(holgura) · «más de lo pedido» = te quedaste con menos reps en reserva (fuiste más duro)"
    }
}
