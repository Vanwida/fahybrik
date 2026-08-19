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
        emomPhaseRemaining = Double(plan.workSeconds)
        emomCountInRemaining = Self.countInSeconds
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

    func skipCountIn() {
        guard let plan = currentSegment?.emomPlan else { return }
        emomCountInRemaining = 0
        emomPhase = .work
        emomPhaseRemaining = Double(plan.workSeconds)
        reanchorTramoDeviceWindowAtGo()
        WorkoutAudio.shared.playGo()
        Haptics.cueGo()
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

    // Drive the EMOM count-in and per-PHASE countdown. Fires the count-in ticks +
    // "go", the last-3s ticks, the end-of-work cue (interval EMOMs only), the
    // top-of-interval beep and the auto-roll to the next interval (or the block
    // close on the last one). Runs off the same 0.25s tick as the main clock.
    func tickEMOM(dt: Double) {
        guard let plan = currentSegment?.emomPlan else { return }

        // Count-in: 3-2-1 with a tick on each whole-second transition, "go" at 0.
        if emomCountInRemaining > 0 {
            let before = emomCountInRemaining
            emomCountInRemaining = max(0, before - dt)
            if before.rounded(.up) != emomCountInRemaining.rounded(.up) {
                if emomCountInRemaining <= 0 {
                    emomPhase = .work
                    emomPhaseRemaining = Double(plan.workSeconds)
                    reanchorTramoDeviceWindowAtGo()
                    WorkoutAudio.shared.playGo()
                    Haptics.cueGo()
                } else {
                    WorkoutAudio.shared.playTick()
                    Haptics.cueTick()
                }
            }
            return
        }

        // Running phase: count down, tick the final 3 seconds, roll at zero. On an
        // interval EMOM those ticks now also run into the END OF THE WORK, which is
        // the whole point of the format — the athlete is warned when to STOP, not
        // only when to start.
        let before = emomPhaseRemaining
        let after = before - dt
        for boundary in [3.0, 2.0, 1.0] where before > boundary && after <= boundary {
            WorkoutAudio.shared.playTick()
            Haptics.cueTick()
        }
        if after <= 0 {
            rollEMOMPhase(plan)
        } else {
            emomPhaseRemaining = after
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
            emomPhaseRemaining = Double(plan.restSeconds)
            WorkoutAudio.shared.playWorkEnd()
            Haptics.cueStop()
            return
        }
        advanceEMOMInterval()   // beep + roll (or close on the last one)
    }
}
