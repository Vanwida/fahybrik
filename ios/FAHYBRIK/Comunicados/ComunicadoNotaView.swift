import SwiftUI

// LA NOTA — el briefing, legible y RELEÍBLE.
//
// Es el comunicado que peor sobrevive al chat: el porqué de un plan de doce
// semanas no cabe en una burbuja y, sobre todo, no se puede volver a encontrar
// en octubre sin subir media pantalla buscándolo.
//
// Aquí cada sección tiene su nombre, su tarjeta y SU FORMA, así que se vuelve a
// UNA y no a la nota entera: la cifra sale de cifra, el reparto sale de barra y
// las semanas salen de espina, en vez de acabar los tres en el mismo párrafo
// gris. El nombre de la sección y su texto son del coach: no se resumen, no se
// reordenan y no se les inventa una jerarquía que él no escribió.
//
// El pie cierra el círculo: un briefing que deja una decisión abierta lo DICE y
// lleva a ella, en vez de dejar que se pierda en otra pantalla.
//
// No lleva acción anclada ni «hecho»: una nota no se cierra, leerla ERA el acto
// (por eso deja de reclamar en cuanto se abre).

struct ComunicadoNotaView: View {
    let comunicado: Comunicado
    let onVolver: () -> Void
    /// Abre el comunicado del pie. Lo resuelve la bandeja, que es la dueña de la
    /// pila de navegación: un detalle no sabe navegar, sabe qué le falta.
    var onAbrirEnlazado: (String) -> Void = { _ in }

    var body: some View {
        VStack(spacing: 0) {
            CabeceraComunicado(comunicado: comunicado, onVolver: onVolver) {
                InsigniaComunicado(insignia: comunicado.insignia())
            }
            FillingScreen {
                CuerpoDeLaNota(comunicado: comunicado, onAbrirEnlazado: onAbrirEnlazado)
            }
        }
    }
}

/// Lo que va dentro del scroll. Vive aparte porque `ImageRenderer` no dibuja un
/// `ScrollView`: así las capturas de diseño salen de la MISMA vista que se
/// envía, y no de una copia del montaje que se queda atrás a la primera.
struct CuerpoDeLaNota: View {
    let comunicado: Comunicado
    var onAbrirEnlazado: (String) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                TituloComunicado(comunicado: comunicado)
                CuerpoComunicado(texto: comunicado.body, tamano: 13.5)
            }

            // Sólo las que tienen algo que decir: una sección de camino sin plan
            // detrás se salta ENTERA, sin dejar el hueco.
            ForEach(comunicado.seccionesVisibles) { seccion in
                CardSurface {
                    SeccionDeNota(seccion: seccion)
                }
                .modifier(VozDeLaSeccion(forma: seccion.forma))
            }

            if let cierre = comunicado.finalNote,
               !cierre.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                CardSurface(leftAccent: true) {
                    VStack(alignment: .leading, spacing: 6) {
                        LabelText(text: "Nota de \(comunicado.nombreCoach)", size: 9.5)
                        Text(cierre)
                            .scaledFont(13, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            if let enlace = comunicado.linked {
                EnlaceCruzadoComunicado(enlace: enlace, onAbrir: onAbrirEnlazado)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.l)
        .padding(.bottom, Theme.Spacing.xl)
    }
}

/// Cómo se OYE una sección. Un texto y una cifra se leen de corrido en una sola
/// parada; un reparto, un camino y una gráfica son varias cosas dentro de una, y
/// aplanarlos dejaría veinticuatro semanas en una sola frase que nadie puede
/// recorrer.
private struct VozDeLaSeccion: ViewModifier {
    let forma: ComunicadoForma

    func body(content: Content) -> some View {
        switch forma {
        case .texto, .cifra:
            content.accessibilityElement(children: .combine)
        case .reparto, .camino, .grafica:
            content.accessibilityElement(children: .contain)
        }
    }
}
