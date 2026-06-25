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
            // Orange [F] is a display GLYPH (text) — on the light canvas the
            // brand orange fails AA, so use the role-split accentText (darkens to
            // #B5430B on light, stays #F06A2A on dark).
            Text("[F]").foregroundStyle(Theme.Color.accentText)
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
            // +0.08em tracked uppercase micro-label (≈1.76pt at 11pt).
            .tracking(Theme.Tracking.dataLabel)
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
//
// Instrument-panel card: an elevated near-black face that floats off the canvas
// under a soft shadow, sealed by a top-lit hairline so it never reads flat.
// API unchanged (padding/radius/topAccent/leftAccent) — only the look is lifted.
struct CardSurface<Content: View>: View {
    var padding: CGFloat = Theme.Spacing.l
    var radius: CGFloat = Theme.Radius.l
    var topAccent: Bool = false
    var leftAccent: Bool = false
    /// Raise onto the brightest layer (use for the hero card on a screen).
    var elevated: Bool = false
    @ViewBuilder var content: () -> Content

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if topAccent {
                Rectangle().fill(Theme.Color.accent).frame(height: 2)
            }
            content()
                .padding(padding)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background {
            // Layered fill: a near-vertical gradient from elevated → surface
            // gives the face a faint top-lit sheen rather than a flat slab.
            shape.fill(
                LinearGradient(
                    colors: elevated
                        ? [Theme.Color.surfaceElevated, Theme.Color.surface]
                        : [Theme.Color.surface, Theme.Color.surface.opacity(0.92)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
        }
        .overlay(alignment: .leading) {
            if leftAccent {
                Rectangle().fill(Theme.Color.accent).frame(width: 3)
            }
        }
        // Hairline seam — slightly brighter at the top edge (the lit lip).
        .overlay {
            shape.stroke(
                LinearGradient(
                    colors: [Theme.Color.hairlineStrong, Theme.Color.hairline],
                    startPoint: .top,
                    endPoint: .bottom
                ),
                lineWidth: 1
            )
        }
        .clipShape(shape)
        .brandShadow(elevated ? Theme.Shadow.hero : Theme.Shadow.card)
    }
}

// MARK: - Instrument readout (THE signature)
//
// Big mono number on a near-black face with a tiny tracked-uppercase label and
// optional unit — the erg-monitor / race-clock voice. `accent: true` paints the
// number Fabrik orange (the key metric). Reads as one VoiceOver element.
struct InstrumentReadout: View {
    let label: String
    let value: String
    var unit: String = ""
    var accent: Bool = true
    var size: CGFloat = 72
    /// Optional trailing delta (e.g. "▲4 vs 7d"), shown muted/ok/warning.
    var trailing: AnyView? = nil

    // The value is a big mono number rendered as TEXT, so the key-metric tint
    // uses accentText (darkens to #B5430B on light where brand orange fails AA).
    private var valueColor: Color { accent ? Theme.Color.accentText : Theme.Color.foreground }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                LabelText(text: label)
                Spacer(minLength: 8)
                if let trailing { trailing }
            }
            HStack(alignment: .lastTextBaseline, spacing: 8) {
                Text(value)
                    .font(.system(size: size, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(valueColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: max(12, size * 0.2), weight: .semibold, design: .monospaced))
                        .foregroundStyle(Theme.Color.muted)
                        .tracking(0.5)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(unit.isEmpty ? "\(label), \(value)" : "\(label), \(value) \(unit)")
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
                .font(.system(size: 13, weight: selected ? .semibold : .medium))
                .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.foreground)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(selected ? Theme.Color.accent : Theme.Color.surfaceElevated)
                .overlay(
                    Capsule().stroke(selected ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1)
                )
                .clipShape(Capsule())
        }
        .buttonStyle(PressScaleStyle())
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
                // Adaptive track seam — a baked white alpha vanished on the
                // light canvas; hairline flips black-on-white / white-on-black.
                .stroke(Theme.Color.hairline, lineWidth: stroke)
            Circle()
                .trim(from: 0, to: max(0, min(1, CGFloat(value) / 100)))
                .stroke(color, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(value)")
                .font(.system(size: size * 0.34, weight: .heavy, design: .monospaced).monospacedDigit())
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
                        .font(.system(size: dense ? 14 : 16, weight: .semibold, design: .monospaced).monospacedDigit())
                        .foregroundStyle(it.color ?? Theme.Color.foreground)
                }
                .padding(.vertical, dense ? 10 : 14)
                .padding(.horizontal, dense ? 14 : 16)
            }
        }
        .background(Theme.Color.surfaceElevated)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .brandShadow(Theme.Shadow.cardTight)
    }
}

// MARK: - Dashboard tile (2x3 grid on Today/Stats)
struct DashTile: View {
    let label: String
    let value: String
    var unit: String = ""
    var color: Color = Theme.Color.foreground

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: label, size: 11)
            HStack(alignment: .lastTextBaseline, spacing: 6) {
                Text(value)
                    .font(.system(size: 36, weight: .heavy, design: .default).italic().monospacedDigit())
                    .foregroundStyle(color)
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surfaceElevated)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .brandShadow(Theme.Shadow.cardTight)
        // Read as one element: "Readiness, 78, /100" instead of 3 fragments.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(unit.isEmpty ? "\(label), \(value)" : "\(label), \(value) \(unit)")
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
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: label, size: 11)
            HStack(alignment: .lastTextBaseline, spacing: 4) {
                Text(value)
                    .font(.system(size: 30, weight: .heavy, design: .default).italic().monospacedDigit())
                    .foregroundStyle(color)
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surfaceElevated)
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .brandShadow(Theme.Shadow.cardTight)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(unit.isEmpty ? "\(label), \(value)" : "\(label), \(value) \(unit)")
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
                .foregroundStyle(Theme.Color.accentOn)
                .frame(maxWidth: .infinity)
                .frame(height: height)
        }
        .buttonStyle(AccentFillButtonStyle(enabled: enabled, radius: Theme.Radius.l))
        .disabled(!enabled)
    }
}

/// Scale-only press feedback (no color change). For neutral / chip buttons.
struct PressScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: 0.18), value: configuration.isPressed)
    }
}

/// Accent-filled CTA: shifts to the pressed orange (#D85A20) and dips slightly
/// on touch — the tactile "key" press of the instrument panel.
struct AccentFillButtonStyle: ButtonStyle {
    var enabled: Bool = true
    var radius: CGFloat = Theme.Radius.l
    func makeBody(configuration: Configuration) -> some View {
        let base = enabled ? Theme.Color.accent : Theme.Color.accent.opacity(0.3)
        return configuration.label
            .background(configuration.isPressed ? Theme.Color.accentPress : base)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .brandShadow(configuration.isPressed ? Theme.Shadow.cardTight : Theme.Shadow.card)
            .scaleEffect(configuration.isPressed ? 0.985 : 1.0)
            .animation(.easeInOut(duration: 0.16), value: configuration.isPressed)
    }
}
