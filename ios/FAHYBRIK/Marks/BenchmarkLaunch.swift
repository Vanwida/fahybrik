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
    /// `environment` is required for RUN marks (calle/cinta — chosen in the same
    /// pre-start flow every run uses) and ignored for erg marks.
    static func context(for mark: MarkView, environment: RunEnvironment?) -> FreeWorkoutContext? {
        guard mark.measuredBy != "registered" else { return nil }

        let draft = FreeWorkoutDraft()
        draft.titleEdited = mark.label
        draft.format = .continuo

        switch mark.measuredBy {
        case "run":
            draft.modality = .run
        case "erg":
            switch mark.erg {
            case "row": draft.modality = .row
            case "ski": draft.modality = .ski
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

        // The pace objective shown by the HUD. A benchmark is an all-out effort, so
        // the most honest target is the athlete's OWN best — "a batir". First attempt
        // (no comparable PR): the modality default stands in; the effort is theirs.
        if let target = paceTargetSeconds(for: mark, environment: environment) {
            draft.targetKind = .pace
            draft.paceSeconds = target
        }

        guard var ctx = draft.buildContext() else { return nil }
        if draft.modality == .run { ctx.runEnvironment = environment }
        ctx.benchmark = BenchmarkTag(
            slug: mark.slug,
            valueKind: mark.unit == "meters" ? .distance : .time,
            runContext: draft.modality == .run
                ? ((environment == .treadmill) ? "treadmill" : "outdoor")
                : nil
        )
        return ctx
    }

    /// The PR-derived pace in the DRAFT's unit (run → s/km, erg → s/500m), or nil
    /// when there is no comparable best yet.
    private static func paceTargetSeconds(for mark: MarkView, environment: RunEnvironment?) -> Int? {
        guard mark.unit == "seconds", let dist = mark.targetDistanceM, dist > 0 else { return nil }
        // Run marks: compare within the context being attempted, mirroring the PR rule.
        let best: MarkResult? = {
            if mark.group == "run" {
                return environment == .treadmill ? mark.bestTreadmill : mark.bestOutdoor
            }
            return mark.best
        }()
        guard let best else { return nil }
        let perUnit = mark.group == "run" ? best.value * 1000 / dist : best.value * 500 / dist
        let rounded = Int(perUnit.rounded())
        return rounded > 0 ? rounded : nil
    }
}
