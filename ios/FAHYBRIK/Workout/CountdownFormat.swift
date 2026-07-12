import Foundation

// Count-DOWN readouts for the wrist HUDs. Two functions, one per context, because
// the correct rounding differs (#68):
//
//   • standalone(_:) — CEIL. The watch is the SOLE display. It shows the whole
//     second (":03" through the entire 3rd second, never ":00" before the boundary),
//     so a 3-2-1 count-in / interval / rest / tramo countdown stays in lock-step with
//     the engine's OWN audio ticks (which fire as each second boundary is crossed).
//
//   • mirrored(_:) — ROUND. The watch is MIRRORING the iPhone's live session, so its
//     clock must match the phone, which formats remaining time with
//     `WorkoutSession.formatElapsed` (round to nearest). CEIL made the mirror read 1s
//     AHEAD of the phone (Alex's bug photo). Round → the same remaining maps to the
//     same integer on both screens.
//
// Pure + shared so both are unit-tested from FAHYBRIKTests (there is no watch test
// target). The <60s form reads ":34" (the mockup's interval style); a minute or more
// delegates to the shared elapsed formatter. Never negative.
enum CountdownFormat {
    /// CEIL — the watch's own countdown (count-in, interval, rest, tramo). Shows the
    /// whole second so the number never drops to ":00" before the boundary and stays
    /// in sync with the engine's audio ticks.
    static func standalone(_ seconds: Double) -> String {
        format(max(0, Int(seconds.rounded(.up))))
    }

    /// ROUND — a countdown that DUPLICATES the iPhone's display (mirror mode). Rounds
    /// to nearest so the wrist clock matches the phone's `formatElapsed`.
    static func mirrored(_ seconds: Double) -> String {
        format(max(0, Int(seconds.rounded())))
    }

    private static func format(_ wholeSeconds: Int) -> String {
        if wholeSeconds < 60 { return String(format: ":%02d", wholeSeconds) }
        return WorkoutSession.formatElapsed(Double(wholeSeconds))
    }
}
