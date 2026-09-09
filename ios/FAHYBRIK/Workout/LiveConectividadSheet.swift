import SwiftUI

// FH-94 — live device hub. Reuses `LiveRecipeDeviceBar` + existing pickers;
// run-environment change lives here, never as mid-HUD CORRER EN CINTA/FUERA walls.

struct LiveConectividadSheet: View {
    @Bindable var session: WorkoutSession
    let devices: [PreWorkoutDevice]
    let pool: PM5Pool
    let treadmillLink: DeviceLink
    let hrLink: DeviceLink
    let onTapErg: (PM5ConnectionStore, String) -> Void
    let onTapTreadmill: () -> Void
    let onTapHR: () -> Void
    let onDismiss: () -> Void

    private var involvesRun: Bool {
        session.plan.segments.contains { $0.involvesRun }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    if involvesRun {
                        runEnvironmentSection
                    }
                    if !devices.isEmpty {
                        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                            LabelText(text: "Dispositivos del entreno", size: 10)
                            LiveRecipeDeviceBar(
                                devices: devices,
                                pool: pool,
                                treadmillLink: treadmillLink,
                                hrLink: hrLink,
                                onTapErg: onTapErg,
                                onTapTreadmill: onTapTreadmill,
                                onTapHR: onTapHR
                            )
                        }
                    }
                    Text("Toca un chip para buscar o cambiar. La sesión sigue en marcha.")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.faint)
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.vertical, Theme.Spacing.m)
            }
            .background(Theme.Color.background)
            .navigationTitle("Conectividad")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Listo", action: onDismiss)
                }
            }
        }
    }

    private var runEnvironmentSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            LabelText(text: "Dónde corres", size: 10)
            ForEach(RunEnvironment.allCases, id: \.self) { env in
                Button {
                    Haptics.light()
                    session.runEnvironment = env
                    session.ensurePhoneWorkoutRun()
                } label: {
                    HStack(spacing: Theme.Spacing.m) {
                        Image(systemName: icon(for: env))
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(session.runEnvironment == env
                                             ? Theme.Color.accentText : Theme.Color.muted)
                        Text(label(for: env))
                            .font(Theme.Typography.bodyEmph)
                            .foregroundStyle(Theme.Color.foreground)
                        Spacer(minLength: 0)
                        if session.runEnvironment == env {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(Theme.Color.accentText)
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.m)
                    .padding(.vertical, 12)
                    .background(session.runEnvironment == env
                                ? Theme.Color.accent.opacity(0.10) : Theme.Color.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                            .stroke(session.runEnvironment == env
                                    ? Theme.Color.accentText.opacity(0.5) : Theme.Color.outline,
                                    lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func icon(for env: RunEnvironment) -> String {
        switch env {
        case .outdoor:   return "location.fill"
        case .treadmill: return "figure.run"
        case .indoor:    return "figure.run.circle"
        }
    }

    private func label(for env: RunEnvironment) -> String {
        switch env {
        case .outdoor:   return "Calle"
        case .treadmill: return "Cinta con conexión"
        case .indoor:    return "Cinta sin conexión"
        }
    }
}
