import SwiftUI

struct Chip: View {
    let title: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: { Haptics.light(); action() }) {
            Text(title)
                .font(Theme.Typography.small)
                .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.foreground)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(selected ? Theme.Color.accent : Theme.Color.surface)
                .clipShape(Capsule())
                .overlay(
                    Capsule().stroke(
                        selected ? Theme.Color.accent : Theme.Color.hairlineStrong,
                        lineWidth: 1
                    )
                )
        }
        .buttonStyle(.plain)
    }
}

struct ChipFlow<T: Hashable & Identifiable>: View {
    let options: [T]
    let label: (T) -> String
    @Binding var selection: Set<T>

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(options) { opt in
                Chip(title: label(opt), selected: selection.contains(opt)) {
                    if selection.contains(opt) { selection.remove(opt) }
                    else { selection.insert(opt) }
                }
            }
        }
    }
}

struct SingleChipFlow<T: Hashable & Identifiable>: View {
    let options: [T]
    let label: (T) -> String
    @Binding var selection: T?

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(options) { opt in
                Chip(title: label(opt), selected: selection == opt) {
                    selection = (selection == opt) ? nil : opt
                }
            }
        }
    }
}

// Positional convenience for the shared SectionLabel (defined in Atoms.swift),
// so onboarding call sites can write `SectionLabel("…")`.
extension SectionLabel {
    init(_ text: String) { self.init(text: text) }
}

// Single-select radio row inside a brandSurface group (full-width, divider).
struct RadioRow: View {
    let title: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: { Haptics.light(); action() }) {
            HStack {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(selected ? Theme.Color.accentText : Theme.Color.muted)
                Text(title)
                    .font(Theme.Typography.body)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer()
            }
            .padding(.vertical, 12)
            .padding(.horizontal, Theme.Spacing.l)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .overlay(
                Rectangle()
                    .fill(Theme.Color.hairline)
                    .frame(height: 1),
                alignment: .bottom
            )
        }
        .buttonStyle(.plain)
    }
}

// Toggle-style boolean row (used for has_track / has_flat_run / has_hr_belt).
struct ToggleRow: View {
    let title: String
    @Binding var isOn: Bool

    var body: some View {
        LabeledRow(label: title) {
            Toggle("", isOn: $isOn)
                .labelsHidden()
                .tint(Theme.Color.accent)
        }
    }
}

// Equal-width selectable cards laid out two-per-row. Single-select semantics
// are owned by the caller (isSelected / onTap) so it works for any enum.
struct ChoiceGrid<Option: Hashable>: View {
    let options: [Option]
    let label: (Option) -> String
    let isSelected: (Option) -> Bool
    let onTap: (Option) -> Void
    var columns: Int = 2

    private var rows: [[Option]] {
        stride(from: 0, to: options.count, by: columns).map {
            Array(options[$0..<min($0 + columns, options.count)])
        }
    }

    var body: some View {
        VStack(spacing: 8) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 8) {
                    ForEach(row, id: \.self) { opt in
                        let sel = isSelected(opt)
                        Button(action: { Haptics.light(); onTap(opt) }) {
                            Text(label(opt))
                                .font(.system(size: 14, weight: .heavy, design: .default).italic())
                                .foregroundStyle(sel ? Theme.Color.accentOn : Theme.Color.foreground)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(sel ? Theme.Color.accent : Theme.Color.surface)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                                        .stroke(Theme.Color.hairline, lineWidth: sel ? 0 : 1)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                    if row.count < columns {
                        ForEach(0..<(columns - row.count), id: \.self) { _ in
                            Color.clear.frame(maxWidth: .infinity)
                        }
                    }
                }
            }
        }
    }
}

// Simple line-wrapping flow layout for chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var total = CGSize.zero
        var rowWidth: CGFloat = 0
        var rowHeight: CGFloat = 0
        for sub in subviews {
            let s = sub.sizeThatFits(.unspecified)
            if rowWidth + s.width > maxWidth, rowWidth > 0 {
                total.width = max(total.width, rowWidth)
                total.height += rowHeight + spacing
                rowWidth = 0
                rowHeight = 0
            }
            rowWidth += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
        total.width = max(total.width, rowWidth)
        total.height += rowHeight
        return total
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for sub in subviews {
            let s = sub.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            sub.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
    }
}
