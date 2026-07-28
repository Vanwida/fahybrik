import Foundation

// Pure mapping: our prescription domain → the PM5's native workout menu
// (PM5WorkoutSpec). The erg twin of TreadmillLegResolver — resolved once per erg
// segment, fully unit-testable, no CoreBluetooth.
//
// PRINCIPLE — program what the monitor can natively RUN, never approximate:
//   · uniform intervals with rest    → fixed dist/time/cal INTERVALS (the free
//     "5×500 r1:30" → distanceIntervals(500, 90); the monitor runs work+rest
//     itself — note the PM has no interval COUNT for fixed intervals, it repeats
//     until the athlete stops; the app's session engine owns the 5 rounds)
//   · intervals with NO rest         → folded into one fixed piece whose SPLIT is
//     the bout (5×500 r0 ≡ 2500m with 500m splits — same thing, honestly)
//   · steady / for-time / warm-up    → fixed distance / time / calories
//   · AMRAP window                   → fixed time
//   · app-driven formats (EMOM, Tabata, Death By…) and heterogeneous interval
//     pyramids (1200/1000/800) → JUST ROW: the app drives the clock, the monitor
//     free-runs with splits and a clean zeroed counter per piece. (Heterogeneous
//     pieces need the variable-interval wire — 0x77 SETPMDATA — a future step.)
// A pace objective rides along whenever one is prescribed (PaceBoat on the PM5).
enum PM5WorkoutProgrammer {

    /// The PM5 program for this segment, or nil when no part of it touches an erg
    /// (never program the monitor from a run or strength piece). Gated on
    /// `involvesErg`, not on the segment kind: a ski/bike EMOM collapses to a
    /// non-erg kind and would otherwise never reach the monitor at all.
    static func spec(for segment: WorkoutSegment) -> PM5WorkoutSpec? {
        guard segment.involvesErg else { return nil }
        let pace = targetPaceSecPer500m(segment)
        guard let p = segment.prescription else { return scalarSpec(segment, pace: pace) }

        switch p.scheme {
        case .intervals:
            return intervalsSpec(segment, p, pace: pace)
        case .steady, .warmup, .cooldown, .forTime:
            // One continuous piece; the scalars (or the single set's measure)
            // carry the goal. A goal-less For Time degrades to just row.
            return scalarSpec(segment, pace: pace)
        case .amrap:
            // Fixed window: the monitor counts the time down, the app counts work.
            if let t = p.totalS, t > 0 { return .fixedTime(seconds: t, pace: pace) }
            return .justRow(pace: pace)
        case .emom, .tabata, .deathBy, .chipper, .ladder, .rounds, .hyroxSim, .sets:
            // App-driven formats: our engine owns the interval clock (beeps,
            // rotation); the monitor free-runs and records honestly.
            return .justRow(pace: pace)
        }
    }

    /// True when the piece we send makes the MONITOR run the whole series itself
    /// (native work+rest intervals). Then the monitor already zeroes its own split
    /// counter between bouts, and re-sending the piece on every bout would restart
    /// the series under the athlete — so the app re-anchors its own window and
    /// leaves the monitor alone. False for everything the APP clocks (EMOM, Tabata,
    /// a heterogeneous pyramid, a single piece), where each window has to be sent
    /// again to get the counter back to zero.
    static func monitorRunsTheSeries(_ segment: WorkoutSegment) -> Bool {
        switch spec(for: segment)?.kind {
        case .distanceIntervals, .timeIntervals, .calorieIntervals: return true
        default: return false
        }
    }

    // MARK: - Shapes

    /// Uniform interval work → the PM's native fixed-interval modes; rest-less
    /// series fold into one fixed piece split by the bout.
    private static func intervalsSpec(_ segment: WorkoutSegment, _ p: Prescription, pace: Double?) -> PM5WorkoutSpec {
        let rest = p.restS ?? p.sets?.first?.restS ?? 0
        guard let measure = boutMeasure(segment, p) else { return .justRow(pace: pace) }
        let rounds = max(1, segment.formatRounds ?? 1)

        switch measure {
        case .distance(let meters):
            let m = Int(meters.rounded())
            guard m > 0 else { return .justRow(pace: pace) }
            return rest > 0
                ? .distanceIntervals(workMeters: m, restSeconds: rest, pace: pace)
                : .fixedDistance(meters: m * rounds, splitMeters: m, pace: pace)
        case .duration(let seconds):
            guard seconds > 0 else { return .justRow(pace: pace) }
            return rest > 0
                ? .timeIntervals(workSeconds: seconds, restSeconds: rest, pace: pace)
                : .fixedTime(seconds: seconds * rounds, splitSeconds: seconds, pace: pace)
        case .calories(let cals):
            guard cals > 0 else { return .justRow(pace: pace) }
            return rest > 0
                ? .calorieIntervals(workCalories: cals, restSeconds: rest, pace: pace)
                : .fixedCalories(calories: cals * rounds, splitCalories: cals, pace: pace)
        case .reps, .unknown:
            return .justRow(pace: pace)
        }
    }

    /// One continuous piece from the segment's scalar mirrors (the flattened
    /// targets every segment carries), else the prescription's uniform measure.
    /// No measurable goal → just row.
    private static func scalarSpec(_ segment: WorkoutSegment, pace: Double?) -> PM5WorkoutSpec {
        if let d = segment.targetDistanceMeters, d > 0 {
            return .fixedDistance(meters: Int(d.rounded()), pace: pace)
        }
        if let t = segment.targetDurationSeconds, t > 0 {
            return .fixedTime(seconds: t, pace: pace)
        }
        // Calories never flatten into scalars — read the typed measure.
        if let m = uniformSetMeasure(segment.prescription) {
            switch m {
            case .calories(let c) where c > 0: return .fixedCalories(calories: c, pace: pace)
            case .distance(let d) where d > 0: return .fixedDistance(meters: Int(d.rounded()), pace: pace)
            case .duration(let s) where s > 0: return .fixedTime(seconds: s, pace: pace)
            default: break
            }
        }
        return .justRow(pace: pace)
    }

    // MARK: - Bout measure

    /// The per-bout measure of an interval segment: the scalar mirrors first
    /// (they are per-bout on a folded series), else the sets' UNIFORM measure.
    /// Heterogeneous sets (a pyramid) → nil, the caller degrades to just row.
    private static func boutMeasure(_ segment: WorkoutSegment, _ p: Prescription) -> Measure? {
        if let sets = p.sets, sets.count > 1, uniformSetMeasure(p) == nil {
            return nil   // heterogeneous pyramid — no single honest bout
        }
        if let d = segment.targetDistanceMeters, d > 0 { return .distance(meters: d) }
        if let s = segment.targetDurationSeconds, s > 0 { return .duration(seconds: s) }
        if let w = p.workS, w > 0 { return .duration(seconds: w) }
        return uniformSetMeasure(p)
    }

    /// The single measure ALL sets share, or nil when sets are absent/mixed.
    private static func uniformSetMeasure(_ p: Prescription?) -> Measure? {
        guard let sets = p?.sets, let first = sets.first?.measure else { return nil }
        return sets.allSatisfy { $0.measure == first } ? first : nil
    }

    // MARK: - Pace objective

    /// Prescribed erg pace in seconds / 500 m, from the typed pace target (the
    /// prescription's, else the first set's), else the scalar sec/km mirror
    /// halved (the segment convention stores erg pace per km). A range takes its
    /// midpoint — the honest single number a PaceBoat can hold.
    static func targetPaceSecPer500m(_ segment: WorkoutSegment) -> Double? {
        let p = segment.prescription
        if let t = p?.target ?? p?.sets?.first?.target,
           case let .pace(unit, valueS, minS, maxS) = t {
            let seconds: Int? = valueS ?? {
                if let lo = minS, let hi = maxS { return (lo + hi) / 2 }
                return minS ?? maxS
            }()
            if let s = seconds, s > 0 {
                switch unit {
                case .per500m: return Double(s)
                case .perKm: return Double(s) / 2
                case .perMile: return nil   // never converted in our domain — skip
                }
            }
        }
        if let perKm = segment.targetPaceSecondsPerKm, perKm > 0 {
            return Double(perKm) / 2
        }
        return nil
    }
}
