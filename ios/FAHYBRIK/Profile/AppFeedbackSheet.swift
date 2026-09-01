import SwiftUI

// MARK: - #59 · App feedback (suggestion / bug) → product-team inbox
//
// A sober sheet the athlete opens from Perfil to send a suggestion or report a
// problem. This goes to the PRODUCT TEAM, not the coach (unlike the #58 workout
// feedback). Posts to /api/athlete/app-feedback with the app version + the screen
// it was sent from. A "Algo falla" report also opens the 24h no-review window so
// we never ask for an App Store rating right after someone hit a bug.

enum AppFeedbackKind: String, CaseIterable, Identifiable {
    case suggestion, bug
    var id: String { rawValue }

    var label: String {
        switch self {
        case .suggestion: return "Sugerencia"
        case .bug:        return "Algo falla"
        }
    }

    /// Placeholder tuned to the kind so the athlete knows what helps.
    var placeholder: String {
        switch self {
        case .suggestion: return "¿Qué mejorarías? Cuéntanoslo con tus palabras."
        case .bug:        return "¿Qué ha pasado? Dinos qué hacías y qué esperabas."
        }
    }
}

struct AppFeedbackPayload: Encodable {
    let kind: String
    let body: String
    let app_version: String?
    let screen: String?
}

private struct AppFeedbackResponse: Decodable {
    let saved: Bool
}

enum AppFeedbackAPI {
    static let path = "/api/athlete/app-feedback"
    /// Backend limits (mirrors the Zod schema): body 1..2000, app_version ≤60.
    static let maxBody = 2000
    static let maxAppVersion = 60

    /// "1.0 (8)" — marketing version + build from the bundle, clamped to the wire
    /// limit. Nil if the bundle carries neither (never fabricated).
    static var appVersion: String? {
        AppBundleMetadata.displayVersion.map { String($0.prefix(maxAppVersion)) }
    }

    /// POST the feedback. Returns `saved`. Throws `APIError` (401/429/400/network)
    /// so the caller can show an honest, retryable message.
    static func submit(kind: AppFeedbackKind, body: String, screen: String?, bearer: String?) async throws -> Bool {
        let trimmed = String(body.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxBody))
        let payload = AppFeedbackPayload(
            kind: kind.rawValue,
            body: trimmed,
            app_version: appVersion,
            screen: screen
        )
        let resp: AppFeedbackResponse = try await APIClient.shared.post(path: path, body: payload, bearer: bearer)
        return resp.saved
    }
}

struct AppFeedbackSheet: View {
    let bearer: String?
    /// The screen the sheet was opened from (e.g. "perfil"), carried to the product team.
    var screen: String? = "perfil"

    @Environment(\.dismiss) private var dismiss

    @State private var kind: AppFeedbackKind = .suggestion
    @State private var text: String = ""
    @State private var isSending = false
    @State private var didSucceed = false
    @State private var errorMessage: String? = nil

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canSend: Bool { !trimmed.isEmpty && !isSending && bearer != nil }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            if didSucceed {
                successState
            } else {
                formState
            }
        }
        .dismissableSheet()
    }

    // MARK: Form

    private var formState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Cuéntanos")
                    .font(Theme.Typography.headlineS)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Tu sugerencia o el fallo nos llega directamente al equipo, no a tu coach.")
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
            }

            kindPicker

            CardSurface(padding: 12) {
                ZStack(alignment: .topLeading) {
                    if trimmed.isEmpty {
                        Text(kind.placeholder)
                            .scaledFont(14, relativeTo: .body)
                            .foregroundStyle(Theme.Color.faint)
                            .padding(.top, 8)
                            .padding(.leading, 5)
                            .allowsHitTesting(false)
                    }
                    TextEditor(text: $text)
                        .scaledFont(14, relativeTo: .body)
                        .foregroundStyle(Theme.Color.foreground)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 150)
                        .accessibilityLabel(kind == .bug ? "Describe el fallo" : "Describe tu sugerencia")
                }
            }

            if let errorMessage {
                Text(errorMessage)
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.danger)
            }

            ExpertPrimaryButton(
                title: isSending ? "ENVIANDO…" : "ENVIAR",
                enabled: canSend,
                action: send
            )

            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.xl)
    }

    // Two-segment control (Sugerencia / Algo falla) in the app's active-pill
    // language — recessed track, active segment lifted on the Fabrik-orange pill.
    private var kindPicker: some View {
        HStack(spacing: 4) {
            ForEach(AppFeedbackKind.allCases) { option in
                let active = kind == option
                Button {
                    guard !active else { return }
                    Haptics.light()
                    withAnimation(.easeInOut(duration: 0.18)) { kind = option }
                } label: {
                    Text(option.label)
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(active ? Theme.Color.accentOn : Theme.Color.muted)
                        .frame(maxWidth: .infinity)
                        .frame(height: 34)
                        .background { if active { Capsule().fill(Theme.Color.accent) } }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(option.label)
                .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(4)
        .background(Theme.Color.surfaceSunken)
        .clipShape(Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Tipo de mensaje")
    }

    // MARK: Success

    private var successState: some View {
        VStack(spacing: Theme.Spacing.l) {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 44, weight: .semibold))
                .foregroundStyle(Theme.Color.ok)
            VStack(spacing: 6) {
                Text("Gracias, lo hemos recibido")
                    .font(Theme.Typography.headlineS)
                    .foregroundStyle(Theme.Color.foreground)
                    .multilineTextAlignment(.center)
                Text(kind == .bug
                     ? "El equipo lo revisa cuanto antes. Gracias por avisar."
                     : "Leemos cada sugerencia. Gracias por ayudarnos a mejorar.")
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
            }
            Spacer()
            ExpertPrimaryButton(title: "HECHO") { dismiss() }
        }
        .padding(Theme.Spacing.xl)
    }

    // MARK: Send

    private func send() {
        guard canSend else { return }
        isSending = true
        errorMessage = nil
        let sentKind = kind
        Task { @MainActor in
            defer { isSending = false }
            do {
                _ = try await AppFeedbackAPI.submit(
                    kind: sentKind, body: trimmed, screen: screen, bearer: bearer
                )
                // A bug report opens the 24h no-review window before we celebrate.
                if sentKind == .bug { ReviewPromptStore.shared.recordBugReport() }
                Haptics.success()
                withAnimation(.easeInOut(duration: 0.2)) { didSucceed = true }
            } catch let APIError.http(status, _) {
                Haptics.error()
                errorMessage = Self.message(forStatus: status)
            } catch {
                Haptics.error()
                errorMessage = "No pudimos enviarlo. Revisa tu conexión e inténtalo de nuevo."
            }
        }
    }

    private static func message(forStatus status: Int) -> String {
        switch status {
        case 401: return "Tu sesión ha caducado. Vuelve a iniciar sesión e inténtalo otra vez."
        case 429: return "Has enviado varios mensajes seguidos. Prueba de nuevo en un rato."
        case 400: return "No pudimos enviar el mensaje. Revisa el texto e inténtalo de nuevo."
        default:  return "No pudimos enviarlo (error \(status)). Inténtalo de nuevo."
        }
    }
}
