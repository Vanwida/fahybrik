import SwiftUI

struct DoneStep: View {
    let onEnter: () -> Void

    @State private var pulse = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.xl) {
                Spacer()

                Text("✓")
                    .font(.system(size: 96, weight: .heavy))
                    .foregroundStyle(Theme.Color.accent)
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

                    Text("Pablo está armando tu primer plan.")
                        .font(Theme.Typography.body)
                        .foregroundStyle(Theme.Color.foreground)

                    Text("Lo verás en Today en unos minutos.\nMientras, échale un vistazo a la app.")
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
