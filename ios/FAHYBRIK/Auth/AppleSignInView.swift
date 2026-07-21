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

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.xl) {
                Spacer()

                Wordmark(size: 64)

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
                    case .failure(let e):
                        if (e as NSError).code != ASAuthorizationError.canceled.rawValue {
                            error = e.localizedDescription
                        }
                    }
                }
                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                .frame(height: 54)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                .padding(.horizontal, Theme.Spacing.xl)

                // Universal path: email + one-time code. Secondary to Apple, but a
                // real alternative for an athlete whose Apple ID ≠ enrolment email.
                Button {
                    Haptics.light()
                    showEmail = true
                } label: {
                    Text("Entrar con mi email")
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

                // Cold-download path: someone who is NOT a member yet → the
                // membership-application funnel (opens in Safari).
                RequestSpotLink()
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.s)

                if let error {
                    Text(error)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.danger)
                        .padding(.horizontal, Theme.Spacing.xl)
                }

                if inProgress {
                    ProgressView().tint(Theme.Color.accentText)
                }

                // ADDITIVE, gated demo entry. Secondary + visually subordinate
                // to Sign in with Apple — never the primary path. Hidden unless
                // the demo build flag is on; the backend additionally 404s the
                // mint endpoint off-demo, so the picker degrades to an honest
                // "demo no disponible" even if the button is ever shown.
                // DEBUG-ONLY: never compiled into a Release / App Store build.
                #if DEBUG
                if DemoEntry.isEnabled, onDemoSession != nil {
                    Button("Entrar como atleta demo") { showDemo = true }
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                        .padding(.top, Theme.Spacing.xs)
                }
                #endif

                LegalAcknowledgementText()
                    .padding(.horizontal, Theme.Spacing.xl)

                Spacer().frame(height: Theme.Spacing.xl)
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
}

// Shown when someone signs in with Apple but has no membership (backend 404
// no_account). Honest: their access is activated by the welcome-email link, and
// non-members can apply for a spot via the funnel. No commerce (Apple 3.1.3(b)).
struct NoAccountView: View {
    let onBack: () -> Void

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.xl) {
                Spacer()

                Wordmark(size: 32)

                VStack(spacing: Theme.Spacing.m) {
                    Text("Aún no tienes acceso.")
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Tu acceso se activa con el enlace de tu email de bienvenida. Ábrelo desde este dispositivo para entrar.")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.Color.muted)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, Theme.Spacing.xl)

                Spacer()

                VStack(spacing: Theme.Spacing.l) {
                    RequestSpotLink()
                        .padding(.horizontal, Theme.Spacing.xl)

                    Button {
                        Haptics.light()
                        onBack()
                    } label: {
                        Text("Volver")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.Color.muted)
                    }
                    .buttonStyle(.plain)
                }

                Spacer().frame(height: Theme.Spacing.xl)
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
            .font(Theme.Typography.caption)
            .foregroundStyle(Theme.Color.muted)
            .multilineTextAlignment(.center)
            .tint(Theme.Color.accentText)
    }
}
