import SwiftUI

// UNA FILA QUE SE PARTE EN DOS LÍNEAS CUANDO NO CABE.

/// Lo de la izquierda y lo de la derecha en una fila; si no caben (texto grande), uno debajo del otro. Un
/// nombre de ejercicio partido a media palabra para que quepa su dosis no se lee.
struct FilaAdaptableDia<Izquierda: View, Derecha: View>: View {
    var alineacion: VerticalAlignment = .firstTextBaseline
    @ViewBuilder let izquierda: () -> Izquierda
    @ViewBuilder let derecha: () -> Derecha

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: alineacion, spacing: Theme.Spacing.m) {
                izquierda()
                Spacer(minLength: Theme.Spacing.s)
                derecha()
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                izquierda()
                derecha()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

