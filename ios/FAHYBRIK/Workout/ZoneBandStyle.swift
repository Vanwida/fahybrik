import SwiftUI

// How a `ZoneCoverage.Band` is PAINTED. Split from `ZoneCoverage` because that
// one compiles into the watch, which has no Theme layer — the same split
// `WatchTheme.zoneColor` already makes for `HRZone`.
//
// It exists so the two surfaces that draw the bar (the post-workout summary and
// the log's executed view) cannot give the same band two different looks, which
// is how "sin pulso" would quietly become "a sixth zone" on one screen and a
// hole on the other.
enum ZoneBandStyle {

    /// The band's fill. A measured zone gets its hue; the unmeasured remainder
    /// gets a hairline wash — deliberately NOT a zone hue and not Z1's gray, so
    /// it reads as a gap in the bar rather than as a sixth, calmer zone.
    static func fill(_ band: ZoneCoverage.Band) -> Color {
        band.zone.map(\.color) ?? Theme.Color.hairlineStrong
    }

    /// The legend's colour. The remainder is `muted` (8.5:1) rather than the
    /// hairline it is drawn with — a 9 pt label at 0.12 alpha is unreadable, and
    /// the point of declaring the hole is that it can be read.
    static func text(_ band: ZoneCoverage.Band) -> Color {
        band.zone.map(\.color) ?? Theme.Color.muted
    }

    /// The whole bar as one spoken sentence — VoiceOver gets the gap too, which
    /// is exactly the reading a sighted athlete gets from the empty slice.
    static func spoken(_ coverage: ZoneCoverage) -> String {
        "Zonas: " + coverage.bands
            .map { "\($0.label) \($0.pct) por ciento" }
            .joined(separator: ", ")
    }
}
