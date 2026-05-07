import SwiftUI

struct ConnectionsStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 11,
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
                ConnectionCard(
                    title: "Garmin",
                    description: "FIT files, training load, recovery, HRV",
                    actionTitle: state.garminConnected ? "Conectado ✓" : "Conectar",
                    isConnected: state.garminConnected
                ) {
                    Task {
                        // Garmin OAuth flow placeholder — backend agent handles
                        // the actual flow in `garmin_oauth_scaffolding`. For
                        // onboarding it suffices to record intent; we'll deep
                        // link to OAuth when backend lands.
                        state.garminConnected = true
                    }
                }

                ConnectionCard(
                    title: "Apple Health",
                    description: "Sueño, HR, HRV, peso",
                    actionTitle: state.healthkitGranted ? "Permitido ✓" : "Permitir",
                    isConnected: state.healthkitGranted
                ) {
                    Task {
                        let granted = await HealthKitPermissions.request()
                        state.healthkitGranted = granted
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
                        .font(Theme.Typography.bodyEmph)
                        .foregroundStyle(Theme.Color.ok)
                }
            }
            Text(description)
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            if let actionTitle, let action {
                Button(action: { Haptics.light(); action() }) {
                    Text(actionTitle)
                        .font(.system(size: 14, weight: .heavy)).italic()
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, Theme.Spacing.l)
                        .padding(.vertical, 10)
                        .background(isConnected ? Theme.Color.muted.opacity(0.4) : Theme.Color.accent)
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
