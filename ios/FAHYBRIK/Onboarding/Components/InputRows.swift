import SwiftUI

struct LabeledRow<Trailing: View>: View {
    let label: String
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            Text(label)
                .scaledFont(16, relativeTo: .body)
                .foregroundStyle(Theme.Color.foreground)
            Spacer()
            trailing()
                .foregroundStyle(Theme.Color.foreground)
        }
        .padding(.vertical, 14)
        .padding(.horizontal, Theme.Spacing.l)
        .frame(maxWidth: .infinity)
        .overlay(
            Rectangle()
                .fill(Theme.Color.hairline)
                .frame(height: 1),
            alignment: .bottom
        )
    }
}

struct NumberRow: View {
    let label: String
    let unit: String
    @Binding var value: Double?
    var allowsDecimal: Bool = true

    @State private var text: String = ""
    // The value scales with Dynamic Type, so its slot has to scale with it —
    // a pinned 80 pt cap truncated three digits at accessibility sizes.
    @ScaledMetric(relativeTo: .body) private var fieldWidth: CGFloat = 80

    var body: some View {
        LabeledRow(label: label) {
            HStack(spacing: 4) {
                TextField("—", text: $text)
                    .keyboardType(allowsDecimal ? .decimalPad : .numberPad)
                    .multilineTextAlignment(.trailing)
                    .scaledFont(16, weight: .semibold, relativeTo: .body, monospaced: true)
                    .frame(maxWidth: fieldWidth)
                    .onChange(of: text) { _, new in
                        let cleaned = new.replacingOccurrences(of: ",", with: ".")
                        value = Double(cleaned)
                    }
                    .onAppear {
                        if let v = value, text.isEmpty {
                            text = formatted(v)
                        }
                    }
                Text(unit)
                    .scaledFont(12, weight: .medium, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }

    private func formatted(_ v: Double) -> String {
        if allowsDecimal && v.truncatingRemainder(dividingBy: 1) != 0 {
            return Formato.esDecimal(v)
        }
        return String(Int(v))
    }
}

struct IntRow: View {
    let label: String
    let unit: String
    @Binding var value: Int?

    @State private var text: String = ""
    @ScaledMetric(relativeTo: .body) private var fieldWidth: CGFloat = 80

    var body: some View {
        LabeledRow(label: label) {
            HStack(spacing: 4) {
                TextField("—", text: $text)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .scaledFont(16, weight: .semibold, relativeTo: .body, monospaced: true)
                    .frame(maxWidth: fieldWidth)
                    .onChange(of: text) { _, new in
                        value = Int(new)
                    }
                    .onAppear {
                        if let v = value, text.isEmpty { text = String(v) }
                    }
                if !unit.isEmpty {
                    Text(unit)
                        .scaledFont(12, weight: .medium, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }
}

// mm:ss input. Athletes think in minutes, not NSDate.
struct TimeMinSecRow: View {
    let label: String
    @Binding var seconds: Int?

    @State private var text: String = ""
    @ScaledMetric(relativeTo: .body) private var fieldWidth: CGFloat = 100

    var body: some View {
        LabeledRow(label: label) {
            TextField("mm:ss", text: $text)
                .keyboardType(.numbersAndPunctuation)
                .multilineTextAlignment(.trailing)
                .scaledFont(16, weight: .semibold, relativeTo: .body, monospaced: true)
                .frame(maxWidth: fieldWidth)
                .onChange(of: text) { _, new in
                    seconds = Self.parse(new)
                }
                .onAppear {
                    if let s = seconds, text.isEmpty { text = Formato.clock(s) }
                }
        }
    }

    static func parse(_ s: String) -> Int? {
        let parts = s.split(separator: ":")
        guard parts.count == 2,
              let m = Int(parts[0]),
              let sec = Int(parts[1]),
              sec < 60 else { return nil }
        return m * 60 + sec
    }

}

// hh:mm:ss for races > 1h (half/marathon)
struct TimeHourMinSecRow: View {
    let label: String
    @Binding var seconds: Int?

    @State private var text: String = ""
    @ScaledMetric(relativeTo: .body) private var fieldWidth: CGFloat = 110

    var body: some View {
        LabeledRow(label: label) {
            TextField("h:mm:ss", text: $text)
                .keyboardType(.numbersAndPunctuation)
                .multilineTextAlignment(.trailing)
                .scaledFont(16, weight: .semibold, relativeTo: .body, monospaced: true)
                .frame(maxWidth: fieldWidth)
                .onChange(of: text) { _, new in
                    seconds = Self.parse(new)
                }
                .onAppear {
                    if let s = seconds, text.isEmpty { text = Formato.clock(s) }
                }
        }
    }

    static func parse(_ s: String) -> Int? {
        let parts = s.split(separator: ":")
        if parts.count == 3,
           let h = Int(parts[0]),
           let m = Int(parts[1]),
           let sec = Int(parts[2]) {
            return h * 3600 + m * 60 + sec
        }
        return TimeMinSecRow.parse(s)
    }

}

struct TextRow: View {
    let label: String
    let placeholder: String
    @Binding var value: String

    @ScaledMetric(relativeTo: .body) private var fieldWidth: CGFloat = 180

    var body: some View {
        LabeledRow(label: label) {
            TextField(placeholder, text: $value)
                .multilineTextAlignment(.trailing)
                .scaledFont(16, relativeTo: .body)
                .frame(maxWidth: fieldWidth)
        }
    }
}

// Labeled integer slider with a live mono readout. Used for 1-10 subjective
// scales (sleep, stress, commitment) and the 0-10 locus-of-control scale.
struct SliderRow: View {
    let label: String
    @Binding var value: Int
    var range: ClosedRange<Int> = 1...10
    var minLabel: String? = nil
    var maxLabel: String? = nil

    private var binding: Binding<Double> {
        Binding(get: { Double(value) }, set: { value = Int($0.rounded()) })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack {
                Text(label)
                    .scaledFont(16, relativeTo: .body)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer()
                Text("\(value)")
                    .font(Theme.Typography.readoutS)
                    .foregroundStyle(Theme.Color.accentText)
            }
            Slider(
                value: binding,
                in: Double(range.lowerBound)...Double(range.upperBound),
                step: 1
            )
            .tint(Theme.Color.accent)
            if minLabel != nil || maxLabel != nil {
                HStack {
                    Text(minLabel ?? "")
                    Spacer()
                    Text(maxLabel ?? "")
                }
                .scaledFont(12, weight: .medium, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, Theme.Spacing.l)
        .frame(maxWidth: .infinity)
        .overlay(
            Rectangle()
                .fill(Theme.Color.hairline)
                .frame(height: 1),
            alignment: .bottom
        )
    }
}

struct DateRow: View {
    let label: String
    @Binding var value: Date?
    var range: ClosedRange<Date>? = nil

    var body: some View {
        LabeledRow(label: label) {
            DatePicker(
                "",
                selection: Binding(get: { value ?? Date() }, set: { value = $0 }),
                in: range ?? Date(timeIntervalSince1970: 0)...Date(timeIntervalSinceNow: 60 * 60 * 24 * 365 * 5),
                displayedComponents: .date
            )
            .labelsHidden()
        }
    }
}
