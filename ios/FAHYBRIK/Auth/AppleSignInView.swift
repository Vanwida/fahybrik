import SwiftUI
import AuthenticationServices

struct AppleSignInView: View {
    let onAuthenticated: (AppleAuthResponse) -> Void

    @State private var error: String?
    @State private var inProgress: Bool = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.xl) {
                Spacer()

                HStack(spacing: 0) {
                    Text("[F]").foregroundStyle(Theme.Color.accent)
                    Text("AHYBRIK").foregroundStyle(Theme.Color.foreground)
                }
                .font(Theme.Typography.display)

                Text("Entrenar al detalle.")
                    .font(Theme.Typography.body)
                    .foregroundStyle(Theme.Color.muted)

                Spacer()

                SignInWithAppleButton(.continue) { request in
                    request.requestedScopes = [.fullName, .email]
                } onCompletion: { result in
                    switch result {
                    case .success(let auth):
                        guard let credential = auth.credential as? ASAuthorizationAppleIDCredential else {
                            error = "Credencial inválida"
                            return
                        }
                        inProgress = true
                        Task {
                            do {
                                let resp = try await AppleAuthService.exchange(credential)
                                inProgress = false
                                Haptics.success()
                                onAuthenticated(resp)
                            } catch {
                                inProgress = false
                                self.error = "No pudimos verificar con Apple. Reintenta."
                            }
                        }
                    case .failure(let e):
                        if (e as NSError).code != ASAuthorizationError.canceled.rawValue {
                            error = e.localizedDescription
                        }
                    }
                }
                .signInWithAppleButtonStyle(.white)
                .frame(height: 54)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                .padding(.horizontal, Theme.Spacing.xl)

                if let error {
                    Text(error)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.danger)
                        .padding(.horizontal, Theme.Spacing.xl)
                }

                if inProgress {
                    ProgressView().tint(Theme.Color.accent)
                }

                LegalAcknowledgementText()
                    .padding(.horizontal, Theme.Spacing.xl)

                Spacer().frame(height: Theme.Spacing.xl)
            }
        }
    }
}

private struct LegalAcknowledgementText: View {
    private static let privacyURL = URL(string: "https://fahybrik.com/privacy")!
    private static let termsURL = URL(string: "https://fahybrik.com/terms")!

    var body: some View {
        let attributed: AttributedString = {
            var s = AttributedString("Al continuar aceptas los ")
            var terms = AttributedString("Términos")
            terms.link = Self.termsURL
            terms.foregroundColor = Theme.Color.accent
            terms.underlineStyle = .single
            s += terms
            s += AttributedString(" y la ")
            var privacy = AttributedString("Política de privacidad")
            privacy.link = Self.privacyURL
            privacy.foregroundColor = Theme.Color.accent
            privacy.underlineStyle = .single
            s += privacy
            s += AttributedString(".")
            return s
        }()

        return Text(attributed)
            .font(Theme.Typography.caption)
            .foregroundStyle(Theme.Color.muted)
            .multilineTextAlignment(.center)
            .tint(Theme.Color.accent)
    }
}
