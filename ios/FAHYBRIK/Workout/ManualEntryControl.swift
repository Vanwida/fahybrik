import SwiftUI

// Compact in-workout stepper for athlete-logged values when no device measures
// them: actual load on strength/sled, covered distance on a run with no GPS.
// −/value/+ row matching the Expert dark HUD (surface tile, mono digits, Fabrik
// orange affordances). The bound value is the real recorded number that flows
// into the segment's LapRecord — never the prescription.
struct ManualStepperField: View {
    let label: String
    let unit: String
    /// nil renders an em-dash and the first +/− tap seeds from `seedOnFirstTap`.
    @Binding var value: Double?
    /// Increment per tap (e.g. 2.5 kg, 50 m).
    let step: Double
    /// Value to seed when the field is empty and the athlete taps +/−.
    var seedOnFirstTap: Double = 0
    /// Whole-number display (no decimals) — true for meters, false for kg.
    var whole: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: label, size: 11)
            HStack(spacing: 10) {
                stepButton(systemName: "minus", delta: -step)
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text(display)
                        .font(.system(size: 30, weight: .heavy, design: .default).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    if !unit.isEmpty {
                        Text(unit)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
                .frame(maxWidth: .infinity)
                stepButton(systemName: "plus", delta: step)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(display) \(unit)")
        .accessibilityValue(display)
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: adjust(step)
            case .decrement: adjust(-step)
            @unknown default: break
            }
        }
    }

    private var display: String {
        guard let v = value else { return "—" }
        return whole ? "\(Int(v.rounded()))" : trimmed(v)
    }

    // kg with at most one decimal, trimming a trailing ".0".
    private func trimmed(_ v: Double) -> String {
        let s = String(format: "%.1f", v)
        return s.hasSuffix(".0") ? String(s.dropLast(2)) : s
    }

    private func stepButton(systemName: String, delta: Double) -> some View {
        Button(action: { adjust(delta) }) {
            Image(systemName: systemName)
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(Theme.Color.accent)
                .frame(width: 36, height: 36)
                .background(Theme.Color.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(delta > 0 ? "Sumar \(unit)" : "Restar \(unit)")
    }

    private func adjust(_ delta: Double) {
        Haptics.light()
        let base = value ?? seedOnFirstTap
        value = max(0, base + delta)
    }
}
