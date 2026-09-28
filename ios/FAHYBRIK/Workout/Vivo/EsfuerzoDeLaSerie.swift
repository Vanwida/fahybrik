import SwiftUI

/// «¿Cómo ha ido la serie 2?» — una fila de toques en el descanso que sigue a la
/// serie (`WorkoutSession.serieParaEsfuerzo`). La escala es la que prescribió el
/// coach (RIR o RPE). Tocar la opción marcada la quita: contestar es opcional.
struct EsfuerzoDeLaSerie: View {
    let session: WorkoutSession
    let indice: Int

    private var escala: EscalaEsfuerzo { session.escalaDeEsfuerzo(serie: indice) }
    private var anotado: Double? { session.esfuerzoAnotado(serie: indice) }
    private var numeroDeSerie: Int {
        session.setRecords.indices.contains(indice) ? session.setRecords[indice].setIndex : indice + 1
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: "\(escala.etiqueta) de la \(Vocab.serie.lowercased()) \(numeroDeSerie)", size: 10)
            HStack(spacing: 6) {
                ForEach(escala.opciones, id: \.self) { valor in
                    let marcado = anotado == valor
                    Button {
                        Haptics.light()
                        session.anotarEsfuerzo(serie: indice, marcado ? nil : valor)
                    } label: {
                        Text(Formato.esDecimal(valor))
                            .scaledFont(17, weight: .heavy, relativeTo: .body, italic: true)
                            .monospacedDigit()
                            .foregroundStyle(marcado ? Theme.Color.background : Theme.Color.foreground)
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(marcado ? Theme.Color.accent : Theme.Color.surface,
                                        in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                    }
                    .buttonStyle(PressScaleStyle())
                    .accessibilityLabel("\(escala.etiqueta) \(Formato.esDecimal(valor))")
                    .accessibilityAddTraits(marcado ? .isSelected : [])
                }
            }
        }
    }
}
