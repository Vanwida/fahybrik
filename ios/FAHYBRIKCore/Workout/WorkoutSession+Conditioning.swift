import Foundation

// EL MOTOR DE LOS FORMATOS CON RELOJ que no son EMOM: For Time / AMRAP / Tabata /
// Intervals / Death By / Steady / Chipper / Ladder / Rounds / simulación HYROX.
// Autocontenido y paralelo al EMOM (al que no toca): una cuenta atrás 3-2-1 y
// después un reloj FIJO (arriba o abajo), un reloj ROTATIVO de trabajo/descanso, o
// una cuenta atrás CONTINUA — todo del mismo latido, con las mismas señales.
extension WorkoutSession {
    // MARK: Conditioning accessors (read by the format HUDs)

    /// True when the current segment runs a non-EMOM conditioning timer.
    var isConditioningActive: Bool { currentSegment?.isConditioningTimer == true }

    /// True while the conditioning 3-2-1 count-in is on screen.
    var isCondCountIn: Bool { condCountInRemaining > 0 }

    /// Format clock time since GO (the count-in excluded), in seconds — the base
    /// for the FIXED count-up / count-down and the CONTINUOUS countdown.
    var condElapsed: Double { max(0, lapElapsedSeconds - condStartElapsed) }

    /// AMRAP / Steady time remaining in the fixed window (count-DOWN, never < 0).
    var condRemaining: Double {
        guard let total = currentSegment?.formatTotalSeconds else { return 0 }
        return max(0, Double(total) - condElapsed)
    }

    /// Total rounds the current ROTATING format runs (Tabata / Intervals), else 0.
    var rotTotalRounds: Int { currentSegment?.formatRounds ?? 0 }

    /// Reps logged so far this Tabata round (the live tally shown on the HUD). A
    /// round not yet counted reads 0 — live that IS the running tally, and the
    /// undeclared/zero distinction only matters when the score is sealed.
    var rotRepsThisRound: Int {
        guard rotRoundIndex >= 0, rotRoundIndex < rotRepsByRound.count else { return 0 }
        return rotRepsByRound[rotRoundIndex] ?? 0
    }

    /// Death By target for the CURRENT minute = start + increment × roundsCompleted.
    var deathByTarget: Int {
        guard let seg = currentSegment else { return 0 }
        return seg.deathByStart + seg.deathByIncrement * rotRoundIndex
    }

    // MARK: - Conditioning format engine (non-EMOM live timers)
    //
    // Drives For Time / AMRAP / Tabata / Intervals / Death By / Steady / Chipper /
    // Ladder / Rounds / HYROX sim. Self-contained and parallel to the EMOM engine
    // (which it never touches): a 3-2-1 count-in, then a FIXED count-up/down, a
    // ROTATING work/rest phase clock, or a CONTINUOUS countdown — each off the same
    // 0.25s tick, reusing WorkoutAudio for the cues.

    func startConditioning() {
        guard let seg = currentSegment, seg.isConditioningTimer else { clearConditioning(); return }
        condSegmentIndex = currentSegmentIndex
        condStartElapsed = lapElapsedSeconds          // provisional; reset at GO
        condCountInRemaining = Self.countInSeconds
        fixedRoundsDone = 0
        fixedRoundSplits = []
        ergIntervalBoutsRecorded = 0
        rotRoundIndex = 0
        rotRoundsCompleted = 0
        rotPhase = .work
        rotPhaseRemaining = 0
        deathByFailed = false
        repsCurrentSegment = 0                          // AMRAP partial-round reps
        rotRepsByRound = Array(repeating: nil, count: max(1, seg.formatRounds ?? 1))
        WorkoutAudio.shared.activate()
        WorkoutAudio.shared.playTick()                  // opening "3" of the count-in
    }

    func clearConditioning() {
        if condSegmentIndex != nil { WorkoutAudio.shared.deactivate() }
        condSegmentIndex = nil
        condCountInRemaining = 0
        condStartElapsed = 0
        fixedRoundsDone = 0
        fixedRoundSplits = []
        // Do NOT zero ergIntervalBoutsRecorded here — closeConditioningAndAdvance
        // calls clearConditioning BEFORE closeCurrentSegmentLap, and the skip-aggregate
        // path needs the count to still be live. Zeroed in startConditioning and after
        // closeCurrentSegmentLap consumes it.
        rotRoundIndex = 0
        rotRoundsCompleted = 0
        rotPhaseRemaining = 0
        rotPhase = .work
        rotRepsByRound = []
        deathByFailed = false
    }

    /// The number of strike-able list items in a FIXED checklist: the movements for
    /// a Chipper (one pass), else the round count (For Time / Ladder / Rounds).
    var fixedListTotal: Int {
        guard let seg = currentSegment else { return 1 }
        switch seg.formatScheme {
        case .chipper:
            return max(1, seg.components.count)
        case .forTime, .ladder, .rounds, .hyroxSim:
            return max(1, seg.formatRounds ?? seg.components.count)
        default:
            return max(1, seg.formatRounds ?? 1)
        }
    }

    // Seconds in the WORK phase of a rotating format (Tabata / Intervals work, a
    // Death By minute). nil for a distance-based interval bout → no auto-roll, the
    // athlete (or a GPS auto-lap) ends it via "Serie hecha".
    private func workPhaseSeconds(_ seg: WorkoutSegment) -> Int? {
        switch seg.formatScheme {
        case .deathBy:            return seg.formatWorkSeconds ?? 60
        case .tabata, .intervals: return seg.formatWorkSeconds
        default:                  return nil
        }
    }

    private func startRotatingFirstPhase(_ seg: WorkoutSegment) {
        guard seg.formatScheme?.presentation == .rotating else { return }
        rotPhase = .work
        rotPhaseRemaining = Double(workPhaseSeconds(seg) ?? 0)
    }

    private func skipCondCountIn() {
        guard let seg = currentSegment else { return }
        condCountInRemaining = 0
        condStartElapsed = lapElapsedSeconds
        startRotatingFirstPhase(seg)
        reanchorTramoDeviceWindowAtGo()
        WorkoutAudio.shared.playGo()
        Haptics.cueGo()
    }

    func tickConditioning(dt: Double) {
        guard let seg = currentSegment, let scheme = seg.formatScheme else { return }

        // Count-in: 3-2-1 with a tick on each whole-second transition, "go" at 0.
        if condCountInRemaining > 0 {
            let before = condCountInRemaining
            condCountInRemaining = max(0, before - dt)
            if before.rounded(.up) != condCountInRemaining.rounded(.up) {
                if condCountInRemaining <= 0 {
                    condStartElapsed = lapElapsedSeconds      // GO — the format clock starts now
                    startRotatingFirstPhase(seg)
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

        switch scheme.presentation {
        case .rotating:   tickRotating(dt: dt, seg: seg, scheme: scheme)
        case .fixed:      tickFixed(dt: dt, seg: seg)
        case .continuous: tickDeadline(dt: dt, seg: seg)
        case .setTable, .list: break
        }
    }

    // FIXED — AMRAP counts DOWN a fixed window and closes at 0:00; a capped For
    // Time counts UP and closes when the cap is hit (the capped finish). An open
    // For Time has no deadline → it just counts up until "Hecho".
    private func tickFixed(dt: Double, seg: WorkoutSegment) {
        // DESCANSO entre estaciones: mientras corre, la siguiente estación NO empieza
        // — ni su reloj ni su goal automático. Si no se parara aquí, el 2:00 del
        // protocolo se lo comería la estación siguiente sin que nadie lo viera.
        if fixedRestRemaining > 0 {
            let before = fixedRestRemaining
            let after = before - dt
            for boundary in [3.0, 2.0, 1.0] where before > boundary && after <= boundary {
                WorkoutAudio.shared.playTick()
                Haptics.cueTick()
            }
            if after <= 0 {
                fixedRestRemaining = 0
                fixedRestTotal = 0
                WorkoutAudio.shared.playIntervalStart()
                Haptics.cueGo()
            } else {
                fixedRestRemaining = after
            }
            tickDeadline(dt: dt, seg: seg)
            return
        }
        // A CLOCK-measured station inside the route ("2 min de bici") ends on its own
        // seconds — the one station transition that needs no machine, because the
        // thing that measures it is the clock this tick is already running. Checked
        // before the block deadline so a station never outlives the cap.
        advanceStationIfClockGoalMet()
        tickDeadline(dt: dt, seg: seg)
    }

    // Shared deadline tick for AMRAP / capped For-Time / Steady: tick the final 3s,
    // bocina + close at zero. No-op when the format has no cap/window (open clock).
    private func tickDeadline(dt: Double, seg: WorkoutSegment) {
        guard let total = seg.formatTotalSeconds else { return }
        let remaining = Double(total) - condElapsed
        let before = remaining + dt
        for boundary in [3.0, 2.0, 1.0] where before > boundary && remaining <= boundary {
            WorkoutAudio.shared.playTick()
            Haptics.cueTick()
        }
        if remaining <= 0 {
            WorkoutAudio.shared.playFinish()
            Haptics.cueFinish()
            closeConditioningAndAdvance()
        }
    }

    // ROTATING — count DOWN the current phase, tick the last 3s, roll at zero.
    private func tickRotating(dt: Double, seg: WorkoutSegment, scheme: PrescriptionScheme) {
        // A distance-based interval bout has no fixed duration → it waits for
        // "Serie hecha" / a GPS auto-lap; nothing to tick down.
        guard rotPhaseRemaining > 0 else { return }
        let before = rotPhaseRemaining
        let after = before - dt
        for boundary in [3.0, 2.0, 1.0] where before > boundary && after <= boundary {
            WorkoutAudio.shared.playTick()
            Haptics.cueTick()
        }
        if after <= 0 {
            rollRotatingPhase(seg: seg, scheme: scheme)
        } else {
            rotPhaseRemaining = after
        }
    }

    private func rollRotatingPhase(seg: WorkoutSegment, scheme: PrescriptionScheme) {
        switch scheme {
        case .deathBy:
            advanceDeathByMinute()          // a completed minute = an implicit "logré"
        case .tabata, .intervals:
            if rotPhase == .work {
                // Snapshot THIS serie's measured window BEFORE rest/next (so serie 2
                // does not blend into serie 1's lap — the erg twin of recordRunLegLap).
                if scheme == .intervals { recordErgIntervalBout(at: rotRoundIndex) }
                if let rest = seg.formatRestSeconds {
                    rotPhase = .rest
                    rotPhaseRemaining = Double(rest)
                    // "Para" — NOT the movement-change tone this used to borrow, which
                    // is the cue for "next round, different movement". Under effort the
                    // two must not sound alike.
                    WorkoutAudio.shared.playWorkEnd()
                    Haptics.cueStop()
                } else {
                    advanceRotatingRound(seg: seg)
                }
            } else {
                advanceRotatingRound(seg: seg)
            }
        default:
            break
        }
    }

    private func advanceRotatingRound(seg: WorkoutSegment) {
        let total = max(1, seg.formatRounds ?? 1)
        let next = rotRoundIndex + 1
        // Getting here means the round the athlete was in just ended — count it,
        // including the last one (which closes the block instead of advancing).
        rotRoundsCompleted = min(next, total)
        if next >= total {
            WorkoutAudio.shared.playFinish()
            Haptics.cueFinish()
            closeConditioningAndAdvance()
            return
        }
        rotRoundIndex = next
        rotPhase = .work
        rotPhaseRemaining = Double(workPhaseSeconds(seg) ?? 0)
        if rotRepsByRound.count < total {
            rotRepsByRound += Array(repeating: nil, count: total - rotRepsByRound.count)
        }
        WorkoutAudio.shared.playIntervalStart()   // work tone
        Haptics.cueGo()
    }

    private func advanceDeathByMinute() {
        guard let seg = currentSegment else { return }
        rotRoundIndex += 1                // survived another minute; the target rises
        rotPhase = .work
        rotPhaseRemaining = Double(seg.formatWorkSeconds ?? 60)
        WorkoutAudio.shared.playIntervalStart()
        Haptics.cueGo()
    }

    // The bottom primary button, routed by scheme.
    func conditioningPrimary(_ seg: WorkoutSegment) {
        if condCountInRemaining > 0 { skipCondCountIn(); return }
        switch seg.formatScheme {
        case .amrap:                                          bumpAmrapRound()
        case .tabata:                                         tabataAddRep()
        case .intervals:                                      intervalsBoutDone()
        case .deathBy:                                        deathByLogged()
        // A ROUTE closes one STATION at a time: the big button and the active line
        // do the same thing, and the last station closes the block on its own. Only
        // a format with nothing smaller than itself to close ends the block outright
        // — otherwise the biggest button on the screen skipped the rest of the WOD.
        // Una lista de RONDAS tiene algo más pequeño que ella misma: la ronda. El
        // mismo principio — el botón cierra RONDA a ronda y la última cierra el
        // bloque sola (11-ago, el contador de rondas).
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim:
            if seg.fixedListIsStations || fixedListTotal > 1 { markRoundDone() }
            else { closeConditioningAndAdvance() }
        case .steady:                                         closeConditioningAndAdvance()
        default:                                              lap()
        }
    }

    // MARK: Conditioning actions (called by the format HUDs / the view)

    /// AMRAP "+ Ronda" — one tap per completed round; the partial-round rep tally
    /// resets for the new round. The block auto-closes when the window hits 0:00.
    func bumpAmrapRound() {
        guard isConditioningActive, condCountInRemaining <= 0, !isPaused, !isFinished else { return }
        fixedRoundsDone += 1
        repsCurrentSegment = 0
        WorkoutAudio.shared.playIntervalStart()
        Haptics.cueGo()
    }

    /// AMRAP partial-round rep tally (+/−1).
    func amrapAddRep(_ delta: Int) {
        guard isConditioningActive, !isPaused, !isFinished else { return }
        repsCurrentSegment = max(0, repsCurrentSegment + delta)
        Haptics.light()
    }

    /// For Time / Chipper / Ladder list strike — records the split, advances the
    /// active line; the LAST item closes the block (the final time).
    ///
    /// `auto` = the STATION closed itself because its goal was met (the monitor hit
    /// the metres, the box ran out) rather than the athlete tapping. Same close, same
    /// record — only the cue differs, because a transition he did not ask for has to
    /// announce itself: he is not looking at the phone, he is gasping at a rower.
    func markRoundDone(auto: Bool = false) {
        guard isConditioningActive, condCountInRemaining <= 0, !isPaused, !isFinished else { return }
        let total = fixedListTotal
        guard fixedRoundsDone < total else { return }
        // Read the closing window BEFORE the cursor moves — one line later these
        // accessors already answer for the station he is walking into.
        // `tramoRecordedSeconds`, never the displayed one: a station closed while the
        // clock is still armed did happen, it just wasn't measured by a monitor, and
        // saving its 0:00 turns "unmeasured" into "instant".
        //
        // Una lista de RONDAS (no estaciones) no re-ancla su ventana de tramo: el
        // cursor es `.segment` y `tramo.key` no cambia al marcar, así que
        // `tramoRecordedSeconds` acumula desde el arranque del bloque. El parcial
        // honesto de la ronda son los DELTAS del reloj del bloque — y las lecturas
        // de máquina, que tampoco re-anclan, ahí no afirman nada (nil, no un
        // acumulado disfrazado de ronda).
        let esEstacion = currentTramo.isFixedStation
        fixedRoundSplits.append(FixedStationSplit(
            elapsed: condElapsed,
            seconds: esEstacion ? tramoRecordedSeconds
                                : condElapsed - (fixedRoundSplits.last?.elapsed ?? 0),
            meters: esEstacion ? tramoErgDistanceMeters : nil,
            calories: esEstacion ? tramoErgCalories : nil
        ))
        fixedRoundsDone += 1
        if auto { Haptics.cueGo() } else { Haptics.medium() }
        if fixedRoundsDone >= total {
            WorkoutAudio.shared.playFinish()
            closeConditioningAndAdvance()
        } else {
            // El descanso que prescribió la estación que ACABA de cerrarse (índice
            // fixedRoundsDone - 1, ya movido el cursor). Solo entre estaciones: tras
            // la última se cierra el bloque, y ahí el descanso lo pone el gate del
            // siguiente bloque, no esto.
            beginFixedRest(seg: currentSegment, closedStation: fixedRoundsDone - 1)
            WorkoutAudio.shared.playIntervalStart()
            // Open the new window HERE rather than on the next tick, so the station's
            // clock and its device counters start at the strike and not up to a
            // quarter of a second into it. Idempotent — the tick's own call is a no-op
            // once the key is stable.
            syncTramoIfNeeded()
        }
    }

    /// Arranca el descanso que la estación recién cerrada declaraba, si declaraba
    /// alguno. Silencioso (0) para todo lo que no lo prescribe — una simulación
    /// HYROX va seguida a propósito, así que aquí no aparece ninguna pausa que el
    /// coach no haya pedido.
    private func beginFixedRest(seg: WorkoutSegment?, closedStation: Int) {
        guard let seg, seg.fixedListIsStations,
              let rest = seg.rotationSet(at: closedStation)?.restS, rest > 0 else {
            fixedRestRemaining = 0
            fixedRestTotal = 0
            return
        }
        fixedRestTotal = Double(rest)
        fixedRestRemaining = Double(rest)
    }

    /// Cortar el descanso y entrar ya en la siguiente estación. El descanso de un
    /// protocolo es parte del protocolo, así que expira solo; esto existe para el
    /// atleta que decide seguir, no para saltárselo por defecto.
    func skipFixedRest() {
        guard fixedRestRemaining > 0 else { return }
        fixedRestRemaining = 0
        fixedRestTotal = 0
        Haptics.light()
    }

    /// Undo the last For Time / Chipper / Ladder strike (a mis-tap), restoring the
    /// previous split.
    func unmarkLastRound() {
        guard isConditioningActive, condCountInRemaining <= 0, !isPaused, !isFinished else { return }
        guard fixedRoundsDone > 0 else { return }
        fixedRoundsDone -= 1
        if !fixedRoundSplits.isEmpty { fixedRoundSplits.removeLast() }
        Haptics.light()
    }

    /// Tabata per-round rep tally (the classic min-reps score). The bottom "+ Reps"
    /// adds one; the in-HUD stepper passes ±1.
    ///
    /// A round starts UNDECLARED (nil), not at 0: counting reps is optional, and a
    /// round nobody counted is unknown, not a zero. The first tap declares it — from
    /// there 0 is a legal, real value (you failed the round), reachable with +1 then
    /// −1. That distinction is what keeps `capturedScoreReps` from inventing a score.
    func tabataAddRep(_ delta: Int = 1) {
        guard isConditioningActive, condCountInRemaining <= 0, !isPaused, !isFinished else { return }
        guard rotRepsByRound.indices.contains(rotRoundIndex) else { return }
        rotRepsByRound[rotRoundIndex] = max(0, (rotRepsByRound[rotRoundIndex] ?? 0) + delta)
        Haptics.light()
    }

    /// Intervals "Serie hecha" — end the current work bout (→ rest, or the next
    /// round when there's no rest), e.g. a distance bout finished by feel/GPS —
    /// or by the monitor crossing the bout's m/cal goal (`auto: true`).
    func intervalsBoutDone(auto: Bool = false) {
        guard isConditioningActive, condCountInRemaining <= 0, !isPaused, !isFinished,
              let seg = currentSegment else { return }
        if auto { Haptics.cueGo() } else { Haptics.medium() }
        if rotPhase == .work {
            rollRotatingPhase(seg: seg, scheme: .intervals)
        } else {
            advanceRotatingRound(seg: seg)
        }
    }

    /// Machine-crossed goal on a plain erg segment → same as `lap()` without the
    /// medium haptic (the auto path already fired cueGo).
    func lapFromMachine() {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, currentSegment != nil else { return }
        let origin = currentSegmentIndex
        closeCurrentSegmentLap()
        if currentSegmentIndex < plan.segments.count - 1 {
            currentSegmentIndex += 1
            enterOrArm(from: origin)
        } else {
            finishPrescribedWork()
        }
    }

    /// Machine-crossed goal on a steady conditioning block.
    func closeConditioningAndAdvanceFromMachine() {
        guard isConditioningActive, !isPaused, !isFinished else { return }
        closeConditioningAndAdvance()
    }

    /// Death By "Lo logré" — completed this minute's target; advance to the next
    /// (the target rises). Auto-roll on the minute does the same implicitly.
    func deathByLogged() {
        guard isConditioningActive, condCountInRemaining <= 0, !isPaused, !isFinished else { return }
        advanceDeathByMinute()
    }

    /// Death By "Fallé" — missed this minute's target; the block ends. Score =
    /// rounds survived (the last full minute completed).
    func deathByFail() {
        guard isConditioningActive, !isFinished else { return }
        deathByFailed = true
        // The block ends, but missing the minute is not a win — the STOP cue, never
        // the finish one.
        Haptics.cueStop()
        WorkoutAudio.shared.playFinish()
        closeConditioningAndAdvance()
    }

    // Capture the PRINCIPAL conditioning block's headline score before the engine
    // is torn down. Idempotent: a no-op once the engine has cleared (so the
    // close-then-finish path can't re-capture zeros over the real result).
    func captureConditioningScore() {
        guard condSegmentIndex == currentSegmentIndex,
              let seg = currentSegment, let scheme = seg.formatScheme,
              scheme == plan.format else { return }
        switch scheme {
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim:
            let elapsed = Int(condElapsed.rounded())
            capturedScoreTimeSeconds = seg.formatTotalSeconds.map { min(elapsed, $0) } ?? elapsed
        case .amrap:
            capturedScoreRounds = fixedRoundsDone
            capturedScoreReps = repsCurrentSegment
        case .deathBy:
            capturedScoreRounds = rotRoundIndex          // minutes survived
        case .tabata:
            // Rounds DONE, never the rounds prescribed: abandoning at round 3 of 8
            // used to be sealed as 8. The min-reps score exists only when every
            // round that ran was counted — a minimum over a subset is a lower bound,
            // not the score, and counting is optional, so most Tabatas have none.
            capturedScoreRounds = rotRoundsCompleted > 0 ? rotRoundsCompleted : nil
            let counted = rotRepsByRound.prefix(rotRoundsCompleted)
            capturedScoreReps = (!counted.isEmpty && counted.allSatisfy { $0 != nil })
                ? counted.compactMap { $0 }.min()
                : nil
        default:
            break
        }
    }

    // Close the conditioning segment's lap (reusing the standard close path) and
    // advance to the next segment, or finish the session — mirrors
    // `closeEMOMAndAdvance`. Crossing into the next block parks on its preview.
    private func closeConditioningAndAdvance() {
        let wasLast = isLastSegment
        let origin = currentSegmentIndex
        captureConditioningScore()
        clearConditioning()
        closeCurrentSegmentLap()
        if wasLast {
            finishPrescribedWork()
        } else {
            currentSegmentIndex += 1
            enterOrArm(from: origin)
        }
    }
}
