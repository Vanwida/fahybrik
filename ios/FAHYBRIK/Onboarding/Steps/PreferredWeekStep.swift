import SwiftUI

// Step: "¿Cómo es tu semana ideal?".
// Binds to: state.preferredWeekByDay ([Set<PreferredTrainingType>], 7 entries,
// index 0=Mon..6=Sun). Per-day MULTI-select of the 5 training types as
// toggleable chips. Lets Pablo / the IA honor the athlete's natural rhythm
// (correr lunes, fuerza sábado...) when slotting the block.
struct PreferredWeekStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    // L M X J V S D — index 0 = Monday.
    private static let dayLabels = ["L", "M", "X", "J", "V", "S", "D"]
    private static let dayNames = [
        "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo",
    ]

    var body: some View {
        StepShell(
            stepIndex: 6,
            title: "¿Cómo es tu semana ideal?",
            subtitle: "Qué te encaja cada día",
            hint: "Dinos qué prefieres cada día (correr lunes, fuerza sábado…). Es una orientación, no una regla.",
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(spacing: Theme.Spacing.m) {
                ForEach(0..<7, id: \.self) { i in
                    PreferredDayCard(
                        short: Self.dayLabels[i],
                        name: Self.dayNames[i],
                        selection: selectionBinding(for: i)
                    )
                }
            }
        }
    }

    private func selectionBinding(for i: Int) -> Binding<Set<PreferredTrainingType>> {
        Binding(
            get: {
                guard state.preferredWeekByDay.indices.contains(i) else { return [] }
                return state.preferredWeekByDay[i]
            },
            set: {
                guard state.preferredWeekByDay.indices.contains(i) else { return }
                state.preferredWeekByDay[i] = $0
            }
        )
    }
}

// MARK: - Per-day card

private struct PreferredDayCard: View {
    let short: String
    let name: String
    @Binding var selection: Set<PreferredTrainingType>

    var body: some View {
        CardSurface(leftAccent: !selection.isEmpty) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                HStack(spacing: Theme.Spacing.m) {
                    Text(short)
                        .scaledFont(13, weight: .heavy, relativeTo: .footnote, italic: true)
                        .foregroundStyle(selection.isEmpty ? Theme.Color.foreground : Theme.Color.accentOn)
                        .padding(.horizontal, Theme.Spacing.xs)
                        .frame(minWidth: 30, minHeight: 30)
                        .background(selection.isEmpty ? Theme.Color.surfaceElevated : Theme.Color.accent)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
                    Text(name)
                        .scaledFont(16, weight: .semibold, relativeTo: .body)
                        .foregroundStyle(Theme.Color.foreground)
                    Spacer()
                    if selection.isEmpty {
                        Text("Libre")
                            .scaledFont(12, weight: .medium, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(name)

                FlowLayout(spacing: 8) {
                    ForEach(PreferredTrainingType.allCases, id: \.self) { type in
                        Chip(title: label(for: type), selected: selection.contains(type)) {
                            toggle(type)
                        }
                    }
                }
            }
        }
    }

    private func toggle(_ type: PreferredTrainingType) {
        if selection.contains(type) {
            selection.remove(type)
        } else {
            selection.insert(type)
        }
    }

    private func label(for type: PreferredTrainingType) -> String {
        switch type {
        case .isolatedRun: return "Carrera"
        case .strengthGym: return "Fuerza"
        case .hyroxTransitions: return "HYROX + transiciones"
        case .ergoConditioning: return "Ergómetros"
        case .specificMaterial: return "Material específico"
        }
    }
}
