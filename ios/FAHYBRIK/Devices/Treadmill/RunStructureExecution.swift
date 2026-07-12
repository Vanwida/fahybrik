import Foundation

// The treadmill / HUD execution BRIDGE for a structured run leg (#61): a `RunLeg`
// resolved to the same `SegmentGoal` / `RunTarget` the treadmill auto-advance,
// progress bar and pace judge already consume. Kept SEPARATE from RunStructure.swift
// (the pure grammar + expansion) because `SegmentGoal` / `RunTarget` / `PaceTarget`
// are app-only (the watch shares the workout engine but has no treadmill HUD), so
// this file is compiled into FAHYBRIK only.

extension RunLeg {
    /// How this leg COMPLETES — the goal the treadmill auto-advance + progress bar
    /// read. Distance → belt/GPS-owned; duration → session-clock-owned; an unknown
    /// or zero measure → `.open` (manual close, no fabricated bar).
    var goal: SegmentGoal {
        switch measure {
        case let .distance(m): return m > 0 ? .distance(meters: Double(m)) : .open
        case let .duration(s): return s > 0 ? .time(seconds: s) : .open
        case .unknown:         return .open
        }
    }

    /// The evaluable pace/zone objetivo, reusing `RunTarget` (the treadmill judge).
    /// An explicit `pace` → its absolute band; a run zone WITH a server-resolved
    /// band → that pace band (the SAME source the athlete already sees on the plan);
    /// an `hrZone` WITHOUT a band → the zone label (estimated); RPE / none → nothing
    /// to judge on pace (RPE surfaces separately via `rpeLabel`).
    var runTarget: RunTarget {
        if case let .pace(v, mn, mx) = target {
            let t = PaceTarget(single: v, fastS: mn, slowS: mx)
            if t.single != nil || t.hasBand { return .pace(t) }
        }
        if let band = resolved?.paceTargetPerKm { return .pace(band) }
        if case let .hrZone(z) = target, let hz = HRZone(rawValue: z) { return .zone(hz) }
        return .none
    }

    /// A short athlete-readable objetivo for the per-tramo reference line — the pace
    /// band, else the coach zone, else the RPE. Nil when the leg is free (by feel).
    var objetivoLabel: String? {
        runTarget.objetivoLabel ?? zoneLabel ?? rpeLabel
    }
}

// MARK: - ResolvedIntensity → PaceTarget (the resolved band as an absolute pace)

extension ResolvedIntensity {
    /// The resolved band as a per-KM `PaceTarget` (fast = the smaller sec/km). A run
    /// zone resolves to a per_km band; a per_500m band (erg) is doubled. Nil only for
    /// a non-positive / absent band.
    var paceTargetPerKm: PaceTarget? {
        let factor = paceUnit == "per_500m" ? 2.0 : 1.0
        let fast = Int((fastS * factor).rounded())
        let slow = slowS.map { Int(($0 * factor).rounded()) }
        guard fast > 0 || (slow ?? 0) > 0 else { return nil }
        return PaceTarget(single: slow == nil ? fast : nil,
                          fastS: slow == nil ? nil : fast,
                          slowS: slow)
    }
}
