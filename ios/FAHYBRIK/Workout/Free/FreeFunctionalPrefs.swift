import Foundation

// MARK: - Entreno libre · funcional — last configuration used, PER FORMAT
//
// A box repeats the same shape all week: the EMOM is always 10 × 1:00, the AMRAP is
// always 12:00. Re-entering those numbers every session is the difference between a
// timer you reach for and one you don't, so the builder restores whatever the
// athlete last STARTED with, keyed by format.
//
// Structural params only — never the movements. What you did today is a fact about
// today; how the clock is shaped is a habit. (And restoring stale movements would
// silently attribute work the athlete never declared this session.)
//
// Plain `UserDefaults`, one namespaced key per format per axis — the same pattern
// the daily check-in uses for its local state. Nothing here is a secret and nothing
// here needs to survive a reinstall.
enum FreeFunctionalPrefs {
    /// One remembered axis. The raw key is `<prefix>.<format>.<axis>`, so formats can
    /// never read each other's numbers.
    private enum Axis: String, CaseIterable {
        case rounds, cadence, transition, window, cap, rest
    }

    private static let prefix = "free.functional"

    private static func key(_ format: FreeFunctionalFormat, _ axis: Axis) -> String {
        "\(prefix).\(format.rawValue).\(axis.rawValue)"
    }

    /// Restore the last STARTED configuration for this format. Only axes actually
    /// stored are applied, so a format used for the first time keeps the seeded
    /// defaults (`selectFormat` sets those before calling this).
    static func apply(to draft: FreeFunctionalDraft, format: FreeFunctionalFormat,
                      defaults: UserDefaults = .standard) {
        if let r = stored(format, .rounds, defaults), r > 0 { draft.rounds = r }
        if let c = stored(format, .cadence, defaults), c > 0 { draft.cadenceSeconds = c }
        // A transition of 0 is a MEANINGFUL value (a plain EMOM), so it is restored
        // as-is — unlike the others, whose 0 would be a broken clock.
        if let t = stored(format, .transition, defaults), t >= 0 { draft.transitionSeconds = t }
        if let w = stored(format, .window, defaults), w > 0 { draft.windowSeconds = w }
        if let cap = stored(format, .cap, defaults), cap >= 0 { draft.capSeconds = cap }
        if let rest = stored(format, .rest, defaults), rest >= 0 { draft.restSeconds = rest }
        // Guard against a stored pair that no longer makes sense (a cadence lowered
        // below a previously stored change): the work window must stay positive.
        if draft.transitionSeconds >= draft.cadenceSeconds { draft.transitionSeconds = 0 }
    }

    /// Persist the configuration the athlete just STARTED with. Called from
    /// `buildContext()`, so what is remembered is what actually ran — never a
    /// half-edited form the athlete backed out of.
    static func remember(_ draft: FreeFunctionalDraft, format: FreeFunctionalFormat,
                         defaults: UserDefaults = .standard) {
        defaults.set(draft.rounds, forKey: key(format, .rounds))
        defaults.set(draft.cadenceSeconds, forKey: key(format, .cadence))
        defaults.set(draft.transitionSeconds, forKey: key(format, .transition))
        defaults.set(draft.windowSeconds, forKey: key(format, .window))
        defaults.set(draft.capSeconds, forKey: key(format, .cap))
        defaults.set(draft.restSeconds, forKey: key(format, .rest))
    }

    /// `nil` when the axis was never stored — `UserDefaults.integer(forKey:)` cannot
    /// tell "absent" from "0", and 0 is a real value for the cap and the change.
    private static func stored(_ format: FreeFunctionalFormat, _ axis: Axis,
                               _ defaults: UserDefaults) -> Int? {
        defaults.object(forKey: key(format, axis)) as? Int
    }
}
