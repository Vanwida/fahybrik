import SwiftUI

// Step: "¿Qué días puedes entrenar?".
// Binds to:
//   state.availabilityByDay ([DayPlanStatus], 7 entries, index 0=Mon..6=Sun)
//   state.availableFrom / state.availableTo (String "HH:MM")
//   state.sessionMinutes (Int)
//   state.scheduleFlexible (Bool)
// Per-day rows (NOT a cramped table) — each day cycles through
// Programa / Otra actividad / Libre via three tappable chips.
struct AvailabilityStep: View {
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
            stepIndex: 5,
            title: "¿Qué días puedes entrenar?",
            subtitle: "Marca cada día y cuánto tiempo tienes",
            hint: "“Programa” = día para tu plan. “Otra actividad” = ya tienes algo. “Libre” = descanso.",
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            // MARK: Day matrix
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                SectionLabel(text: "Disponibilidad por día")
                VStack(spacing: 0) {
                    ForEach(0..<7, id: \.self) { i in
                        if i > 0 { Hairline() }
                        DayAvailabilityRow(
                            short: Self.dayLabels[i],
                            name: Self.dayNames[i],
                            status: statusBinding(for: i)
                        )
                    }
                }
                .brandSurface()
            }

            // MARK: Time window + session length
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                SectionLabel(text: "Franja horaria")
                VStack(spacing: 0) {
                    LabeledRow(label: "Desde") {
                        TimeOfDayMenu(value: $state.availableFrom, fallback: "07:00")
                    }
                    Hairline()
                    LabeledRow(label: "Hasta") {
                        TimeOfDayMenu(value: $state.availableTo, fallback: "21:00")
                    }
                    Hairline()
                    LabeledRow(label: "Duración sesión") {
                        SessionLengthControl(minutes: $state.sessionMinutes)
                    }
                    Hairline()
                    LabeledRow(label: "¿Horario flexible?") {
                        Toggle("", isOn: $state.scheduleFlexible)
                            .labelsHidden()
                            .tint(Theme.Color.accent)
                    }
                }
                .brandSurface()
            }
            .padding(.top, Theme.Spacing.l)
        }
    }

    private func statusBinding(for i: Int) -> Binding<DayPlanStatus> {
        Binding(
            get: {
                guard state.availabilityByDay.indices.contains(i) else { return .rest }
                return state.availabilityByDay[i]
            },
            set: {
                guard state.availabilityByDay.indices.contains(i) else { return }
                state.availabilityByDay[i] = $0
            }
        )
    }
}

// MARK: - Per-day row

private struct DayAvailabilityRow: View {
    let short: String
    let name: String
    @Binding var status: DayPlanStatus

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            // Day badge — orange face when this day is for the program.
            Text(short)
                .scaledFont(13, weight: .heavy, relativeTo: .footnote, italic: true)
                .foregroundStyle(status == .program ? Theme.Color.accentOn : Theme.Color.foreground)
                .padding(.horizontal, Theme.Spacing.xs)
                .frame(minWidth: 30, minHeight: 30)
                .background(status == .program ? Theme.Color.accent : Theme.Color.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
                .accessibilityLabel(name)

            Spacer(minLength: Theme.Spacing.s)

            HStack(spacing: 6) {
                ForEach(DayPlanStatus.allCases, id: \.self) { s in
                    StatusChip(label: label(for: s), selected: status == s) {
                        status = s
                    }
                }
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, Theme.Spacing.l)
    }

    private func label(for s: DayPlanStatus) -> String {
        switch s {
        case .program: return "Programa"
        case .otherActivity: return "Otra act."
        case .rest: return "Libre"
        }
    }
}

// MARK: - Status chip (compact, single-select per day)

private struct StatusChip: View {
    let label: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: { Haptics.light(); action() }) {
            Text(label)
                .scaledFont(12, weight: selected ? .semibold : .medium, relativeTo: .caption)
                .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(selected ? Theme.Color.accent : Theme.Color.surfaceElevated)
                .overlay(
                    Capsule().stroke(
                        selected ? Color.clear : Theme.Color.hairlineStrong,
                        lineWidth: 1
                    )
                )
                .clipShape(Capsule())
        }
        .buttonStyle(PressScaleStyle())
    }
}

// MARK: - Time of day menu (HH:MM, 30-min steps)

private struct TimeOfDayMenu: View {
    @Binding var value: String
    let fallback: String

    // 05:00 → 23:30 in 30-min steps — the realistic training window.
    private static let options: [String] = {
        var out: [String] = []
        for h in 5...23 {
            for m in stride(from: 0, to: 60, by: 30) {
                out.append(String(format: "%02d:%02d", h, m))
            }
        }
        return out
    }()

    private var display: String { value.isEmpty ? fallback : value }

    var body: some View {
        Menu {
            ForEach(Self.options, id: \.self) { t in
                Button(t) { Haptics.light(); value = t }
            }
        } label: {
            HStack(spacing: 4) {
                Text(display)
                    .font(Theme.Typography.bodyEmph.monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                Image(systemName: "chevron.up.chevron.down")
                    .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }
}

// MARK: - Session length (stepper, 15-min steps)

private struct SessionLengthControl: View {
    @Binding var minutes: Int

    private static let step = 15
    private static let range = 30...180

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            Text("\(minutes)")
                .font(Theme.Typography.bodyEmph.monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
                .frame(minWidth: 32, alignment: .trailing)
            Text("min")
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Color.muted)
            Stepper(
                "",
                value: $minutes,
                in: Self.range,
                step: Self.step
            )
            .labelsHidden()
        }
    }
}
