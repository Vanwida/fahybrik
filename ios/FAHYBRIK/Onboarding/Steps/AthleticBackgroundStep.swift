import SwiftUI

struct AthleticBackgroundStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 10,
            title: "Trayectoria",
            subtitle: "Cuánto y qué entrenas",
            hint: nil,
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(spacing: 0) {
                IntRow(label: "Años entrenando", unit: "años", value: $state.trainingYears)
                IntRow(label: "Horas / semana", unit: "h", value: $state.hoursPerWeek)
            }
            .brandSurface()

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Nivel de entrenamiento")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)

                HStack(spacing: 8) {
                    ForEach(TrainingLevelOption.allCases) { level in
                        Button {
                            Haptics.light()
                            state.trainingLevel = level.rawValue
                        } label: {
                            VStack(spacing: 2) {
                                Text(level.title)
                                    .font(.system(size: 14, weight: .heavy, design: .default).italic())
                                Text(level.subtitle)
                                    .font(.system(size: 9, weight: .semibold))
                                    .textCase(.uppercase)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .foregroundStyle(state.trainingLevel == level.rawValue ? Theme.Color.accentOn : Theme.Color.foreground)
                            .background(state.trainingLevel == level.rawValue ? Theme.Color.accent : Theme.Color.surface)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.top, Theme.Spacing.l)

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Disciplina principal")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)

                ChipFlow(
                    options: Discipline.allCases,
                    label: \.label,
                    selection: Binding(
                        get: { state.primaryDiscipline.map { Set([$0]) } ?? [] },
                        set: { state.primaryDiscipline = $0.first }
                    )
                )
            }
            .padding(.top, Theme.Spacing.l)
        }
    }
}

private enum TrainingLevelOption: Int, CaseIterable, Identifiable {
    case beginner = 1
    case intermediate = 2
    case pro = 3
    case elite = 4

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .beginner: return "N1"
        case .intermediate: return "N2"
        case .pro: return "N3"
        case .elite: return "N4"
        }
    }

    var subtitle: String {
        switch self {
        case .beginner: return "base"
        case .intermediate: return "inter"
        case .pro: return "pro"
        case .elite: return "elite"
        }
    }
}
