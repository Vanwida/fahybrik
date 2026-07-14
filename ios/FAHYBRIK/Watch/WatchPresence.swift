import Foundation
import Observation

// Whether the athlete's Apple Watch app is available to record this session — the
// single observable the pre-workout UI reads to treat the watch as a FIRST-CLASS
// personal HR source (it streams on its own at start; nothing to "connect"), the
// same way Garmin/Wahoo/Peloton separate your own wearables from the shared gym
// machines you pick by name.
//
// `appAvailable` = the watch is paired AND our watch app is installed on it. It is
// refreshed by `WatchConnectivityiOSService` from `activationDidCompleteWith` and
// every `sessionWatchStateDidChange` (app installed/removed, watch un/paired), so it
// tracks reality without the UI polling. In the simulator (no paired watch) it stays
// false → the HR chip falls back to the unchanged chest-strap flow.
@Observable
final class WatchPresence {
    static let shared = WatchPresence()

    /// True when a paired Apple Watch has our app installed and can record. Drives the
    /// "Pulso · Apple Watch" chip and the picker's "you're wearing a watch" hint.
    private(set) var appAvailable: Bool = false

    private init() {}

    /// Recompute from the live WCSession flags. MainActor-isolated because the value
    /// feeds SwiftUI; the connectivity delegate hops here off its own queue.
    @MainActor
    func refresh(paired: Bool, installed: Bool) {
        appAvailable = paired && installed
    }
}
