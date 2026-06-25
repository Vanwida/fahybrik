import SwiftUI

// HR zones Z1–Z5. Orange is reserved as brand accent and MUST NOT appear here.
// DARK hexes pinned to docs/design/fahybrik-design-system/colors_and_type.css
// (via the ZoneZ* asset catalog); LIGHT hexes are darkened in-code for the white
// canvas (see `color`). The app follows the system appearance.
enum HRZone: Int, CaseIterable, Codable {
    case z1 = 1, z2, z3, z4, z5

    var label: String { "Z\(rawValue)" }

    // Adaptive per appearance. DARK = the original asset-catalog hexes (pinned to
    // colors_and_type.css, UNCHANGED). LIGHT = the same hue DARKENED so each zone
    // still reads as a fill/bar (≥3:1) AND as text in a ZBadge over its own 0.15
    // tint (≥4.5:1) on the white canvas — the bright dark-mode hues (e.g. gray
    // #C7C7C7 ≈1.4:1, amber #F2B833 ≈1.6:1) vanish on white. Same darkening
    // strategy Theme.swift already applies to ok/warning/danger/info.
    var color: Color {
        switch self {
        case .z1: return Theme.Color.dyn(light: HRZone.light(0x565C63), dark: HRZone.dark("ZoneZ1")) // recovery (gray)
        case .z2: return Theme.Color.dyn(light: HRZone.light(0x1A62B5), dark: HRZone.dark("ZoneZ2")) // aerobic base (blue)
        case .z3: return Theme.Color.dyn(light: HRZone.light(0x0F6E3C), dark: HRZone.dark("ZoneZ3")) // tempo (green)
        case .z4: return Theme.Color.dyn(light: HRZone.light(0x8A5A00), dark: HRZone.dark("ZoneZ4")) // threshold (amber)
        case .z5: return Theme.Color.dyn(light: HRZone.light(0xBC2A2A), dark: HRZone.dark("ZoneZ5")) // VO2 / red line (red)
        }
    }

    /// Asset-catalog hex (dark side), resolved to a UIColor for `dyn`.
    private static func dark(_ name: String) -> UIColor { UIColor(named: name) ?? .gray }
    /// Darkened light-mode hue from an 0xRRGGBB literal.
    private static func light(_ rgb: UInt32) -> UIColor {
        UIColor(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }

    /// 15% alpha tint — used as fill in zone chips and chart bands. Matches
    /// `--z*-tint` CSS vars in `colors_and_type.css`. Derives from `color`, so it
    /// adapts with it (light tint = darkened hue at 0.15 over the light canvas).
    var tint: Color { color.opacity(0.15) }
}

// %HRmax thresholds — used to derive zone from a live BPM given athlete HRmax.
enum HRZoneClassifier {
    static func zone(forBpm bpm: Int, hrMax: Int) -> HRZone {
        guard hrMax > 0 else { return .z1 }
        let pct = Double(bpm) / Double(hrMax)
        switch pct {
        case ..<0.60: return .z1
        case ..<0.70: return .z2
        case ..<0.80: return .z3
        case ..<0.90: return .z4
        default:      return .z5
        }
    }
}
