import SwiftUI

// MARK: - Entry controls

/// A big mono numeric field with − / + fine-adjust buttons, in the instrument
/// readout voice. Backed by a String binding so typing never fights a formatter.
struct AmountEntry: View {
    @Binding var text: String
    let unit: String
    let step: Double
    let decimals: Bool
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            stepButton("minus") { adjust(-step) }
            HStack(alignment: .lastTextBaseline, spacing: 6) {
                TextField("0", text: $text)
                    .keyboardType(decimals ? .decimalPad : .numberPad)
                    .focused($focused)
                    .font(Theme.Typography.readoutL)
                    .foregroundStyle(Theme.Color.foreground)
                    .multilineTextAlignment(.center)
                    .fixedSize()
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 15, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .frame(maxWidth: .infinity)
            stepButton("plus") { adjust(step) }
        }
    }

    private func adjust(_ delta: Double) {
        let current = Double(text.replacingOccurrences(of: ",", with: ".")) ?? 0
        let next = max(0, current + delta)
        text = decimals
            ? (next == next.rounded() ? String(Int(next)) : String(format: "%.1f", next))
            : String(Int(next.rounded()))
        Haptics.light()
    }

    private func stepButton(_ system: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 44, height: 44)
                .background(Theme.Color.surfaceElevated)
                .clipShape(Circle())
                .overlay(Circle().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(system == "plus" ? "Aumentar" : "Disminuir")   // AUDIT-B7
    }
}

/// mm:ss entry — two mono fields with a colon, plus − / + on the whole time
/// (adjusts seconds, rolling into minutes). For time-trial results (5K, 2K).
struct TimeEntry: View {
    @Binding var minText: String
    @Binding var secText: String
    let step: Double

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            stepButton("minus") { adjust(-step) }
            HStack(alignment: .center, spacing: 4) {
                field($minText, placeholder: "0")
                Text(":")
                    .font(Theme.Typography.readoutL)
                    .foregroundStyle(Theme.Color.muted)
                field($secText, placeholder: "00")
            }
            .frame(maxWidth: .infinity)
            stepButton("plus") { adjust(step) }
        }
    }

    private func field(_ binding: Binding<String>, placeholder: String) -> some View {
        TextField(placeholder, text: binding)
            .keyboardType(.numberPad)
            .font(Theme.Typography.readoutL)
            .foregroundStyle(Theme.Color.foreground)
            .multilineTextAlignment(.center)
            .frame(minWidth: 62)
            .fixedSize()
    }

    private func adjust(_ delta: Double) {
        let m = Int(minText) ?? 0
        let s = Int(secText) ?? 0
        let total = max(0, m * 60 + s + Int(delta))
        minText = String(total / 60)
        secText = String(format: "%02d", total % 60)
        Haptics.light()
    }

    private func stepButton(_ system: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 44, height: 44)
                .background(Theme.Color.surfaceElevated)
                .clipShape(Circle())
                .overlay(Circle().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(system == "plus" ? "Aumentar" : "Disminuir")   // AUDIT-B7
    }
}
