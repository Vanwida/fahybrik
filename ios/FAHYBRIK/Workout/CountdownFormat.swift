import Foundation

// Shared count-DOWN readout for the wrist HUDs (the live interval clock + the mirror
// rest overlay). Extracted so the ROUNDING matches the iPhone exactly: the phone
// formats a remaining time with `WorkoutSession.formatElapsed` (ROUND to nearest),
// so a countdown must round too — CEIL made the mirror read 1 second AHEAD of the
// phone (Alex's bug photo). Pure + shared so it is unit-tested from FAHYBRIKTests
// (there is no watch test target).
enum CountdownFormat {
    /// Under a minute reads ":34" (the mockup's interval style); a minute or more
    /// reads mm:ss via the shared elapsed formatter. Never negative. Rounds to the
    /// nearest whole second so the same remaining maps to the same integer the phone
    /// shows (53.4 → ":53", 53.5 → ":54").
    static func label(_ seconds: Double) -> String {
        let s = max(0, Int(seconds.rounded()))
        if s < 60 { return String(format: ":%02d", s) }
        return WorkoutSession.formatElapsed(Double(s))
    }
}
