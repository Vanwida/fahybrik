import SwiftUI

struct HyroxHistoryStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 15,
            title: "HYROX",
            subtitle: "Tu historial de carreras",
            hint: (state.hyroxRacesCompleted ?? 0) == 0
                ? "Primera HYROX en el horizonte. Lo programamos."
                : nil,
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(spacing: 0) {
                IntRow(label: "Carreras completadas", unit: "", value: $state.hyroxRacesCompleted)

                if (state.hyroxRacesCompleted ?? 0) > 0 {
                    TimeHourMinSecRow(label: "Mejor tiempo", seconds: $state.hyroxBestTimeSeconds)
                    DateRow(
                        label: "Última carrera",
                        value: $state.hyroxLastRaceDate,
                        range: Date(timeIntervalSinceNow: -60 * 60 * 24 * 365 * 30)...Date()
                    )
                }
            }
            .brandSurface()

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("División")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)
                ChipFlow(
                    options: HyroxDivision.allCases,
                    label: \.label,
                    selection: $state.hyroxDivisions
                )
            }
            .padding(.top, Theme.Spacing.l)

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Notas (opcional)")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)
                TextField("p.ej. molestia en cadera última carrera",
                          text: $state.hyroxNotes, axis: .vertical)
                    .lineLimit(2...4)
                    .padding(Theme.Spacing.m)
                    .background(Theme.Color.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                    .foregroundStyle(Theme.Color.foreground)
            }
            .padding(.top, Theme.Spacing.l)
        }
    }
}
