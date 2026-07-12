import SwiftUI

// MARK: - #58 · "Cómo ha ido" — structured feedback to the coach
//
// Sits in the post-workout sensations area, next to the RPE. Everything is
// OPTIONAL and travels in the SAME execution POST: how the session felt vs the
// prescription (perceived_difficulty) and an optional physical niggle (pain_area +
// a short note). Only shown for a PRESCRIBED session — a free workout has no
// coach prescription to judge "fácil/duro" against.
struct SessionFeedbackCard: View {
    @Binding var difficulty: PerceivedDifficulty?
    @Binding var painExpanded: Bool
    @Binding var painArea: PainArea?
    @Binding var painNote: String

    private let painColumns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 3)

    var body: some View {
        CardSurface(padding: 10) {
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    LabelText(text: "Cómo ha ido", size: 9)
                    Text("Le llega a tu coach.")
                        .scaledFont(11, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                }

                // Difficulty vs prescription — single choice, tap again to clear.
                HStack(spacing: 6) {
                    ForEach(PerceivedDifficulty.allCases) { option in
                        FeedbackChip(title: option.label, selected: difficulty == option) {
                            difficulty = (difficulty == option) ? nil : option
                        }
                    }
                }

                painToggle

                if painExpanded {
                    VStack(alignment: .leading, spacing: 8) {
                        LazyVGrid(columns: painColumns, spacing: 6) {
                            ForEach(PainArea.allCases) { area in
                                FeedbackChip(title: area.label, selected: painArea == area) {
                                    painArea = (painArea == area) ? nil : area
                                }
                            }
                        }
                        TextField("Nota corta (opcional)", text: $painNote, axis: .vertical)
                            .lineLimit(1...3)
                            .scaledFont(13, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.foreground)
                            .padding(.vertical, 4)
                            .accessibilityLabel("Nota sobre la molestia")
                            // Enforce the backend note limit as the athlete types.
                            .onChange(of: painNote) { _, new in
                                if new.count > PainArea.maxNoteLength {
                                    painNote = String(new.prefix(PainArea.maxNoteLength))
                                }
                            }
                    }
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
        }
    }

    private var painToggle: some View {
        Button {
            Haptics.light()
            withAnimation(.easeInOut(duration: 0.18)) {
                painExpanded.toggle()
                // Collapsing retracts the report — nothing lingers to be sent.
                if !painExpanded { painArea = nil; painNote = "" }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: painExpanded ? "minus.circle" : "plus.circle")
                    .font(.system(size: 13, weight: .semibold))
                Text("Molestia física")
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                Spacer()
            }
            .foregroundStyle(painExpanded ? Theme.Color.accentText : Theme.Color.muted)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(painExpanded ? "Ocultar molestia física" : "Añadir molestia física")
    }
}

// A pill chip that fills its container so difficulty rows and the pain grid stay
// tidy. Selected = Fabrik-orange fill with the valid brown-on-orange text.
private struct FeedbackChip: View {
    let title: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            action()
        } label: {
            Text(title)
                .scaledFont(12, weight: selected ? .semibold : .medium, relativeTo: .caption)
                .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(selected ? Theme.Color.accent : Theme.Color.surfaceElevated)
                .overlay(
                    Capsule().stroke(selected ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1)
                )
                .clipShape(Capsule())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
    }
}
