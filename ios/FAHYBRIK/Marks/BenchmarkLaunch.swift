import Foundation

// #Marcas — "Probarme" = a pre-configured free workout, nothing new to execute.
//
// A benchmark attempt is EXACTLY a single-bout measured free session (the mark's
// distance, or Cooper's fixed 12 minutes) run through the existing live engine —
// GPS or belt for running, PM5 for the ergs. This builder fills the same
// FreeWorkoutDraft the free wizard fills, so the engine cannot tell the difference;
// the only addition is the BenchmarkTag that makes the summary post the mark.
enum BenchmarkLaunch {
    /// Build the runnable context for a self-testable mark. Returns nil for marks
    /// the app cannot measure (the registrable races) or an unknown erg.
    ///
    /// Calle/cinta is NOT decided here: the brief's standard pre-start asks it (and
    /// connects the belt); the save reads the answer from the session. One question.
    static func context(for mark: MarkView) -> FreeWorkoutContext? {
        guard mark.measuredBy != "registered" else { return nil }

        let draft = FreeWorkoutDraft()
        draft.titleEdited = mark.label
        draft.format = .continuo

        // Through `selectModality` — the ONE entry point that also seeds the
        // discipline's own values. Assigning `draft.modality` directly is what left
        // the erg pace default (1:52 /500m) painted on a running benchmark as
        // "@ 1:52 /km", a pace no human has ever run.
        switch mark.measuredBy {
        case "run":
            draft.selectModality(.run)
        case "erg":
            switch mark.erg {
            case "row": draft.selectModality(.row)
            case "ski": draft.selectModality(.ski)
            default: return nil
            }
        default:
            return nil
        }

        if let fixed = mark.fixedDurationS {
            // Cooper: a fixed 12-minute effort; the SCORE is the distance covered.
            draft.measureKind = .time
            draft.workSeconds = fixed
        } else if let distance = mark.targetDistanceM {
            draft.measureKind = .distance
            draft.distanceMeters = Int(distance)
        } else {
            return nil
        }

        // A benchmark is an ALL-OUT effort: the only honest objective is the
        // athlete's own record, framed as "a batir" — never a prescribed intensity.
        //
        //   · with a record → the block says what to beat, in the mark's own unit
        //     ("3:52", "2800 m"), for EVERY mark including Cooper.
        //   · time trials also get the derived pace so the live HUD can say "you're
        //     on / off record pace" (run /km, erg /500m — the draft's unit).
        //   · first attempt → NO objective at all. Not a default, not an estimate:
        //     there is nothing to beat, and the HUD must not pretend otherwise.
        draft.benchmark = mark.best.map { .toBeat(MarkFormat.value(mark, $0.value)) } ?? .firstAttempt
        if let target = paceTargetSeconds(for: mark) {
            draft.targetKind = .pace
            draft.paceSeconds = target
        } else {
            draft.targetKind = nil
        }

        guard var ctx = draft.buildContext() else { return nil }
        ctx.benchmark = BenchmarkTag(
            slug: mark.slug,
            valueKind: mark.unit == "meters" ? .distance : .time
        )
        return ctx
    }

    /// The record-derived pace in the DRAFT's unit (run → s/km, erg → s/500m) — the
    /// pace that MATCHES the athlete's best over this exact distance, so holding it
    /// ties the record and anything under it breaks it. Nil, and therefore NO
    /// objective, when:
    ///   · the mark scores METERS (Cooper): a fixed 12-minute effort has no target
    ///     pace at all — the distance covered is the score.
    ///   · there is no record yet: nothing to derive it from.
    private static func paceTargetSeconds(for mark: MarkView) -> Int? {
        guard mark.unit == "seconds", let dist = mark.targetDistanceM, dist > 0 else { return nil }
        guard let best = mark.best else { return nil }
        let perUnit = mark.group == "run" ? best.value * 1000 / dist : best.value * 500 / dist
        let rounded = Int(perUnit.rounded())
        return rounded > 0 ? rounded : nil
    }
}
