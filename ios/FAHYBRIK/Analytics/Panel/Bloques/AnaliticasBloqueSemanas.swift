import SwiftUI

// 3 · SEMANA A SEMANA — ¿hago lo que toca? Carga (apilada por familia) u horas
// por semana, el plan en contorno sobre lo hecho, y las dos cifras de la
// ventana contra el periodo anterior. La lista de cumplimiento por sesión
// (A8) llega con el bloque de cumplimiento, que el servidor aún no sirve.

private typealias C = AnaliticasColor

struct AnaliticasBloqueSemanas: View {
    let ctx: ContextoDeBloque

    enum Modo: Hashable { case carga, horas }
    @State private var modo: Modo = .carga

    private var lecturas: [LecturaAnalitica] { ctx.lecturas(.semanas) }
    private var estado: EstadoBloque { ctx.estado(.semanas) }

    var body: some View {
        let n = AnaliticasDerivados.lectura(lecturas, "semanas.carga")?.serie?.puntos.count ?? 0
        let agrupar = AnaliticasEscala.agrupacion(puntos: n, ancho: ctx.ancho - 60)
        let cubos = modo == .carga ? AnaliticasDerivados.cubosCarga(ctx.panel, agrupar: agrupar) : AnaliticasDerivados.cubosHoras(ctx.panel, agrupar: agrupar)
        let carga = AnaliticasDerivados.lectura(lecturas, "semanas.carga")
        let horas = AnaliticasDerivados.lectura(lecturas, "semanas.horas")

        AnaliticasSeccion(titulo: BloqueDelPanel.semanas.titulo, pregunta: BloqueDelPanel.semanas.pregunta, onAbrir: { ctx.onAbrir(.bloque(.semanas)) }) {
            if estado != .vacio, !ctx.pendiente(.semanas) {
                AnaliticasSegmento(items: [(Modo.carga, "Carga"), (Modo.horas, "Horas")], valor: $modo, etiqueta: "Carga u horas")
            }
        } contenido: {
            AnaliticasHuecoDeBloque(ctx: ctx, bloque: .semanas)

            if !cubos.isEmpty {
                AnaliticasSuperficie {
                    VStack(alignment: .leading, spacing: 8) {
                        AnaliticasGraficoColumnas(
                            cubos: cubos,
                            leyenda: AnaliticasDerivados.leyenda(de: cubos),
                            formatoY: modo == .carga ? { "\(Int($0.rounded()))" } : { "\(Int($0.rounded())) h" },
                            diasPorCubo: 7 * agrupar
                        )
                        if agrupar > 1 {
                            AnaliticasNota(texto: "Cada columna suma \(agrupar) semanas: a este ancho una por semana no se lee.")
                        }
                    }
                }
            }

            if estado != .vacio, let carga, let horas, let dc = carga.dato, let dh = horas.dato {
                AnaliticasFilaDeCeldas {
                    AnaliticasCelda(etiqueta: "Carga", valor: dc.valor, unidad: dc.unidad, delta: AnaliticasDerivados.delta(de: carga))
                    AnaliticasCelda(etiqueta: "Horas", valor: dh.valor, unidad: dh.unidad, delta: AnaliticasDerivados.delta(de: horas))
                }
            }
        }
    }
}
