import SwiftUI

// Inline Apple Watch status for Devices hub + Brief ready screen. Informational
// and optional prep — never blocks the sole ▶ EMPEZAR.

struct PreWorkoutWatchCard: View {
    @Binding var answers: SessionStartAnswers
    let mirror: PhoneMirrorService
    let onPrepWatch: (() -> Void)?

    var body: some View {
        CardSurface(padding: Theme.Spacing.m) {
            if mirror.wristJoined {
                statusRow(icon: "checkmark.circle.fill", color: Theme.Color.ok,
                          title: "Reloj grabando",
                          subtitle: "Espejo HealthKit activo en la muñeca")
            } else if answers.watchUnavailable {
                statusRow(icon: "applewatch.slash", color: Theme.Color.muted,
                          title: "Sin Apple Watch",
                          subtitle: "El teléfono graba lo que pueda")
            } else if let started = mirror.watchJoinStartedAt,
                      Date().timeIntervalSince(started) > PhoneMirrorService.watchJoinHintSeconds,
                      mirror.watchJoinStartedAt != nil {
                statusRow(icon: "exclamationmark.triangle.fill", color: Theme.Color.warning,
                          title: "El reloj no se unió todavía",
                          subtitle: "Puedes empezar igual — abre la app en la muñeca o sigue sin reloj")
            } else if mirror.watchJoinStartedAt != nil {
                HStack(spacing: Theme.Spacing.m) {
                    ProgressView().tint(Theme.Color.accent)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Esperando al reloj…")
                            .font(Theme.Typography.bodyEmph)
                            .foregroundStyle(Theme.Color.foreground)
                        Text("Puedes empezar igual — se unirá en directo si abre la app")
                            .font(Theme.Typography.caption)
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            } else {
                statusRow(icon: "applewatch", color: Theme.Color.muted,
                          title: "Apple Watch",
                          subtitle: "Opcional — firma pulso y calorías en la muñeca")
            }

            if let onPrepWatch, !answers.watchUnavailable, !mirror.wristJoined {
                SecondaryButton(title: "Preparar grabación en el reloj") {
                    onPrepWatch()
                }
                .padding(.top, Theme.Spacing.s)
            }

            if !answers.watchUnavailable {
                Button("Continuar sin reloj") {
                    answers.watchProceedWithoutWrist = true
                }
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .frame(maxWidth: .infinity)
                .padding(.top, Theme.Spacing.s)
            }
        }
    }

    private func statusRow(icon: String, color: Color, title: String, subtitle: String) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            Image(systemName: icon)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Text(subtitle)
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
