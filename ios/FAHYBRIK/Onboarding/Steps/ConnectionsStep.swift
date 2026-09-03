import SwiftUI

struct ConnectionsStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 17,
            title: "Conexiones",
            subtitle: "Sincroniza tus dispositivos",
            hint: nil,
            primaryEnabled: true,
            skipTitle: "Hacerlo después",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(spacing: Theme.Spacing.m) {
                // Garmin OAuth is not live yet. Be honest: surface it as coming
                // soon rather than faking a connected state. When the backend
                // OAuth flow lands, swap the nil action for the real deep link
                // and re-enable the connect button.
                ConnectionCard(
                    title: "Garmin",
                    description: "FIT files, training load, recovery, HRV. Próximamente.",
                    actionTitle: nil,
                    isConnected: false,
                    action: nil
                )

                ConnectionCard(
                    title: "Apple Health",
                    description: "Sueño, HR, HRV, peso",
                    actionTitle: state.healthkitGranted ? "Permitido ✓" : "Permitir",
                    isConnected: state.healthkitGranted
                ) {
                    Task {
                        // HealthKit never reports read-grant status, so a
                        // successful request = the sheet was presented. Treat
                        // as connected; only a thrown error means it failed.
                        do {
                            try await HealthKitPermissions.request()
                            // Granting here must START the sync, exactly like Perfil
                            // and el día-1. Marking the flag alone left the athlete
                            // "conectado" y sin subir un solo dato.
                            try await HealthKitConnection.markConnectedAndSync()
                            state.healthkitGranted = true
                        } catch {
                            state.healthkitGranted = false
                        }
                    }
                }

                ConnectionCard(
                    title: "PM5 (Concept2)",
                    description: "Row + Ski erg directo. Te conectamos en el gym.",
                    actionTitle: nil,
                    isConnected: false,
                    action: nil
                )
            }
        }
    }
}

private struct ConnectionCard: View {
    let title: String
    let description: String
    let actionTitle: String?
    let isConnected: Bool
    let action: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack {
                Text(title)
                    .font(Theme.Typography.headlineS)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer()
                if isConnected {
                    Text("✓")
                        .scaledFont(16, weight: .semibold, relativeTo: .body)
                        .foregroundStyle(Theme.Color.ok)
                }
            }
            Text(description)
                .scaledFont(13, weight: .medium, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            if let actionTitle, let action {
                Button(action: { Haptics.light(); action() }) {
                    Text(actionTitle)
                        .scaledFont(13, weight: .heavy, relativeTo: .footnote, italic: true)
                        .foregroundStyle(isConnected ? Theme.Color.muted : Theme.Color.accentOn)
                        .padding(.horizontal, Theme.Spacing.l)
                        .padding(.vertical, 10)
                        .background(isConnected ? Theme.Color.surfaceSunken : Theme.Color.accent)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(isConnected)
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brandSurface()
    }
}
