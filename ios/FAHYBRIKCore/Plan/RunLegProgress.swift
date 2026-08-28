import Foundation

// Un progreso de pierna. GPS, cinta y muñeca alimentan el mismo `step`.
// PURE: no timer, no vista, no segundo cierre.

struct RunLegProgress {
    /// The covered-distance reading captured when the active leg opened. The current
    /// leg's covered distance is measured from here, so overshoot from the previous
    /// leg never leaks into this one.
    private var baselineMeters: Double = 0
    /// Identity of the leg the baseline was captured for. The caller builds it from
    /// the session — segment index + `runLegIndex` + count-in phase — so the GO
    /// transition (count-in → running) RE-baselines, discarding the metres jogged
    /// during the 3-2-1.
    private var activeKey: String = ""
    /// The leg key already auto-closed, so a distance leg fires `primaryAdvance()`
    /// exactly once (mirrors TreadmillHUDModel.autoAdvancedLegKey).
    private var autoClosedKey: String = ""

    /// The CURRENT leg's covered distance (never negative), for the "510 / 800 m"
    /// progress readout.
    func covered(segmentCoveredMeters: Double) -> Double {
        max(0, segmentCoveredMeters - baselineMeters)
    }

    /// New session or discarded window. The next `step` captures a fresh baseline.
    mutating func reset() {
        baselineMeters = 0
        activeKey = ""
        autoClosedKey = ""
    }

    /// Evaluate one display tick. Re-baselines when the active leg changed (a new
    /// leg, or the count-in→GO transition), discarding the prior leg's overshoot.
    /// Returns TRUE exactly once per leg — when a DISTANCE leg the wrist owns has
    /// covered its target and the caller should close it via `session.primaryAdvance()`.
    /// A TIME leg / recovery countdown is owned by the session clock and is NEVER
    /// closed here (`isDistanceLeg` false), so the two can't double-advance.
    ///
    /// - Parameters:
    ///   - legKey: stable within a running leg; changes on leg change AND on GO.
    ///   - segmentCoveredMeters: the segment-cumulative covered distance (HK).
    ///   - goal: the current leg's `SegmentGoal` (its distance target).
    ///   - isDistanceLeg: true when the leg completes on distance (wrist-owned).
    ///   - isRunnableNow: false while paused / on the count-in / at a block gate.
    mutating func step(legKey: String,
                       segmentCoveredMeters: Double,
                       goal: SegmentGoal,
                       isDistanceLeg: Bool,
                       isRunnableNow: Bool) -> Bool {
        if legKey != activeKey {
            activeKey = legKey
            baselineMeters = segmentCoveredMeters   // discard the prior leg's overshoot
        }
        guard isRunnableNow, isDistanceLeg, autoClosedKey != legKey else { return false }
        guard goal.isComplete(distanceM: covered(segmentCoveredMeters: segmentCoveredMeters), elapsedS: 0) else {
            return false
        }
        autoClosedKey = legKey
        return true
    }
}
