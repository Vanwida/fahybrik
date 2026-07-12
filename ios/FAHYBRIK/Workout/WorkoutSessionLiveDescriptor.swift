import Foundation

// #56 — the SINGLE live descriptor of a running session (block name + format
// progress), read by BOTH the Apple-Watch mirror frame (PhoneMirrorService) and the
// dobles-live heartbeat (DoblesLivePresence). Extracted here so there is ONE
// derivation of "RONDA n/m" / "TRAMO n/m" / "SERIE n/m": a new format that teaches
// the mirror its progress teaches the partner's live strip the same, never a second
// parallel derivation that goes blind. iOS-only (both readers are iOS); the watch
// derives its standalone progress elsewhere.
extension WorkoutSession {
    /// The current coach block's title — the live "block name" the mirror header and
    /// the partner strip both show. Nil for a freeform/title-only session.
    var liveBlockName: String? { currentBlockRegion?.title }

    /// Round / set / tramo progress within the current format ("TRAMO 2/3",
    /// "RONDA 3/5", "SERIE 2/4"), or nil when the format has no counter. THE single
    /// source both PhoneMirrorService's frame and the dobles-live heartbeat read.
    /// (Moved verbatim from PhoneMirrorService.progressText — `self` for `session`.)
    var liveProgressText: String? {
        // A structured run counts TRAMOS off the leg cursor (mirror of the phone HUD),
        // NOT the rotating machine — whose rotRoundIndex stays frozen at 0 here.
        if isRunStructureActive {
            return "TRAMO \(runLegNumber)/\(runLegTotal)"
        }
        let seg = currentSegment
        if seg?.isEMOM == true, let plan = seg?.emomPlan {
            return "RONDA \(min(emomIntervalIndex + 1, plan.intervalCount))/\(plan.intervalCount)"
        }
        if isConditioningActive, let scheme = seg?.formatScheme {
            switch scheme.presentation {
            case .rotating:
                let total = rotTotalRounds
                if total > 0 { return "RONDA \(min(rotRoundIndex + 1, total))/\(total)" }
            case .fixed:
                if scheme == .amrap { return "\(fixedRoundsDone) rondas" }
                let total = fixedListTotal
                if total > 1 { return "\(fixedRoundsDone)/\(total)" }
            default:
                break
            }
        }
        if seg?.usesMultiSetStrength == true, !setRecords.isEmpty {
            let done = setRecords.filter { $0.confirmed }.count
            return "SERIE \(min(done + 1, setRecords.count))/\(setRecords.count)"
        }
        return nil
    }
}
