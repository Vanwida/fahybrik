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
        // MARK: - Adaptive resolution
        //
        // Every semantic token below resolves PER interface style: the DARK
        // value is the original instrument-panel near-black palette (unchanged);
        // the LIGHT value is the "Cool Clean" set — white canvas, cool light-gray
        // cards, cool near-black text. The app follows the SYSTEM appearance
        // (AppRoot no longer forces dark). Light hexes were contrast-checked
        // against their real backgrounds (text ≥4.5:1, UI/large ≥3:1, WCAG AA).
        static func dyn(light: UIColor, dark: UIColor) -> SwiftUI.Color {
            SwiftUI.Color(UIColor { tc in
                tc.userInterfaceStyle == .dark ? dark : light
            })
        }
        /// sRGB UIColor from an 0xRRGGBB literal (keeps the per-channel exactness
        /// the design memory pins, without repeating the /255 boilerplate).
        private static func ui(_ rgb: UInt32) -> UIColor {
            UIColor(
                red: CGFloat((rgb >> 16) & 0xFF) / 255,
                green: CGFloat((rgb >> 8) & 0xFF) / 255,
                blue: CGFloat(rgb & 0xFF) / 255,
                alpha: 1
            )
        }

        // Layered surfaces. DARK = near-black depth (canvas → card → raised →
        // well). LIGHT = white canvas, cool light-gray cards, raised cards back
        // to white so they "float" off the gray, well a touch deeper gray.
        static let background       = dyn(light: ui(0xFFFFFF), dark: ui(0x0B0B0C)) // canvas
        static let surface          = dyn(light: ui(0xF6F7F9), dark: ui(0x141416)) // card
        static let surfaceElevated  = dyn(light: ui(0xFFFFFF), dark: ui(0x1C1C1F)) // raised
        static let surfaceSunken    = dyn(light: ui(0xECEEF1), dark: ui(0x080809)) // well

        static let foreground = dyn(light: ui(0x0F1217), dark: ui(0xF5F3F0)) // text   (18.8:1 / —)
        static let muted      = dyn(light: ui(0x474D55), dark: ui(0x9A938B)) // muted  (8.5:1)
        static let faint      = dyn(light: ui(0x79808A), dark: ui(0x6B6258)) // faint  (UI 3.99:1)

        // Hairlines / outlines flip from warm-white-on-black to black-on-white at
        // the same low alphas — the instrument-panel seam, inverted.
        static let hairline       = dyn(light: UIColor.black.withAlphaComponent(0.07),
                                        dark:  UIColor.white.withAlphaComponent(0.07))
        static let hairlineStrong = dyn(light: UIColor.black.withAlphaComponent(0.12),
                                        dark:  UIColor.white.withAlphaComponent(0.12))
        static let outline        = dyn(light: UIColor.black.withAlphaComponent(0.10),
                                        dark:  UIColor.white.withAlphaComponent(0.10))
        // Scrim sits over content under sheets/overlays — lighter on light so it
        // dims without going muddy.
        static let scrim          = dyn(light: UIColor.black.withAlphaComponent(0.40),
                                        dark:  UIColor.black.withAlphaComponent(0.55))

        // Brand orange is the FILL in BOTH modes (button bg, bars, active pill);
        // unchanged. accentOn (#511900 brown) is the text/glyph ON that fill —
        // 4.57:1 on #F06A2A, valid in both modes.
        static let accent      = dyn(light: ui(0xF06A2A), dark: ui(0xF06A2A)) // #F06A2A Fabrik orange
        static let accentPress = dyn(light: ui(0xD85A20), dark: ui(0xD85A20)) // #D85A20 pressed
        static let accentOn    = dyn(light: ui(0x511900), dark: ui(0x511900)) // brown on orange
        // Orange as TEXT/links/small glyphs fails AA on a light canvas, so on
        // light it darkens to #B5430B (5.6:1 on white / 5.2:1 on surface). On
        // dark it stays the brand orange. Use this — NOT `accent` — for text.
        static let accentText  = dyn(light: ui(0xB5430B), dark: ui(0xF06A2A))

        // Semantic hues. DARK = the vivid instrument set. LIGHT = darkened so
        // each still passes ≥4.5:1 as TEXT on the white/surface canvas.
        static let ok      = dyn(light: ui(0x157A45), dark: ui(0x3FC773)) // green   (5.4:1 / 5.0:1)
        static let warning = dyn(light: ui(0x8A5A00), dark: ui(0xF2A52E)) // amber   (5.9:1 / 5.5:1)
        static let danger  = dyn(light: ui(0xC62F2F), dark: ui(0xF23F3F)) // red     (5.5:1 / 5.1:1)
        static let info    = dyn(light: ui(0x1F6FCC), dark: ui(0x4D9EEB)) // blue    (5.0:1 / 4.7:1)
        static let neutral = dyn(light: ui(0x6B7177), dark: ui(0xA1A1A1)) // "no signal" grey (UI 4.9:1)

        // Low-alpha status fills for chips/badges — parity with web --*-tint
        // (color + icon + label, never color alone). 0.14 alpha over the base hue.
        static let okTint = ok.opacity(0.14)
        static let warningTint = warning.opacity(0.14)
        static let dangerTint = danger.opacity(0.14)
        static let infoTint = info.opacity(0.14)
        static let neutralTint = neutral.opacity(0.14)

        // MARK: - Modality palette
        //
        // A DEDICATED hue per training modality for the day dot + legend (G5). This
        // is a SEPARATE axis from the ok/warning/danger delta semantics (reserved
        // for signed deltas) — these encode "what KIND of work", not "good/bad".
        // Run keeps the brand orange (the spine of a HYROX race); ergometers the
        // info blue; the rest get distinct, well-separated hues so metcon, HYROX,
        // strength and mobility never collapse into the same neutral dot. The dot
        // is decorative (accessibilityHidden — the session title carries meaning),
        // but each hue is darkened on light / brightened on dark so it reads on the
        // row surface in both modes (≥3:1 as a UI mark on #F6F7F9 light / #141416 dark).
        static let modalityStrength   = dyn(light: ui(0x6A46B0), dark: ui(0xB49BEE)) // violet  — iron
        static let modalityFunctional = dyn(light: ui(0x17834A), dark: ui(0x4FD08A)) // green   — metcon/WOD
        static let modalityHyrox      = dyn(light: ui(0xBD2493), dark: ui(0xEE7ACF)) // magenta — the flagship
        static let modalitySupport    = dyn(light: ui(0x0E7C72), dark: ui(0x3BD0BE)) // teal    — core/mobility

        // Asset-catalog brand colors, kept for anything that must track the
        // shared catalog 1:1 (e.g. cross-platform parity checks).
        static let backgroundAsset = SwiftUI.Color("BrandBackground")
        static let surfaceAsset = SwiftUI.Color("BrandSurface")
        static let foregroundAsset = SwiftUI.Color("BrandForeground")
        static let mutedAsset = SwiftUI.Color("BrandMuted")
        static let accentAsset = SwiftUI.Color("BrandAccent")

        // Partner identity in Dobles: the handoff colors Ana orange (= our brand
        // accent) and Marcos blue (= our info). The "self" athlete always reads
        // as the brand accent; the partner reads as info blue.
        static let partner = info
    }

    // MARK: - Modality
    //
    // A training session's modality drives a single dot/badge color across the
    // redesign (Plan day rows, compact session rows, day-detail switcher, the
    // pre-workout brief, the Dobles plan). The input is the API's `modality`
    // field — the PRINCIPAL block's real modality (run/row/ski/bike/strength/
    // functional/core/mobility/other, see /api/athlete/plan/week G5) — OR, when a
    // template has no readable segments, its FORMAT fallback (amrap/emom/for_time/
    // circuit/hyrox_sim/strength_block/intervals/tempo/test). We match loosely
    // (substring, EN+ES) so every spelling and the format fallbacks land on the
    // right hue without the backend promising an exact enum. Every modality gets a
    // distinct, well-separated color (Color.modality* above) so metcon, HYROX,
    // strength and mobility never collapse into one dot.
    enum Modality {
        // The canonical training-modality buckets the day dot, the week breakdown
        // and the legend all collapse onto — a SINGLE source of truth for both the
        // hue and the ES label, so a dot can never drift from the word that names
        // it. Ergometers (row/ski/bike) share one bucket; core + mobility + warmup/
        // cooldown share the calm "support" bucket.
        enum Kind: CaseIterable {
            case run, ergo, strength, functional, hyrox, support, other

            var color: SwiftUI.Color {
                switch self {
                case .run:        return Color.accent             // brand-orange spine of a race
                case .ergo:       return Color.info               // machine-blue family
                case .strength:   return Color.modalityStrength   // violet — iron
                case .functional: return Color.modalityFunctional // green — metcon/WOD
                case .hyrox:      return Color.modalityHyrox      // magenta — the flagship
                case .support:    return Color.modalitySupport    // teal — core/mobility
                case .other:      return Color.neutral            // ambiguous conditioning
                }
            }

            /// ES label for the breakdown + legend ("3 carrera · 1 fuerza · 1 HYROX").
            var label: String {
                switch self {
                case .run:        return "carrera"
                case .ergo:       return "ergómetro"
                case .strength:   return "fuerza"
                case .functional: return "funcional"
                case .hyrox:      return "HYROX"
                case .support:    return "movilidad"
                case .other:      return "otro"
                }
            }
        }

        /// Bucket a modality (or format-fallback) string. Case-insensitive,
        /// substring match, ordered most-specific-first. Unknown / ambiguous
        /// conditioning formats (intervals, tempo, test) resolve to `.other`
        /// rather than guessing a discipline.
        static func kind(_ raw: String?) -> Kind {
            let s = (raw ?? "").lowercased()
            func has(_ needles: String...) -> Bool { needles.contains { s.contains($0) } }

            // HYROX first — the flagship discipline keeps its own identity, so
            // "hyrox_sim" never falls through to a generic run/strength dot.
            if has("hyrox") { return .hyrox }
            // Running — the brand-orange spine of a HYROX race.
            if has("run", "corr", "carrera") { return .run }
            // Ergometers (row / ski / bike) — one machine-blue family.
            if has("erg", "row", "remo", "ski", "bike", "bici", "assault") { return .ergo }
            // Strength / lifting (incl. the "strength_block" format).
            if has("strength", "fuerza", "lift", "weight") { return .strength }
            // Functional / metcon / WOD formats.
            if has("functional", "metcon", "wod", "amrap", "emom",
                   "for_time", "fortime", "circuit", "hiit", "crossfit") { return .functional }
            // Core + mobility — low-intensity support work, one calm hue. (Also
            // catches warmup/cooldown titles for the per-block dots in the brief.)
            if has("core", "abdom", "mobility", "movilidad", "stretch", "estiram",
                   "yoga", "warm", "calent", "activaci", "cooldown", "calma") { return .support }
            // Unknown / "other" / ambiguous formats (intervals, tempo, test).
            return .other
        }

        /// Color for a modality (or format-fallback) string. Delegates to `kind`
        /// so the dot, the legend and the week breakdown can never diverge.
        static func color(_ raw: String?) -> SwiftUI.Color { kind(raw).color }

        /// ES label for a modality string (e.g. "carrera", "ergómetro").
        static func label(_ raw: String?) -> String { kind(raw).label }
    }

    // MARK: - Depth (soft shadows for elevated instrument cards)
    enum Shadow {
        /// Resting card — a soft, dramatic drop so the card floats off the canvas.
        /// Shadow alpha is adaptive: heavy on the dark canvas, soft on light (a
        /// 0.45 black shadow on white reads as a grimy halo).
        struct Spec { let color: SwiftUI.Color; let radius: CGFloat; let x: CGFloat; let y: CGFloat }
        private static func shadowColor(light: CGFloat, dark: CGFloat) -> SwiftUI.Color {
            Color.dyn(
                light: UIColor.black.withAlphaComponent(light),
                dark:  UIColor.black.withAlphaComponent(dark)
            )
        }
        static let card = Spec(color: shadowColor(light: 0.10, dark: 0.45), radius: 18, x: 0, y: 10)
        static let cardTight = Spec(color: shadowColor(light: 0.07, dark: 0.35), radius: 10, x: 0, y: 5)
        static let hero = Spec(color: shadowColor(light: 0.14, dark: 0.55), radius: 28, x: 0, y: 16)
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

    enum Size {
        /// Height of a full-width tap target: the primary CTA, Sign in with
        /// Apple, a picker slot. 54 pt sits comfortably above the 44 pt HIG
        /// minimum and is the height the whole app already used — it was just
        /// written as a bare `54` in half a dozen files.
        ///
        /// Our own buttons apply it as a `minHeight` so the label can still grow
        /// with Dynamic Type; system controls (Sign in with Apple) take it as a
        /// fixed `height`, because they render their own label and do not reflow.
        static let control: CGFloat = 54
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

// MARK: - Theme mode (user-selectable appearance override)
//
// The palette already resolves per interface style via `Theme.Color.dyn(light:dark:)`.
// This enum lets the athlete OVERRIDE which style the app renders in, independent of
// the OS setting: `.system` defers to the device (the historical default), `.light`
// and `.dark` force the corresponding scheme. It's persisted once, read at the app
// root (AppRoot) and written from the Perfil "Apariencia" control — a single
// @AppStorage(ThemeMode.storageKey) value drives the whole app.
enum ThemeMode: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    /// Single source of truth for the persisted preference key.
    static let storageKey = "fahybrik.themeMode"

    var id: String { rawValue }

    /// Scheme to force via `.preferredColorScheme`. `nil` → follow the system.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light:  return .light
        case .dark:   return .dark
        }
    }

    /// Short ES label for the segmented control.
    var label: String {
        switch self {
        case .system: return "Auto"
        case .light:  return "Claro"
        case .dark:   return "Oscuro"
        }
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
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        // In light mode the dark radial + white grain read as dirt on the white
        // canvas, so render nothing. In dark mode keep the original behaviour.
        if colorScheme == .light {
            SwiftUI.Color.clear
        } else {
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
