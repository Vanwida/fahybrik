import Foundation

// Pure domain layer for the treadmill run HUD: what the coach prescribed for the
// current run leg, and whether the athlete's live effort is inside it. No UI, no
// devices — resolved from a WorkoutSegment, fully unit-testable.

// MARK: - Pace math

enum TreadmillMath {
    /// Belt speed (km/h) → running pace in whole seconds per km. Returns nil when
    /// the belt is effectively stopped (`< minMovingSpeedKmh`): pace is undefined
    /// at a standstill and must render as "—", never a divide-by-zero.
    static func paceSecPerKm(fromSpeedKmh kmh: Double) -> Int? {
        guard kmh >= TreadmillConstants.minMovingSpeedKmh else { return nil }
        return Int((3600.0 / kmh).rounded())
    }

    /// Integrate one telemetry step into covered distance (speed × dt). Used for
    /// treadmills that don't report cumulative distance in their FTMS packets.
    static func advanceDistance(_ meters: Double, speedKmh: Double, dt: TimeInterval) -> Double {
        guard dt > 0, speedKmh > 0 else { return meters }
        return meters + (speedKmh / 3.6) * dt
    }

    /// Format whole seconds as m:ss (pace / clock). Kept here so the pure layer
    /// has no SwiftUI dependency.
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
        let tol = TreadmillConstants.singlePaceToleranceSecPerKm
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
/// nothing to judge (guidance only).
enum RunTarget: Equatable {
    case pace(PaceTarget)
    case zone(HRZone)
    case none

    /// Resolve from a segment. Prefers the STRUCTURED `prescription.target` (the
    /// only place a pace band lives), normalizing any unit (/500m, /mile) to
    /// seconds-per-km; falls back to the flattened scalar pace, then scalar zone.
    static func resolve(from segment: WorkoutSegment) -> RunTarget {
        if let target = segment.prescription?.target {
            switch target {
            case let .pace(unit, valueS, minS, maxS):
                let t = PaceTarget(
                    single: valueS.map { perKm($0, unit) },
                    fastS: minS.map { perKm($0, unit) },
                    slowS: maxS.map { perKm($0, unit) }
                )
                if t.single != nil || t.hasBand { return .pace(t) }
            case let .hrZone(value, min, _):
                if let z = zone(from: value ?? min) { return .zone(z) }
            default:
                break
            }
        }
        if let scalar = segment.targetPaceSecondsPerKm { return .pace(PaceTarget(single: scalar)) }
        if let z = segment.targetZone { return .zone(z) }
        return .none
    }

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

    // /500m and /mile → /km. Runs read /km; the erg /500m form is doubled, a
    // mile is 1.609344 km.
    private static func perKm(_ seconds: Int, _ unit: PaceUnit) -> Int {
        switch unit {
        case .perKm:    return seconds
        case .per500m:  return seconds * 2
        case .perMile:  return Int((Double(seconds) / 1.609344).rounded())
        }
    }

    private static func zone(from value: Double?) -> HRZone? {
        guard let value else { return nil }
        return HRZone(rawValue: Int(value.rounded()))
    }
}

// MARK: - Work measure / completion

/// How the current run leg completes: a fixed distance, a fixed time, or open
/// (no measurable goal — the athlete ends it manually).
enum SegmentGoal: Equatable {
    case distance(meters: Double)
    case time(seconds: Int)
    case open

    static func resolve(from segment: WorkoutSegment) -> SegmentGoal {
        if let d = segment.targetDistanceMeters, d > 0 { return .distance(meters: d) }
        if let t = segment.targetDurationSeconds, t > 0 { return .time(seconds: t) }
        return .open
    }

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

// MARK: - Estimated HR zone (no real threshold exists in the product)

/// Age-based HR zone estimate. There is NO measured HR threshold anywhere in
/// FAHYBRIK — the personalized zones are pace-based — so any HR zone shown here
/// is an estimate from the textbook 220−age max, and MUST be labeled "estimada".
/// Without an age there is no honest estimate: returns nil and the HUD hides the
/// zone entirely rather than inventing one.
enum EstimatedHRZone {
    static func hrMax(forAge age: Int?) -> Int? {
        guard let age, age > 0, age < 120 else { return nil }
        return TreadmillConstants.hrMaxAgeConstant - age
    }

    static func zone(forBpm bpm: Int, age: Int?) -> HRZone? {
        guard let hrMax = hrMax(forAge: age), hrMax > 0 else { return nil }
        return HRZoneClassifier.zone(forBpm: bpm, hrMax: hrMax)
    }
}
