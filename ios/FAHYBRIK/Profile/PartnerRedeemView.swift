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
    @State private var declining: Bool = false
    @State private var declined: Bool = false

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

                if declined {
                    VStack(spacing: 8) {
                        Image(systemName: "checkmark.circle")
                            .font(.system(size: 30))
                            .foregroundStyle(Theme.Color.muted)
                        Text("Invitación rechazada")
                            .font(Theme.Typography.headlineS)
                            .foregroundStyle(Theme.Color.foreground)
                        Text("Se lo haremos saber a tu compañero/a. Ya puedes cerrar esta pantalla.")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.Color.muted)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, Theme.Spacing.xl)
                    }
                } else {
                    SignInWithAppleButton(.continue) { request in
                        request.requestedScopes = [.fullName, .email]
                    } onCompletion: { result in
                        handleApple(result)
                    }
                    .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                    .frame(height: 54)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                    .padding(.horizontal, Theme.Spacing.xl)
                    .disabled(inProgress || declining)
                    .opacity((inProgress || declining) ? 0.6 : 1)

                    Button {
                        Haptics.light()
                        Task { await decline() }
                    } label: {
                        Text(declining ? "Rechazando…" : "Rechazar invitación")
                            .font(Theme.Typography.small)
                            .foregroundStyle(Theme.Color.muted)
                    }
                    .buttonStyle(.plain)
                    .disabled(inProgress || declining)

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
            error = Self.redeemErrorMessage(code: PartnerService.errorCode(from: body), status: status)
        } catch {
            self.error = "No pudimos completar la invitación. Intenta de nuevo."
        }
    }

    private func decline() async {
        declining = true
        error = nil
        defer { declining = false }
        do {
            try await PartnerService.declineInvite(token: token)
            Haptics.success()
            declined = true
        } catch let APIError.http(status, body) {
            error = Self.redeemErrorMessage(code: PartnerService.errorCode(from: body), status: status)
        } catch {
            self.error = "No pudimos rechazar la invitación. Intenta de nuevo."
        }
    }

    /// Maps the backend `error.code` (falling back to HTTP status) to honest
    /// invitee-facing copy — shared by the accept and decline paths. A 403
    /// `already_paired` no longer reads as "sesión caducada".
    private static func redeemErrorMessage(code: String?, status: Int) -> String {
        switch code {
        case "token_already_used":           return "Esta invitación ya se ha usado."
        case "token_cancelled":              return "Tu compañero/a canceló la invitación."
        case "token_declined":               return "Esta invitación ya fue rechazada."
        case "token_expired":                return "Esta invitación ha caducado."
        case "token_invalid":                return "No encontramos esta invitación."
        case "inviter_already_paired":       return "Tu compañero/a ya tiene una pareja de Dobles."
        case "accepted_user_already_paired": return "Ya tienes una pareja de Dobles."
        case "user_already_exists":          return "Ya tienes una cuenta en FAHYBRID. Pídele a vuestro coach que os empareje como pareja de Dobles."
        case "apple_token_invalid", "auth_required": return "No pudimos validar tu identidad de Apple."
        default:
            switch status {
            case 410:      return "Esta invitación ya no está disponible."
            case 409:      return "Esta invitación ya se ha usado."
            case 404:      return "No encontramos esta invitación."
            case 401, 403: return "No pudimos validar tu identidad de Apple."
            default:       return "No pudimos completar la invitación. Intenta de nuevo."
            }
        }
    }
}
