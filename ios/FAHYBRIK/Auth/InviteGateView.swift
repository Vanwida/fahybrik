import SwiftUI
import AuthenticationServices

// Cold sign-in gate. Shown when someone signs in with Apple but the resulting
// account has no active access (no active/comp subscription) — i.e. they were
// never invited, or their access lapsed.
//
// COMPLIANCE — CRITICAL (Apple Guideline 3.1.3(b), invite-only model):
// This screen contains ZERO commerce. No price, no "suscríbete", no "comprar",
// no link to a paid web flow. The ONLY message is: this app is for invited
// athletes — ask your coach for an invite or open the link they sent you.
struct InviteGateView: View {
    let auth: AuthState
    /// Re-runs Sign in with Apple → re-checks access. On success the parent
    /// routing clears the gate.
    let onRetrySignedIn: (AppleAuthResponse) -> Void

    @State private var error: String? = nil
    @State private var inProgress: Bool = false

    // ARQUETIPO Vacío · altura `centra` (§6). The subject is what is missing and
    // why; the exit — retrying Sign in with Apple — is REQUIRED and lives inside
    // the state, which is what `RedesignEmptyState` enforces. Only the escape
    // ("cerrar sesión") is anchored, so it can never be confused with the way in.
    //
    // Was a `ZStack { fondo; VStack(spacing: .xl) }` with two flexible Spacers
    // and no scroll: at accessibility text sizes it clipped top and bottom.
    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()

            CenteredScreen {
                VStack(spacing: Theme.Spacing.m) {
                    RedesignEmptyState(
                        symbol: "person.badge.key",
                        title: "Esta app es para atletas invitados.",
                        message: "Si tu coach te ha invitado, abre el enlace que te envió o entra con el email que te dio.",
                        exit: .action(title: "Reintentar con Apple", perform: retrySignIn)
                    )

                    if let error {
                        Text(error)
                            .scaledFont(13, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.danger)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, Theme.Spacing.xl)
                    }
                    if inProgress {
                        ProgressView().tint(Theme.Color.accentText)
                    }
                }
                .padding(.vertical, Theme.Spacing.xl)
            }
            .anchoredAction(separator: false) {
                SkipLink(title: "Cerrar sesión") {
                    auth.signOut()
                }
            }
        }
    }

    // MARK: - Retry (re-run Sign in with Apple)
    //
    // We drive the Apple flow directly with an ASAuthorizationController (rather
    // than a SignInWithAppleButton) so the primary CTA can stay on-brand.
    private func retrySignIn() {
        guard !inProgress else { return }
        inProgress = true
        error = nil
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]

        let controller = ASAuthorizationController(authorizationRequests: [request])
        let delegate = AppleRetryDelegate { [self] result in
            Task { @MainActor in await self.handleRetry(result) }
        }
        // Retain the delegate for the lifetime of the request.
        controller.delegate = delegate
        controller.presentationContextProvider = delegate
        Self.retainedDelegate = delegate
        controller.performRequests()
    }

    @MainActor
    private func handleRetry(_ result: Result<ASAuthorization, Error>) async {
        defer { Self.retainedDelegate = nil }
        switch result {
        case .failure(let e):
            inProgress = false
            if (e as NSError).code != ASAuthorizationError.canceled.rawValue {
                error = e.localizedDescription
            }
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
                inProgress = false
                error = "Credencial inválida"
                return
            }
            do {
                let resp = try await AppleAuthService.exchange(credential)
                inProgress = false
                Haptics.success()
                onRetrySignedIn(resp)
            } catch {
                inProgress = false
                self.error = "No pudimos validar tu identidad. Inténtalo de nuevo."
            }
        }
    }

    // Strong reference so the ASAuthorizationController delegate isn't
    // deallocated mid-flight (the controller holds it weakly).
    private static var retainedDelegate: AppleRetryDelegate? = nil
}

// MARK: - Apple authorization delegate
//
// Bridges the UIKit ASAuthorizationController callbacks to a Swift closure so
// the gate can re-trigger Sign in with Apple from a custom button.
private final class AppleRetryDelegate: NSObject,
    ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {

    private let completion: (Result<ASAuthorization, Error>) -> Void

    init(completion: @escaping (Result<ASAuthorization, Error>) -> Void) {
        self.completion = completion
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        completion(.success(authorization))
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        completion(.failure(error))
    }

    func presentationAnchor(
        for controller: ASAuthorizationController
    ) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes
        let windowScene = scenes.first { $0.activationState == .foregroundActive } as? UIWindowScene
            ?? scenes.first as? UIWindowScene
        return windowScene?.keyWindow
            ?? windowScene?.windows.first
            ?? ASPresentationAnchor()
    }
}
