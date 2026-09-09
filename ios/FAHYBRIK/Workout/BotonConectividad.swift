import SwiftUI

/// Disparador de la hoja de conectividad en vivo. Misma familia que
/// `BotonVerBloques`: icono en la banda superior, la hoja la presenta el padre.
struct BotonConectividad: View {
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            Image(systemName: "antenna.radiowaves.left.and.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Dispositivos y conectividad")
        .accessibilityHint("Abre cinta, PM5 y pulso")
    }
}
