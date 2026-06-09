import SwiftUI

// Step 13 — A-event / carreras. The race that anchors the ATR block plan: name,
// date, division, and the objective (finish / target time / podium). Maps to
// the `races` array + the flat a_event_* fields in the snapshot.
struct AEventStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 16,
            title: "Tu A-event",
            subtitle: "La carrera que ancla el plan",
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
                SectionLabel("Objetivo")
                VStack(spacing: 0) {
                    ForEach(GoalKind.allCases) { g in
                        RadioRow(title: g.label, selected: state.goalKind == g) {
                            state.goalKind = (state.goalKind == g) ? nil : g
                        }
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
