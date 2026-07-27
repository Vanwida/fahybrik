import SwiftUI

struct DoneStep: View {
    /// FREE (no coach): nobody is building a plan — the athlete builds their
    /// first workout. Coached keeps the "plan on its way" framing, agnostic.
    var hasCoach: Bool = true
    let onEnter: () -> Void

    @State private var pulse = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.xl) {
                Spacer()

                Text("✓")
                    .font(.system(size: 96, weight: .heavy))
                    .foregroundStyle(Theme.Color.accentText)
                    .scaleEffect(pulse ? 1.04 : 1.0)
                    .animation(
                        .easeInOut(duration: 1.6).repeatForever(autoreverses: true),
                        value: pulse
                    )
                    .onAppear { pulse = true }

                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    Text("Listo.")
                        .font(Theme.Typography.headlineL)
                        .foregroundStyle(Theme.Color.foreground)

                    Text(hasCoach
                         ? "Tu coach está armando tu primer plan."
                         : "Tu cuenta está lista.")
                        .font(Theme.Typography.body)
                        .foregroundStyle(Theme.Color.foreground)

                    Text(hasCoach
                         ? "Lo verás en Today en unos minutos.\nMientras, échale un vistazo a la app."
                         : "Construye tu primer entreno desde Inicio.\nCalle, cinta, ergos y fuerza, como entrenes hoy.")
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.xl)

                Spacer()

                PrimaryButton(title: "Entrar", action: onEnter)
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.bottom, Theme.Spacing.xl)
            }
        }
    }
}
