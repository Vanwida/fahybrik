import SwiftUI

// HR zones Z1–Z5. Orange is reserved as brand accent and MUST NOT appear here.
// Hex values pinned to docs/design/fahybrik-design-system/colors_and_type.css.
enum HRZone: Int, CaseIterable, Codable {
    case z1 = 1, z2, z3, z4, z5

    var label: String { "Z\(rawValue)" }

    var color: Color {
        switch self {
        case .z1: return Color("ZoneZ1")    // #C7C7C7 — recovery (gray)
        case .z2: return Color("ZoneZ2")    // #4D9EEB — aerobic base (blue)
        case .z3: return Color("ZoneZ3")    // #4DC773 — tempo (green)
        case .z4: return Color("ZoneZ4")    // #F2B833 — threshold (amber)
        case .z5: return Color("ZoneZ5")    // #EB4D4D — VO2 / red line (red)
        }
    }

    /// 15% alpha tint — used as fill in zone chips and chart bands. Matches
    /// `--z*-tint` CSS vars in `colors_and_type.css`.
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
