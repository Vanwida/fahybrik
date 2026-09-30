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
        PantallaPerfil(
            titulo: "Invita a tu compañero/a", sobretitulo: "Dobles", alto: sent == nil ? .natural : .llena,
            cierre: .cerrar, cierreActivo: !sending
        ) {
            if let result = sent {
                successCard(result)
            } else {
                formulario
            }
        } pie: {
            if sent == nil {
                AccionAncladaPerfil(
                    titulo: sending ? "Enviando…" : "Enviar invitación",
                    enCurso: sending,
                    habilitada: isValid(email)
                ) {
                    Task { await send() }
                }
            }
        }
        .interactiveDismissDisabled(sending)
        .compactSheet()
    }

    // MARK: - UI

    private var formulario: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            Text("Le mandamos un email con un link para que se cree su cuenta y entrene contigo. Tiene 14 días para aceptar.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            GrupoPerfil {
                CampoTextoPerfil(
                    etiqueta: "Email de tu compañero/a", placeholder: "nombre@email.com", texto: $email,
                    teclado: .emailAddress, capitalizacion: .never
                )
                .textContentType(.emailAddress)
                .autocorrectionDisabled(true)
            }
            if let error {
                AvisoEnLineaPerfil(tono: .peligro, texto: error)
            }
        }
    }

    /// El resultado: el sujeto dice qué pasó de verdad (enviado, o creada pero sin poder enviar) y su salida.
    private func successCard(_ result: InvitationResult) -> some View {
        SujetoDia(
            tono: result.sent ? .ok : .aviso,
            etiqueta: result.sent ? "Email enviado a \(email)" : "No pudimos enviar el email a \(email)"
        ) {
            if result.sent {
                KickerDia("Enviado")
                TituloDia("Email enviado a \(email)")
                ApoyoDia("Tu compañero/a tiene 14 días para aceptar la invitación desde su email.")
            } else {
                // Part (b): the invitation row exists, but Resend did not send.
                // Don't claim "enviado" — be honest and offer a retry.
                KickerDia("Invitación creada")
                TituloDia("No pudimos enviar el email a \(email)")
                ApoyoDia("La invitación queda activa 14 días. Reintenta el envío en un momento.")
            }
        } abajo: {
            Button {
                Haptics.light()
                dismiss()
            } label: {
                AccionDia("Hecho", glifo: .check)
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
            if !result.sent {
                // Sobre el tinte del sujeto el texto es la tinta del tema, no el acento (CONTRATO-UI §11.2).
                Button {
                    Haptics.light()
                    Task { await send() }
                } label: {
                    Text(sending ? "Reenviando…" : "Reintentar envío")
                        .papel(.cuerpoFuerte)
                        .underline()
                        .foregroundStyle(Theme.Color.foreground)
                        .frame(maxWidth: .infinity, minHeight: Theme.Size.toque, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle(escala: 0.96))
                .disabled(sending)
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
