import Foundation

// #56 — DIRECTION of a HYROX dobles simulation, resolved to the reading athlete's
// point of view for DISPLAY. The engine (#23, SegmentDoblesSplit) already decides WHO
// works each station and the athlete's share; this is a pure, render-ready projection
// of that decision — read by the phone's turn hero (ActiveWorkoutView) and pushed to
// the wrist (MirrorDoblesTurn). No new domain: every value comes from the split + the
// station's own numeric rep total; nothing is invented.

/// One athlete's TURN at a dobles station, from the reading athlete's POV.
struct DoblesTurn: Equatable {
    /// Whose station this is: the athlete does it whole (`mine`), the partner does it
    /// while the athlete recovers (`partner`), or both share it by reps (`split`).
    enum Who: String, Equatable { case mine, partner, split }

    let who: Who
    /// Station label ("SkiErg 1km", "Wall Balls") — the coach's, never fabricated.
    let station: String
    /// Reading athlete's share of the volume, 0…1 (drives the bicolor bar). 1 for
    /// `mine`, 0 for `partner`, the coach's split for `split`.
    let selfShare: Double
    /// Reading athlete's reps this turn, ONLY when the station carries a numeric rep
    /// total to split (nil for a time/distance/target-less station — never invented).
    let selfReps: Int?
    /// Partner's reps this turn (nil as above). `selfReps + partnerReps == total`.
    let partnerReps: Int?
    /// Partner's first name, or nil → the surface falls back to "compañero".
    let partnerName: String?
    /// Coach's reparto note ("alterna 250m"), when any.
    let note: String?

    /// 0…100 self-share for the bar/legend (the coach's 5% grain rounds cleanly here).
    var selfSharePct: Int { Int((max(0, min(1, selfShare)) * 100).rounded()) }
    /// 0…100 partner share — the exact complement, so the two always sum to 100.
    var partnerSharePct: Int { 100 - selfSharePct }
}

extension SegmentDoblesSplit {
    /// Split a numeric station rep total between the reading athlete and the partner
    /// by `selfShare`, rounded to whole reps so the two halves sum EXACTLY to the total
    /// (partner = total − mine, never a second independent rounding). Nil when there is
    /// no numeric total to split — the caller then shows only the percentage, never an
    /// invented rep count.
    func repSplit(total: Int?) -> (mine: Int, partner: Int)? {
        guard let total, total > 0 else { return nil }
        let mine = min(total, max(0, Int((Double(total) * selfShare).rounded())))
        return (mine, total - mine)
    }

    /// This split resolved to a display `DoblesTurn`, given the station's numeric rep
    /// total (`WorkoutSegment.targetReps`; pass nil for a time/distance station).
    func turn(total: Int?) -> DoblesTurn {
        let split = repSplit(total: total)
        return DoblesTurn(
            who: DoblesTurn.Who(rawValue: role.rawValue) ?? .split,
            station: stationLabel,
            selfShare: selfShare,
            selfReps: split?.mine,
            partnerReps: split?.partner,
            partnerName: partnerName,
            note: note
        )
    }
}

extension WorkoutSegment {
    /// This station's dobles turn for the reading athlete, or nil when the segment
    /// carries no dobles split (individual work, runs, unmapped stations). The rep
    /// total comes from `targetReps` (nil when zero/absent → percentage-only display).
    var doblesTurn: DoblesTurn? {
        doblesSplit?.turn(total: (targetReps ?? 0) > 0 ? targetReps : nil)
    }
}

extension Array where Element == WorkoutSegment {
    /// The next station AFTER `index` that carries a dobles split, resolved to a turn —
    /// the "Después:" preview. Skips non-dobles segments (a run between stations) and
    /// returns nil when no split station follows (the last station, or an individual
    /// session).
    func nextDoblesTurn(after index: Int) -> DoblesTurn? {
        let start = Swift.max(0, index + 1)
        guard start < count else { return nil }
        for i in start..<count {
            if let turn = self[i].doblesTurn { return turn }
        }
        return nil
    }
}
