import SwiftUI

// Step: "Lesiones y limitaciones".
// Binds to: state.injuries ([OnbInjury]) and state.movementLimitations (String).
// An empty injury list is a valid, honest answer — the athlete can proceed
// with "Sin lesiones". Each injury is structured (area + type + active + note)
// so the IA can reason over it, never free text alone.
struct InjuriesLimitationsStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    // Common body areas — keeps `area` structured for the model instead of
    // raw text. "Otro" lets the athlete type anything not covered.
    private static let bodyAreas = [
        "Rodilla", "Hombro", "Espalda", "Cadera", "Tobillo", "Muñeca", "Otro",
    ]

    var body: some View {
        StepShell(
            stepIndex: 4,
            title: "Lesiones y limitaciones",
            subtitle: "Para adaptar la carga con seguridad",
            hint: "Si no tienes nada, déjalo vacío — “Sin lesiones” es una respuesta válida.",
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            // MARK: Injuries
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                SectionLabel(text: "Lesiones")

                if state.injuries.isEmpty {
                    EmptyInjuriesCard()
                } else {
                    VStack(spacing: Theme.Spacing.m) {
                        ForEach($state.injuries) { $injury in
                            InjuryCard(
                                injury: $injury,
                                areas: Self.bodyAreas,
                                onRemove: { remove(injury.id) }
                            )
                        }
                    }
                }

                AddInjuryButton {
                    Haptics.light()
                    state.injuries.append(
                        OnbInjury(area: Self.bodyAreas.first ?? "Otro", type: "", active: true, note: nil)
                    )
                }
            }

            // MARK: Movement limitations
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                SectionLabel(text: "Limitaciones de movimiento")
                Text("¿Algún movimiento que evites o no puedas hacer?")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)

                VStack(spacing: 0) {
                    LabeledRow(label: "Limitación") {
                        TextField("p.ej. sentadilla profunda", text: $state.movementLimitations)
                            .multilineTextAlignment(.trailing)
                            .font(Theme.Typography.body)
                            .frame(maxWidth: 200)
                    }
                }
                .brandSurface()
            }
            .padding(.top, Theme.Spacing.l)
        }
    }

    private func remove(_ id: OnbInjury.ID) {
        Haptics.light()
        state.injuries.removeAll { $0.id == id }
    }
}

// MARK: - Empty state

private struct EmptyInjuriesCard: View {
    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            Image(systemName: "checkmark.shield")
                .scaledFont(18, weight: .semibold, relativeTo: .body)
                .foregroundStyle(Theme.Color.ok)
            VStack(alignment: .leading, spacing: 2) {
                Text("Sin lesiones")
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Añade una solo si tienes algo que reportar.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .brandSurface()
    }
}

// MARK: - Injury card

private struct InjuryCard: View {
    @Binding var injury: OnbInjury
    let areas: [String]
    let onRemove: () -> Void

    var body: some View {
        CardSurface(leftAccent: injury.active) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                // Header: area picker + remove
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                        SectionLabel(text: "Zona")
                        FlowLayout(spacing: 8) {
                            ForEach(areas, id: \.self) { area in
                                Chip(title: area, selected: injury.area == area) {
                                    injury.area = area
                                }
                            }
                        }
                    }
                    Spacer(minLength: Theme.Spacing.s)
                    Button(action: onRemove) {
                        Image(systemName: "trash")
                            .scaledFont(16, weight: .semibold, relativeTo: .body)
                            .foregroundStyle(Theme.Color.muted)
                            .padding(Theme.Spacing.s)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Eliminar lesión")
                }

                Hairline()

                // Type free text (e.g. "rotura parcial")
                HStack(spacing: Theme.Spacing.m) {
                    Text("Tipo")
                        .font(Theme.Typography.body)
                        .foregroundStyle(Theme.Color.foreground)
                    Spacer()
                    TextField("p.ej. rotura parcial", text: $injury.type)
                        .multilineTextAlignment(.trailing)
                        .font(Theme.Typography.body)
                        .frame(maxWidth: 190)
                }

                Hairline()

                // Active toggle
                Toggle(isOn: $injury.active) {
                    Text(injury.active ? "Activa ahora" : "Recuperada")
                        .font(Theme.Typography.body)
                        .foregroundStyle(Theme.Color.foreground)
                }
                .tint(Theme.Color.accent)

                Hairline()

                // Optional note
                HStack(spacing: Theme.Spacing.m) {
                    Text("Nota")
                        .font(Theme.Typography.body)
                        .foregroundStyle(Theme.Color.foreground)
                    Spacer()
                    TextField("opcional", text: noteBinding)
                        .multilineTextAlignment(.trailing)
                        .font(Theme.Typography.body)
                        .frame(maxWidth: 190)
                }
            }
        }
    }

    // OnbInjury.note is String? — bridge to a non-optional TextField binding,
    // collapsing empty strings back to nil so we never persist "".
    private var noteBinding: Binding<String> {
        Binding(
            get: { injury.note ?? "" },
            set: { injury.note = $0.isEmpty ? nil : $0 }
        )
    }
}

// MARK: - Add button

private struct AddInjuryButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.s) {
                Image(systemName: "plus")
                    .scaledFont(13, weight: .heavy, relativeTo: .footnote)
                Text("Añadir lesión")
                    .scaledFont(16, weight: .semibold, relativeTo: .body)
            }
            .foregroundStyle(Theme.Color.accentText)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.accentText.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
            )
        }
        .buttonStyle(PressScaleStyle())
    }
}
