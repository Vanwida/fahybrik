import SwiftUI

// LA GLOSA (A5) — nombres, no siglas: a un toque, la hoja con lo que significa
// cada número y su sigla de TrainingPeaks para quien la busque. Los días de
// forma y fatiga salen del MÉTODO del coach que viaja en el panel, nunca de un
// número escrito aquí.

private typealias TA = AnaliticasTokens.TA
private typealias C = AnaliticasColor

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

struct AnaliticasGlosa: View {
    let metodo: MetodoDelPanel
    let onCerrar: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center) {
                    Text("Qué significa cada número")
                        .font(.system(size: TA.titulo.cuerpo, weight: TA.titulo.peso))
                        .foregroundStyle(C.tinta)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    Button(action: onCerrar) {
                        Image(systemName: "xmark")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(C.tinta)
                            .frame(width: 36, height: 36)
                            .background(C.superficie2, in: Circle())
                    }
                    .buttonStyle(VivoPulsarStyle())
                    .accessibilityLabel("Cerrar")
                }
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(AnaliticasGlosario.terminos(metodo: metodo)) { g in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                AnaliticasCuerpo(texto: g.termino, fuerte: true)
                                if let sigla = g.sigla { AnaliticasEtiqueta(texto: sigla) }
                            }
                            AnaliticasCuerpo(texto: g.queEs, tono: C.tinta2)
                        }
                    }
                }
                AnaliticasEtiqueta(texto: "Los días de forma y fatiga, las bandas y los umbrales los fija tu coach.")
            }
            .padding(.horizontal, AnaliticasTokens.margen)
            .padding(.top, 18)
            .padding(.bottom, 24)
        }
        .background(C.superficie.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.hidden)
        .presentationBackground(C.superficie)
        .presentationCornerRadius(AnaliticasTokens.Radio.hoja)
    }
}
