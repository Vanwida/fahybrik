import SwiftUI

struct GoalsStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 9,
            title: "Tu A-event",
            subtitle: "El objetivo que ancla el plan",
            hint: nil,
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(spacing: 0) {
                TextRow(label: "Evento", placeholder: "p.ej. HYROX BCN 2026", value: $state.aEventName)

                DateRow(
                    label: "Fecha",
                    value: $state.aEventDate,
                    range: Date()...Date(timeIntervalSinceNow: 60 * 60 * 24 * 365 * 4)
                )

                LabeledRow(label: "División") {
                    HStack(spacing: 6) {
                        ForEach(HyroxDivision.allCases) { d in
                            Chip(title: d.label, selected: state.aEventDivision == d) {
                                state.aEventDivision = (state.aEventDivision == d) ? nil : d
                            }
                        }
                    }
                }
            }
            .brandSurface()

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Objetivo")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)
                VStack(spacing: 0) {
                    ForEach(GoalKind.allCases) { g in
                        Button {
                            state.goalKind = (state.goalKind == g) ? nil : g
                        } label: {
                            HStack {
                                Image(systemName: state.goalKind == g
                                      ? "largecircle.fill.circle"
                                      : "circle")
                                    .foregroundStyle(state.goalKind == g
                                                     ? Theme.Color.accent
                                                     : Theme.Color.muted)
                                Text(g.label)
                                    .font(Theme.Typography.body)
                                    .foregroundStyle(Theme.Color.foreground)
                                Spacer()
                            }
                            .padding(.vertical, 12)
                            .padding(.horizontal, Theme.Spacing.l)
                            .overlay(
                                Rectangle()
                                    .fill(Theme.Color.muted.opacity(0.18))
                                    .frame(height: 1),
                                alignment: .bottom
                            )
                        }
                        .buttonStyle(.plain)
                    }
                    if state.goalKind == .time {
                        TimeHourMinSecRow(label: "Tiempo objetivo", seconds: $state.goalTimeSeconds)
                    }
                }
                .brandSurface()
            }
            .padding(.top, Theme.Spacing.l)
        }
    }
}
