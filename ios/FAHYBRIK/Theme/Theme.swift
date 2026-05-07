import SwiftUI

enum Theme {
    enum Color {
        static let background = SwiftUI.Color("BrandBackground")
        static let surface = SwiftUI.Color("BrandSurface")
        static let surfaceElevated = SwiftUI.Color("BrandSurface").opacity(0.6)
        static let foreground = SwiftUI.Color("BrandForeground")
        static let muted = SwiftUI.Color("BrandMuted")
        static let accent = SwiftUI.Color("BrandAccent")
        static let danger = SwiftUI.Color(red: 0.95, green: 0.25, blue: 0.25)
        static let warning = SwiftUI.Color(red: 0.95, green: 0.65, blue: 0.18)
        static let ok = SwiftUI.Color(red: 0.25, green: 0.78, blue: 0.45)
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
    }
}

extension View {
    func brandSurface(radius: CGFloat = Theme.Radius.l) -> some View {
        self
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }

    func uppercaseTracked(_ tracking: CGFloat = 1.6) -> some View {
        self.tracking(tracking).textCase(.uppercase)
    }
}
