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

    /// True when this segment is driven by the structured-run leg cursor (#61); it
    /// supersedes the scalar `isRunSeries` path (per-bout measure/target/incline).
    static func hasStructure(_ s: WorkoutSegment) -> Bool { s.hasRunStructure }

    /// The treadmill leg for a STRUCTURED run segment, resolved from the expanded
    /// leg list at `legIndex` — the per-bout measure / target / incline the scalar
    /// path could not carry. This fills BOTH documented seams: a heterogeneous
    /// pyramid work bout reads its OWN distance (no `.open` degrade), and a distance
    /// recovery ("trota 200m") resolves to `.distance` + `ownsAutoAdvance` so the
    /// belt closes it exactly like a work bout. A TIME leg (work or rest) stays
    /// session-clock-owned; an open/unknown leg is manual-only.
    static func leg(for segment: WorkoutSegment, structureLegIndex legIndex: Int) -> TreadmillLeg {
        guard let legs = segment.runStructureLegs, legIndex >= 0, legIndex < legs.count else {
            return leg(for: segment, isWork: true)   // defensive: fall back to the scalar path
        }
        let l = legs[legIndex]
        let goal = l.goal
        let ownsDistance: Bool = { if case .distance = goal { return true }; return false }()
        return TreadmillLeg(phase: l.isRecovery ? .recovery : .work,
                            goal: goal,
                            target: l.isRecovery ? .none : l.runTarget,
                            ownsAutoAdvance: ownsDistance)
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
                // LIMITATION (#61 structure): a HETEROGENEOUS pyramid (1200/1000/800)
                // has no scalar per-bout measure — the web drops `distance_meters`
                // for unequal bouts and nobody reads `sets[bout].measure` yet. So the
                // bout degrades to `.open`: unowned (manual "Terminar tramo ahora" or
                // the session's own close), no distance bar, no invented data. Reading
                // per-bout measures arrives with the athlete `structure` wire (#61).
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
    static func legs(in s: WorkoutSegment) -> Int {
        // A STRUCTURED run carries the EXACT leg list (#61): the expanded count is
        // the single source of truth — heterogeneous bouts, distance recoveries and
        // phase legs all count as themselves, not `formatRounds × stride`.
        if let legs = s.runStructureLegs { return legs.count }
        guard TreadmillLegResolver.isRunSeries(s) else { return 1 }
        // Bout count = `formatRounds`, the single source of truth: it already falls
        // back to `sets.count` for legacy sets-only interval pyramids (see
        // WorkoutSegment.formatRounds). work (+ recovery) per bout.
        return max(1, s.formatRounds ?? 1) * (s.formatRestSeconds != nil ? 2 : 1)
    }

    static func total(_ segments: [WorkoutSegment]) -> Int {
        segments.reduce(0) { $0 + legs(in: $1) }
    }

    /// 1-based global leg number for the live position (LEGACY series / continuous).
    static func current(_ segments: [WorkoutSegment], index: Int,
                        rotRoundIndex: Int, isWork: Bool) -> Int {
        guard index >= 0, index < segments.count else { return 1 }
        let before = legsBefore(segments, index)
        var within = 0
        if TreadmillLegResolver.isRunSeries(segments[index]) {
            let stride = segments[index].formatRestSeconds != nil ? 2 : 1
            within = rotRoundIndex * stride + (isWork ? 0 : 1)
        }
        return before + within + 1
    }

    /// 1-based global leg number for a STRUCTURED run — the flat leg cursor already
    /// IS the within-segment offset, so no work/rest stride maths.
    static func current(_ segments: [WorkoutSegment], index: Int, structureLegIndex: Int) -> Int {
        guard index >= 0, index < segments.count else { return 1 }
        let within = max(0, min(structureLegIndex, legs(in: segments[index]) - 1))
        return legsBefore(segments, index) + within + 1
    }

    private static func legsBefore(_ segments: [WorkoutSegment], _ index: Int) -> Int {
        segments.prefix(index).reduce(0) { $0 + legs(in: $1) }
    }
}
