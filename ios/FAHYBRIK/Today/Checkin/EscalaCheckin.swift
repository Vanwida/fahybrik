import SwiftUI

// LA ESCALA DEL CHECK-IN — los cinco círculos de una pregunta y los dos extremos que la nombran.
//
// La comparten el paso a paso de Hoy (`HoySujetoCheckin`) y la hoja larga (`CheckinView`): una sola
// escala, para que contestar «Ánimo» se sienta igual en las dos.

/// Los cinco círculos de una pregunta. Cada uno es un botón de 52 pt (sobre los 44 de la HIG) con el
/// círculo de 48 dentro; el elegido se rellena con el acento del club. VoiceOver los lee como una escala:
/// «Recuperación muscular, de 1 a 5» y, dentro, cada número con su seleccionado.
struct EscalaCheckin: View {
    let titulo: String
    /// Qué significan el 1 y el 5 («1 dolorido, 5 recuperado»): a VoiceOver se lo dice la escala, porque los
    /// dos textos de debajo son ornamento visual de la misma información.
    let extremos: String
    let valor: Int?
    let alElegir: (Int) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let toque: CGFloat = Theme.Size.toque + 4
    private static let circulo: CGFloat = 48

    var body: some View {
        HStack(spacing: 0) {
            ForEach(1...5, id: \.self) { v in
                if v > 1 { Spacer(minLength: 0) }
                boton(v)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(titulo), de 1 a 5")
        .accessibilityHint(extremos)
    }

    private func boton(_ v: Int) -> some View {
        let elegido = valor == v
        return Button { alElegir(v) } label: {
            Text("\(v)")
                .papel(.accion)
                .monospacedDigit()
                .foregroundStyle(elegido ? Theme.Color.accentOn : Theme.Color.foreground)
                .frame(width: Self.circulo, height: Self.circulo)
                .background(elegido ? Theme.Color.accent : SwiftUI.Color.clear, in: Circle())
                .overlay(Circle().strokeBorder(elegido ? Theme.Color.accent : Theme.Color.muted, lineWidth: 2))
                .frame(width: Self.toque, height: Self.toque)
                .contentShape(Circle())
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.18), value: elegido)
        }
        .buttonStyle(PressScaleStyle(escala: 0.92))
        .accessibilityLabel("\(v)")
        .accessibilityAddTraits(elegido ? .isSelected : [])
    }
}

/// Los dos extremos de la escala, cada uno en su lado; con texto grande no caben uno junto al otro sin partir
/// una palabra («recupera/do») y pasan a dos líneas. Es ornamento visual de lo que la escala ya le dice a
/// VoiceOver, así que no se lee dos veces. El color y el papel los pone quien lo monta.
struct ExtremosDeEscala: View {
    let izquierda: String
    let derecha: String

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
                Text(izquierda).fixedSize()
                Spacer(minLength: 0)
                Text(derecha).fixedSize()
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(izquierda)
                Text(derecha)
            }
        }
        .accessibilityHidden(true)
    }
}
