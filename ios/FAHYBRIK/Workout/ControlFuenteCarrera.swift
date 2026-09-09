import SwiftUI

// FH-102 — Visible mid-run control for calle ↔ cinta. Compact chip in the HUD
// chrome; opens the same LiveConectividadSheet as BotonConectividad.

struct ControlFuenteCarrera: View {
    let environment: RunEnvironment?
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 11, weight: .semibold))
                Text(label)
                    .font(.system(size: 11, weight: .heavy, design: .default).italic())
                    .tracking(0.4)
                    .lineLimit(1)
            }
            .foregroundStyle(Theme.Color.foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(Theme.Color.surface)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(Theme.Color.outline, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Fuente de carrera: \(label)")
        .accessibilityHint("Cambiar calle o cinta sin parar la sesión")
    }

    private var label: String {
        environment?.hudLabel ?? "Elegir"
    }

    private var icon: String {
        switch environment {
        case .outdoor:   return "location.fill"
        case .treadmill: return "figure.run"
        case .indoor:    return "figure.run.circle"
        case .none:      return "arrow.triangle.2.circlepath"
        }
    }
}
