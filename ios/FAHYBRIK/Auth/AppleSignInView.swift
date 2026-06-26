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
    @State private var showDemo: Bool = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: Theme.Spacing.xl) {
                Spacer()

                HStack(spacing: 0) {
                    Text("[F]").foregroundStyle(Theme.Color.accentText)
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
                            } catch let apiErr as APIError {
                                inProgress = false
                                switch apiErr {
                                case .http(let code, let body):
                                    let bodyStr = String(data: body, encoding: .utf8) ?? ""
                                    self.error = "HTTP \(code): \(bodyStr.prefix(220))"
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
                if DemoEntry.isEnabled, onDemoSession != nil {
                    Button("Entrar como atleta demo") { showDemo = true }
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                        .padding(.top, Theme.Spacing.xs)
                }

                LegalAcknowledgementText()
                    .padding(.horizontal, Theme.Spacing.xl)

                Spacer().frame(height: Theme.Spacing.xl)
            }
        }
        .sheet(isPresented: $showDemo) {
            DemoSignInView { bearer, athleteId in
                showDemo = false
                onDemoSession?(bearer, athleteId)
            }
        }
    }
}

// Gates the additive demo-entry button. Reads the optional Info.plist key
// `FahybrikDemoEntry` ("1" → on, "0" → off); absent → on in DEBUG, off in
// Release. This is a UX gate only — the real security gate is server-side
// (the mint endpoint 404s unless DEMO_ACCESS=1), so a stray button can never
// grant access on its own.
enum DemoEntry {
    static var isEnabled: Bool {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "FahybrikDemoEntry") as? String {
            return raw == "1"
        }
        #if DEBUG
        return true
        #else
        return false
        #endif
    }
}

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
