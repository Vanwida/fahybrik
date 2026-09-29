import SwiftUI

// LA TENDENCIA DE UNA LECTURA — su serie semanal (o diaria) en una tarjeta, con la escala en la unidad de la lectura y
// «lo bueno arriba»: un ritmo o un tiempo que baja es una marca que mejora, y va hacia arriba. Es el gráfico de línea que
// repiten los detalles (la marca clave, el Motor, los vatios al mismo pulso, un WOD); una sola pieza para que ninguno lo
// dibuje a su manera. Un hueco (nulo) corta la línea y no se interpola.

/// ¿La serie se dibuja? Con dos puntos con valor como mínimo: uno solo no es una tendencia.
extension SerieDeLectura {
    var seDibuja: Bool { puntos.compactMap(\.v).count >= 2 }
}

/// La sección que sigue al sujeto de una familia: la serie de LA MISMA fila que el sujeto (la de la portada), titulada con su marca.
/// Con menos de dos semanas con dato dice cuándo se dibujará, en vez de callarse: el atleta abrió la pantalla esperando verla.
struct AnaliticasTendenciaDelSujeto: View {
    let sujeto: SujetoDeFamilia
    let fila: LecturaAnalitica?
    let familia: FamiliaLectura

    var body: some View {
        if case .marca(let m) = sujeto.cuerpo, let fila, let dato = fila.dato {
            AnaliticasSeccion(titulo: m.etiqueta, pregunta: AnaliticasFormato.preguntaDeTendencia()) {
                if let serie = fila.serie, serie.seDibuja {
                    AnaliticasTendencia(serie: serie, unidad: dato.unidad, familia: familia, etiqueta: "Tendencia de \(m.etiqueta)")
                } else {
                    AnaliticasNota(texto: "Con dos semanas con dato ya se dibuja la tendencia.")
                }
            }
        }
    }
}

struct AnaliticasTendencia: View {
    let serie: SerieDeLectura
    /// La unidad del dato: manda la escala y el sentido de «mejor».
    let unidad: UnidadLectura
    let familia: FamiliaLectura?
    /// Lo que dice VoiceOver: «Tendencia del Motor».
    let etiqueta: String
    var alto: CGFloat = 170

    private var esTiempo: Bool {
        switch unidad {
        case .sKm, .s500m, .s1000m, .segundos: return true
        default: return false
        }
    }

    var body: some View {
        AnaliticasSuperficie {
            AnaliticasGraficoLineas(
                series: [SerieDeLinea(id: "tendencia", etiqueta: etiqueta, puntos: serie.puntos, color: FamiliaGrande(familia).color, rotuloFinal: true)],
                formatoY: { AnaliticasFormato.cifra($0, unidad) },
                alto: alto,
                leyenda: false,
                invertido: AnaliticasFormato.menosEsMejor(unidad),
                escalaTiempo: esTiempo
            )
        }
    }
}

extension AnaliticasFormato {
    /// «Semana a semana · arriba es mejor». Los gráficos de un detalle ponen «lo bueno arriba» (un ritmo o un tiempo que
    /// baja se dibuja hacia arriba, como en Garmin y TrainingPeaks), así que la frase es la misma para todas las unidades:
    /// el doble escribía «abajo es mejor» sobre un eje invertido y decía lo contrario de lo que se ve.
    static func preguntaDeTendencia(paso: SerieDeLectura.PasoDeSerie = .semana) -> String {
        "\(paso == .dia ? "Día a día" : "Semana a semana") · arriba es mejor"
    }
}
