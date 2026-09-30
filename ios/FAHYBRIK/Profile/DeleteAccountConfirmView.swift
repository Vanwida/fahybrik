import SwiftUI

// Destructive RGPD modal. Two safety rails before the DELETE request fires:
//   1. The atleta must type "ELIMINAR MI CUENTA" exactly (case + spaces).
//   2. The "Confirmar eliminación" button stays disabled until the input
//      matches AND a network request is not in flight.
//
// On success: wipes local state, calls `onCompleted` (which triggers sign-out
// + push to AppleSignInView at AppRoot level), and displays a closing
// confirmation screen for ~3 seconds before dismissing.
struct DeleteAccountConfirmView: View {
    let bearer: String
    /// Optional first name of the paired partner — included in the warning
    /// copy when present ("Tu compañero/a [name] será notificado/a").
    let partnerName: String?
    /// Called once the deletion request returns successfully AND the user
    /// dismisses the closing screen. The AppRoot wires this to `auth.signOut()`.
    let onCompleted: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var reason: String = ""
    @State private var confirmationInput: String = ""
    @State private var loading: Bool = false
    @State private var error: String? = nil
    @State private var didDelete: Bool = false

    private var canSubmit: Bool {
        confirmationInput.trimmingCharacters(in: .whitespacesAndNewlines)
            == AccountService.deleteConfirmationPhraseEs && !loading
    }

    var body: some View {
        if didDelete {
            closingScreen
        } else {
            form
        }
    }

    // MARK: - Form (pre-confirmation)

    /// En una pantalla destructiva la salida tiene que verse SIN scrollear: el «Cancelar» vive en la barra de la
    /// hoja, arriba, y la acción que destruye va anclada abajo; ni una ni otra es la cola de un scroll que exige
    /// leer antes un aviso y dos campos.
    private var form: some View {
        PantallaPerfil(titulo: "Eliminar mi cuenta", sobretitulo: "RGPD · Art. 17", cierre: .cancelar, cierreActivo: !loading) {
            warningCard
            reasonField
            confirmationField
            if let error {
                AvisoEnLineaPerfil(tono: .peligro, texto: error)
            }
        } pie: {
            confirmButton
        }
        .interactiveDismissDisabled(loading)
    }

    private var warningCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text("Esta acción es permanente.")
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
            bullet("Se eliminarán todos tus datos en 30 días.")
            bullet("Tu suscripción se cancelará al final del periodo pagado.")
            if let partnerName, !partnerName.isEmpty {
                bullet("Tu compañero/a \(partnerName) (Dobles) será notificado/a.")
            }
            bullet("Recibirás un email de confirmación tras esta acción.")
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaDia()
        .overlay(alignment: .leading) {
            // El peligro va en la marca: una barra del color de peligro en el borde de la tarjeta.
            Rectangle().fill(Theme.Color.danger).frame(width: 4).accessibilityHidden(true)
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
            Circle().fill(Theme.Color.danger).frame(width: 8, height: 8).accessibilityHidden(true)
            Text(text)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var reasonField: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("¿Por qué te vas? (opcional)")
            GrupoPerfil {
                TextField(
                    "",
                    text: $reason,
                    prompt: Text("Ayúdanos a mejorar").foregroundStyle(Theme.Color.muted),
                    axis: .vertical
                )
                .lineLimit(3...5)
                .textInputAutocapitalization(.sentences)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .accessibilityLabel("¿Por qué te vas? Opcional")
                .padding(Theme.Spacing.l)
                .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
            }
        }
    }

    private var confirmationField: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Para confirmar, escribe ELIMINAR MI CUENTA")
            GrupoPerfil {
                CampoTextoPerfil(
                    etiqueta: "Confirmación", placeholder: "ELIMINAR MI CUENTA", texto: $confirmationInput,
                    capitalizacion: .characters, nombreAccesible: "Escribe ELIMINAR MI CUENTA para confirmar"
                )
                .autocorrectionDisabled(true)
            }
        }
    }

    /// La acción que destruye: el peligro va en el TEXTO y en el borde, nunca en un fondo rojo; deshabilitada hasta
    /// que la frase coincide.
    private var confirmButton: some View {
        Button(action: submit) {
            HStack(spacing: Theme.Spacing.s) {
                if loading { ProgressView() }
                Text("Confirmar eliminación").papel(.accion)
            }
            .foregroundStyle(Theme.Color.danger)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.accion)
            .padding(.horizontal, 22)
            .overlay(Capsule().strokeBorder(Theme.Color.danger.opacity(0.6), lineWidth: 2))
            .opacity(canSubmit ? 1 : 0.4)
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.98))
        .disabled(!canSubmit)
    }

    // MARK: - Closing state

    private var closingScreen: some View {
        FillingScreen {
            SujetoDia(tono: .neutro, etiqueta: "Cuenta marcada para eliminación. Tu cuenta se eliminará en 30 días.") {
                KickerDia("Cuenta marcada para eliminación")
                TituloDia("Tu cuenta se eliminará en 30 días.")
                ApoyoDia("Te enviamos un email de confirmación. Puedes contactar \(Marca.soporteEmail) si necesitas cancelar la solicitud antes de 30 días.")
            } abajo: {
                Button {
                    Haptics.medium()
                    dismiss()
                    // Slight defer so the sheet dismiss animation completes
                    // before AppRoot swaps to AppleSignInView.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                        onCompleted()
                    }
                } label: {
                    AccionDia("Cerrar sesión")
                }
                .buttonStyle(PressScaleStyle(escala: 0.96))
            }
            .padding(EdgeInsets(top: Theme.Spacing.xl, leading: Theme.Spacing.pantalla, bottom: Theme.Spacing.xl, trailing: Theme.Spacing.pantalla))
        }
        .background(Theme.Color.background.ignoresSafeArea())
    }

    // MARK: - Submit

    private func submit() {
        guard canSubmit else { return }
        Haptics.medium()
        error = nil
        loading = true
        Task {
            do {
                let trimmedReason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
                try await AccountService.deleteAccount(
                    reason: trimmedReason.isEmpty ? nil : trimmedReason,
                    bearer: bearer
                )
                // Wipe local state immediately so any background scheduled
                // task that fires before sign-out can't re-cache the user.
                AccountService.wipeLocalState()
                await MainActor.run {
                    loading = false
                    didDelete = true
                }
            } catch let APIError.http(status, _) {
                await MainActor.run {
                    loading = false
                    error = status == 401
                        ? "Tu sesión ha caducado. Vuelve a iniciar sesión."
                        : "No pudimos eliminar tu cuenta. Inténtalo de nuevo (HTTP \(status))."
                }
            } catch {
                await MainActor.run {
                    loading = false
                    self.error = "No pudimos eliminar tu cuenta. Revisa tu conexión e inténtalo de nuevo."
                }
            }
        }
    }
}

// MARK: - Internal helper exposed for testing
//
// XCTest cannot reach `canSubmit` (private), so this free function mirrors the
// rule that the button uses. Keep both in sync.
func deleteAccountCanSubmit(input: String, loading: Bool) -> Bool {
    input.trimmingCharacters(in: .whitespacesAndNewlines)
        == AccountService.deleteConfirmationPhraseEs && !loading
}
