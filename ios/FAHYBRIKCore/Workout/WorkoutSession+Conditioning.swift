import Foundation

// EL MOTOR DE LOS FORMATOS CON RELOJ que no son EMOM: For Time / AMRAP / Tabata /
// Intervals / Death By / Steady / Chipper / Ladder / Rounds / simulación HYROX.
// Autocontenido y paralelo al EMOM (al que no toca): una cuenta atrás 3-2-1 y
// después un reloj FIJO (arriba o abajo), un reloj ROTATIVO de trabajo/descanso, o
// una cuenta atrás CONTINUA — todo del mismo latido, con las mismas señales.
extension WorkoutSession {
    // MARK: Conditioning accessors (read by the format HUDs)

    /// True when the current segment runs a non-EMOM conditioning timer.
    var isConditioningActive: Bool { condSegmentIndex != nil }

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
        countInRemaining = Self.countInSeconds
        restEndsTramo = false
        runProgress.reset()
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

    func startRotatingFirstPhase(_ seg: WorkoutSegment) {
        guard seg.formatScheme?.presentation == .rotating else { return }
        rotPhase = .work
        workRemaining = Double(workPhaseSeconds(seg) ?? 0)
        restRemainingSeconds = 0
        restEndsTramo = false
        resetBeltWorkElapsed()
    }

    func rollRotatingPhase(seg: WorkoutSegment, scheme: PrescriptionScheme) {
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
                    restRemainingSeconds = Double(rest)
                    restTotalSeconds = Double(rest)
                    restEndsTramo = true
                    workRemaining = 0
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
        resetBeltWorkElapsed()
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
        resetBeltWorkElapsed()
        WorkoutAudio.shared.playIntervalStart()
        Haptics.cueGo()
    }

    // MARK: Conditioning actions (score and station close)

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

    /// Arranca el descanso que la ronda recién cerrada declaraba, si declaraba
    /// alguno. Silencioso (0) para todo lo que no lo prescribe — una simulación
    /// HYROX va seguida a propósito, así que aquí no aparece ninguna pausa que el
    /// coach no haya pedido.
    ///
    /// DOS PUERTAS QUE ESTABAN DE MÁS (card 146). El 24-ago un bloque de 10 rondas
    /// de SkiErg con 45 s de descanso escritos se encadenó SIN NINGUNO, y el
    /// atleta lo cortó a la cuarta.
    ///
    /// La primera puerta exigía que el bloque fuera una RUTA de estaciones
    /// distintas. Diez rondas del mismo ejercicio no lo son, así que no descansaba
    /// nunca — pero el descanso entre rondas iguales es tan real como el de entre
    /// estaciones. Quien decide si hay pausa es el coach al escribirla, no la
    /// forma del bloque.
    ///
    /// La segunda sólo miraba el descanso de la SERIE. El coach lo escribe UNA vez
    /// para el ejercicio, no repetido en cada ronda — es el mismo agujero que ya
    /// se tapó en las tablas de hierro, y se tapó sólo allí. Aquí se aplica la
    /// misma precedencia: manda el de la ronda si lo tiene, y si no el del
    /// ejercicio.
    ///
    /// Lo que NO cambia: sin descanso escrito no aparece ninguno. Un simulacro
    /// sigue yendo seguido.
    private func beginFixedRest(seg: WorkoutSegment?, closedStation: Int) {
        let rest = seg.flatMap { s in
            s.rotationSet(at: closedStation)?.restS ?? s.prescription?.restS
        } ?? 0
        guard rest > 0 else {
            restRemainingSeconds = 0
            restTotalSeconds = 0
            restEndsTramo = false
            return
        }
        restTotalSeconds = Double(rest)
        restRemainingSeconds = Double(rest)
        restEndsTramo = true
    }

    /// Undo the last For Time / Chipper / Ladder strike (a mis-tap), restoring the
    /// previous split.
    func unmarkLastRound() {
        guard isConditioningActive, condCountInRemaining <= 0, !isFinished else { return }
        guard fixedRoundsDone > 0 else { return }
        fixedRoundsDone -= 1
        if !fixedRoundSplits.isEmpty { fixedRoundSplits.removeLast() }
        Haptics.light()
    }

    func restoreConditioningHold(_ hold: ConditioningUndoHold) {
        condSegmentIndex = currentSegmentIndex
        condCountInRemaining = 0
        condStartElapsed = 0
        fixedRoundsDone = hold.roundsDone
        fixedRoundSplits = hold.splits
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
    // Internal: `closeTramo` in Lifecycle calls this. `private` is file-scoped.
    func closeConditioningAndAdvance() {
        let wasLast = isLastSegment
        let origin = currentSegmentIndex
        captureConditioningScore()
        if wasLast, fixedRoundsDone > 0 {
            conditioningUndoHold = ConditioningUndoHold(
                segmentIndex: currentSegmentIndex,
                roundsDone: fixedRoundsDone,
                splits: fixedRoundSplits)
        }
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
