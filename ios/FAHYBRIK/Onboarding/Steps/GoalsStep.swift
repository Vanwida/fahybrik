import SwiftUI

// Step 10 — Metas. The athlete's own framing: horizon goals, realism check,
// locus of control, and what they want from the coach. Qualitative inputs that
// orient the IA + give Pablo context the numbers don't carry.
struct GoalsStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 9,
            title: "Tus metas",
            subtitle: "Dónde quieres llegar, con tus palabras",
            hint: nil,
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                MultilineField(
                    label: "Corto plazo (semanas)",
                    placeholder: "p.ej. correr 5K sin parar",
                    text: $state.goalShort
                )
                MultilineField(
                    label: "Medio plazo (meses)",
                    placeholder: "p.ej. bajar de 1h30 en HYROX",
                    text: $state.goalMid
                )
                MultilineField(
                    label: "Largo plazo (años)",
                    placeholder: "p.ej. clasificar para el mundial",
                    text: $state.goalLong
                )
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                SectionLabel("¿Alcanzable en 2-4 meses?")
                ChoiceGrid(
                    options: Achievable.allCases,
                    label: achievableLabel,
                    isSelected: { state.achievable24Months == $0 },
                    onTap: { state.achievable24Months = (state.achievable24Months == $0) ? nil : $0 },
                    columns: 3
                )
            }
            .padding(.top, Theme.Spacing.l)

            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                MultilineField(
                    label: "Tu mayor obstáculo",
                    placeholder: "p.ej. la constancia, las lesiones, el tiempo",
                    text: $state.biggestObstacle
                )
            }
            .padding(.top, Theme.Spacing.l)

            VStack(spacing: 0) {
                SliderRow(
                    label: "¿Cuánto depende de ti?",
                    value: $state.pctDependsOnMe,
                    range: 0...10,
                    minLabel: "Nada",
                    maxLabel: "Todo"
                )
            }
            .brandSurface()
            .padding(.top, Theme.Spacing.l)

            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                MultilineField(
                    label: "¿Qué esperas del coach?",
                    placeholder: "p.ej. que me exija, que me ajuste cuando falle",
                    text: $state.coachRole
                )
            }
            .padding(.top, Theme.Spacing.l)
        }
    }

    private func achievableLabel(_ a: Achievable) -> String {
        switch a {
        case .yes: return "Sí"
        case .no: return "No"
        case .unknown: return "No sé"
        }
    }
}

// Multiline labeled text input on the brand surface — reused by the goal fields.
struct MultilineField: View {
    let label: String
    let placeholder: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            SectionLabel(label)
            TextField(placeholder, text: $text, axis: .vertical)
                .lineLimit(2...4)
                .font(Theme.Typography.body)
                .padding(Theme.Spacing.m)
                .background(Theme.Color.surface)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                        .stroke(Theme.Color.hairline, lineWidth: 1)
                )
                .foregroundStyle(Theme.Color.foreground)
        }
    }
}
