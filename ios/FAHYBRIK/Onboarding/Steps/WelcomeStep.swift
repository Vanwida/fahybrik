import SwiftUI

struct WelcomeStep: View {
    /// FREE (no coach) reframes the pitch to the athlete's own numbers; coached
    /// speaks to the coach relationship — never a hardcoded name.
    var hasCoach: Bool = true
    let onStart: () -> Void
    let onResumeLater: () -> Void

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.xl) {
                Spacer()
                Wordmark(size: 32)

                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    Text("Bienvenido.")
                        .font(Theme.Typography.headlineM)
                        .foregroundStyle(Theme.Color.foreground)

                    Text(hasCoach
                         ? "El siguiente paso es que tu coach conozca tu cuerpo.\nCuanto más sepa, más preciso será tu plan."
                         : "Cuéntanos cómo entrenas.\nCuanto más sepamos, más precisos serán tus números.")
                        .font(Theme.Typography.body)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)

                    Text("~10 min")
                        .font(Theme.Typography.small)
                        .italic()
                        .foregroundStyle(Theme.Color.muted)
                        .padding(.top, Theme.Spacing.s)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.xl)

                Spacer()

                VStack(spacing: Theme.Spacing.m) {
                    PrimaryButton(title: "Empezar", action: onStart)
                    SkipLink(title: "¿Saltar y volver luego?", action: onResumeLater)

                    HStack(spacing: Theme.Spacing.l) {
                        Link("Privacidad", destination: URL(string: "https://fahybrid.com/privacy")!)
                        Text("·").foregroundStyle(Theme.Color.muted)
                        Link("Términos", destination: URL(string: "https://fahybrid.com/terms")!)
                    }
                    .font(Theme.Typography.caption)
                    .tint(Theme.Color.accentText)
                    .padding(.top, Theme.Spacing.s)
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.bottom, Theme.Spacing.xl)
            }
        }
    }
}
