import SwiftUI

// LOS DETALLES — placeholders NAVEGABLES hasta la segunda tanda: el detalle de
// un bloque (Forma y fatiga, Semana a semana, Intensidad, Récords, Carrera) y el
// de una familia (correr, remo, ski, bici, fuerza, estaciones, WOD), con el
// contrato en `screens/analiticas-familia-*` y `analiticas-sesion` del doble.
// Aquí solo el cromo (título, pregunta y la vuelta a «Analíticas»), para que el
// toque en la portada ya lleve a su sitio.

private typealias C = AnaliticasColor
private typealias TA = AnaliticasTokens.TA

struct AnaliticasDetalleView: View {
    let destino: AnaliticasDestino
    @Environment(\.dismiss) private var dismiss

    private var titulo: String {
        switch destino {
        case .bloque(let b): return b.titulo
        case .familia(let f): return f.nombre
        case .dispositivos: return "Dispositivos y apps"
        }
    }

    private var pregunta: String {
        switch destino {
        case .bloque(let b): return b.pregunta
        case .familia: return "¿Mejoro en esta familia?"
        case .dispositivos: return ""
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AnaliticasTokens.hueco) {
            Button(action: { dismiss() }) {
                HStack(spacing: 2) {
                    Image(systemName: "chevron.left").font(.system(size: 15, weight: .semibold))
                    Text(AppTab.analiticas.title).font(.system(size: TA.cuerpo, weight: .semibold))
                }
                .foregroundStyle(C.tinta2)
                .frame(height: 32)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Volver a \(AppTab.analiticas.title)")
            Text(titulo)
                .font(.system(size: TA.pantalla.cuerpo, weight: TA.pantalla.peso))
                .tracking(-0.5)
                .foregroundStyle(C.tinta)
            if !pregunta.isEmpty { AnaliticasEtiqueta(texto: pregunta) }
            AnaliticasHueco(
                texto: TextoHueco(
                    titulo: "Muy pronto",
                    cuerpo: "Aquí irá el detalle: lo que te piden y lo que haces, tus mejores marcas y de dónde sale cada cifra.",
                    salida: .espera("Se llena solo"),
                    plazo: nil
                ),
                onSalida: { _ in }
            )
            Spacer(minLength: 0)
        }
        .padding(.horizontal, AnaliticasTokens.margen)
        .padding(.top, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(C.fondo.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }
}
