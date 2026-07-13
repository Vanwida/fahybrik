import SwiftUI

// HR zones Z1–Z5. Orange is reserved as brand accent and MUST NOT appear here.
// DARK hexes pinned to docs/design/fahybrik-design-system/colors_and_type.css
// (via the ZoneZ* asset catalog); LIGHT hexes are darkened in-code for the white
// canvas (see `color`). The app follows the system appearance.
enum HRZone: Int, CaseIterable, Codable {
    case z1 = 1, z2, z3, z4, z5

    var label: String { "Z\(rawValue)" }

    // The zone COLORS below are iPhone-only: they resolve through the Theme palette,
    // which is not compiled into the watch target. The watch only ever needs the
    // zone identity (rawValue / label) + the classifier, so the UI members are
    // compiled out there rather than dragging the Theme layer onto the wrist.
    // `HRZone` itself (and `HRZoneClassifier`) stay fully shared.
    #if !os(watchOS)
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
    #endif
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

// The athlete's max HR and where it came from — the SINGLE source that every
// zone surface (structured engine, treadmill/outdoor HUDs, watch, post-workout
// desglose) reads, so the same number drives them all. `isEstimated` travels
// with it so a surface can label a 220−age fallback "estimada".
struct HRMaxSource: Equatable {
    let bpm: Int
    /// true  = textbook 220−age fallback (label "estimada").
    /// false = the athlete's own measured/entered max HR (personal, unlabeled).
    let isEstimated: Bool
}

// Resolves the athlete's max HR from what we know, in priority order:
//   1. a measured/entered max (personal) — wins whenever present and sane,
//   2. else the textbook 220−age estimate (flagged estimated),
//   3. else nil — no honest max, so the caller HIDES the zone rather than
//      inventing one (never a fabricated default like 190).
// Pure Foundation, shared into the watch target (single source of the % bands
// stays HRZoneClassifier; only the max input is personalized here).
enum PersonalHRMax {
    /// Textbook age-based max: 220 − age.
    static let ageMaxConstant = 220
    /// Sane bounds for a measured/entered max HR (bpm). Outside → ignored, so a
    /// typo can't drive absurd zones; falls through to the age estimate.
    static let minMeasuredBpm = 100
    static let maxMeasuredBpm = 230

    static func resolve(measuredMaxHrBpm: Int?, age: Int?) -> HRMaxSource? {
        if let m = measuredMaxHrBpm, m >= minMeasuredBpm, m <= maxMeasuredBpm {
            return HRMaxSource(bpm: m, isEstimated: false)
        }
        if let age, age > 0, age < 120 {
            return HRMaxSource(bpm: ageMaxConstant - age, isEstimated: true)
        }
        return nil
    }

    /// Classify a live BPM against a resolved source. Nil source → nil zone
    /// (the surface hides the zone; we never fabricate a max).
    static func zone(forBpm bpm: Int, source: HRMaxSource?) -> HRZone? {
        guard let source else { return nil }
        return HRZoneClassifier.zone(forBpm: bpm, hrMax: source.bpm)
    }
}
