import SwiftUI
import AuthenticationServices

// Landing surface shown when the athlete opens a coach invite deep link
// (`fahybrid://invite?token=…` or `https://fahybrid.com/invite/<token>`).
// Triggered from AppRoot via `onOpenURL`, mirroring the Dobles partner-redeem
// flow (PartnerRedeemView) — same deep-link plumbing, same Sign-in-with-Apple
// → POST → AuthState handoff.
//
// Flow:
//   1. Show "te han invitado" welcome + "Continuar con Apple".
//   2. SignInWithApple → identity token.
//   3. POST /api/athlete/invite/redeem { identity_token, invite_token }.
//      The backend binds this Apple ID to the invite's pre-provisioned account
//      (independent of email) and returns an active session.
//   4. Store the returned bearer into AuthState → app (or onboarding).
//
// COMPLIANCE: invite-only, ZERO commerce — no price, no "subscribe", no link
// to a paid web flow (Apple Guideline 3.1.3(b)).
struct InviteLandingView: View {
    let inviteToken: String
    let auth: AuthState
    let onCompleted: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var error: String? = nil
    @State private var inProgress: Bool = false

    // ARQUETIPO Vacío · altura `centra` (§6). What is missing is the activation;
    // the invitation itself is the subject, so it centres, and the single way in
    // is anchored. Composed by hand rather than through `RedesignEmptyState`
    // because the exit HAS to be Apple's own button — the component's exit is an
    // `ExpertPrimaryButton`, and Sign in with Apple may not be re-skinned.
    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()

            CenteredScreen {
                VStack(spacing: Theme.Spacing.m) {
                    Wordmark(size: 28)
                        .padding(.bottom, Theme.Spacing.s)
                    LabelText(text: "Te han invitado", color: Theme.Color.accentText)
                    Text("Activa tu cuenta")
                        .font(Theme.Typography.headlineM)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Tu coach te ha invitado a entrenar en FAHYBRID. Inicia sesión con Apple para activar tu cuenta.")
                        .scaledFont(16, relativeTo: .body)
                        .foregroundStyle(Theme.Color.muted)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.vertical, Theme.Spacing.xl)
            }
            .anchoredAction(separator: false) {
                VStack(spacing: Theme.Spacing.m) {
                    if let error {
                        Text(error)
                            .scaledFont(13, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.danger)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if inProgress {
                        ProgressView().tint(Theme.Color.accentText)
                    }

                    SignInWithAppleButton(.continue) { request in
                        request.requestedScopes = [.fullName, .email]
                    } onCompletion: { result in
                        handleApple(result)
                    }
                    .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                    // Apple's control renders its own label and does not reflow,
                    // so it keeps a fixed height.
                    .frame(height: Theme.Size.control)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                    .disabled(inProgress)
                    .opacity(inProgress ? 0.6 : 1)
                    .accessibilityLabel("Iniciar sesión con Apple para activar tu invitación")
                }
                .padding(.horizontal, Theme.Spacing.s)
            }
        }
    }

    private func handleApple(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .failure(let e):
            if (e as NSError).code != ASAuthorizationError.canceled.rawValue {
                error = e.localizedDescription
            }
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
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

    @MainActor
    private func redeem(identity: String) async {
        defer { inProgress = false }
        do {
            let resp = try await InviteService.redeemInvite(
                identityToken: identity,
                inviteToken: inviteToken
            )
            Haptics.success()
            auth.acceptAppleResponse(resp)
            // Invite redemption grants active access by construction — mark it
            // so the cold gate never flashes on this path.
            auth.markAccessActive()
            onCompleted()
        } catch let APIError.http(status, body) {
            let bodyStr = String(data: body, encoding: .utf8) ?? ""
            switch status {
            case 410:      error = "Esta invitación ha caducado. Pide a tu coach que te la reenvíe."
            case 409:      error = "Esta invitación ya se ha usado."
            case 404:      error = "Invitación no encontrada. Comprueba el enlace que te envió tu coach."
            case 401, 403: error = "No pudimos validar tu identidad de Apple."
            default:       error = "Error \(status). \(bodyStr.prefix(140))"
            }
        } catch {
            self.error = "No pudimos activar tu invitación. Inténtalo de nuevo."
        }
    }
}
