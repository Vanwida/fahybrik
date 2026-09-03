import SwiftUI

/// El disparador de la hoja de bloques. Un solo `Button`, cuatro cromos.
///
/// Apple: `Button` + `View.sheet(isPresented:onDismiss:content:)` en el padre.
/// La hoja vive SOLO en `ActiveWorkoutView`. Este botón no presenta nada.
struct BotonVerBloques: View {
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            Image(systemName: "list.bullet.rectangle")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ver el entreno entero")
    }
}
