import SwiftUI

// ErgData-style illustrated "cómo conectar" help for the PM5 pairing sheet: the
// PM5's main menu DRAWN in SwiftUI (no image assets) with an accent arrow on
// "Connect", plus the one instruction that actually unblocks an athlete at the
// gym. Shown EXPANDED while the device list is empty and collapsed-but-present
// once ergs are listed — persistent help that never vanishes mid-flow.
struct PM5ConnectGuide: View {
    var body: some View {
        VStack(alignment: .center, spacing: Theme.Spacing.m) {
            PM5MenuIllustration()
            Text("En el PM5, pulsa «Connect» para hacerlo visible. Luego toca tu erg en la lista (el número es el ID que sale en el monitor).")
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity)
    }
}

// The PM5 monitor face: dark screen, five real menu rows, accent arrow marking
// "Connect" — the athlete recognises the exact button they must press.
private struct PM5MenuIllustration: View {
    private static let rows = ["Just Row", "Select Workout", "Connect", "Memory", "More Options"]
    private static let target = "Connect"

    var body: some View {
        VStack(spacing: 5) {
            Text("Main Menu")
                .font(.system(size: 9, weight: .semibold, design: .monospaced))
                .foregroundStyle(Theme.Color.muted)
            ForEach(Self.rows, id: \.self) { menuRow($0) }
        }
        .padding(12)
        .frame(width: 232)
        .background(Theme.Color.surfaceSunken)
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(Theme.Color.hairlineStrong, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Menú principal del PM5 con la opción Connect señalada")
    }

    private func menuRow(_ title: String) -> some View {
        let isTarget = title == Self.target
        return HStack(spacing: 6) {
            if isTarget {
                Image(systemName: "arrowtriangle.right.fill")
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundStyle(Theme.Color.accent)
            }
            Text(title)
                .font(.system(size: 11, weight: isTarget ? .heavy : .medium, design: .monospaced))
                .foregroundStyle(isTarget ? Theme.Color.accentText : Theme.Color.foreground.opacity(0.75))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10)
        .frame(height: 24)
        .background(isTarget ? Theme.Color.accent.opacity(0.14) : .clear)
        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous)
            .stroke(isTarget ? Theme.Color.accent : Theme.Color.hairline,
                    lineWidth: isTarget ? 1.5 : 1))
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
    }
}
