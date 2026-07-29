import SwiftUI

// HR zones Z1–Z5 — the zone IDENTITY (number, label, colour) and nothing else.
//
// THIS APP DOES NOT COMPUTE ZONES. It used to: each zone carried a fraction of
// the athlete's max HR, and when the athlete had no measured max (nobody does)
// `PersonalHRMax` handed out a fabricated 184 bpm so the bands would always
// resolve. The result was that the server put Z2 at 128–137 ppm for a 44-year-old
// and the phone put it at 106–124 — no overlap — and the seconds-per-zone that
// reached the coach were bucketed against a number nobody had measured.
//
// The bands now come from the server (`HRZoneProfile`, shipped with the identity)
// and this enum only says what Z3 is CALLED and what colour it is painted.
//
// Orange is reserved as brand accent and MUST NOT appear here.
// DARK hexes pinned to docs/design/fahybrik-design-system/colors_and_type.css
// (via the ZoneZ* asset catalog); LIGHT hexes are darkened in-code for the white
// canvas (see `color`). The app follows the system appearance.
enum HRZone: Int, CaseIterable, Codable {
    case z1 = 1, z2, z3, z4, z5

    var label: String { "Z\(rawValue)" }

    // The zone COLORS below are iPhone-only: they resolve through the Theme palette,
    // which is not compiled into the watch target. The watch only ever needs the
    // zone identity (rawValue / label) + the server's bands, so the UI members are
    // compiled out there rather than dragging the Theme layer onto the wrist.
    // `HRZone` itself (and `HRZoneProfile`) stay fully shared.
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

// Bounds for the max HR the athlete may TYPE in their profile. They exist so a
// typo can't persist an absurd number; they mirror the column's own CHECK
// (migration 0129, 100–230). The max is an INPUT the server may use to derive a
// threshold — it is not a zone anchor on this side any more.
enum AthleteMaxHR {
    static let minBpm = 100
    static let maxBpm = 230
}

// ONE zone band, as the server resolved it. Absolute beats per minute — never a
// percentage of anything, because a percentage needs an anchor and the anchor is
// exactly what this app must not invent.
struct HRZoneBand: Codable, Equatable {
    /// 1…5.
    let zone: Int
    /// "Z3".
    let code: String
    /// The athlete-facing name ("Aeróbico intenso").
    let label: String
    /// Lower bound, inclusive. Nil on Z1 — there is no floor to being easy.
    let minBpm: Int?
    /// Upper bound, inclusive.
    let maxBpm: Int
    /// Ready to render ("128–137 ppm"). The server formats it so no client
    /// re-derives a range and gets the dash or the unit different.
    let rangeLabel: String

    var hrZone: HRZone? { HRZone(rawValue: zone) }
}

// The athlete's heart-rate zones, resolved by the server and shipped with the
// identity (GET /api/auth/me → `hr_zones`).
//
// THE APP NEVER BUILDS ONE OF THESE FROM A MAX HR. If the server sends nil, the
// athlete has no zones yet and the surfaces say so and offer the threshold test.
// That absence is the honest state and it is common: the anchor is a measured
// threshold, a measured max, or an age — and most athletes have none of the three.
struct HRZoneProfile: Codable, Equatable {
    /// The threshold heart rate every band is a fraction of.
    let lthrBpm: Int
    /// True when the SERVER inferred the threshold (from a max HR, or from an age).
    /// Surfaces MUST show this: an estimated band that looks measured is how a
    /// number nobody measured quietly becomes evidence. False for a threshold the
    /// athlete declared — that one is his, not our arithmetic.
    let estimated: Bool
    /// Closed set: `lthr_measured` · `lthr_declared` · `from_max_hr` · `from_age`.
    let source: String
    /// Athlete-facing explanation ("Estimado por tu edad").
    let sourceLabel: String
    /// `measured` · `declared` · `estimated` — the three tiers of evidence. Older
    /// builds never received it, so it decodes as nil and the surfaces fall back to
    /// `estimated`.
    let confidence: String?
    /// The five bands, easiest first.
    let zones: [HRZoneBand]

    /// The zone a live pulse falls in. The top band is open-ended — a pulse above
    /// the physiological cap is still Z5. Nil for a nonsense reading or an empty
    /// model, never a fabricated zone.
    func zone(forBpm bpm: Int) -> HRZone? {
        guard bpm > 0, !zones.isEmpty else { return nil }
        for band in zones where bpm <= band.maxBpm {
            return band.hrZone
        }
        return zones.last?.hrZone
    }

    /// One band by zone. Nil when the model has no such zone.
    func band(for zone: HRZone) -> HRZoneBand? {
        zones.first { $0.zone == zone.rawValue }
    }

    /// The ABSOLUTE bpm range for a zone — what an external device must receive
    /// instead of a zone NUMBER, since the device would otherwise apply its own
    /// zones off its own FCmáx estimate. Nil when the zone isn't in the model or
    /// the band has no floor (Z1, which is not a target anyone prescribes).
    func bpmBand(for zone: HRZone) -> ClosedRange<Int>? {
        guard let band = band(for: zone), let low = band.minBpm, low <= band.maxBpm else { return nil }
        return low...band.maxBpm
    }
}
