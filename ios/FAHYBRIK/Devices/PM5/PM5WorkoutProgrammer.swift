import Foundation

// Pure mapping: our prescription domain → the PM5's native workout menu
// (PM5WorkoutSpec). The erg twin of TreadmillLegResolver — fully unit-testable,
// no CoreBluetooth.
//
// PRINCIPLE (2026-08, counter sync): the APP owns the series count. Each work
// tramo is programmed as THAT bout's fixed piece (500 m, 20 cal, 2:00), so the
// monitor zeros and waits for "row to begin" when the tramo opens. Native PM5
// interval modes (work+rest repeating forever, no round count) are no longer the
// default path — they desynced the app's "serie 3/5" from the monitor.
//
//   · series / stations / steady goal → fixed dist/time/cal of THIS bout
//   · AMRAP window                    → fixed time once (cumulative)
//   · EMOM / open app-driven          → justRow (or fixed if the round has m/cal)
//   · rest / count-in / non-erg       → nil (do not program)
//
// A pace objective rides along whenever one is prescribed (PaceBoat on the PM5).
// See docs/plan-sincronia-contadores-dispositivo.md + ErgCounterPolicy.
enum PM5WorkoutProgrammer {

    /// Segment-level program — used for cumulative windows (AMRAP) and as a
    /// fallback when no tramo is available. Prefer `spec(for:tramo:segment:policy:)`.
    static func spec(for segment: WorkoutSegment) -> PM5WorkoutSpec? {
        guard segment.involvesErg else { return nil }
        let pace = targetPaceSecPer500m(segment)
        guard let p = segment.prescription else { return scalarSpec(segment, pace: pace) }

        switch p.scheme {
        case .intervals:
            // App-owned series: program ONE bout (not native intervals, not the
            // whole multi-round total). The live path re-sends per tramo key.
            return boutFixedSpec(measure: boutMeasure(segment, p), pace: pace)
        case .steady, .warmup, .cooldown, .forTime:
            return scalarSpec(segment, pace: pace)
        case .amrap:
            if let t = p.totalS, t > 0 { return .fixedTime(seconds: t, pace: pace) }
            return .justRow(pace: pace)
        case .emom, .tabata, .deathBy, .chipper, .ladder, .rounds, .hyroxSim, .sets:
            return .justRow(pace: pace)
        }
    }

    /// Program for the LIVE tramo under an already-resolved policy. Nil when the
    /// policy says not to program (rest, count-in, non-erg) or the segment is not
    /// erg-related.
    static func spec(for tramo: LiveTramo,
                     segment: WorkoutSegment,
                     policy: ErgCounterPolicy) -> PM5WorkoutSpec? {
        guard segment.involvesErg, tramo.isErg, policy.shouldProgramOnEnter else { return nil }
        let pace = targetPaceSecPer500m(segment)
        switch policy.program {
        case .none:
            return nil
        case .justRow:
            return .justRow(pace: pace)
        case .fixedPiece:
            if let measure = tramo.measure {
                return boutFixedSpec(measure: measure, pace: pace)
            }
            // Cumulative AMRAP etc. fall back to the segment shape.
            return spec(for: segment)
        }
    }

    /// Window key for `programIfNeeded`. Changes → monitor is re-sent and zeros.
    /// perTramo → tramo key; cumulative → stable segment key.
    static func programWindowKey(policy: ErgCounterPolicy,
                                 tramo: LiveTramo,
                                 segment: WorkoutSegment) -> String? {
        guard policy.shouldProgramOnEnter else { return nil }
        switch policy.scope {
        case .perTramo: return tramo.key
        case .cumulativeSegment: return "seg-\(segment.id.uuidString)"
        }
    }

    /// Legacy name. Always false under app-owned series: the app reprograms every
    /// work tramo so the monitor counter matches the bout. Kept so call sites
    /// compile; prefer `ErgCounterPolicy` + `programWindowKey`.
    static func monitorRunsTheSeries(_ segment: WorkoutSegment) -> Bool {
        _ = segment
        return false
    }

    // MARK: - Shapes

    /// One bout → fixed piece (the app will re-send for the next bout).
    private static func boutFixedSpec(measure: Measure?, pace: Double?) -> PM5WorkoutSpec {
        guard let measure else { return .justRow(pace: pace) }
        switch measure {
        case .distance(let meters):
            let m = Int(meters.rounded())
            return m > 0 ? .fixedDistance(meters: m, pace: pace) : .justRow(pace: pace)
        case .duration(let seconds):
            return seconds > 0 ? .fixedTime(seconds: seconds, pace: pace) : .justRow(pace: pace)
        case .calories(let cals):
            return cals > 0 ? .fixedCalories(calories: cals, pace: pace) : .justRow(pace: pace)
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
