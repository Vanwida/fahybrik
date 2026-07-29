import SwiftUI

struct DoneStep: View {
    /// FREE (no coach): nobody is building a plan — the athlete builds their
    /// first workout. Coached keeps the "plan on its way" framing, agnostic.
    var hasCoach: Bool = true
    let onEnter: () -> Void

    @State private var pulse = false

    // ARQUETIPO Vacío · altura `centra` (§6): nothing left to fill. One glyph and
    // three lines earn the screen by centring in it, with the single action
    // anchored — the same shape the "solicitud enviada" confirmation uses.
    //
    // Was Spacer/Spacer inside a non-scrolling VStack around a 96 pt checkmark:
    // at accessibility text sizes the copy ran off both edges and "Entrar" went
    // with it.
    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()

            CenteredScreen {
                VStack(spacing: Theme.Spacing.xl) {
                    // Display glyph: fixed by design, like every hero mark in the
                    // app (the copy under it is what scales).
                    Image(systemName: "checkmark")
                        .font(Theme.Typography.display)
                        .foregroundStyle(Theme.Color.accentText)
                        .scaleEffect(pulse ? 1.04 : 1.0)
                        .animation(
                            .easeInOut(duration: 1.6).repeatForever(autoreverses: true),
                            value: pulse
                        )
                        .onAppear { pulse = true }
                        .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                        Text("Listo.")
                            .font(Theme.Typography.headlineL)
                            .foregroundStyle(Theme.Color.foreground)

                        Text(hasCoach
                             ? "Tu coach está armando tu primer plan."
                             : "Tu cuenta está lista.")
                            .font(Theme.Typography.body)
                            .foregroundStyle(Theme.Color.foreground)
                            .fixedSize(horizontal: false, vertical: true)

                        Text(hasCoach
                             ? "Lo verás en Inicio en unos minutos.\nMientras, échale un vistazo a la app."
                             : "Construye tu primer entreno desde Inicio.\nCalle, cinta, ergos y fuerza, como entrenes hoy.")
                            .font(Theme.Typography.small)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.vertical, Theme.Spacing.xl)
            }
            .anchoredAction(separator: false) {
                PrimaryButton(title: "Entrar", action: onEnter)
                    .padding(.horizontal, Theme.Spacing.s)
            }
        }
    }
}
