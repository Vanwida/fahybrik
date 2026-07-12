import Foundation

// Pure pace / target / goal domain for a RUN leg — the judgeable objetivo (pace
// band or HR zone), whether the live effort sits inside it, and how a leg
// completes (distance / time / open). Shared by BOTH targets: the iPhone treadmill
// HUD AND the Apple Watch structured-run HUD read the same band, the same in/out
// judgment and the same progress fraction, so they can never drift.
//
// This is the pure core LIFTED out of the app-only treadmill files (#68): the
// device-bound halves stay in `Devices/Treadmill` — `RunTarget.resolve(from:
// WorkoutSegment)` / `SegmentGoal.resolve(from:)` (need the segment's scalar
// extensions), the belt math (`TreadmillMath.paceSecPerKm` / `advanceDistance`,
// need `TreadmillConstants`) and `EstimatedHRZone`. They extend the SAME types
// declared here, so the iPhone target compiles unchanged (same symbols, other file).

// MARK: - Clock formatting

enum TreadmillMath {
    /// Format whole seconds as m:ss (pace / clock). The single seconds→m:ss
    /// formatter both platforms share (the belt math + `paceSecPerKm` live in the
    /// app-only extension in RunTargetResolver.swift).
    static func clock(_ seconds: Int) -> String {
        let s = max(0, seconds)
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}

// MARK: - Target

/// A pace objective in seconds-per-KILOMETER. Carries the coach's prescription
/// as given: a single point (`single`) and/or a band (`fastS`..`slowS`, where
/// `fastS` is the faster/smaller sec/km). A single point is judged within a ±
/// tolerance; a band is judged strictly.
struct PaceTarget: Equatable {
    var single: Int?
    var fastS: Int?
    var slowS: Int?

    /// A single prescribed pace (no band) is judged inside a ± window of this many
    /// seconds/km — strict equality against a live pace would never read "in target".
    static let singleToleranceSecPerKm: Int = 8

    var hasBand: Bool { fastS != nil || slowS != nil }

    /// Human objetivo string (the "/km" unit is added by the caller).
    var label: String {
        if let f = fastS, let s = slowS { return "\(TreadmillMath.clock(f))–\(TreadmillMath.clock(s))" }
        if let f = fastS { return "≥ \(TreadmillMath.clock(f))" }
        if let s = slowS { return "≤ \(TreadmillMath.clock(s))" }
        if let single { return TreadmillMath.clock(single) }
        return "—"
    }

    func status(currentSecPerKm pace: Int?) -> TargetStatus {
        guard let pace, pace > 0 else { return .unknown }
        if hasBand {
            if let f = fastS, pace < f { return .tooFast }
            if let s = slowS, pace > s { return .tooSlow }
            return .inTarget
        }
        guard let single else { return .unknown }
        let tol = Self.singleToleranceSecPerKm
        if pace < single - tol { return .tooFast }
        if pace > single + tol { return .tooSlow }
        return .inTarget
    }

    /// How far (sec/km, magnitude) the live pace sits OUTSIDE the objective — the
    /// number spoken in "Vas 15 segundos rápido" (#63). Distance to the nearest bound
    /// for a band, to the point for a single. 0 when inside; nil when unmeasurable.
    func deviationSecPerKm(currentSecPerKm pace: Int?) -> Int? {
        guard let pace, pace > 0 else { return nil }
        if hasBand {
            if let f = fastS, pace < f { return f - pace }
            if let s = slowS, pace > s { return pace - s }
            return 0
        }
        guard let single else { return nil }
        return abs(pace - single)
    }
}

/// Whether the athlete's current effort sits inside the prescribed objective.
enum TargetStatus: Equatable {
    case inTarget
    case tooFast   // harder/faster than prescribed (pace below fast bound, or HR above target zone)
    case tooSlow   // easier/slower than prescribed
    case unknown   // no measurable value yet, or nothing evaluable to judge against
}

/// The evaluable objective of a RUN leg. A run is judged on PACE when the coach
/// set a pace/band; else on HR ZONE when the coach set a zone; else there is
/// nothing to judge (guidance only). Resolving one FROM a `WorkoutSegment` is the
/// treadmill's scalar path (app-only, see RunTargetResolver.swift); a structured
/// leg builds it directly via `RunLeg.runTarget`.
enum RunTarget: Equatable {
    case pace(PaceTarget)
    case zone(HRZone)
    case none

    /// Live pace (sec/km) → status against a pace target. `.unknown` for a
    /// non-pace target or a missing/stopped pace.
    func paceStatus(currentSecPerKm pace: Int?) -> TargetStatus {
        guard case let .pace(t) = self else { return .unknown }
        return t.status(currentSecPerKm: pace)
    }

    /// Magnitude (sec/km) the live pace sits outside a PACE target — for the spoken
    /// pace nudge (#63). Nil for a non-pace target or an unmeasurable pace.
    func paceDeviationSecPerKm(currentSecPerKm pace: Int?) -> Int? {
        guard case let .pace(t) = self else { return nil }
        return t.deviationSecPerKm(currentSecPerKm: pace)
    }

    /// Live HR zone → status against a zone target. `.unknown` for a non-zone
    /// target or when no zone is available (no HR, or no age for the estimate).
    func zoneStatus(currentZone zone: HRZone?) -> TargetStatus {
        guard case let .zone(target) = self else { return .unknown }
        guard let zone else { return .unknown }
        if zone.rawValue < target.rawValue { return .tooSlow }
        if zone.rawValue > target.rawValue { return .tooFast }
        return .inTarget
    }

    /// The objetivo shown near the hero, or nil when there's nothing to hit.
    var objetivoLabel: String? {
        switch self {
        case let .pace(t): return "\(t.label) /km"
        case let .zone(z): return z.label
        case .none:        return nil
        }
    }
}

// MARK: - Work measure / completion

/// How the current run leg completes: a fixed distance, a fixed time, or open
/// (no measurable goal — the athlete ends it manually). Resolving one FROM a
/// `WorkoutSegment` is app-only (see RunTargetResolver.swift); a structured leg
/// builds it directly via `RunLeg.goal`.
enum SegmentGoal: Equatable {
    case distance(meters: Double)
    case time(seconds: Int)
    case open

    /// Progress fraction 0...1 given covered distance (m) and elapsed time (s).
    func fraction(distanceM: Double, elapsedS: Double) -> Double {
        switch self {
        case let .distance(target):
            guard target > 0 else { return 0 }
            return min(1, max(0, distanceM / target))
        case let .time(target):
            guard target > 0 else { return 0 }
            return min(1, max(0, elapsedS / Double(target)))
        case .open:
            return 0
        }
    }

    func isComplete(distanceM: Double, elapsedS: Double) -> Bool {
        switch self {
        case let .distance(target): return target > 0 && distanceM >= target
        case let .time(target):     return target > 0 && elapsedS >= Double(target)
        case .open:                 return false
        }
    }
}

// MARK: - RunLeg → goal / target / objetivo bridge (#61)
//
// Resolves a structured-run `RunLeg` (the shared expansion in RunStructure.swift)
// to the SAME `SegmentGoal` / `RunTarget` the auto-advance, progress bar and pace
// judge consume — on the treadmill AND on the wrist. Depends only on the pure
// types above + `ResolvedIntensity` / `HRZone`, so it compiles into both targets.

extension RunLeg {
    /// How this leg COMPLETES — the goal the auto-advance + progress bar read.
    /// Distance → belt/GPS-owned; duration → session-clock-owned; an unknown or
    /// zero measure → `.open` (manual close, no fabricated bar).
    var goal: SegmentGoal {
        switch measure {
        case let .distance(m): return m > 0 ? .distance(meters: Double(m)) : .open
        case let .duration(s): return s > 0 ? .time(seconds: s) : .open
        case .unknown:         return .open
        }
    }

    /// The evaluable pace/zone objetivo, reusing `RunTarget` (the pace judge). An
    /// explicit `pace` → its absolute band; a run zone WITH a server-resolved band →
    /// that pace band (the SAME source the athlete already sees on the plan); an
    /// `hrZone` WITHOUT a band → the zone label (estimated); RPE / none → nothing to
    /// judge on pace (RPE surfaces separately via `rpeLabel`).
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
