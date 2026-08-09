import SwiftUI

// La entrada a «Del coach» desde la cabecera, con el globito de lo que te
// reclama.
//
// Misma decisión que el chat: la bandeja no puede quedar enterrada, pero
// tampoco es un destino primario que merezca una pestaña. Vive en la cabecera —
// a la IZQUIERDA del logotipo, donde el chat y el avatar ocupan la derecha — y
// `AppShell` la levanta como cover a través de `\.openCoachInbox`, igual que
// hace con el hilo. Un solo sitio para el aspecto, el globito y la acción.
//
// El globito cuenta lo que RECLAMA (sin ver, sin responder, sin hacer), no lo
// que hay: un foco que no caduca nunca no puede tener a nadie con un punto rojo
// para siempre.

// MARK: - openCoachInbox

private struct OpenCoachInboxKey: EnvironmentKey {
    static let defaultValue: (String?) -> Void = { _ in }
}

extension EnvironmentValues {
    /// Abre la bandeja «Del coach». Con un id, además abre ese comunicado (es
    /// por donde entra un push). Lo inyecta AppShell; fuera de él no hace nada,
    /// así que una vista previa nunca revienta.
    var openCoachInbox: (String?) -> Void {
        get { self[OpenCoachInboxKey.self] }
        set { self[OpenCoachInboxKey.self] = newValue }
    }
}

// MARK: - Botón de cabecera

/// Bandeja circular con el contador de pendientes, leído en vivo de la porción
/// compartida (una sola verdad: coincide con lo que enseña la propia bandeja).
/// Área de toque de 44 pt.
struct CoachInboxHeaderButton: View {
    @Environment(AppDataStore.self) private var store
    @Environment(\.openCoachInbox) private var openCoachInbox

    private var pendientes: Int { store.comunicadosPendientes }

    var body: some View {
        Button {
            Haptics.light()
            openCoachInbox(nil)
        } label: {
            ZStack(alignment: .topTrailing) {
                ZStack {
                    Circle().fill(Theme.Color.surfaceElevated)
                    Image(systemName: "tray")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                }
                .frame(width: 34, height: 34)
                .overlay(Circle().stroke(Theme.Color.hairline, lineWidth: 1))

                if pendientes > 0 {
                    Text(pendientes > 9 ? "9+" : "\(pendientes)")
                        .font(.system(size: 10, weight: .heavy, design: .rounded).monospacedDigit())
                        .foregroundStyle(Theme.Color.accentOn)
                        .padding(.horizontal, 4)
                        .frame(minWidth: 16, minHeight: 16)
                        .background(Theme.Color.accent)
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(Theme.Color.background, lineWidth: 1.5))
                        .offset(x: 5, y: -5)
                }
            }
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(pendientes > 0
            ? "Del coach, \(pendientes) sin resolver"
            : "Del coach")
        .accessibilityAddTraits(.isButton)
    }
}
