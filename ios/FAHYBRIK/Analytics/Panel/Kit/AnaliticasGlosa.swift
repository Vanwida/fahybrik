import SwiftUI

// LA GLOSA (A5) — nombres, no siglas: a un toque, la hoja con lo que significa
// cada número y su sigla de TrainingPeaks para quien la busque. Los días de
// forma y fatiga salen del MÉTODO del coach que viaja en el panel, nunca de un
// número escrito aquí.

struct TerminoDeGlosa: Identifiable {
    let termino: String
    let sigla: String?
    let queEs: String
    var id: String { termino }
}

enum AnaliticasGlosario {
    static func terminos(metodo: MetodoDelPanel) -> [TerminoDeGlosa] {
        [
            TerminoDeGlosa(termino: "Forma", sigla: "CTL", queEs: "La carga que llevas encima de fondo: media de los últimos \(metodo.ctlDays) días (los días los fija tu coach)."),
            TerminoDeGlosa(termino: "Fatiga", sigla: "ATL", queEs: "El cansancio reciente: media de los últimos \(metodo.atlDays) días."),
            TerminoDeGlosa(termino: "Frescura", sigla: "TSB", queEs: "Forma menos fatiga. En positivo llegas descansado; en negativo, cargado."),
            TerminoDeGlosa(termino: "Carga", sigla: "TSS", queEs: "Cuánto pesa un entreno: 1 hora en tu umbral son 100. Sale del ritmo, los vatios, el pulso o tu esfuerzo, por ese orden."),
            TerminoDeGlosa(termino: "Motor", sigla: "EF", queEs: "Lo rápido que vas al mismo pulso. Si mejora, corres más por el mismo esfuerzo."),
            TerminoDeGlosa(termino: "Disposición", sigla: nil, queEs: "Cómo llegas hoy, según tu variabilidad, tu pulso en reposo y tu sueño contra tu basal."),
        ]
    }
}

/// La hoja del glosario. Modal de verdad: la presenta `.sheet` (foco, Escape y arrastre son del
/// sistema) con el lienzo del tema, en claro y en oscuro.
struct AnaliticasGlosa: View {
    let metodo: MetodoDelPanel
    let onCerrar: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.m + 2) {
                HStack(alignment: .center, spacing: Theme.Spacing.s) {
                    Text("Qué significa cada número")
                        .papel(.seccion)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: Theme.Spacing.s)
                    BotonCromoDia(.cerrar, etiqueta: "Cerrar", accion: onCerrar)
                }
                AnaliticasLista {
                    ForEach(AnaliticasGlosario.terminos(metodo: metodo)) { g in
                        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                            HStack(spacing: Theme.Spacing.s) {
                                AnaliticasCuerpo(texto: g.termino, fuerte: true)
                                if let sigla = g.sigla { InfoPill(text: sigla, estilo: .neutro) }
                            }
                            AnaliticasCuerpo(texto: g.queEs, tono: Theme.Color.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Theme.Spacing.l)
                        .padding(.vertical, 14)
                        .accessibilityElement(children: .combine)
                    }
                }
                AnaliticasEtiqueta(texto: "Los días de forma y fatiga, las bandas y los umbrales los fija tu coach.")
            }
            .padding(.horizontal, Theme.Spacing.pantalla)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.Color.background)
        .presentationCornerRadius(Theme.Radius.sujeto)
    }
}

#if DEBUG
#Preview("Glosa · fábrica") { AnaliticasGlosa(metodo: .porDefecto, onCerrar: {}) }
#Preview("Glosa · club azul") {
    let _ = ClubThemeStore.update(.pruebaAzul)
    AnaliticasGlosa(metodo: .porDefecto, onCerrar: {})
}
#endif
