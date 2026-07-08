import SwiftUI

// Passwordless EMAIL-CODE login sheet. Two beats:
//   1. enter email  → "Enviar código" (backend emails a 6-digit code; the response
//      is enumeration-safe, so we always advance).
//   2. enter code   → "Entrar" → mints the SAME athlete session as Sign in with
//      Apple and hands the response back through `onAuthenticated`.
// Presented from AppleSignInView; the "Solicita tu plaza" funnel link stays there.
struct EmailSignInView: View {
    /// Same callback Sign in with Apple uses — the host seats the session via
    /// AuthState.acceptAppleResponse, so downstream screens behave identically.
    let onAuthenticated: (AppleAuthResponse) -> Void
    let onClose: () -> Void

    private enum Phase { case email, code }
    private enum Field { case email, code }

    @State private var phase: Phase = .email
    @State private var email: String = ""
    @State private var code: String = ""
    @State private var inProgress: Bool = false
    @State private var error: String?
    @State private var info: String?
    @FocusState private var focus: Field?

    private var normalizedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
    private var emailLooksValid: Bool {
        let e = normalizedEmail
        guard let at = e.firstIndex(of: "@"), at != e.startIndex else { return false }
        let domain = e[e.index(after: at)...]
        return domain.contains(".") && !domain.hasSuffix(".")
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()

            VStack(spacing: 0) {
                closeBar
                ScrollView {
                    VStack(spacing: Theme.Spacing.xl) {
                        Wordmark(size: 32)
                            .padding(.top, Theme.Spacing.s)
                        switch phase {
                        case .email: emailPhase
                        case .code: codePhase
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
                .scrollDismissesKeyboard(.interactively)
            }
        }
        .onAppear { focus = .email }
    }

    private var closeBar: some View {
        HStack {
            Spacer()
            Button {
                Haptics.light()
                onClose()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, Theme.Spacing.s)
        .padding(.top, Theme.Spacing.s)
    }

    // MARK: - Phase 1: email

    private var emailPhase: some View {
        VStack(spacing: Theme.Spacing.l) {
            VStack(spacing: Theme.Spacing.s) {
                Text("Entra con tu email")
                    .font(Theme.Typography.headlineS)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Te enviaremos un código de 6 dígitos para entrar.")
                    .font(Theme.Typography.body)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            TextField("tu@email.com", text: $email)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.go)
                .focused($focus, equals: .email)
                .onSubmit { if emailLooksValid { requestCode(resend: false) } }
                .brandFieldStyle()

            ExpertPrimaryButton(
                title: inProgress ? "Enviando…" : "Enviar código",
                enabled: emailLooksValid && !inProgress
            ) {
                requestCode(resend: false)
            }

            if let error {
                errorText(error)
            }
        }
    }

    // MARK: - Phase 2: code

    private var codePhase: some View {
        VStack(spacing: Theme.Spacing.l) {
            VStack(spacing: Theme.Spacing.s) {
                Text("Revisa tu email")
                    .font(Theme.Typography.headlineS)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Escribe el código que enviamos a \(normalizedEmail).")
                    .font(Theme.Typography.body)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            TextField("000000", text: $code)
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .tracking(8)
                .multilineTextAlignment(.center)
                .focused($focus, equals: .code)
                .onChange(of: code) { _, newValue in
                    let filtered = String(newValue.filter(\.isNumber).prefix(6))
                    if filtered != code { code = filtered }
                }
                .brandFieldStyle()

            ExpertPrimaryButton(
                title: inProgress ? "Entrando…" : "Entrar",
                enabled: code.count == 6 && !inProgress
            ) {
                verifyCode()
            }

            if let error {
                errorText(error)
            } else if let info {
                Text(info)
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
            }

            HStack(spacing: Theme.Spacing.l) {
                Button("Reenviar código") { requestCode(resend: true) }
                    .disabled(inProgress)
                Text("·").foregroundStyle(Theme.Color.faint)
                Button("Cambiar email") {
                    error = nil; info = nil; code = ""
                    withAnimation { phase = .email }
                    focus = .email
                }
                .disabled(inProgress)
            }
            .font(Theme.Typography.small)
            .foregroundStyle(Theme.Color.accentText)
            .padding(.top, Theme.Spacing.xs)
        }
    }

    private func errorText(_ message: String) -> some View {
        Text(message)
            .font(Theme.Typography.small)
            .foregroundStyle(Theme.Color.danger)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - Actions

    private func requestCode(resend: Bool) {
        guard emailLooksValid else { return }
        error = nil; info = nil; inProgress = true
        let target = normalizedEmail
        Task {
            do {
                try await EmailAuthService.requestCode(email: target)
                inProgress = false
                Haptics.light()
                if resend {
                    code = ""
                    info = "Te hemos enviado un código nuevo."
                    focus = .code
                } else {
                    withAnimation { phase = .code }
                    focus = .code
                }
            } catch APIError.http(let status, _) where status == 429 {
                inProgress = false
                error = "Has pedido demasiados códigos. Espera un momento e inténtalo de nuevo."
            } catch APIError.offline {
                inProgress = false
                error = "Sin conexión."
            } catch {
                inProgress = false
                self.error = "No hemos podido enviar el código. Inténtalo de nuevo."
            }
        }
    }

    private func verifyCode() {
        guard code.count == 6 else { return }
        error = nil; info = nil; inProgress = true
        let target = normalizedEmail
        let submitted = code
        Task {
            do {
                let resp = try await EmailAuthService.verifyCode(email: target, code: submitted)
                inProgress = false
                Haptics.success()
                onAuthenticated(resp)
            } catch APIError.http(let status, let body) {
                inProgress = false
                Haptics.error()
                let bodyStr = String(data: body, encoding: .utf8) ?? ""
                if bodyStr.contains("too_many_attempts") || status == 429 {
                    error = "Demasiados intentos. Pide un código nuevo."
                } else {
                    error = "El código no es válido o ha caducado. Revísalo o pide uno nuevo."
                }
            } catch APIError.offline {
                inProgress = false
                error = "Sin conexión."
            } catch {
                inProgress = false
                self.error = "No hemos podido validar el código. Inténtalo de nuevo."
            }
        }
    }
}

// Rounded, sunken brand field used by the email + code inputs.
private extension View {
    func brandFieldStyle() -> some View {
        self
            .font(Theme.Typography.body)
            .foregroundStyle(Theme.Color.foreground)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .frame(maxWidth: .infinity)
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .strokeBorder(Theme.Color.outline, lineWidth: 1)
            )
            .tint(Theme.Color.accent)
    }
}
