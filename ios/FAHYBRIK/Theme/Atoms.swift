import SwiftUI

// Mirrors docs/design/fahybrik-design-system/project/athlete_app/kit.jsx.
// All Expert-variant screens compose these atoms. Edit the design system
// first if a token here needs to move.

// MARK: - Wordmark
// Bracketed orange [F] + foreground AHYBRIK. Italic-bold display, tracking -1.
struct Wordmark: View {
    var size: CGFloat = 22
    var body: some View {
        HStack(spacing: 0) {
            Text("[F]").foregroundStyle(Theme.Color.accent)
            Text("AHYBRIK").foregroundStyle(Theme.Color.foreground)
        }
        .font(.system(size: size, weight: .heavy, design: .default).italic())
        .tracking(-1)
        .lineLimit(1)
    }
}

// MARK: - Type
struct LabelText: View {
    let text: String
    var color: Color = Theme.Color.muted
    var size: CGFloat = 11
    var body: some View {
        Text(text)
            .font(.system(size: size, weight: .semibold))
            .tracking(1.6)
            .textCase(.uppercase)
            .foregroundStyle(color)
    }
}

struct MonoText: View {
    let text: String
    var size: CGFloat = 13
    var weight: Font.Weight = .medium
    var color: Color = Theme.Color.foreground
    var italic: Bool = false
    var body: some View {
        let f = Font.system(size: size, weight: weight, design: .monospaced).monospacedDigit()
        Text(text)
            .font(italic ? f.italic() : f)
            .foregroundStyle(color)
    }
}

struct HeroNumber: View {
    let text: String
    var size: CGFloat = 96
    var color: Color = Theme.Color.foreground
    var body: some View {
        Text(text)
            .font(.system(size: size, weight: .heavy, design: .default).italic().monospacedDigit())
            .tracking(-1)
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }
}

// MARK: - Card
struct CardSurface<Content: View>: View {
    var padding: CGFloat = Theme.Spacing.l
    var radius: CGFloat = Theme.Radius.l
    var topAccent: Bool = false
    var leftAccent: Bool = false
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if topAccent {
                Rectangle().fill(Theme.Color.accent).frame(height: 2)
            }
            content()
                .padding(padding)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Theme.Color.surface)
        .overlay(alignment: .leading) {
            if leftAccent {
                Rectangle().fill(Theme.Color.accent).frame(width: 2)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

// MARK: - HR Zone badge
struct ZBadge: View {
    let zone: HRZone
    var big: Bool = false
    var body: some View {
        Text(zone.label)
            .font(.system(size: big ? 13 : 11, weight: .bold))
            .tracking(1.6)
            .foregroundStyle(zone.color)
            .padding(.horizontal, big ? 14 : 10)
            .padding(.vertical, big ? 6 : 4)
            .background(zone.color.opacity(0.15))
            .clipShape(Capsule())
    }
}

// MARK: - Pill / chip
struct PillChip: View {
    let title: String
    var selected: Bool = false
    var action: (() -> Void)? = nil

    var body: some View {
        Button(action: { Haptics.light(); action?() }) {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(selected ? Color.white : Theme.Color.foreground)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(selected ? Theme.Color.accent : Theme.Color.surface)
                .overlay(
                    Capsule().stroke(selected ? Theme.Color.accent : Theme.Color.muted.opacity(0.35), lineWidth: 1)
                )
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
    }
}

// MARK: - Recovery ring (SVG-equivalent)
struct RecoveryRing: View {
    let value: Int
    var size: CGFloat = 96
    var stroke: CGFloat = 8
    var color: Color = Theme.Color.foreground

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.08), lineWidth: stroke)
            Circle()
                .trim(from: 0, to: max(0, min(1, CGFloat(value) / 100)))
                .stroke(color, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(value)")
                .font(.system(size: size * 0.36, weight: .heavy, design: .default).italic())
                .foregroundStyle(Theme.Color.foreground)
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Coach quote
struct CoachQuote: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 14).italic())
            .foregroundStyle(Theme.Color.muted)
            .padding(.leading, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(
                Rectangle().fill(Theme.Color.accent).frame(width: 2),
                alignment: .leading
            )
    }
}

// MARK: - Hairline-divided rows
struct MetricRowsList: View {
    struct Item: Identifiable {
        let id = UUID()
        let label: String
        let value: String
        var color: Color? = nil
    }

    let items: [Item]
    var dense: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { idx, it in
                if idx > 0 {
                    Rectangle().fill(Theme.Color.hairline).frame(height: 1)
                }
                HStack {
                    Text(it.label)
                        .font(.system(size: dense ? 14 : 16))
                        .foregroundStyle(Theme.Color.foreground)
                    Spacer()
                    Text(it.value)
                        .font(.system(size: dense ? 14 : 16, weight: .semibold).monospacedDigit())
                        .foregroundStyle(it.color ?? Theme.Color.foreground)
                }
                .padding(.vertical, dense ? 10 : 14)
                .padding(.horizontal, dense ? 14 : 16)
            }
        }
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }
}

// MARK: - Dashboard tile (2x3 grid on Today/Stats)
struct DashTile: View {
    let label: String
    let value: String
    var unit: String = ""
    var color: Color = Theme.Color.foreground

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: label, size: 9)
            HStack(alignment: .lastTextBaseline, spacing: 4) {
                Text(value)
                    .font(.system(size: 24, weight: .heavy, design: .default).italic().monospacedDigit())
                    .foregroundStyle(color)
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }
}

// MARK: - Polarization stacked bar
struct PolBar: View {
    let z12: Int
    let z3: Int
    let z45: Int

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                Rectangle().fill(HRZone.z2.color)
                    .frame(width: geo.size.width * CGFloat(z12) / 100)
                Rectangle().fill(HRZone.z3.color)
                    .frame(width: geo.size.width * CGFloat(z3) / 100)
                Rectangle().fill(HRZone.z5.color)
                    .frame(width: geo.size.width * CGFloat(z45) / 100)
            }
        }
        .frame(height: 8)
        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
    }
}

// MARK: - Expert-density data cell (small Garmin-style)
struct ExpertCell: View {
    let label: String
    let value: String
    var unit: String = ""
    var color: Color = Theme.Color.foreground

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            LabelText(text: label, size: 9)
            HStack(alignment: .lastTextBaseline, spacing: 4) {
                Text(value)
                    .font(.system(size: 22, weight: .heavy, design: .default).italic().monospacedDigit())
                    .foregroundStyle(color)
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

// MARK: - Section header (tracked uppercase label)
struct SectionLabel: View {
    let text: String
    var color: Color = Theme.Color.muted
    var size: CGFloat = 11
    var body: some View {
        LabelText(text: text, color: color, size: size)
    }
}

// MARK: - Hairline divider helper
struct Hairline: View {
    var body: some View {
        Rectangle().fill(Theme.Color.hairline).frame(height: 1)
    }
}

// MARK: - Press-scale primary button (haptic medium, no color change)
struct ExpertPrimaryButton: View {
    let title: String
    var height: CGFloat = 54
    var enabled: Bool = true
    let action: () -> Void

    @State private var pressed: Bool = false

    var body: some View {
        Button(action: {
            guard enabled else { return }
            Haptics.medium()
            action()
        }) {
            Text(title)
                .font(.system(size: 16, weight: .heavy, design: .default).italic())
                .tracking(1)
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity)
                .frame(height: height)
                .background(Theme.Color.accent.opacity(enabled ? 1 : 0.3))
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!enabled)
    }
}

struct PressScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: 0.18), value: configuration.isPressed)
    }
}
