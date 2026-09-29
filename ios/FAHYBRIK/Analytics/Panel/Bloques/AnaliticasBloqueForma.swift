import SwiftUI

// 2 · FORMA Y FATIGA — ¿gano forma o me paso? ¿llego fresco? La curva de las
// tres con la proyección discontinua hasta la carrera (A7), la frescura en
// barras debajo y, lleno, la subida de forma y cuánto de la carga se ha
// calculado. El veredicto («¿voy a más o me paso?») ya no se escribe aquí: sube al
// sujeto de la portada, donde explica la palabra de hoy (`SujetoEstado`).

struct AnaliticasBloqueForma: View {
    let ctx: ContextoDeBloque

    private var lecturas: [LecturaAnalitica] { ctx.lecturas(.forma) }
    private var estado: EstadoBloque { ctx.estado(.forma) }
    private var enFrio: Bool { AnaliticasEstados.faltaDeHistoria(lecturas) != nil }

    var body: some View {
        let (series, marcas) = AnaliticasDerivados.seriesForma(ctx.panel)
        let frescura = AnaliticasDerivados.frescura(ctx.panel)
        let fatiga = AnaliticasDerivados.lectura(lecturas, "carga.reciente")
        let subida = AnaliticasDerivados.lectura(lecturas, "carga.subida")
        let cobertura = AnaliticasDerivados.lectura(lecturas, "carga.cobertura")

        AnaliticasSeccion(titulo: BloqueDelPanel.forma.titulo, pregunta: BloqueDelPanel.forma.pregunta, onAbrir: { ctx.onAbrir(.bloque(.forma)) }) {
            AnaliticasHuecoDeBloque(ctx: ctx, bloque: .forma)

            if estado == .poco, enFrio, let fatiga, let d = fatiga.dato {
                // En arranque en frío solo la fatiga (la ventana corta) dice algo.
                AnaliticasCelda(etiqueta: "\(fatiga.tituloEs) (\(ctx.metodo.atlDays) días)", valor: d.valor, unidad: d.unidad, ancla: fatiga.procedencia.ancla)
            } else if series.contains(where: { $0.puntos.compactMap(\.v).count >= 2 }) {
                AnaliticasSuperficie {
                    VStack(alignment: .leading, spacing: 12) {
                        AnaliticasGraficoLineas(series: series, marcas: marcas, formatoY: { AnaliticasFormato.entero($0) }, desdeCero: true)
                        if let frescura, frescura.puntos.compactMap(\.v).count >= 2 {
                            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                                AnaliticasEtiqueta(texto: "Frescura · forma menos fatiga")
                                AnaliticasGraficoDivergente(puntos: frescura.puntos, proyeccion: frescura.proyeccion, marcas: marcas, formato: { AnaliticasFormato.entero($0, conSigno: true) })
                            }
                        }
                    }
                }
            }

            if estado == .lleno, (subida?.dato != nil || cobertura?.dato != nil) {
                AnaliticasFilaDeCeldas {
                    if let subida, let d = subida.dato {
                        AnaliticasCelda(etiqueta: "Subida de forma", valor: d.valor, unidad: d.unidad, delta: AnaliticasDerivados.delta(de: subida), nota: "por semana")
                    }
                    if let cobertura, let d = cobertura.dato {
                        let estimada = cobertura.reparto?.partes.first { $0.code == "estimada" }?.pct ?? 0
                        AnaliticasCelda(etiqueta: "Carga calculada", valor: d.valor, unidad: d.unidad,
                                        nota: estimada > 0 ? "\(Int(estimada.rounded())) % con umbral estimado" : "todo medido o declarado")
                    }
                }
            }
        }
    }
}
