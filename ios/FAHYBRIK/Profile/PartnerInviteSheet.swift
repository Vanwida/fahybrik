import SwiftUI

// Sheet presented from ProfileView when a Dobles athlete wants to invite
// their partner. Calls POST /api/athlete/partner/invite — backend mails the
// invitee a `fahybrid://partner/redeem?token=…` deep link (mirrored to
// Universal Link once apple-app-site-association ships).
struct PartnerInviteSheet: View {
    let bearer: String?
    let onInvited: (InvitationResult) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var email: String = ""
    @State private var sending: Bool = false
    @State private var error: String? = nil
    @State private var sent: InvitationResult? = nil

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        header
                        if let result = sent {
                            successCard(result)
                        } else {
                            formCard
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.l)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cerrar") { dismiss() }
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }

    // MARK: - UI

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: "DOBLES", color: Theme.Color.accentText)
            Text("Invita a tu compañero/a")
                .font(Theme.Typography.headlineS)
                .foregroundStyle(Theme.Color.foreground)
            Text("Le mandamos un email con un link para que se cree su cuenta y entrene contigo. Tiene 14 días para aceptar.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.muted)
                .padding(.top, 2)
        }
    }

    private var formCard: some View {
        CardSurface(padding: 16) {
            VStack(alignment: .leading, spacing: 14) {
                LabelText(text: "EMAIL DE TU COMPAÑERO/A")
                TextField("nombre@email.com", text: $email)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Theme.Color.foreground)
                    .padding(.vertical, 12)
                    .padding(.horizontal, 12)
                    .background(Theme.Color.background)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                            .stroke(Theme.Color.outline, lineWidth: 1)
                    )
                if let error {
                    Text(error)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.danger)
                }
                ExpertPrimaryButton(
                    title: sending ? "ENVIANDO…" : "ENVIAR INVITACIÓN",
                    enabled: !sending && isValid(email)
                ) {
                    Task { await send() }
                }
            }
        }
    }

    private func successCard(_ result: InvitationResult) -> some View {
        CardSurface(padding: 16, topAccent: true) {
            VStack(alignment: .leading, spacing: 10) {
                if result.sent {
                    LabelText(text: "ENVIADO", color: Theme.Color.ok)
                    Text("Email enviado a \(email)")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Tu compañero/a tiene 14 días para aceptar la invitación desde su email.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.muted)
                } else {
                    // Part (b): the invitation row exists, but Resend did not send.
                    // Don't claim "enviado" — be honest and offer a retry.
                    LabelText(text: "INVITACIÓN CREADA", color: Theme.Color.accentText)
                    Text("No pudimos enviar el email a \(email)")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                    Text("La invitación queda activa 14 días. Reintenta el envío en un momento.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.muted)
                }
                HStack(spacing: 16) {
                    if !result.sent {
                        Button {
                            Haptics.light()
                            Task { await send() }
                        } label: {
                            Text(sending ? "REENVIANDO…" : "Reintentar envío")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Theme.Color.foreground)
                                .padding(.top, 4)
                        }
                        .buttonStyle(.plain)
                        .disabled(sending)
                    }
                    Button {
                        Haptics.light()
                        dismiss()
                    } label: {
                        Text("Hecho")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.Color.accentText)
                            .padding(.top, 4)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Logic

    private func isValid(_ raw: String) -> Bool {
        let s = raw.trimmingCharacters(in: .whitespaces)
        guard s.count >= 5, s.contains("@") else { return false }
        // Minimal RFC 5322 substring check — backend re-validates.
        let parts = s.split(separator: "@")
        guard parts.count == 2 else { return false }
        return parts[1].contains(".") && !parts[1].hasSuffix(".")
    }

    private func send() async {
        guard let bearer else {
            error = "Sesión caducada. Vuelve a entrar."
            return
        }
        sending = true
        error = nil
        defer { sending = false }
        do {
            let result = try await PartnerService.invitePartner(
                email: email.trimmingCharacters(in: .whitespaces),
                bearer: bearer
            )
            Haptics.success()
            sent = result
            onInvited(result)
        } catch let APIError.http(status, body) {
            // Part (c): map the honest backend `error.code` — a 403
            // `inviter_already_paired` must NOT read "sesión caducada".
            switch PartnerService.errorCode(from: body) {
            case "inviter_already_paired": error = "Ya tienes una pareja de Dobles."
            case "inviter_not_dobles":     error = "Las invitaciones de pareja requieren el plan Dobles."
            case "invitee_is_self":        error = "No puedes invitarte a ti mismo/a."
            case "invitee_email_invalid":  error = "Ese email no es válido."
            case "unauthorized":           error = "Tu sesión ha caducado. Vuelve a entrar."
            case "rate_limited":           error = "Has enviado muchas invitaciones. Espera un momento."
            default:
                switch status {
                case 429: error = "Has enviado muchas invitaciones. Espera un momento."
                case 422, 400: error = "Email inválido o no aceptado."
                case 401: error = "Tu sesión ha caducado. Vuelve a entrar."
                default: error = "No pudimos enviar la invitación. Intenta de nuevo."
                }
            }
        } catch {
            self.error = "No pudimos enviar la invitación. Intenta de nuevo."
        }
    }
}
