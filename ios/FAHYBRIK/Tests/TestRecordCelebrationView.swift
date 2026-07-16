import SwiftUI

// Tests guiados — the «Récord del test» moment (mockup C). Shown over the
// capture sheet's done state when the bridge reports at least one entry that
// BEAT the previous mark (server-side `improved`). Deliberately the same
// night-coded, gold-accented voice as the run-PR overlay (PRCelebrationView /
// CelebrationGold): a record is a record. Copy is test-specific and every
// number is real — value + delta come straight from the response.
struct TestRecordCelebrationView: View {
    struct Item: Identifiable {
        let id: String        // benchmark slug
        let label: String     // coach-facing result label ("5K", "Sentadilla")
        let valueText: String // "22:14" / "142.5 kg"
        let deltaText: String?
    }

    let items: [Item]
    let onDone: () -> Void

    @State private var appear = false

    /// Map the response's improved entries onto displayable items through the
    /// test's own contract (label + unit per slug). Pure — unit-tested.
    static func items(
        from entries: [RecordBatteryResult.EntryDelta],
        specs: [StoreResultSpec]
    ) -> [Item] {
        entries.map { entry in
            let spec = specs.first { $0.slug == entry.slug }
            let unit = spec?.unit ?? ""
            let delta = entry.prevValue.map { prev in
                "\(BenchmarkDelta.deltaLabel(unit: unit, delta: entry.value - prev)) vs tu marca anterior"
            }
            return Item(
                id: entry.slug,
                label: spec?.label ?? entry.slug,
                valueText: BenchmarkDelta.valueLabel(unit: unit, value: entry.value),
                deltaText: delta
            )
        }
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.94)
                .ignoresSafeArea()
                .onTapGesture { onDone() }

            VStack(spacing: Theme.Spacing.l) {
                medal
                VStack(spacing: 4) {
                    Text(items.count > 1 ? "¡Récords del test!" : "¡Récord del test!")
                        .font(.system(size: 26, weight: .heavy, design: .default).italic())
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Marca personal")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(Theme.Tracking.dataLabel)
                        .textCase(.uppercase)
                        .foregroundStyle(CelebrationGold.bright)
                }

                VStack(spacing: 12) {
                    ForEach(items) { item in
                        recordRow(item)
                    }
                }

                Button(action: { Haptics.light(); onDone() }) {
                    Text("Seguir")
                        .font(.system(size: 15, weight: .heavy, design: .default).italic())
                        .tracking(0.5)
                        .foregroundStyle(Color.black.opacity(0.78))
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .background(CelebrationGold.gradient)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(Theme.Spacing.xl)
            .frame(maxWidth: 360)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                    .fill(Theme.Color.surface)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                            .stroke(CelebrationGold.deep.opacity(0.5), lineWidth: 1)
                    )
            )
            .padding(.horizontal, Theme.Spacing.xl)
            .scaleEffect(appear ? 1 : 0.92)
            .opacity(appear ? 1 : 0)
        }
        // A celebration is a night-coded moment (same rule as the run PR): force
        // dark so the gold reads in light mode too.
        .environment(\.colorScheme, .dark)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { appear = true }
            Haptics.success()
        }
    }

    private var medal: some View {
        ZStack {
            Circle().fill(CelebrationGold.gradient)
                .frame(width: 76, height: 76)
                .shadow(color: CelebrationGold.deep.opacity(0.5), radius: 16, y: 6)
            Image(systemName: "stopwatch.fill")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(Color.black.opacity(0.72))
        }
        .accessibilityHidden(true)
    }

    private func recordRow(_ item: Item) -> some View {
        VStack(spacing: 4) {
            Text(item.label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
            Text(item.valueText)
                .font(.system(size: 44, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            if let delta = item.deltaText {
                Text(delta)
                    .font(.system(size: 12))
                    .foregroundStyle(CelebrationGold.bright)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}
