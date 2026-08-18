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
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            if didDelete {
                closingScreen
            } else {
                form
            }
        }
    }

    // MARK: - Form (pre-confirmation)

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                header
                warningCard
                reasonField
                confirmationField
                if let error {
                    Text(error)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.danger)
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.l)
            .padding(.bottom, Theme.Spacing.l)
        }
        // On a destructive screen the way OUT has to be visible without
        // scrolling. Both actions were the tail of the scroll, i.e. reachable
        // only after reading past a warning card and two fields.
        .anchoredAction {
            VStack(spacing: Theme.Spacing.s) {
                confirmButton
                cancelButton
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: "RGPD · Art. 17", color: Theme.Color.danger)
            Text("Eliminar mi cuenta")
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.foreground)
        }
    }

    private var warningCard: some View {
        CardSurface(padding: 14, leftAccent: true) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Esta acción es permanente.")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                bullet("Se eliminarán todos tus datos en 30 días.")
                bullet("Tu suscripción se cancelará al final del periodo pagado.")
                if let partnerName, !partnerName.isEmpty {
                    bullet("Tu compañero/a \(partnerName) (Dobles) será notificado/a.")
                }
                bullet("Recibirás un email de confirmación tras esta acción.")
            }
        }
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("·")
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(Theme.Color.danger)
            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.foreground)
        }
    }

    private var reasonField: some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: "¿Por qué te vas? (opcional)")
            TextField(
                "",
                text: $reason,
                prompt: Text("Ayúdanos a mejorar")
                    .foregroundStyle(Theme.Color.muted),
                axis: .vertical
            )
            .lineLimit(3...5)
            .textInputAutocapitalization(.sentences)
            .font(.system(size: 14))
            .foregroundStyle(Theme.Color.foreground)
            .padding(12)
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
    }

    private var confirmationField: some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: "Para confirmar, escribe ELIMINAR MI CUENTA")
            TextField(
                "",
                text: $confirmationInput,
                prompt: Text("ELIMINAR MI CUENTA")
                    .foregroundStyle(Theme.Color.muted)
            )
            .textInputAutocapitalization(.characters)
            .disableAutocorrection(true)
            .font(.system(size: 14, weight: .semibold, design: .monospaced))
            .foregroundStyle(Theme.Color.foreground)
            .padding(12)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(canSubmit ? Theme.Color.danger.opacity(0.6) : Color.clear, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
    }

    private var confirmButton: some View {
        Button(action: submit) {
            HStack {
                if loading {
                    ProgressView()
                        .tint(Color.white)
                        .padding(.trailing, 6)
                }
                Text("Confirmar eliminación")
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(canSubmit ? Theme.Color.danger : Theme.Color.danger.opacity(0.35))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!canSubmit)
        .padding(.top, Theme.Spacing.s)
    }

    private var cancelButton: some View {
        Button {
            Haptics.light()
            dismiss()
        } label: {
            Text("Cancelar")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Closing state

    private var closingScreen: some View {
        VStack(alignment: .leading, spacing: 14) {
            LabelText(text: "Cuenta marcada para eliminación", color: Theme.Color.accentText)
            Text("Tu cuenta se eliminará en 30 días.")
                .font(Theme.Typography.headlineS)
                .foregroundStyle(Theme.Color.foreground)
            Text("Te enviamos un email de confirmación. Puedes contactar \(Marca.soporteEmail) si necesitas cancelar la solicitud antes de 30 días.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.muted)
            Spacer().frame(height: Theme.Spacing.l)
            Button {
                Haptics.medium()
                dismiss()
                // Slight defer so the sheet dismiss animation completes
                // before AppRoot swaps to AppleSignInView.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                    onCompleted()
                }
            } label: {
                Text("Cerrar sesión")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentOn)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Theme.Color.accent)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.xxl)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
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
