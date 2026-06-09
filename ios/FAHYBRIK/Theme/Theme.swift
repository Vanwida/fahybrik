import SwiftUI

// Canonical tokens mirror docs/design/fahybrik-design-system/colors_and_type.css.
// Hex values are exact; touch with care — design memory pins them.
//
// Design language: "INSTRUMENTO ATLÉTICO" (Concept2 PM5 monitor × Whoop ×
// brand Fabrik). The palette is LAYERED near-black for depth — never flat —
// with a single sharp Fabrik-orange accent. Backgrounds step bg → surface →
// elevated so cards visibly float off the canvas under a soft shadow.
enum Theme {
    enum Color {
        // Layered near-blacks for DEPTH (canvas → card → raised). Defined as
        // literal sRGB so the step between layers is exact and reads as depth,
        // not a flat single black. Asset-backed brand colors stay available via
        // the *Asset accessors below for anything that must track the catalog.
        static let background = SwiftUI.Color(red: 0x0B/255, green: 0x0B/255, blue: 0x0C/255)   // #0B0B0C canvas
        static let surface = SwiftUI.Color(red: 0x14/255, green: 0x14/255, blue: 0x16/255)      // #141416 card
        static let surfaceElevated = SwiftUI.Color(red: 0x1C/255, green: 0x1C/255, blue: 0x1F/255) // #1C1C1F raised
        // A touch deeper than the canvas, for wells / inset instrument faces.
        static let surfaceSunken = SwiftUI.Color(red: 0x08/255, green: 0x08/255, blue: 0x09/255)    // #080809 well

        static let foreground = SwiftUI.Color(red: 0xF5/255, green: 0xF3/255, blue: 0xF0/255)   // #F5F3F0 warm white
        static let muted = SwiftUI.Color(red: 0x9A/255, green: 0x93/255, blue: 0x8B/255)        // #9A938B
        static let faint = SwiftUI.Color(red: 0x6B/255, green: 0x62/255, blue: 0x58/255)        // #6B6258 faint

        // Hairlines are warm-white at very low alpha — the instrument-panel seam.
        static let hairline = SwiftUI.Color.white.opacity(0.07)
        static let hairlineStrong = SwiftUI.Color.white.opacity(0.12)
        static let outline = SwiftUI.Color.white.opacity(0.10)
        static let scrim = SwiftUI.Color.black.opacity(0.55)

        static let accent = SwiftUI.Color(red: 0xF0/255, green: 0x6A/255, blue: 0x2A/255)       // #F06A2A Fabrik orange
        static let accentPress = SwiftUI.Color(red: 0xD8/255, green: 0x5A/255, blue: 0x20/255)  // #D85A20 pressed
        // #511900 brown — 4.57:1 on #F06A2A (WCAG AA), paridad with coach
        // (--accent-on). White was 3.09:1 (fails AA).
        static let accentOn = SwiftUI.Color(red: 0x51/255, green: 0x19/255, blue: 0x00/255)
        static let ok = SwiftUI.Color(red: 0x3F/255, green: 0xC7/255, blue: 0x73/255)
        static let warning = SwiftUI.Color(red: 0xF2/255, green: 0xA5/255, blue: 0x2E/255)
        static let danger = SwiftUI.Color(red: 0xF2/255, green: 0x3F/255, blue: 0x3F/255)

        // Asset-catalog brand colors, kept for anything that must track the
        // shared catalog 1:1 (e.g. cross-platform parity checks).
        static let backgroundAsset = SwiftUI.Color("BrandBackground")
        static let surfaceAsset = SwiftUI.Color("BrandSurface")
        static let foregroundAsset = SwiftUI.Color("BrandForeground")
        static let mutedAsset = SwiftUI.Color("BrandMuted")
        static let accentAsset = SwiftUI.Color("BrandAccent")
    }

    // MARK: - Depth (soft shadows for elevated instrument cards)
    enum Shadow {
        /// Resting card — a soft, dramatic drop so the card floats off the canvas.
        struct Spec { let color: SwiftUI.Color; let radius: CGFloat; let x: CGFloat; let y: CGFloat }
        static let card = Spec(color: .black.opacity(0.45), radius: 18, x: 0, y: 10)
        static let cardTight = Spec(color: .black.opacity(0.35), radius: 10, x: 0, y: 5)
        static let hero = Spec(color: .black.opacity(0.55), radius: 28, x: 0, y: 16)
    }

    // MARK: - Motion (one orchestrated staggered reveal on appear)
    enum Motion {
        /// Per-card delay step in the entrance stagger.
        static let stagger: Double = 0.06
        /// Spring used for the reveal — restrained, high-impact.
        static let reveal: Animation = .spring(response: 0.55, dampingFraction: 0.86)
        /// Travel distance for the reveal slide-up.
        static let revealOffset: CGFloat = 14
    }

    enum Spacing {
        static let xs: CGFloat = 4
        static let s: CGFloat = 8
        static let m: CGFloat = 12
        static let l: CGFloat = 16
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
        static let xxxl: CGFloat = 48
    }

    enum Radius {
        static let s: CGFloat = 6
        static let m: CGFloat = 10
        static let l: CGFloat = 14
        static let xl: CGFloat = 20
        static let pill: CGFloat = 9999
    }

    enum Tracking {
        /// 0.16em at 11pt label size (≈ 1.76pt) — uppercase data labels.
        static let dataLabel: CGFloat = 1.76
        /// -0.01em at 38/28pt headline sizes.
        static let headline: CGFloat = -0.38
        /// -0.02em at 56pt display.
        static let display: CGFloat  = -1.12
    }

    enum Typography {
        static let display = Font.system(size: 56, weight: .heavy, design: .default).italic()
        static let headlineL = Font.system(size: 38, weight: .heavy, design: .default).italic()
        static let headlineM = Font.system(size: 28, weight: .heavy, design: .default).italic()
        static let headlineS = Font.system(size: 20, weight: .bold, design: .default).italic()
        static let body = Font.system(size: 16, weight: .regular, design: .default)
        static let bodyEmph = Font.system(size: 16, weight: .semibold, design: .default)
        static let small = Font.system(size: 13, weight: .medium, design: .default)
        static let caption = Font.system(size: 12, weight: .medium, design: .default)
        static let dataDigit = Font.system(size: 36, weight: .heavy, design: .default).italic().monospacedDigit()
        static let dataDigitHero = Font.system(size: 96, weight: .heavy, design: .default).italic().monospacedDigit()
        static let dataLabel = Font.system(size: 11, weight: .semibold, design: .default)

        // MARK: - Instrument readout (the signature: erg-monitor / race-clock mono)
        //
        // True monospaced (`design: .monospaced`), upright (NOT italic), heavy,
        // tabular. This is the PM5/Whoop "readout" voice — big mono numbers that
        // hold their column as values change. Use for the hero metric on a card.
        static let readoutHero = Font.system(size: 72, weight: .heavy, design: .monospaced).monospacedDigit()
        static let readoutL    = Font.system(size: 48, weight: .heavy, design: .monospaced).monospacedDigit()
        static let readoutM    = Font.system(size: 34, weight: .bold,  design: .monospaced).monospacedDigit()
        static let readoutS    = Font.system(size: 22, weight: .bold,  design: .monospaced).monospacedDigit()
        /// Small tracked-uppercase mono caption that sits under a readout.
        static let readoutLabel = Font.system(size: 11, weight: .semibold, design: .monospaced)

        // MARK: - Dynamic Type (accessibility)
        //
        // SwiftUI's `Font.system(size:)` is FIXED-size — it does not honor the
        // user's text-size setting. To make body/label copy scale we use the
        // `.scaledFont(...)` view modifier (below), which is backed by
        // `@ScaledMetric` and scales the point size relative to a text style.
        //
        // Use `.scaledFont(...)` for body/label copy on screens the athlete
        // reads daily (Today, Plan, ActiveWorkout, Chat, Profile). Hero/data
        // display fonts deliberately stay fixed (`Font.system(size:)`) so the
        // dense Garmin-style metric grids don't reflow at large text sizes.

        /// Raw spec tuples (size/weight/italic/leading/tracking) for callsites
        /// that need the underlying values — e.g. UIFont interop, custom layout.
        struct Spec {
            let size: CGFloat
            let weight: Font.Weight
            let italic: Bool
            let leading: CGFloat
            let tracking: CGFloat
        }

        static let displaySpec       = Spec(size: 56, weight: .heavy,    italic: true,  leading: 1.0,  tracking: Tracking.display)
        static let headlineLSpec     = Spec(size: 38, weight: .heavy,    italic: true,  leading: 1.05, tracking: Tracking.headline)
        static let headlineMSpec     = Spec(size: 28, weight: .heavy,    italic: true,  leading: 1.1,  tracking: Tracking.headline)
        static let headlineSSpec     = Spec(size: 20, weight: .bold,     italic: true,  leading: 1.2,  tracking: 0)
        static let bodySpec          = Spec(size: 16, weight: .regular,  italic: false, leading: 1.4,  tracking: 0)
        static let bodyEmphSpec      = Spec(size: 16, weight: .semibold, italic: false, leading: 1.4,  tracking: 0)
        static let smallSpec         = Spec(size: 13, weight: .medium,   italic: false, leading: 1.4,  tracking: 0)
        static let captionSpec       = Spec(size: 12, weight: .medium,   italic: false, leading: 1.3,  tracking: 0)
        static let dataDigitSpec     = Spec(size: 36, weight: .heavy,    italic: true,  leading: 1.0,  tracking: 0)
        static let dataDigitHeroSpec = Spec(size: 96, weight: .heavy,    italic: true,  leading: 0.95, tracking: 0)
        static let dataLabelSpec     = Spec(size: 11, weight: .semibold, italic: false, leading: 1.0,  tracking: Tracking.dataLabel)
    }
}

extension View {
    func brandSurface(radius: CGFloat = Theme.Radius.l) -> some View {
        self
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }

    /// Apply uppercase + canonical data-label tracking
    /// (1.76pt ≈ 0.16em at 11pt label size).
    func uppercaseTracked(_ tracking: CGFloat = Theme.Tracking.dataLabel) -> some View {
        self.tracking(tracking).textCase(.uppercase)
    }

    /// Soft, dramatic drop shadow so elevated cards float off the canvas.
    func brandShadow(_ spec: Theme.Shadow.Spec = Theme.Shadow.card) -> some View {
        self.shadow(color: spec.color, radius: spec.radius, x: spec.x, y: spec.y)
    }

    /// Subtle full-bleed vignette + fine grain laid over the canvas so the
    /// near-black background never reads flat. Apply once, behind content.
    func instrumentCanvas() -> some View {
        self.overlay(BrandVignette().allowsHitTesting(false))
    }

    /// One orchestrated staggered reveal: fade + slide-up keyed off `appear`,
    /// delayed by `index` steps. Drive `appear` from the screen's `onAppear`.
    func staggerReveal(_ appear: Bool, index: Int = 0) -> some View {
        self
            .opacity(appear ? 1 : 0)
            .offset(y: appear ? 0 : Theme.Motion.revealOffset)
            .animation(
                Theme.Motion.reveal.delay(Double(index) * Theme.Motion.stagger),
                value: appear
            )
    }

    /// Dynamic-Type-aware system font. The base point `size` is scaled relative
    /// to `textStyle` via `@ScaledMetric`, so text grows with the user's
    /// accessibility text-size setting (unlike `Font.system(size:)`, which is
    /// fixed). Use for readable body/label copy on core screens.
    func scaledFont(
        _ size: CGFloat,
        weight: Font.Weight = .regular,
        relativeTo textStyle: Font.TextStyle = .body,
        italic: Bool = false,
        monospaced: Bool = false
    ) -> some View {
        modifier(ScaledFontModifier(
            size: size,
            weight: weight,
            textStyle: textStyle,
            italic: italic,
            monospaced: monospaced
        ))
    }
}

/// Vignette + faint grain overlay. Darkens the canvas edges and adds a barely
/// perceptible noise so large near-black fields gain depth instead of banding.
/// Decorative only — ignored by VoiceOver and hit-testing.
struct BrandVignette: View {
    var body: some View {
        ZStack {
            RadialGradient(
                colors: [.clear, .black.opacity(0.38)],
                center: .center,
                startRadius: 140,
                endRadius: 620
            )
            // Fine grain: a tiny tiled dot pattern at very low alpha.
            Canvas { ctx, size in
                let dot = Path(ellipseIn: CGRect(x: 0, y: 0, width: 1, height: 1))
                var seed: UInt64 = 0x9E3779B9
                func rnd() -> CGFloat {
                    seed = seed &* 6364136223846793005 &+ 1442695040888963407
                    return CGFloat((seed >> 33) & 0xFFFF) / 65535.0
                }
                let count = Int((size.width * size.height) / 900)
                for _ in 0..<max(0, count) {
                    let x = rnd() * size.width
                    let y = rnd() * size.height
                    ctx.fill(dot.offsetBy(dx: x, dy: y), with: .color(.white.opacity(0.018)))
                }
            }
        }
        .blendMode(.plusLighter)
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

/// Backs `.scaledFont(...)`. `@ScaledMetric` recomputes the effective point
/// size whenever the Dynamic Type setting changes, keeping the design's pinned
/// base sizes while letting them scale for accessibility.
struct ScaledFontModifier: ViewModifier {
    let size: CGFloat
    var weight: Font.Weight = .regular
    var textStyle: Font.TextStyle = .body
    var italic: Bool = false
    var monospaced: Bool = false

    @ScaledMetric private var scaledSize: CGFloat

    init(
        size: CGFloat,
        weight: Font.Weight,
        textStyle: Font.TextStyle,
        italic: Bool,
        monospaced: Bool
    ) {
        self.size = size
        self.weight = weight
        self.textStyle = textStyle
        self.italic = italic
        self.monospaced = monospaced
        self._scaledSize = ScaledMetric(wrappedValue: size, relativeTo: textStyle)
    }

    func body(content: Content) -> some View {
        var font = Font.system(
            size: scaledSize,
            weight: weight,
            design: monospaced ? .monospaced : .default
        )
        if monospaced { font = font.monospacedDigit() }
        if italic { font = font.italic() }
        return content.font(font)
    }
}
