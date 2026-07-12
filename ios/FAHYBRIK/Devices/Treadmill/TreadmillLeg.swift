import Foundation

// Unifies the two shapes the treadmill HUD must traverse into ONE concept — a
// "leg": either a whole continuous-run segment, or a single work/recovery bout of
// an interval SERIES (which the session folds into ONE `.intervals` segment and
// advances internally via rotRoundIndex/rotPhase). Pure, resolved from a segment
// plus the live series phase — fully unit-testable.

enum LegPhase: Equatable { case single, work, recovery }

struct TreadmillLeg: Equatable {
    let phase: LegPhase
    let goal: SegmentGoal
    let target: RunTarget
    /// True when the treadmill player must DRIVE the advance itself on completion.
    /// False when the session's own clock advances the leg (interval TIME work
    /// bouts and RECOVERY countdowns), so the two never double-advance.
    let ownsAutoAdvance: Bool

    var isRecovery: Bool { phase == .recovery }
}

enum TreadmillLegResolver {
    /// A run leg driven as an interval SERIES (folded `.intervals`, run modality)
    /// rather than a plain continuous run.
    static func isRunSeries(_ s: WorkoutSegment) -> Bool {
        s.isConditioningTimer && s.formatScheme == .intervals && s.kind == .running
    }

    /// The current leg. For a continuous run, `isWork` is ignored. For a series:
    /// a WORK bout (distance → the player owns the close; time → the session's
    /// clock owns it) or a RECOVERY countdown (session-owned).
    static func leg(for segment: WorkoutSegment, isWork: Bool) -> TreadmillLeg {
        guard isRunSeries(segment) else {
            let goal = SegmentGoal.resolve(from: segment)
            let owns = goal != .open   // a measurable continuous run auto-closes; "open" is manual-only
            return TreadmillLeg(phase: .single, goal: goal,
                                target: RunTarget.resolve(from: segment), ownsAutoAdvance: owns)
        }
        if isWork {
            let goal: SegmentGoal
            if let d = segment.targetDistanceMeters, d > 0 {
                goal = .distance(meters: d)
            } else if let w = segment.formatWorkSeconds, w > 0 {
                goal = .time(seconds: w)
            } else {
                goal = .open
            }
            // Only DISTANCE work bouts need us to drive the advance; a timed bout is
            // rolled by the session's own tick.
            let ownsDistance: Bool = { if case .distance = goal { return true }; return false }()
            return TreadmillLeg(phase: .work, goal: goal,
                                target: RunTarget.resolve(from: segment), ownsAutoAdvance: ownsDistance)
        }
        // Recovery: today only a time countdown (rest_s), owned by the session's clock.
        //
        // FORWARD SEAM (#61 run-structure grammar): when a recovery ships a DISTANCE
        // measure ("trota 200m"), resolve it here to `.distance(meters:)` with
        // `ownsAutoAdvance: true` — the auto-advance machine already closes any
        // distance-owned leg generically (same path as a work bout), so no state
        // machine change is needed, only this branch. Keep reading the new measure
        // in preference to the legacy `rest_s` so a belt-closed recovery never also
        // gets time-closed by the session.
        let goal: SegmentGoal = segment.formatRestSeconds.map { .time(seconds: $0) } ?? .open
        return TreadmillLeg(phase: .recovery, goal: goal, target: .none, ownsAutoAdvance: false)
    }
}

// MARK: - Global leg counter ("Tramo N de M")

/// Projects the whole plan into a flat leg count so the HUD can show the athlete's
/// global position — a series expands into its work(+recovery) bouts, every other
/// segment counts as one leg (the session's own segment granularity). Matches the
/// approved mockup ("Tramo 3 de 13" for a 6×800 session).
enum WorkoutLegCount {
    /// Number of work bouts in a run series. Uses `rounds`, FALLING BACK to the
    /// `sets` array length — ~40% of real interval prescriptions are legacy
    /// pyramids (1200/1000/800) that carry no `rounds`, only one `sets` entry per
    /// bout. Never rely on `rounds` alone or those collapse to a single leg.
    static func boutCount(_ s: WorkoutSegment) -> Int {
        max(1, s.formatRounds ?? s.prescription?.sets?.count ?? 1)
    }

    static func legs(in s: WorkoutSegment) -> Int {
        guard TreadmillLegResolver.isRunSeries(s) else { return 1 }
        return boutCount(s) * (s.formatRestSeconds != nil ? 2 : 1)   // work + recovery per round
    }

    static func total(_ segments: [WorkoutSegment]) -> Int {
        segments.reduce(0) { $0 + legs(in: $1) }
    }

    /// 1-based global leg number for the live position.
    static func current(_ segments: [WorkoutSegment], index: Int,
                        rotRoundIndex: Int, isWork: Bool) -> Int {
        guard index >= 0, index < segments.count else { return 1 }
        let before = segments.prefix(index).reduce(0) { $0 + legs(in: $1) }
        var within = 0
        if TreadmillLegResolver.isRunSeries(segments[index]) {
            let stride = segments[index].formatRestSeconds != nil ? 2 : 1
            within = rotRoundIndex * stride + (isWork ? 0 : 1)
        }
        return before + within + 1
    }
}
