import SwiftUI

enum AppLinks {
    /// Public membership-application funnel (fahybrid.com/es/empieza). This is a
    /// price-free APPLICATION form ("solicita tu plaza") — not a checkout — and it
    /// is opened in the EXTERNAL browser (openURL), so any later web payment
    /// happens clearly outside the app (App Store personal-service posture).
    static let funnel = URL(string: "https://fahybrid.com/es/empieza")!
}

/// "¿Aún no entrenas con nosotros? Solicita tu plaza" → opens the funnel in Safari.
/// Reused on the pre-auth welcome and the no-account state. Club-toned, no
/// commerce button, no price — a membership application, kept 3.1.3(b)-safe.
struct RequestSpotLink: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        Button {
            Haptics.light()
            openURL(AppLinks.funnel)
        } label: {
            VStack(spacing: 3) {
                Text("¿Aún no entrenas con nosotros?")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.muted)
                Text("Solicita tu plaza")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Solicita tu plaza. Abre la web en Safari.")
    }
}
