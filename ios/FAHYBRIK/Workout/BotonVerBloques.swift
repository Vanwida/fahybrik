import SwiftUI

/// El disparador de la hoja de bloques. Un solo `Button`, cuatro cromos.
///
/// Apple: `Button` + `View.sheet(isPresented:onDismiss:content:)` en el padre.
/// La hoja vive SOLO en `ActiveWorkoutView`. Este botón no presenta nada.
struct BotonVerBloques: View {
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            IconoDia(.bloques, tam: 18)
                .foregroundStyle(Theme.Color.muted)
                .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ver el entreno entero")
    }
}
