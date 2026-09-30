import SwiftUI

// EL CUERPO DE LA PORTADA — lo que la pantalla pinta con un panel delante, sin ninguna de sus
// máquinas (ni scroll, ni almacén, ni navegación): la cabecera, el sujeto (el Estado) y los siete
// bloques. Está aparte de `AnaliticasPortadaView` para que la galería y las capturas pinten
// EXACTAMENTE lo mismo que la pantalla, y para que sus cuatro estados (datos · cargando · vacío ·
// error) vivan juntos.
//
// ALTURA (CONTRATO-UI §6.1): `llena`. Los siete bloques se pintan SIEMPRE —con su contenido o con
// su hueco y su salida—, así que el cuerpo nunca es más corto que la pantalla y el sujeto no tiene
// sobrante que absorber; si lo hubiera, entraría en él, jamás en una cola muerta debajo.

/// El sujeto y los siete bloques, a partir de un panel ya servido.
struct AnaliticasPortadaCuerpo: View {
    let panel: PanelAnaliticas
    /// Ancho útil del lienzo, para decidir cuántas columnas caben.
    let ancho: CGFloat
    /// Las sesiones del plan de la ventana, si el cumplimiento ya llegó: la puerta a los días de Semana a semana.
    var sesiones: [FilaDeSesionVista] = []
    /// El arco de la disposición se dibuja al entrar; una captura estática pide `false`.
    var animado = true
    let onGlosa: () -> Void
    let onSalida: (DestinoDeSalida) -> Void
    let onAbrir: (AnaliticasDestino) -> Void
    /// Con qué bloques y si lleva el sujeto. La pantalla los pinta todos; la galería de capturas la
    /// corta en dos tramos porque una imagen de todo el scroll no cabe en una textura.
    var bloques: [BloqueDelPanel] = BloqueDelPanel.delCuerpo
    var conSujeto = true

    /// Aire entre secciones: las de analíticas son más densas que las de Hoy y piden un punto más.
    static let entreSecciones: CGFloat = 30

    var body: some View {
        let estados = ContextoDeBloque.estados(de: panel)
        let ctx = ContextoDeBloque(panel: panel, estados: estados, ancho: ancho, onSalida: onSalida, onAbrir: onAbrir, sesiones: sesiones)
        VStack(alignment: .leading, spacing: Self.entreSecciones) {
            if conSujeto {
                AnaliticasSujeto(sujeto: SujetoEstado.desde(panel, bloque: estados[.estado] ?? .vacio), animado: animado,
                                 onGlosa: onGlosa, onSalida: onSalida)
            }
            ForEach(bloques, id: \.rawValue) { AnaliticasBloque(ctx: ctx, bloque: $0) }
        }
    }
}

// MARK: - Cargando: el esqueleto con la MISMA forma

/// Lo que se ve antes de que llegue el panel: el sujeto neutro con sus tres insertos y dos secciones
/// con su título y su tarjeta, de las medidas de lo que va a llegar. Nada salta al llegar el dato.
struct AnaliticasPortadaEsqueleto: View {
    var body: some View {
        VStack(alignment: .leading, spacing: AnaliticasPortadaCuerpo.entreSecciones) {
            SujetoDia(tono: .neutro, etiqueta: "Cargando tus analíticas") {
                SkeletonBar(width: 130, height: 15, radius: 5).frame(minHeight: 32)
                SkeletonBar(height: 44, radius: 10).frame(maxWidth: 260)
                SkeletonBar(height: 17, radius: 6)
            } abajo: {
                HStack(spacing: Theme.Spacing.s) {
                    ForEach(0..<3, id: \.self) { _ in SkeletonBar(height: 72, radius: Theme.Radius.fila) }
                }
                SkeletonBar(height: 84, radius: Theme.Radius.fila)
            }
            ForEach(0..<2, id: \.self) { _ in
                VStack(alignment: .leading, spacing: Theme.Spacing.m + 2) {
                    SkeletonBar(width: 190, height: 24, radius: 6)
                    SkeletonBar(width: 240, height: 15, radius: 5)
                    SkeletonBar(height: 200, radius: Theme.Radius.tarjeta)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando tus analíticas")
    }
}

// MARK: - Error: con su salida

/// Lo pedido no ha llegado y no hay copia: `SujetoErrorDia` con el texto de la pestaña. Lo usan la portada y todos los detalles:
/// cambia el kicker (dónde estás) y el título (qué no llegó).
struct AnaliticasErrorDeCarga: View {
    var kicker = "Tu estado hoy"
    var titulo = "No se han podido cargar tus analíticas"
    var reintentando = false
    let onReintentar: () -> Void

    var body: some View {
        SujetoErrorDia(
            kicker: kicker, titulo: titulo, apoyo: "Comprueba la conexión y vuelve a intentarlo.",
            reintentando: reintentando, alReintentar: onReintentar
        )
    }
}
