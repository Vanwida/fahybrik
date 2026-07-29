import SwiftUI
import AuthenticationServices

struct AppleSignInView: View {
    let onAuthenticated: (AppleAuthResponse) -> Void
    /// ADDITIVE demo entry. Called when a demo athlete session is minted; the
    /// host seats it via `AuthState.acceptDemoSession`. Never touches the real
    /// Sign in with Apple path above it.
    var onDemoSession: ((_ bearer: String, _ athleteId: String) -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme
    @State private var error: String?
    @State private var inProgress: Bool = false
    #if DEBUG
    @State private var showDemo: Bool = false
    #endif
    /// Presents the passwordless email-code login — the universal path for an
    /// athlete whose Apple ID doesn't match their enrolment email.
    @State private var showEmail: Bool = false
    /// Shown when Sign in with Apple succeeds at Apple but the backend has no
    /// membership for this Apple ID (404 no_account) — an organic download.
    @State private var showNoAccount: Bool = false

    // ARQUETIPO Vacío · altura `centra` (docs/CONTRATO-UI.md §6). What is
    // missing is the session, and the way out is the door itself: the identity
    // block centres in the height it does not fill, and every way in lives in
    // the anchored footer, where the thumb is.
    //
    // Was two flexible `Spacer()`s around a `Spacer().frame(height: .xl)` — a
    // flexible hole in the middle, 24 pt between absolutely everything, and the
    // Apple button floating in the flow with the email alternative under it. At
    // accessibility text sizes the whole stack clipped top and bottom and
    // "Entrar con mi email" — the only real alternative for an athlete whose
    // Apple ID is not their enrolment email — became unreachable.
    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()

            CenteredScreen {
                VStack(spacing: Theme.Spacing.m) {
                    Wordmark(size: 64)
                    Text("Entrenar al detalle.")
                        .scaledFont(16, relativeTo: .body)
                        .foregroundStyle(Theme.Color.muted)
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

                    appleButton

                    // Universal path: email + one-time code. Secondary to Apple,
                    // but a real alternative for an athlete whose Apple ID ≠
                    // enrolment email — so it is anchored next to it, never below
                    // the fold.
                    SecondaryButton(title: "Entrar con mi email") {
                        showEmail = true
                    }

                    // Cold-download path: someone who is NOT a member yet → the
                    // membership-application funnel (opens in Safari).
                    RequestSpotLink()

                    // ADDITIVE, gated demo entry. Secondary + visually subordinate
                    // to Sign in with Apple — never the primary path. Hidden unless
                    // the demo build flag is on; the backend additionally 404s the
                    // mint endpoint off-demo, so the picker degrades to an honest
                    // "demo no disponible" even if the button is ever shown.
                    // DEBUG-ONLY: never compiled into a Release / App Store build.
                    #if DEBUG
                    if DemoEntry.isEnabled, onDemoSession != nil {
                        SkipLink(title: "Entrar como atleta demo") { showDemo = true }
                    }
                    #endif

                    LegalAcknowledgementText()
                }
                // 16 (the footer's own inset) + 8 = the 24 pt gutter the rest of
                // the screen uses.
                .padding(.horizontal, Theme.Spacing.s)
            }
        }
        .sheet(isPresented: $showEmail) {
            EmailSignInView(
                onAuthenticated: { resp in
                    showEmail = false
                    onAuthenticated(resp)
                },
                onClose: { showEmail = false }
            )
        }
        #if DEBUG
        .sheet(isPresented: $showDemo) {
            DemoSignInView { bearer, athleteId in
                showDemo = false
                onDemoSession?(bearer, athleteId)
            }
        }
        #endif
        .fullScreenCover(isPresented: $showNoAccount) {
            NoAccountView { showNoAccount = false }
        }
    }

    // MARK: - Sign in with Apple
    //
    // Apple's own control, so it keeps a FIXED height: it renders its own label
    // and does not reflow at large Dynamic Type (our buttons next to it take
    // `Theme.Size.control` as a minimum and grow instead).
    private var appleButton: some View {
        SignInWithAppleButton(.continue) { request in
            request.requestedScopes = [.fullName, .email]
        } onCompletion: { result in
            handle(result)
        }
        .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
        .frame(height: Theme.Size.control)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }

    private func handle(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .failure(let e):
            if (e as NSError).code != ASAuthorizationError.canceled.rawValue {
                error = e.localizedDescription
            }
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
                } catch let apiErr as APIError {
                    inProgress = false
                    switch apiErr {
                    case .http(let code, let body):
                        let bodyStr = String(data: body, encoding: .utf8) ?? ""
                        if code == 404, bodyStr.contains("no_account") {
                            // Signed in fine, but not a member → funnel.
                            showNoAccount = true
                        } else {
                            self.error = "HTTP \(code): \(bodyStr.prefix(220))"
                        }
                    case .offline:
                        self.error = "Sin conexión."
                    case .invalidResponse:
                        self.error = "Respuesta inválida del servidor."
                    case .decoding(let dec):
                        self.error = "Decoding: \(dec.localizedDescription)"
                    }
                } catch {
                    inProgress = false
                    self.error = "Error: \(error.localizedDescription)"
                }
            }
        }
    }
}

// Shown when someone signs in with Apple but has no account yet (backend 404
// no_account — the login is find-only while the open free signup is off).
// HONEST in both worlds: it never claims signing up is impossible, and it
// never promises a welcome email to someone who was never enrolled. When the
// server flips to open signup, this 404 stops firing and the same login flow
// simply enters — no separate registration screen exists or is needed.
// No commerce (Apple 3.1.3(b)).
struct NoAccountView: View {
    let onBack: () -> Void

    // ARQUETIPO Vacío · altura `centra` (§6). The subject is what is missing and
    // why, so it is the shared `RedesignEmptyState` — same piece the rest of the
    // app uses — centred, with the funnel and the way back anchored below.
    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()

            CenteredScreen {
                RedesignEmptyState(
                    symbol: "envelope.badge",
                    title: "Aún no tienes cuenta activa.",
                    message: "Entra con el mismo email con el que tu coach te dio de alta, o abre el enlace de tu email de bienvenida.",
                    exit: .explained(
                        note: "Si tu coach acaba de darte de alta, el email de bienvenida puede tardar unos minutos."
                    )
                )
                .padding(.vertical, Theme.Spacing.xl)
            }
            .anchoredAction(separator: false) {
                VStack(spacing: Theme.Spacing.m) {
                    RequestSpotLink()
                    SkipLink(title: "Volver", action: onBack)
                }
                .padding(.horizontal, Theme.Spacing.s)
            }
        }
    }
}

// Gates the additive demo-entry button. DEBUG-ONLY — the whole enum is stripped
// from Release along with the rest of the demo path, so the real security gate
// (server-side: the mint endpoint 404s unless DEMO_ACCESS=1) is never even
// reachable in the App Store binary. Reads the optional Info.plist key
// `FahybrikDemoEntry` ("1" → on, "0" → off); absent → on (this only ever
// compiles in DEBUG).
#if DEBUG
enum DemoEntry {
    static var isEnabled: Bool {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "FahybrikDemoEntry") as? String {
            return raw == "1"
        }
        return true
    }
}
#endif

private struct LegalAcknowledgementText: View {
    private static let privacyURL = URL(string: "https://fahybrid.com/privacy")!
    private static let termsURL = URL(string: "https://fahybrid.com/terms")!

    var body: some View {
        let attributed: AttributedString = {
            var s = AttributedString("Al continuar aceptas los ")
            var terms = AttributedString("Términos")
            terms.link = Self.termsURL
            terms.foregroundColor = Theme.Color.accentText
            terms.underlineStyle = .single
            s += terms
            s += AttributedString(" y la ")
            var privacy = AttributedString("Política de privacidad")
            privacy.link = Self.privacyURL
            privacy.foregroundColor = Theme.Color.accentText
            privacy.underlineStyle = .single
            s += privacy
            s += AttributedString(".")
            return s
        }()

        return Text(attributed)
            .scaledFont(12, weight: .medium, relativeTo: .caption)
            .foregroundStyle(Theme.Color.muted)
            .multilineTextAlignment(.center)
            .tint(Theme.Color.accentText)
    }
}
