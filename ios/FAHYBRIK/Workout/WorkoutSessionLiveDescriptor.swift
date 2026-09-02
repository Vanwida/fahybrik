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
                // A ROUTE reads as the POSITION he is standing on, the same number
                // the phone's strip shows ("ESTACIÓN 2/5"). A repeated-round list
                // reads the SAME way since the round counter (11-ago): the phone
                // leads with the round he is IN («RONDA 4/8»), so the wrist says
                // the same number — la muñeca dice lo mismo que la pantalla, o son
                // dos apps.
                if currentSegment?.fixedListIsStations == true, total > 1 {
                    if fixedHasOuterRounds {
                        let r = fixedOuterRoundTotal
                        return "RONDA \(min(fixedOuterRoundIndex + 1, r))/\(r)"
                    }
                    return "ESTACIÓN \(min(fixedRoundsDone + 1, total))/\(total)"
                }
                if total > 1 { return "RONDA \(min(fixedRoundsDone + 1, total))/\(total)" }
            default:
                break
            }
        }
        if seg?.usesMultiSetStrength == true, !setRecords.isEmpty {
            let done = setRecords.filter { $0.confirmed }.count
            let actual = min(done, setRecords.count - 1)
            // En una SUPERSERIE «SERIE 5/12» es cierto y no sitúa a nadie: lo que
            // cuenta en una rotación es la vuelta, igual que en el EMOM. La muñeca
            // dice lo mismo que la pantalla, o son dos apps.
            if let t = seg?.supersetSlot(at: actual) {
                return "\(Vocab.ronda.uppercased()) \(t.round)/\(t.rounds)"
            }
            return "SERIE \(min(done + 1, setRecords.count))/\(setRecords.count)"
        }
        return nil
    }
}
