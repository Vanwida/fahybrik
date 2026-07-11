import SwiftUI

// Objetivo por rangos — the way athletes actually talk about a HYROX finish
// (sub-60 / sub-70 / sub-80 / sub-90) instead of dialing an exact clock. Each
// preset maps to `goal_time_seconds` (the SAME field the exact wheels write —
// zero server change); "Acabarla bien" is the no-clock first-race choice → nil.
//
// Single source of truth for the objective selector on EVERY surface (Carreras
// · Fijar objetivo, onboarding · Tu objetivo) so the rungs and their mapping can
// never drift between screens.

/// The four HYROX finish-time rungs. Raw value = the goal time in seconds, so the
/// enum IS its own mapping (Sub-60 → 3600 … Sub-90 → 5400) and a stored goal time
/// can be matched straight back to its rung for pre-selection.
enum GoalPreset: Int, CaseIterable, Identifiable {
    case sub60 = 3600
    case sub70 = 4200
    case sub80 = 4800
    case sub90 = 5400

    var id: Int { rawValue }

    /// The `goal_time_seconds` this rung submits.
    var seconds: Int { rawValue }

    /// "Sub-60" … "Sub-90" — the big italic chip title.
    var title: String { "Sub-\(rawValue / 60)" }

    /// The small qualifier under the title (élite / avanzado / top 25% / la referencia).
    var descriptor: String {
        switch self {
        case .sub60: return "élite"
        case .sub70: return "avanzado"
        case .sub80: return "top 25%"
        case .sub90: return "la referencia"
        }
    }

    /// Which rung a stored goal time exactly matches, if any — so re-opening the
    /// selector pre-selects the chip (and a non-rung exact time falls to the
    /// "tiempo exacto" fallback instead of silently matching nothing).
    static func matching(_ seconds: Int?) -> GoalPreset? {
        guard let seconds else { return nil }
        return allCases.first { $0.seconds == seconds }
    }
}

/// The athlete's objective choice across the selector: a finish-time rung, the
/// no-clock "Acabarla bien", or the exact-time fallback (wheels / text field, the
/// host screen supplies its own). `nil` = nothing chosen yet (submits no goal).
enum GoalChoice: Equatable {
    case preset(GoalPreset)
    case finish
    case exact
}

// MARK: - Chip

/// One objective chip — a big italic title over a small uppercase qualifier.
/// Selected fills brand orange with `accentOn` text (the app's accent-on-fill
/// pattern, shared with SegmentedChoice / PillChip). Used both in the 2-up rung
/// grid and as the full-width "Acabarla bien" chip.
struct GoalPresetChip: View {
    let title: String
    let descriptor: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button {
            guard !selected else { return }
            Haptics.light()
            action()
        } label: {
            VStack(spacing: 3) {
                Text(title)
                    .font(.system(size: 19, weight: .heavy, design: .default).italic())
                    .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(descriptor)
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.7)
                    .textCase(.uppercase)
                    .foregroundStyle(selected ? Theme.Color.accentOn.opacity(0.75) : Theme.Color.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .padding(.horizontal, 10)
            .background(selected ? Theme.Color.accent : Theme.Color.surfaceElevated)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(selected ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(descriptor)")
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
    }
}

// MARK: - Rung grid

/// The 2-up grid of the four finish-time rungs, bound to a `GoalChoice`. Kept as
/// one component so the two host screens (Fijar objetivo, onboarding manual form)
/// render identical rungs; each host adds its own "Acabarla bien" chip (only
/// where a finish goal is distinct) and its own exact-time fallback.
struct GoalPresetGrid: View {
    @Binding var choice: GoalChoice?

    private let columns = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
    ]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            ForEach(GoalPreset.allCases) { preset in
                GoalPresetChip(
                    title: preset.title,
                    descriptor: preset.descriptor,
                    selected: choice == .preset(preset)
                ) {
                    choice = .preset(preset)
                }
            }
        }
    }
}

// MARK: - Exact-time reveal link

/// The "Prefiero un tiempo exacto…" secondary affordance that drops the exact
/// wheels/field. Reuses the orange-as-text underline treatment; the host toggles
/// its `choice` to `.exact` and renders its own picker.
struct GoalExactLink: View {
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            action()
        } label: {
            Text("Prefiero un tiempo exacto…")
                .font(.system(size: 13, weight: .medium))
                .underline()
                .foregroundStyle(Theme.Color.accentText)
                .frame(maxWidth: .infinity, alignment: .center)
        }
        .buttonStyle(PressScaleStyle())
    }
}

// MARK: - Preview (Pantalla A — objetivo por rangos)

#if DEBUG
private struct GoalPresetSelectorPreview: View {
    @State private var choice: GoalChoice? = .preset(.sub90)
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text("¿A qué vas?")
                .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            GoalPresetGrid(choice: $choice)
            GoalPresetChip(
                title: "Acabarla bien",
                descriptor: "primera carrera · sin reloj",
                selected: choice == .finish
            ) { choice = .finish }
            GoalExactLink { choice = .exact }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.background)
    }
}

#Preview("Objetivo por rangos") {
    GoalPresetSelectorPreview()
}
#endif
