import SwiftUI

struct Chip: View {
    let title: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: { Haptics.light(); action() }) {
            Text(title)
                .font(Theme.Typography.small)
                .foregroundStyle(selected ? Color.white : Theme.Color.foreground)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(selected ? Theme.Color.accent : Theme.Color.surface)
                .clipShape(Capsule())
                .overlay(
                    Capsule().stroke(
                        selected ? Theme.Color.accent : Theme.Color.muted.opacity(0.35),
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
