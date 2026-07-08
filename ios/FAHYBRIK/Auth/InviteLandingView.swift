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
    /// Presents the email-code activation — the universal path for an athlete
    /// whose Apple ID doesn't match their enrolment email (or who has no Apple).
    @State private var showEmail: Bool = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.xl) {
                Spacer()

                Wordmark(size: 28)

                VStack(spacing: 12) {
                    LabelText(text: "Te han invitado", color: Theme.Color.accentText)
                    Text("Activa tu cuenta")
                        .font(Theme.Typography.headlineM)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Tu coach te ha invitado a entrenar en FAHYBRID. Inicia sesión con Apple para activar tu cuenta.")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Color.muted)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
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
                .accessibilityLabel("Iniciar sesión con Apple para activar tu invitación")

                // Universal path: activate with email + a one-time code. For an
                // athlete whose Apple ID ≠ enrolment email, or with no Apple device.
                Button {
                    Haptics.light()
                    showEmail = true
                } label: {
                    Text("Activar con mi email")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                                .strokeBorder(Theme.Color.outline, lineWidth: 1)
                        )
                }
                .buttonStyle(PressScaleStyle())
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.xs)
                .disabled(inProgress)

                if let error {
                    Text(error)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.danger)
                        .padding(.horizontal, Theme.Spacing.xl)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if inProgress {
                    ProgressView().tint(Theme.Color.accentText)
                }

                Spacer().frame(height: Theme.Spacing.xl)
            }
        }
        .sheet(isPresented: $showEmail) {
            EmailSignInView(
                onAuthenticated: { resp in
                    showEmail = false
                    Haptics.success()
                    auth.acceptAppleResponse(resp)
                    // Redemption granted active access by construction — mark it
                    // so the cold gate never flashes on this path.
                    auth.markAccessActive()
                    onCompleted()
                },
                onClose: { showEmail = false },
                inviteToken: inviteToken
            )
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
