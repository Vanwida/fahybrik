import SwiftUI
import AuthenticationServices

// Landing surface for the *invitee* device when the user opens the email
// deep link. Triggered from FAHYBRIKApp via `onOpenURL` when the URL matches
// `fahybrid://partner/redeem?token=…` (custom scheme — Universal Link will
// flip on once apple-app-site-association ships in /web/public/.well-known).
//
// Flow:
//   1. Show welcome + "Continuar con Apple".
//   2. SignInWithApple → identity token.
//   3. POST /api/athlete/partner/redeem { token, apple_identity_token }.
//   4. Store the returned bearer into AuthState → onboarding stage.
//      (Their own onboarding — NOT cloned from the inviter.)
struct PartnerRedeemView: View {
    let token: String
    let auth: AuthState
    let onCompleted: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var error: String? = nil
    @State private var inProgress: Bool = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.xl) {
                Spacer()

                Wordmark(size: 28)

                VStack(spacing: 12) {
                    LabelText(text: "INVITACIÓN A DOBLES", color: Theme.Color.accentText)
                    Text("Bienvenido/a")
                        .font(Theme.Typography.headlineM)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Tu compañero/a te ha invitado a entrenar juntos en FAHYBRID. Continúa con Apple para crear tu cuenta.")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Color.muted)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, Theme.Spacing.xl)
                }

                Spacer()

                SignInWithAppleButton(.continue) { request in
                    request.requestedScopes = [.fullName, .email]
                } onCompletion: { result in
                    handleApple(result)
                }
                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                .frame(height: 54)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                .padding(.horizontal, Theme.Spacing.xl)
                .disabled(inProgress)
                .opacity(inProgress ? 0.6 : 1)

                if let error {
                    Text(error)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.danger)
                        .padding(.horizontal, Theme.Spacing.xl)
                        .multilineTextAlignment(.center)
                }
                if inProgress {
                    ProgressView().tint(Theme.Color.accentText)
                }

                Spacer().frame(height: Theme.Spacing.xl)
            }
        }
    }

    private func handleApple(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .failure(let e):
            if (e as NSError).code != ASAuthorizationError.canceled.rawValue {
                error = e.localizedDescription
            }
        case .success(let auth):
            guard let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let identity = String(data: tokenData, encoding: .utf8) else {
                error = "Credencial inválida"
                return
            }
            inProgress = true
            error = nil
            Task { await redeem(identity: identity) }
        }
    }

    private func redeem(identity: String) async {
        defer { inProgress = false }
        do {
            let resp = try await PartnerService.redeem(
                token: token,
                appleIdentityToken: identity
            )
            Haptics.success()
            let envelope = AppleAuthResponse(
                sessionToken: resp.sessionToken,
                athleteId: resp.athleteId,
                onboardedAt: resp.onboardedAt
            )
            self.auth.acceptAppleResponse(envelope)
            onCompleted()
        } catch let APIError.http(status, body) {
            let bodyStr = String(data: body, encoding: .utf8) ?? ""
            switch status {
            case 410:      error = "Esta invitación ha caducado."
            case 409:      error = "Ya has aceptado una invitación previa."
            case 404:      error = "Invitación no encontrada."
            case 401, 403: error = "No pudimos validar tu identidad de Apple."
            default:       error = "Error \(status). \(bodyStr.prefix(140))"
            }
        } catch {
            self.error = "No pudimos completar la invitación. Intenta de nuevo."
        }
    }
}
