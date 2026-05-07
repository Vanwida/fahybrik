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

                Spacer().frame(height: Theme.Spacing.xl)
            }
        }
    }
}
