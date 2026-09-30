import SwiftUI

// ErgData-style illustrated "cómo conectar" help for the erg pairing sheet: the
// monitor's main menu DRAWN in SwiftUI (no image assets) with an accent arrow on
// "Connect", plus the one instruction that actually unblocks an athlete at the
// gym. Shown EXPANDED while the device list is empty and collapsed-but-present
// once ergs are listed — persistent help that never vanishes mid-flow.
struct PM5ConnectGuide: View {
    var body: some View {
        VStack(alignment: .center, spacing: Theme.Spacing.m) {
            PM5MenuIllustration()
            Text("En el monitor del erg, pulsa «Connect» para hacerlo visible. Luego toca tu erg en la lista (el número es el ID que sale en el monitor).")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity)
    }
}

// The monitor face: a sunken screen, five real menu rows (in the monitor's own words, so the
// athlete recognises the exact button), and the accent marking "Connect".
private struct PM5MenuIllustration: View {
    private static let rows = ["Just Row", "Select Workout", "Connect", "Memory", "More Options"]
    private static let target = "Connect"

    var body: some View {
        VStack(spacing: Theme.Spacing.xs) {
            Text("Main Menu")
                .papel(.nota)
                .monospaced()
                .foregroundStyle(Theme.Color.muted)
            ForEach(Self.rows, id: \.self) { menuRow($0) }
        }
        .padding(Theme.Spacing.m)
        .frame(maxWidth: 280)
        .background(Theme.Color.surfaceSunken)
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
            .strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Menú principal del monitor del erg con la opción Connect señalada")
    }

    private func menuRow(_ title: String) -> some View {
        let isTarget = title == Self.target
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
        return HStack(spacing: Theme.Spacing.s) {
            if isTarget {
                IconoDia(.play, tam: 12, peso: .heavy)
                    .foregroundStyle(Theme.Color.accent)
            }
            Text(title)
                .papel(isTarget ? .notaPesada : .nota)
                .monospaced()
                .foregroundStyle(Theme.Color.foreground)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.m)
        .frame(minHeight: 32)
        .background(isTarget ? Theme.Color.accentTint : .clear, in: forma)
        .overlay(forma.strokeBorder(isTarget ? Theme.Color.accent : Theme.Color.hairline,
                                    lineWidth: isTarget ? 1.5 : 1))
    }
}
