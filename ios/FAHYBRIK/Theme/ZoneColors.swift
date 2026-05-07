import SwiftUI

// HR zones Z1–Z5. Orange is reserved as brand accent and MUST NOT appear here.
enum HRZone: Int, CaseIterable, Codable {
    case z1 = 1, z2, z3, z4, z5

    var label: String { "Z\(rawValue)" }

    var color: Color {
        switch self {
        case .z1: return Color(red: 0.78, green: 0.78, blue: 0.78)
        case .z2: return Color(red: 0.30, green: 0.62, blue: 0.92)
        case .z3: return Color(red: 0.30, green: 0.78, blue: 0.45)
        case .z4: return Color(red: 0.95, green: 0.72, blue: 0.20)
        case .z5: return Color(red: 0.92, green: 0.30, blue: 0.30)
        }
    }
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
