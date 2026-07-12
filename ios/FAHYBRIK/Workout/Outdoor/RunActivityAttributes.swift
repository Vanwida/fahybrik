import Foundation
import ActivityKit

// The Live Activity data contract for an outdoor run (#64) — SHARED by the app
// (which starts + updates it) and the FAHYBRIKWidgets extension (which renders the
// lock screen + Dynamic Island). Compiled into BOTH targets (like WatchWireModels),
// so it is the single source of the shape both sides read.
//
// The live numbers are carried as PRE-FORMATTED strings computed app-side from the
// same formatters the on-screen HUD uses, so the lock screen can never drift from
// the HUD and the widget stays purely declarative. `paused` drives the paused
// treatment. Updates are pushed on a throttle (≈2 s) plus immediately on a state
// change — never every display tick (ActivityKit rate-limits pushes).

struct RunActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// Current smoothed pace, e.g. "4:47" — "—:—" when GPS can't vouch for it.
        var paceLabel: String
        /// "Tramo 2/5" for a structured run, or "" for a continuous run (no legs).
        var legLabel: String
        /// Covered distance, e.g. "3,20 km".
        var distanceLabel: String
        /// Elapsed MOVING time, e.g. "24:18" (auto-pause excludes stopped time).
        var timeLabel: String
        /// HR zone chip, e.g. "Z3" — "" when there is no zone.
        var zoneLabel: String
        /// True while (auto-)paused → the widget shows the paused treatment.
        var paused: Bool
    }

    /// A stable title for the activity — the athlete's session name / "Carrera".
    var title: String
}
