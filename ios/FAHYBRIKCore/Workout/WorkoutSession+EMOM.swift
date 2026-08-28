import Foundation

// EL MOTOR EMOM: cuenta atrás 3-2-1, la fase de trabajo (y la de cambio, si el
// formato la declara), el salto de minuto y el cierre del bloque. Autocontenido y
// paralelo a los motores de conditioning y de carrera estructurada — no toca
// ninguno de los dos.
extension WorkoutSession {
    /// True when the current segment is a running EMOM (past its count-in).
    var isEMOMActive: Bool { currentSegment?.isEMOM == true }

    /// EMOM intervals still ahead of the current one (0 on the last interval).
    var emomIntervalsRemaining: Int {
        guard let plan = currentSegment?.emomPlan else { return 0 }
        return max(0, plan.intervalCount - emomIntervalIndex - 1)
    }

    func startEMOM() {
        guard let plan = currentSegment?.emomPlan else { clearEMOMState(); return }
        emomSegmentIndex = currentSegmentIndex
        emomIntervalIndex = 0
        emomCompletedIntervals = 0
        emomPhase = .work
        workRemaining = Double(plan.workSeconds)
        restRemainingSeconds = 0
        restEndsTramo = false
        countInRemaining = Self.countInSeconds
        runProgress.reset()
        WorkoutAudio.shared.activate()
        WorkoutAudio.shared.playTick()   // the opening "3" of the 3-2-1 count-in
    }

    func clearEMOMState() {
        if emomSegmentIndex != nil { WorkoutAudio.shared.deactivate() }
        emomSegmentIndex = nil
        emomCountInRemaining = 0
        emomIntervalIndex = 0
        emomPhase = .work
        emomPhaseRemaining = 0
        emomCompletedIntervals = 0
    }

    // Advance to the next EMOM interval, or close the block on the last one. Reached
    // both by the timer rolling over and by the athlete tapping through — the result
    // is identical either way, so it takes no "was this automatic" flag.
    private func advanceEMOMInterval() {
        guard let plan = currentSegment?.emomPlan else { return }
        // Plain EMOM (no explicit rest) and the last work minute: the work window
        // that just ended is still THIS interval — record it before the cursor moves.
        // (Interval EMOMs with a change window already recorded on work→rest.)
        if emomPhase == .work {
            recordEMOMIntervalBout(at: emomIntervalIndex)
        }
        emomCompletedIntervals = max(emomCompletedIntervals, emomIntervalIndex + 1)
        let next = emomIntervalIndex + 1
        if next >= plan.intervalCount {
            WorkoutAudio.shared.playFinish()
            Haptics.cueFinish()
            closeEMOMAndAdvance()
            return
        }
        let changed = plan.interval(next)?.movement != plan.interval(emomIntervalIndex)?.movement
        emomIntervalIndex = next
        emomPhase = .work
        emomPhaseRemaining = Double(plan.workSeconds)
        // Open the next minute's device window (ski after remo → counters at 0).
        syncTramoIfNeeded()
        if changed {
            WorkoutAudio.shared.playMovementChange()
            // A WORKOUT CUE, not UI feedback: this has to reach the wrist. It was
            // `Haptics.heavy()`, which only buzzes the phone — so a multi-station EMOM
            // (movement changes every minute) never sent the wrist a single cue.
            Haptics.cueChange()
        } else {
            WorkoutAudio.shared.playIntervalStart()
            Haptics.cueGo()
        }
    }

    // Capture the EMOM's completion (X of Y intervals) BEFORE the engine is torn
    // down — mirrors captureConditioningScore. `emomCompletedIntervals` is zeroed by
    // clearEMOMState(), so without this the lap closed with the rounds LOST (#break-1).
    // Only fires for the ACTIVE EMOM segment, so a non-EMOM close never captures it.
    func captureEMOMScore() {
        guard emomSegmentIndex == currentSegmentIndex, let plan = currentSegment?.emomPlan else { return }
        capturedEmomCompleted = emomCompletedIntervals
        capturedEmomPrescribed = plan.intervalCount
    }

    // Close the EMOM segment's lap (reusing the standard segment-close path) and
    // advance to the next segment, or finish the session. Crossing into the next
    // block parks on its preview (the gate) instead of auto-starting it.
    private func closeEMOMAndAdvance() {
        let wasLast = isLastSegment
        let origin = currentSegmentIndex
        captureEMOMScore()   // BEFORE clearEMOMState zeroes the counters (#break-1)
        clearEMOMState()
        closeCurrentSegmentLap()
        if wasLast {
            finishPrescribedWork()
        } else {
            currentSegmentIndex += 1
            enterOrArm(from: origin)
        }
    }

    /// A phase hit zero. An INTERVAL EMOM (explicit transition) closes the WORK
    /// first — the distinct "para" cue + a firm haptic — and only rolls to the next
    /// round when the transition is spent. A plain EMOM has no transition, so its
    /// work phase IS the cycle and it rolls straight through exactly as before.
    func rollEMOMPhase(_ plan: EmomPlan) {
        // The LAST work window ends the block — a Rogue clock doesn't make you stand
        // through a change with nowhere to change to.
        let isLastRound = emomIntervalIndex + 1 >= plan.intervalCount
        if plan.hasTransition, emomPhase == .work, !isLastRound {
            // Close THIS station's work (metres / cal / pace) before the change window.
            recordEMOMIntervalBout(at: emomIntervalIndex)
            emomPhase = .rest
            restRemainingSeconds = Double(plan.restSeconds)
            restTotalSeconds = Double(plan.restSeconds)
            restEndsTramo = true
            workRemaining = 0
            WorkoutAudio.shared.playWorkEnd()
            Haptics.cueStop()
            return
        }
        advanceEMOMInterval()   // beep + roll (or close on the last one)
    }
}
