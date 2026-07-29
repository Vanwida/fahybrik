import SwiftUI

// Mirrors docs/design/fahybrik-design-system/project/athlete_app/kit.jsx.
// All Expert-variant screens compose these atoms. Edit the design system
// first if a token here needs to move.

// MARK: - Wordmark
// Official FAHYBRID brand logo (the "FH" monogram from web/public/brand/).
// Light canvas → black variant, dark canvas → white variant, resolved by the
// `BrandLogo` asset's luminosity appearances. `size` is the rendered HEIGHT in
// points (width scales with the logo's intrinsic aspect ratio).
// Consumer brand = FAHYBRID (fahybrid.com); internal infra stays FAHYBRIK.
struct Wordmark: View {
    var size: CGFloat = 22
    var body: some View {
        Image("BrandLogo")
            .resizable()
            .scaledToFit()
            .frame(height: size)
            .accessibilityLabel("FAHYBRID")
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
    /// Sigue el tamaño de texto del sistema (contrato §4).
    ///
    /// Por defecto NO escala, como el resto de lecturas: las rejillas densas de HUD
    /// se reflowean y dejan de leerse. Pero cuando este dato va en fila JUNTO A una
    /// etiqueta que sí escala, tiene que escalar con ella — si no, a tamaño accesible
    /// la etiqueta crece, el dato se queda, y acaba pesando más la etiqueta que el
    /// dato. Se pide por parámetro para poder adoptarlo pantalla a pantalla.
    var escala: Bool = false
    var relativeTo: Font.TextStyle = .footnote

    var body: some View {
        let f = Font.system(size: size, weight: weight, design: .monospaced).monospacedDigit()
        if escala {
            Text(text)
                .scaledFont(size, weight: weight, relativeTo: relativeTo,
                            italic: italic, monospaced: true)
                .foregroundStyle(color)
        } else {
            Text(text)
                .font(italic ? f.italic() : f)
                .foregroundStyle(color)
        }
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

// MARK: - Context strip
//
// The thin band that carries "where am I" above a live surface — the erg's
// "SERIE 2/5 · 500 m remo", a route's "FOR TIME · 3 de 5 · 8:03". One chrome for
// every live surface that needs one, so two strips on two screens are the same
// object to the athlete's eye.
extension View {
    func stripChrome() -> some View {
        self
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
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
    /// Optional asset name of a subtle athletic photo to lay behind the card,
    /// sealed under an adaptive scrim (see `CardPhotoBackground`) so text keeps
    /// full WCAG-AA contrast in both themes. Used by the race countdown cards;
    /// `nil` everywhere else (the existing flat-surface fill is preserved).
    var backgroundImage: String? = nil
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
            if let backgroundImage {
                // A subtle athletic photo behind the card, sealed under an
                // adaptive scrim that keeps every text element legible (AA) in
                // both themes. The outer `.clipShape` rounds it to the card.
                CardPhotoBackground(imageName: backgroundImage)
            } else {
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

// MARK: - Brand imagery
//
// Free-license photography that ships in the asset catalog. Every race backdrop
// is a HYROX / functional-fitness shot from Unsplash, used under the Unsplash
// License (free for commercial use, no attribution required). One source of
// truth for both the asset POOL and the deterministic picker, so the Inicio
// anchor and the Carreras cards can't drift and every race keeps its own photo.
enum BrandImagery {
    /// The pool of race-card backdrops (each a `RaceCardBackground*.imageset`).
    /// A race is mapped to ONE of these deterministically — see
    /// `raceCardBackground(for:)` — so the same race always shows the same photo
    /// and adjacent cards vary. Add a new imageset → append its name here.
    ///   1 sled push · 2 indoor mass run · 3 wall-balls station · 4 competition
    ///   rig · 5 grayscale strength. All Unsplash License (free, no attribution).
    static let raceCardBackgrounds = [
        "RaceCardBackground",
        "RaceCardBackground2",
        "RaceCardBackground3",
        "RaceCardBackground4",
        "RaceCardBackground5",
    ]

    /// Fallback backdrop for a race surface with no stable identity yet (e.g. the
    /// Inicio "elige tu carrera" empty state, before a target race exists).
    static let raceCardBackgroundDefault = raceCardBackgrounds[0]

    /// Deterministically pick ONE backdrop from the pool for a race, keyed by a
    /// STABLE identity string (the Carreras `raceId`, or the Inicio target race's
    /// `name|date` identity). Uses a 64-bit FNV-1a hash of the key — NOT Swift's
    /// `hashValue`, which is per-process randomized and would reshuffle photos on
    /// every launch — so a given race renders the same photo across launches, and
    /// the avalanche spreads neighbouring ids across the pool so visible cards differ.
    static func raceCardBackground(for key: String) -> String {
        let pool = raceCardBackgrounds
        guard !pool.isEmpty else { return raceCardBackgroundDefault }
        // FNV-1a (64-bit): offset basis + prime, &-ops to wrap without trapping.
        var hash: UInt64 = 0xcbf29ce484222325
        for byte in key.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 0x100000001b3
        }
        return pool[Int(hash % UInt64(pool.count))]
    }
}

// MARK: - Card photo background (subtle athletic backdrop + legibility scrim)
//
// A faint athletic photo laid behind a `CardSurface`, sealed under an adaptive
// surface-colored scrim so every text element keeps full WCAG-AA contrast in
// BOTH themes — the photo only ever whispers through. The scrim is heaviest at
// the top (where the chosen sled-push shot's bright LED wall sits, and where the
// small tracked eyebrow label lives) and at the very bottom (the small proximity
// line), easing in the middle so the photo breathes behind the large, tolerant
// countdown/title type. Because the scrim is the adaptive `surface` color, the
// backdrop reads dark-on-dark and a fainter ghost on the clean light canvas —
// never muddy. Decorative: hidden from VoiceOver, never hit-tested.
private struct CardPhotoBackground: View {
    let imageName: String
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        // Scrim opacity stops (top / middle / bottom). On light the photo is a
        // mere whisper (~6–12%) so the clean canvas stays clean; on dark it
        // breathes a little more (~9–20%) for the moody, race-prep feel.
        let s = scheme == .light
            ? (top: 0.96, mid: 0.91, bottom: 0.94)
            : (top: 0.91, mid: 0.80, bottom: 0.88)
        ZStack {
            // Opaque base so transparent regions never punch through to the canvas.
            Theme.Color.surface
            Image(imageName)
                .resizable()
                .scaledToFill()
            LinearGradient(
                stops: [
                    .init(color: Theme.Color.surface.opacity(s.top), location: 0.0),
                    .init(color: Theme.Color.surface.opacity(s.mid), location: 0.45),
                    .init(color: Theme.Color.surface.opacity(s.bottom), location: 1.0),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
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
