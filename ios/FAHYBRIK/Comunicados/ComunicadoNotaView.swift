import SwiftUI

// LA NOTA — el briefing, legible y RELEÍBLE.
//
// Es el comunicado que peor sobrevive al chat: el porqué de un plan de doce
// semanas no cabe en una burbuja y, sobre todo, no se puede volver a encontrar
// en octubre sin subir media pantalla buscándolo.
//
// Aquí cada sección tiene su nombre y su tarjeta, así que se vuelve a UNA y no a
// la nota entera. El nombre de la sección y su texto son del coach: no se
// resumen, no se reordenan y no se les inventa una jerarquía que él no escribió.
//
// No lleva acción anclada ni «hecho»: una nota no se cierra, leerla ERA el acto
// (por eso deja de reclamar en cuanto se abre).

struct ComunicadoNotaView: View {
    let comunicado: Comunicado
    let onVolver: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            CabeceraComunicado(comunicado: comunicado, onVolver: onVolver) {
                InsigniaComunicado(insignia: comunicado.insignia())
            }
            FillingScreen {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                        TituloComunicado(comunicado: comunicado)
                        CuerpoComunicado(texto: comunicado.body, tamano: 13.5)
                    }

                    ForEach(comunicado.items) { seccion in
                        CardSurface {
                            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                                if let etiqueta = seccion.label, !etiqueta.isEmpty {
                                    LabelText(text: etiqueta, size: 10)
                                    Hairline()
                                }
                                Text(seccion.content)
                                    .scaledFont(14, relativeTo: .callout)
                                    .foregroundStyle(Theme.Color.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        .accessibilityElement(children: .combine)
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
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xl)
            }
        }
    }
}
