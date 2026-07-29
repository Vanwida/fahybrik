import SwiftUI

// DemoSignInView — gated demo athlete entry (presented as a sheet from the
// sign-in screen). Pick one of the two seeded demo athletes → mint that
// athlete's Bearer via DemoAuthService → hand the session up so AppRoot seats
// it exactly like a real sign-in. Honest states: per-slot loading, a clean
// "demo no disponible" when the flag is off, and a network-error line.
//
// DEBUG-ONLY: excluded from Release builds so the demo entry UI never ships in
// the App Store binary. Its only call-site (the demo button + sheet in
// AppleSignInView) is likewise `#if DEBUG`-gated.
#if DEBUG
struct DemoSignInView: View {
    /// Called once a demo session is minted. Carries the athlete bearer + id so
    /// the host can route them through `AuthState.acceptDemoSession`.
    let onSession: (_ bearer: String, _ athleteId: String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var loadingSlot: DemoAuthService.Slot?
    @State private var error: String?

    private var isLoading: Bool { loadingSlot != nil }

    // ARQUETIPO Lista · altura `centra` (§6): two slots never fill a phone, so
    // the sheet opens at half height (`.compactSheet()`) and the choice centres
    // in it instead of hanging off the top with three flexible Spacers under it.
    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()

            CenteredScreen {
                VStack(spacing: Theme.Spacing.l) {
                    Text("Acceso demo")
                        .font(Theme.Typography.headlineM)
                        .foregroundStyle(Theme.Color.foreground)

                    Text("Entra como uno de los atletas de prueba para ver la app con un plan real. No necesitas Apple ID.")
                        .scaledFont(16, relativeTo: .body)
                        .foregroundStyle(Theme.Color.muted)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)

                    VStack(spacing: Theme.Spacing.m) {
                        ForEach(DemoAuthService.Slot.allCases) { slot in
                            ExpertPrimaryButton(
                                title: loadingSlot == slot ? "Entrando…" : slot.label,
                                enabled: !isLoading
                            ) {
                                enter(slot)
                            }
                        }
                    }
                    .padding(.top, Theme.Spacing.s)

                    if let error {
                        Text(error)
                            .scaledFont(13, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.danger)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.vertical, Theme.Spacing.xl)
            }
            .anchoredAction(separator: false) {
                SkipLink(title: "Cancelar") { dismiss() }
                    .disabled(isLoading)
            }
        }
        .compactSheet()
    }

    private func enter(_ slot: DemoAuthService.Slot) {
        error = nil
        loadingSlot = slot
        Task {
            do {
                let resp = try await DemoAuthService.requestBearer(slot: slot)
                loadingSlot = nil
                Haptics.success()
                onSession(resp.bearer, String(resp.athleteId))
            } catch DemoAuthService.DemoError.unavailable {
                loadingSlot = nil
                error = "Demo no disponible en este entorno."
            } catch let apiErr as APIError {
                loadingSlot = nil
                switch apiErr {
                case .offline:
                    error = "Sin conexión."
                case .http(let code, _):
                    error = "No se pudo entrar (HTTP \(code))."
                case .invalidResponse:
                    error = "Respuesta inválida del servidor."
                case .decoding:
                    error = "Respuesta inesperada del servidor."
                }
            } catch {
                loadingSlot = nil
                self.error = "Error: \(error.localizedDescription)"
            }
        }
    }
}
#endif
