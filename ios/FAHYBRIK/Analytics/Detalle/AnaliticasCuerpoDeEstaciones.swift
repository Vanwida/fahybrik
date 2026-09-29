import SwiftUI

// EL DETALLE DE ESTACIONES Y WOD, PINTADO — el mejor tiempo de cada estación con su dosis y su carga, el historial de las
// simulaciones y de los WOD que se repiten, y el hueco por tramo de tu carrera entero (el bloque «Carrera» de la portada, con
// TODOS sus tramos). Una estación se compara consigo misma: la misma prueba, a la misma dosis y con la misma carga.

struct AnaliticasCuerpoDeEstaciones: View {
    let lectura: LecturaDeEstaciones
    /// El panel de la misma ventana: de él sale el hueco por tramo de la carrera. Nulo mientras no ha llegado (la sección no sale).
    let panel: PanelAnaliticas?
    /// Ancho útil del lienzo.
    let ancho: CGFloat
    let onSalida: (DestinoDeSalida) -> Void

    private var hoy: String { lectura.hoy }

    var body: some View {
        if lectura.estado != .vacio {
            mejores
            wods
            carrera
        }
    }

    // MARK: Mejor por estación

    @ViewBuilder
    private var mejores: some View {
        if !lectura.estaciones.isEmpty {
            AnaliticasSeccion(
                titulo: "Mejor por estación",
                pregunta: "\(lectura.estaciones.count) \(lectura.estaciones.count == 1 ? "estación con marca" : "estaciones con marca")"
            ) {
                AnaliticasTabla(
                    etiqueta: "Mejor por estación",
                    columnas: [
                        ColumnaDeTabla(cabecera: "Estación"),
                        ColumnaDeTabla(cabecera: "Mejor", alinear: .trailing, ancho: 96),
                        ColumnaDeTabla.cuando,
                    ],
                    filas: lectura.estaciones
                ) { e, columna in
                    switch columna {
                    case 0: AnaliticasCeldaDoble(principal: e.nombre, apoyo: e.detalle.isEmpty ? "sin carga" : e.detalle)
                    case 1:
                        AnaliticasCeldaDoble(
                            principal: Formato.clock(e.mejor),
                            apoyo: e.anterior.map { "\(AnaliticasFormato.formatearDelta(e.mejor - $0, .segundos)) vs antes" },
                            alinear: .trailing
                        )
                    default:
                        VStack(alignment: .trailing, spacing: 4) {
                            if e.nuevo { AnaliticasSello(texto: "Nuevo") }
                            if let d = e.cuando.texto(hoy: hoy) { AnaliticasEtiqueta(texto: d, tono: e.viejo ? Theme.Color.muted : Theme.Color.foreground) }
                        }
                    }
                }
                AnaliticasNota(texto: "Cada estación se compara con ella misma: la misma dosis y la misma carga. Las que aún no has hecho salen aquí en cuanto hagas la primera.")
            }
        }
    }

    // MARK: Simulaciones y WOD de referencia

    @ViewBuilder
    private var wods: some View {
        AnaliticasSeccion(
            titulo: "Simulaciones y WOD de referencia",
            pregunta: lectura.wods.isEmpty ? "Los WOD que tu coach repite para medirte" : "Su historial entero · arriba es mejor"
        ) {
            if lectura.wods.isEmpty {
                AnaliticasHueco(
                    texto: TextoHueco(
                        titulo: "Sin WOD de referencia",
                        cuerpo: "Cuando tu coach te ponga una simulación o un WOD de referencia, aquí se queda su historial: es la marca que más se parece a la carrera.",
                        salida: .espera("Lo pone tu coach en el plan"),
                        plazo: nil
                    ),
                    onSalida: onSalida
                )
            } else {
                ForEach(lectura.wods) { tarjeta($0) }
            }
        }
    }

    private func tarjeta(_ w: WodDeReferencia) -> some View {
        AnaliticasSuperficie {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 12) {
                    AnaliticasCuerpo(texto: w.nombre, fuerte: true).frame(maxWidth: .infinity, alignment: .leading)
                    if let u = w.ultimo {
                        VStack(alignment: .trailing, spacing: 2) {
                            AnaliticasNumeral(texto: AnaliticasFormato.formatear(u.valor, w.unidad), talla: .fila)
                            AnaliticasEtiqueta(texto: AnaliticasFormato.fechaLegible(u.dia, hoy: hoy))
                        }
                    }
                }
                if w.hayTendencia {
                    AnaliticasGraficoLineas(
                        series: [SerieDeLinea(id: w.id, etiqueta: w.nombre, puntos: w.serie, color: Theme.Color.familiaEstaciones, rotuloFinal: true)],
                        formatoY: { AnaliticasFormato.cifra($0, w.unidad) },
                        alto: 140, leyenda: false, invertido: w.menosEsMejor, escalaTiempo: w.unidad == .segundos
                    )
                } else {
                    AnaliticasNota(texto: "Una sola marca: con la segunda se dibuja la tendencia.")
                }
            }
        }
    }

    // MARK: El hueco por tramo de la carrera

    @ViewBuilder
    private var carrera: some View {
        if let panel, !panel.estaPendiente(.carrera), !panel.bloques.carrera.isEmpty {
            let estados = ContextoDeBloque.estados(de: panel)
            AnaliticasBloqueCarrera(
                ctx: ContextoDeBloque(panel: panel, estados: estados, ancho: ancho, onSalida: onSalida, onAbrir: { _ in }),
                todosLosTramos: true
            )
        }
    }
}
