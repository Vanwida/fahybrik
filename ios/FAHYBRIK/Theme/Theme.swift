import SwiftUI

// Canonical tokens mirror docs/design/fahybrik-design-system/colors_and_type.css.
// Hex values are exact; touch with care — design memory pins them.
enum Theme {
    enum Color {
        static let background = SwiftUI.Color("BrandBackground")            // #0A0A0A
        static let surface = SwiftUI.Color("BrandSurface")                  // #141414
        static let surfaceElevated = SwiftUI.Color(red: 0x1F/255, green: 0x1F/255, blue: 0x1F/255)
        static let foreground = SwiftUI.Color("BrandForeground")            // #F5F5F5
        static let muted = SwiftUI.Color("BrandMuted")                      // #A1A1A1
        static let hairline = SwiftUI.Color("BrandMuted").opacity(0.18)
        static let outline = SwiftUI.Color.white.opacity(0.10)
        static let scrim = SwiftUI.Color.black.opacity(0.55)
        static let accent = SwiftUI.Color("BrandAccent")                    // #F06A2A
        static let accentPress = SwiftUI.Color(red: 0xD8/255, green: 0x5A/255, blue: 0x20/255)
        static let accentOn = SwiftUI.Color.white
        static let ok = SwiftUI.Color(red: 0x3F/255, green: 0xC7/255, blue: 0x73/255)
        static let warning = SwiftUI.Color(red: 0xF2/255, green: 0xA5/255, blue: 0x2E/255)
        static let danger = SwiftUI.Color(red: 0xF2/255, green: 0x3F/255, blue: 0x3F/255)
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
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }

    /// Apply uppercase + canonical data-label tracking
    /// (1.76pt ≈ 0.16em at 11pt label size).
    func uppercaseTracked(_ tracking: CGFloat = Theme.Tracking.dataLabel) -> some View {
        self.tracking(tracking).textCase(.uppercase)
    }
}
