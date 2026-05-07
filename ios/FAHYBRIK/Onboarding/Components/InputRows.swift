import SwiftUI

struct LabeledRow<Trailing: View>: View {
    let label: String
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            Text(label)
                .font(Theme.Typography.body)
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
                .fill(Theme.Color.muted.opacity(0.18))
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

    var body: some View {
        LabeledRow(label: label) {
            HStack(spacing: 4) {
                TextField("—", text: $text)
                    .keyboardType(allowsDecimal ? .decimalPad : .numberPad)
                    .multilineTextAlignment(.trailing)
                    .font(Theme.Typography.bodyEmph.monospacedDigit())
                    .frame(maxWidth: 80)
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
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }

    private func formatted(_ v: Double) -> String {
        if allowsDecimal && v.truncatingRemainder(dividingBy: 1) != 0 {
            return String(format: "%.1f", v)
        }
        return String(Int(v))
    }
}

struct IntRow: View {
    let label: String
    let unit: String
    @Binding var value: Int?

    @State private var text: String = ""

    var body: some View {
        LabeledRow(label: label) {
            HStack(spacing: 4) {
                TextField("—", text: $text)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .font(Theme.Typography.bodyEmph.monospacedDigit())
                    .frame(maxWidth: 80)
                    .onChange(of: text) { _, new in
                        value = Int(new)
                    }
                    .onAppear {
                        if let v = value, text.isEmpty { text = String(v) }
                    }
                if !unit.isEmpty {
                    Text(unit)
                        .font(Theme.Typography.caption)
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

    var body: some View {
        LabeledRow(label: label) {
            TextField("mm:ss", text: $text)
                .keyboardType(.numbersAndPunctuation)
                .multilineTextAlignment(.trailing)
                .font(Theme.Typography.bodyEmph.monospacedDigit())
                .frame(maxWidth: 100)
                .onChange(of: text) { _, new in
                    seconds = Self.parse(new)
                }
                .onAppear {
                    if let s = seconds, text.isEmpty { text = Self.format(s) }
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

    static func format(_ s: Int) -> String {
        String(format: "%d:%02d", s / 60, s % 60)
    }
}

// hh:mm:ss for races > 1h (half/marathon)
struct TimeHourMinSecRow: View {
    let label: String
    @Binding var seconds: Int?

    @State private var text: String = ""

    var body: some View {
        LabeledRow(label: label) {
            TextField("h:mm:ss", text: $text)
                .keyboardType(.numbersAndPunctuation)
                .multilineTextAlignment(.trailing)
                .font(Theme.Typography.bodyEmph.monospacedDigit())
                .frame(maxWidth: 110)
                .onChange(of: text) { _, new in
                    seconds = Self.parse(new)
                }
                .onAppear {
                    if let s = seconds, text.isEmpty { text = Self.format(s) }
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

    static func format(_ s: Int) -> String {
        if s >= 3600 {
            return String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
        }
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}

struct TextRow: View {
    let label: String
    let placeholder: String
    @Binding var value: String

    var body: some View {
        LabeledRow(label: label) {
            TextField(placeholder, text: $value)
                .multilineTextAlignment(.trailing)
                .font(Theme.Typography.body)
                .frame(maxWidth: 180)
        }
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
            .colorScheme(.dark)
        }
    }
}
