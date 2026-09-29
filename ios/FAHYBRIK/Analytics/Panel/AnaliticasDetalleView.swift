import SwiftUI

// LOS DETALLES — placeholders NAVEGABLES hasta la segunda tanda: el detalle de
// un bloque (Forma y fatiga, Semana a semana, Intensidad, Récords, Carrera) y el
// de una familia (correr, remo, ski, bici, fuerza, estaciones, WOD), con el
// contrato en `screens/analiticas-familia-*` y `analiticas-sesion` del doble.
// Aquí solo el cromo (la vuelta a «Analíticas», el título y su pregunta), hecho con
// el kit del día y el tema del atleta, para que el toque en la portada ya lleve a su
// sitio y la segunda tanda solo tenga que sustituir el cuerpo.

/// «‹ Analíticas»: la vuelta de un detalle, a la izquierda y fija. Un detalle no lleva la barra de pestañas
/// propia; el gesto de borde del sistema también vuelve.
struct AnaliticasAtras: View {
    let texto: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 2) {
                Image(systemName: "chevron.left").font(.system(size: 20, weight: .bold)).accessibilityHidden(true)
                Text(texto).papel(.cuerpoFuerte)
            }
            .foregroundStyle(Theme.Color.accentText)
            .padding(.leading, Theme.Spacing.xs)
            .padding(.trailing, Theme.Spacing.m + 2)
            .frame(minHeight: Theme.Size.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
        .accessibilityLabel("Volver a \(texto)")
    }
}

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
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.m + 2) {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text(titulo).papel(.saludo).foregroundStyle(Theme.Color.foreground)
                        .accessibilityAddTraits(.isHeader)
                    if !pregunta.isEmpty { AnaliticasEtiqueta(texto: pregunta) }
                }
                AnaliticasHueco(
                    texto: TextoHueco(
                        titulo: "Muy pronto",
                        cuerpo: "Aquí irá el detalle: lo que te piden y lo que haces, tus mejores marcas y de dónde sale cada cifra.",
                        salida: .espera("Se llena solo"),
                        plazo: nil
                    ),
                    onSalida: { _ in }
                )
            }
            .padding(.horizontal, Theme.Spacing.pantalla)
            .padding(.bottom, Theme.Spacing.xxl)
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack { AnaliticasAtras(texto: AppTab.analiticas.title) { dismiss() }; Spacer() }
                .padding(.horizontal, Theme.Spacing.s)
                .frame(maxWidth: .infinity)
                .background(Theme.Color.background)
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }
}

#if DEBUG
#Preview("Detalle · fábrica") { AnaliticasDetalleView(destino: .bloque(.forma)) }
#Preview("Detalle · club azul") {
    let _ = ClubThemeStore.update(.pruebaAzul)
    AnaliticasDetalleView(destino: .bloque(.forma))
}
#endif
