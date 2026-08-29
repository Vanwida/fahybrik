import Foundation

// LA MÁQUINA DE LA SESIÓN: arrancar y parar el motor, pausar (a mano y sola),
// avanzar / retroceder / saltar, la puerta de bloque que pide el visto bueno del
// atleta, y terminar. Es quien decide CUÁNDO se entra en un tramo; los motores de
// cada formato (EMOM, conditioning, carrera) deciden QUÉ pasa dentro.
extension WorkoutSession {
    func start() {
        // AUDIT-3 — (re)enable persistence for this workout; a previous session may
        // have closed the store on finish/discard.
        Task { await WorkoutStateStore.shared.open() }
        guard timer == nil else { return }
        lastTick = Date()
        // `.common` so ticks (and with them cue haptics / audio) keep firing while
        // the user scrolls the live HUD — default `.default` mode dies mid-gesture
        // and was a silent killer of 3-2-1 buzzes on the wrist standalone path.
        let t = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
            self?.tick()
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
        // First appearance: ARM the current block (show its preview, hold the
        // clock) so the session begins with the athlete's approval, not a timer
        // that's already running. A crash-recovered EMOM keeps its live interval
        // state (emomSegmentIndex != nil) and resumes running, exactly as before.
        // Re-appearances (hasArmedInitial) just resume the timer — they never
        // re-arm a block mid-session.
        if !hasArmedInitial {
            hasArmedInitial = true
            #if os(iOS)
            AudioCoach.shared.beginWorkout()   // fresh voice-coaching state for this workout (#63, iOS-only)
            #endif
            if emomSegmentIndex == nil { armBlock() }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        WorkoutAudio.shared.deactivate()
    }

    func togglePause() {
        Haptics.medium()
        // A MANUAL action always wins over auto-pause: pausing by hand makes it a
        // manual hold (never auto-resumed), and resuming by hand clears any
        // auto-pause that was holding the clock.
        autoPaused = false
        if isPaused {
            isPaused = false
            lastTick = Date()
        } else {
            isPaused = true
        }
    }

    func beginAutoPauseEvaluation() { autoPauseEvaluadores += 1 }

    func endAutoPauseEvaluation() {
        autoPauseEvaluadores = Swift.max(0, autoPauseEvaluadores - 1)
        guard autoPauseEvaluadores == 0 else { return }
        autoResume()
    }

    /// Engage AUTO-pause (outdoor GPS #64): the athlete stopped moving, so freeze the
    /// clock exactly like a manual pause — `elapsedSeconds` then measures MOVING time
    /// and the covered pace stays honest — while remembering that WE paused, so
    /// resumed movement can lift it. No-op when already paused / finished / parked on
    /// a block preview. The caller owns the haptic + the non-modal "Auto-pausa" banner.
    /// Sin evaluador registrado no se auto-pausa: ver `autoPauseEvaluadores`.
    func autoPause() {
        guard !isPaused, !isFinished, !isAwaitingBlockStart else { return }
        // Sin nadie vigilando no se auto-pausa: nadie podría deshacerlo.
        guard autoPauseEvaluadores > 0 else { return }
        isPaused = true
        autoPaused = true
    }

    /// Resume from an AUTO-pause when movement returns. ONLY lifts a pause WE set — a
    /// manual pause (autoPaused == false) is the athlete's own hold and is never
    /// touched. Resets the tick baseline so the clock can't jump by the stopped span.
    func autoResume() {
        guard isPaused, autoPaused, !isFinished else { return }
        isPaused = false
        autoPaused = false
        lastTick = Date()
    }

    /// Pause the clock for a transient, NON-modal interruption — e.g. the athlete
    /// taps the technique video mid-set. Unlike `togglePause` it fires no haptic
    /// and never drives the pause modal. Returns true only when it actually paused
    /// a running clock, so the caller knows whether to resume on dismiss (an
    /// already-paused or finished session is left untouched).
    @discardableResult
    func pauseForVideo() -> Bool {
        guard !isPaused, !isFinished else { return false }
        isPaused = true
        return true
    }

    /// Resume after `pauseForVideo`. Resets the tick baseline so the elapsed
    /// clock can't jump by the time the video sheet was open.
    func resumeFromVideo() {
        guard isPaused, !isFinished else { return }
        isPaused = false
        lastTick = Date()
    }

    func tap(reps: Int = 1) {
        guard !isPaused, !isFinished, !isAwaitingBlockStart else { return }
        repsCurrentSegment = max(0, repsCurrentSegment + reps)
        repsConfirmed = true
        repsSkipped = false
        registerFirstWorkingSet()
    }

    /// Stepper setter for the pre-filled rep HUD — sets the ACTUAL reps and marks
    /// the value confirmed (the athlete touched it), clearing any skip.
    func setReps(_ value: Int) {
        guard !isFinished else { return }
        repsCurrentSegment = max(0, value)
        repsConfirmed = true
        repsSkipped = false
        registerFirstWorkingSet()
    }

    /// Explicit SKIP for the current rep/strength segment → actual = null,
    /// status = skipped. Toggleable so a mis-tap is reversible before advancing.
    func setRepsSkipped(_ skipped: Bool) {
        guard !isFinished else { return }
        repsSkipped = skipped
        repsConfirmed = true
    }

    // MARK: - Forward / back navigation
    //
    // ONE path drives the bottom primary button, the back chevron, the phase rail
    // and the segment stepper: `primaryAdvance` (forward one step), `stepBack`
    // (back one step, REOPENING the previous segment / interval), and `jumpTo`
    // (the rail / stepper shortcut — close-then-skip forward, or reopen backward).

    /// The bottom primary button. For an EMOM it advances the PHASE — finishing the
    /// work early lands on the change window (you still have to move to the next
    /// station), and tapping during the change starts the next round; a plain EMOM
    /// has no change, so it advances the interval exactly as it always did. This is
    /// the same behaviour the rotating engine gives "Serie hecha". For every other
    /// format it closes the current segment's lap and advances — the classic manual
    /// lap, unchanged.
    ///
    /// EL AVANCE ES SIEMPRE DEL ESCALÓN MÁS PEQUEÑO QUE TIENES DELANTE, y por eso
    /// vive AQUÍ y no en una vista. Cada formato ya declaraba cuál es su escalón
    /// —la fase del EMOM, la ronda del rotativo, la pierna de la carrera— menos la
    /// FUERZA, cuyo escalón es LA SERIE y cuya regla («con series pendientes no se
    /// cierra el ejercicio») solo existía dentro de `FuerzaVivoView`. Cualquier otro
    /// mando que llame a este método —el botón «Siguiente» del reloj, vía
    /// `PhoneMirrorService.applyCommand`— se la saltaba: un toque en la muñeca
    /// durante la serie 1 de press de banca cerraba el ejercicio ENTERO y saltaba al
    /// curl. Y como los dos ejercicios comparten bloque, el salto era mudo (sin
    /// preview intermedia) y el descanso que sonaba ya era el del curl. Los dos
    /// fallos del gym del 4-ago son el mismo agujero: una regla de dominio metida en
    /// una pantalla.
    /// UN TOQUE DE MÁS NO CUESTA UNA SERIE (card 113). El 20-ago un doble toque
    /// sin querer cerró dos series seguidas: el trabajo no se pierde, pero el
    /// atleta acaba mirando una pantalla que no es la suya sin saber si ha roto
    /// algo. Dos avances separados por menos de `avanceMinimoEntreToques` no son
    /// dos intenciones: son un dedo.
    ///
    /// `fromAthleteTap` existe porque esto NO es una regla del dominio sino
    /// higiene de la entrada: el antirrebote protege DEDOS, no avances. El motor
    /// se conduce a sí mismo mucho más rápido que ninguna mano —el reloj rotativo
    /// de un Death By, el encadenado de tramos de una serie, el cierre automático
    /// de una estación al llegar a sus metros— y frenar eso rompía veinte pruebas
    /// que reproducen entrenos reales.
    ///
    /// Vive aquí y no en la pantalla para que valga IGUAL para el botón grande del
    /// móvil y para el «Siguiente» de la muñeca, que entran los dos por esta
    /// puerta. Sólo tienen que marcarlo los dos sitios donde hay un dedo detrás; el
    /// defecto no frena nada, que es el comportamiento de siempre.
    func primaryAdvance(fromAthleteTap: Bool = false) {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, currentSegment != nil else { return }
        if fromAthleteTap {
            let ahora = Date()
            if let ultimo = lastPrimaryAdvanceAt,
               ahora.timeIntervalSince(ultimo) < Self.avanceMinimoEntreToques {
                return
            }
            lastPrimaryAdvanceAt = ahora
        }
        if countInRemaining > 0 { skipCountIn(); return }
        if restRemainingSeconds > 0, !restEndsTramo {
            dismissRest()
            return
        }
        closeTramo(auto: false)
    }

    /// Close the current window. Manual tap and auto-close (clock, GPS, erg) share this.
    func closeTramo(auto: Bool = false) {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, let seg = currentSegment else { return }
        if currentSegmentIsPartnerRelay {
            advanceRelay()
            return
        }
        if restRemainingSeconds > 0, restEndsTramo {
            let listRest = seg.fixedListIsStations || seg.strikesAreTramos
            restRemainingSeconds = 0
            restTotalSeconds = 0
            restEndsTramo = false
            if listRest {
                syncTramoIfNeeded()
                return
            }
        }
        switch currentTramo.cursor {
        case .runLeg:
            advanceRunLeg(auto: auto)
        case .emomInterval:
            guard let plan = seg.emomPlan else { return }
            rollEMOMPhase(plan)
        case .fixedStation:
            markRoundDone(auto: auto)
        case .conditioningRound:
            guard let scheme = seg.formatScheme else { return }
            if scheme == .intervals {
                intervalsBoutDone(auto: auto)
            } else {
                rollRotatingPhase(seg: seg, scheme: scheme)
            }
        case .strengthSet:
            if let i = pendingSetIndex { confirmSet(i); return }
            lap()
        case .segment:
            if seg.strikesAreTramos {
                markRoundDone(auto: auto)
            } else if seg.isConditioningTimer {
                closeConditioningAndAdvance()
            } else {
                lap()
            }
        }
    }

    /// La serie que el atleta tiene delante: la primera sin confirmar y sin saltar.
    /// Nil cuando el tramo no va por series o cuando ya están todas cerradas — y
    /// entonces el escalón vuelve a ser el ejercicio.
    var pendingSetIndex: Int? {
        guard currentSegment?.usesMultiSetStrength == true else { return nil }
        return setRecords.firstIndex { !$0.confirmed && $0.status != "skipped" }
    }

    // Closes current segment's lap, advances to next. Behavior shared by For
    // Time / AMRAP / Circuit / HYROX Sim. EMOM auto-advances its intervals instead.
    func lap() {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, currentSegment != nil else { return }
        Haptics.medium()
        let origin = currentSegmentIndex
        closeCurrentSegmentLap()
        if currentSegmentIndex < plan.segments.count - 1 {
            currentSegmentIndex += 1
            enterOrArm(from: origin)
        } else {
            finishPrescribedWork()
        }
    }

    /// #23 — advance past a PARTNER relay station. In HYROX dobles the partner
    /// works this station while the athlete recovers, so the athlete logs NOTHING:
    /// we DISCARD any live state and close NO work lap (mirrors jumpTo's "skipped →
    /// no lap"), so the station never enters this athlete's volume/analytics. The
    /// relay time still elapses on the session clock. Advances to the next segment
    /// (or finishes on the last).
    func advanceRelay() {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, currentSegment != nil else { return }
        Haptics.medium()
        let origin = currentSegmentIndex
        discardCurrentLiveState()
        if currentSegmentIndex < plan.segments.count - 1 {
            currentSegmentIndex += 1
            enterOrArm(from: origin)
        } else {
            finishPrescribedWork()
        }
    }

    /// Lo que separa dos toques distintos de un dedo torpe. Medido contra el caso
    /// real: un doble toque accidental cae muy por debajo; cerrar dos series a
    /// propósito tan seguido no lo hace nadie con una barra en las manos.
    static let avanceMinimoEntreToques: TimeInterval = 0.8

    /// Un toque: deshace el último avance y sigue en vivo. La tabla es `LiveUndo`.
    func stepBack() {
        guard !isFinished else { return }
        switch LiveUndo.action(for: liveUndoCursor) {
        case .unconfirmLastSet:
            unconfirmLastSet()
        case .unmarkLastRound:
            unmarkLastRound()
        case .reopenFromFinish:
            reopenFromFinishDecision()
        case .stepBackEmom:
            stepBackEMOMInterval()
        case .parkBlockGate:
            Haptics.light()
            armBlock()
        case .stepBackSegment:
            stepBackSegment()
        case .noop:
            return
        }
    }

    private func stepBackEMOMInterval() {
        guard let seg = currentSegment, seg.isEMOM, emomIntervalIndex > 0 else { return }
        Haptics.light()
        emomIntervalIndex -= 1
        emomCompletedIntervals = min(emomCompletedIntervals, emomIntervalIndex)
        emomPhase = .work
        emomPhaseRemaining = Double(seg.emomPlan?.workSeconds ?? 60)
        WorkoutAudio.shared.playIntervalStart()
    }

    private func stepBackSegment() {
        guard currentSegmentIndex > 0 else { return }
        Haptics.light()
        let origin = currentSegmentIndex
        clearEMOMState()
        clearConditioning()
        clearRunStructure()
        currentSegmentIndex -= 1
        reopenCurrentSegment()
        enterOrArm(from: origin)
    }

    /// El último avance cerró el plan. Se reabre ese tramo y se sigue en vivo.
    func reopenFromFinishDecision() {
        guard isAwaitingFinishDecision, !isFinished else { return }
        isAwaitingFinishDecision = false
        finishDecisionMade = false
        isExtraWork = false
        Haptics.light()
        reopenCurrentSegment()
        if let hold = conditioningUndoHold, hold.segmentIndex == currentSegmentIndex {
            restoreConditioningHold(hold)
            unmarkLastRound()
            conditioningUndoHold = nil
        }
        isPaused = false
        lastTick = Date()
    }

    /// Jump to an arbitrary segment (phase rail / stepper). Forward closes the
    /// current segment then SKIPS the intermediate ones (they produce no lap — not
    /// performed); backward reopens segment-by-segment until the target.
    func jumpTo(_ index: Int) {
        guard !isPaused, !isFinished, !isAwaitingBlockStart,
              index >= 0, index < plan.segments.count, index != currentSegmentIndex else { return }
        Haptics.medium()
        let origin = currentSegmentIndex
        clearEMOMState()
        clearConditioning()
        clearRunStructure()
        if index > currentSegmentIndex {
            closeCurrentSegmentLap()
            currentSegmentIndex = index
        } else {
            discardCurrentLiveState()
            while currentSegmentIndex > index {
                currentSegmentIndex -= 1
                reopenCurrentSegment()
            }
        }
        // A jump that lands in a DIFFERENT block (the phase rail always does)
        // shows that block's preview; a jump within the same block runs straight in.
        enterOrArm(from: origin)
    }

    /// The prescription just ran out on its own. EVERY natural-completion path goes
    /// through here instead of straight to `finish()`, so the athlete is asked once
    /// whether that is the end of his session — the prescribed work is already
    /// closed into its lap either way, so answering "seguir" costs him nothing and
    /// answering "terminar" saves exactly what it used to.
    ///
    /// The question is asked ONCE per session: after he chooses to keep going, the
    /// engine never interrupts him again and he closes the session himself.
    func finishPrescribedWork() {
        guard !isFinished else { return }
        guard !finishDecisionMade else { finish(); return }
        finishDecisionMade = true
        isAwaitingFinishDecision = true
        Haptics.cueFinish()
        WorkoutAudio.shared.playFinish()
    }

    /// "Seguir entrenando" — the prescribed work stays recorded exactly as it was
    /// closed; the session simply stays open and the clock runs again. Extra work is
    /// extra: nothing already logged is reopened or altered.
    func continueAfterPrescribedWork() {
        guard isAwaitingFinishDecision else { return }
        isAwaitingFinishDecision = false
        isExtraWork = true
        isPaused = false
        lastTick = Date()
        resetTramoWindow()
        Haptics.cueGo()
    }

    /// End the session and route to the post-workout summary. `completeness` is the
    /// EARNED outcome: `.full` only when the protocol ran to its end (the default,
    /// the happy path); `.partial` when the athlete terminated early ("Terminar y
    /// guardar" / "Terminar bloque"). The summary reads it to mark the assignment
    /// 'completed' vs 'partial' — never a fabricated completion. Discarding
    /// (ABANDONAR) does NOT come through here: it saves nothing.
    func finish(completeness: WorkoutCompleteness = .full) {
        self.completeness = completeness
        isAwaitingFinishDecision = false
        conditioningUndoHold = nil
        Haptics.cueFinish()
        // Capture the in-flight conditioning score before the engine is torn down
        // (a "Terminar y guardar" mid-AMRAP keeps the rounds so far). No-op when
        // the engine already closed itself via `closeConditioningAndAdvance`.
        captureConditioningScore()
        captureEMOMScore()   // a "Terminar y guardar" mid-EMOM keeps X/Y rondas (#break-1)
        clearEMOMState()
        clearConditioning()
        clearRunStructure()
        // Close the in-flight segment so the final segment is never dropped from
        // the execution record (finish can be reached via the last lap auto-finish,
        // "Terminar bloque", or "Terminar y guardar" mid-session). lap() will have
        // already closed and zeroed lapElapsedSeconds, so a residual >0 means work
        // is pending. A structural warmup/cooldown only ever logs via its own
        // "hecho" button — an untapped one emits NO row (null = not done).
        if !isFinished, currentSegment != nil, lapElapsedSeconds > 0, !currentBlockIsStructural {
            closeCurrentSegmentLap()
        }
        // HRR anchor: recovery offsets measure from the moment the EFFORT ended.
        // First finish wins (finish can re-enter via auto-finish + button races).
        if finishedAt == nil { finishedAt = Date() }
        isFinished = true
        // Voice the total time BEFORE stop() tears the tone session down — the coach
        // holds the session active for the cue and releases it when the cue ends (#63).
        #if os(iOS)
        AudioCoach.shared.finishWorkout(totalSeconds: Int(elapsedSeconds.rounded()))
        #endif
        stop()
        // AUDIT-2/3 — CLOSE (clear + latch) instead of saving: a finished session must
        // never be re-offered as "recuperar entreno en curso", and the latch stops a
        // late autosave Task from re-creating the snapshot after this.
        Task { await WorkoutStateStore.shared.close() }
    }

    /// AUDIT-3 — abandon (clean exit, nothing recorded): stop the engine, then close
    /// persistence. Ordered through the store's latch so a late autosave can never
    /// resurrect the discarded session.
    func discardAndClose() {
        stop()
        Task { await WorkoutStateStore.shared.close() }
    }

    /// Open the post-effort HRR window (tests guiados). Called by the container
    /// right after a LIVE finish when the test's contract asks for an `hrr`
    /// result; a no-op otherwise. Snapshots the effort tail (hr_end) and starts
    /// accepting recovery samples through `injectLiveHR` for the next 90 s.
    func beginRecoveryWindow(now: Date = Date()) {
        guard isFinished, hrRecovery == nil else { return }
        let anchor = finishedAt ?? now
        let tail = recentEffortHR.map {
            (secondsBeforeFinish: anchor.timeIntervalSince($0.date), bpm: $0.bpm)
        }
        hrRecovery = HRRecoveryCapture(effortTail: tail)
    }

    // MARK: - Segment entry / EMOM lifecycle

    // MARK: Block-transition gate

    /// Decide, after a move that changed `currentSegmentIndex`, whether we crossed
    /// a BLOCK boundary (→ park on the new block's preview) or merely moved within
    /// the same block (→ enter it running, keeping intra-block auto-advance). The
    /// block a segment belongs to is its `blockGroupingKey`; comparing origin vs
    /// destination is the single boundary test for forward, back AND jump moves.
    func enterOrArm(from origin: Int) {
        if blockKey(at: origin) != blockKey(at: currentSegmentIndex) {
            armBlock()
        } else if cambiaDeEjercicioConMaterial(desde: origin) {
            armNextExercise()
        } else {
            onEnterSegment()
        }
    }

    /// EL PASO ANTES DEL SIGUIENTE EJERCICIO (card 112). Alex, sesión del 20-ago:
    /// «Al acabar las series de Deadlift pasó solo a Romanian Deadlift. El atleta
    /// no tenía los discos listos y el reloj ya había empezado».
    ///
    /// La puerta se pone SÓLO cuando cambiar de ejercicio significa cambiar de
    /// material, o sea en el hierro y el trineo. En un metcon o un circuito
    /// encadenar ES el ejercicio: meter una puerta entre los burpees y las wall
    /// balls rompería el entreno en vez de arreglarlo.
    ///
    /// Y sólo hacia ADELANTE: volver atrás ya tiene su propio comportamiento
    /// (card 115) y aparcar también al retroceder haría falta tocar dos veces
    /// para deshacer un paso.
    private func cambiaDeEjercicioConMaterial(desde origin: Int) -> Bool {
        guard currentSegmentIndex > origin, let seg = currentSegment else { return false }
        return seg.kind == .strength || seg.kind == .sled
    }

    /// Aparca en la puerta del ejercicio que viene. Hermana de `armBlock()`, pero
    /// SIN tocar el Rx/Scaled: eso es del bloque, y aquí el bloque no ha cambiado.
    private func armNextExercise() {
        primeManualLoadIfNeeded()
        primeRepsIfNeeded()
        primeSetsIfNeeded()
        isPaused = false
        isAwaitingBlockStart = true
        awaitingGate = .nextExercise
    }

    /// El «Empezar» de la puerta del ejercicio. Mismo gesto que `beginBlock()` —
    /// existe con su propio nombre porque la pantalla que lo llama es otra y el
    /// código tiene que poder leerse sin ir a mirar qué puerta era.
    func beginNextExercise() {
        beginBlock()
    }

    private func blockKey(at index: Int) -> String? {
        guard index >= 0, index < plan.segments.count else { return nil }
        return plan.segments[index].blockGroupingKey
    }

    /// Park on the current block's PREVIEW: tear down any running EMOM so the
    /// preview never shows stale interval state, prime the strength load, and clear
    /// a stale pause (the gate is its own hold). The clock stays frozen until
    /// `beginBlock`. Does NOT touch a reopened lap — a back-step into an earlier
    /// block keeps its restored progress, ready to resume on Empezar.
    func armBlock() {
        awaitingGate = .block
        clearEMOMState()
        clearConditioning()
        clearRunStructure()
        // A new block resets the block-scoped Rx/Scaled choice; priming re-defaults
        // it to "rx" for a metcon block (nil otherwise).
        rxScaled = nil
        scaledNote = nil
        primeManualLoadIfNeeded()
        primeRepsIfNeeded()
        primeSetsIfNeeded()
        primeRxScaledIfNeeded()
        isPaused = false
        isAwaitingBlockStart = true
    }

    /// "Empezar" — leave the preview and START the current block. Resets the tick
    /// baseline (no elapsed jump), then runs the real segment entry: an EMOM kicks
    /// its 3-2-1 count-in + audio AFTER this tap (never as a between-blocks
    /// transition); every other format just starts its clock.
    func beginBlock() {
        guard isAwaitingBlockStart, !isFinished else { return }
        isAwaitingBlockStart = false
        awaitingGate = nil
        isPaused = false
        lastTick = Date()
        Haptics.medium()
        onEnterSegment()
    }

    /// "Terminar bloque" — end the CURRENT block before it's complete (e.g. an
    /// EMOM 15 abandoned at round 12 because the athlete is spent). The in-flight
    /// segment is recorded HONESTLY: `closeCurrentSegmentLap` logs only the real
    /// elapsed time + work actually done — never the full prescription — and any
    /// remaining segments of this block are SKIPPED (not performed → no lap), so
    /// the block reads as partial in the execution, not 100% complete. Then it
    /// parks on the next block's preview, or finishes the session if this was the
    /// last block. Applies to every format; EMOM is the live case today.
    func endBlockEarly() {
        guard canEndBlockEarly, let region = currentBlockRegion else { return }
        Haptics.heavy()   // a firm, intentional cue — NOT the success chord
        // An in-flight conditioning block records its partial score (rounds/time so
        // far) before the engine is torn down.
        captureConditioningScore()
        clearEMOMState()
        clearConditioning()
        clearRunStructure()
        // A structural warmup/cooldown closes as ONE completion, never a partial
        // per-exercise lap.
        if currentBlockIsStructural {
            appendStructuralLap(for: region, durationSeconds: max(0, lapElapsedSeconds))
            discardCurrentLiveState()
        } else {
            closeCurrentSegmentLap()
        }
        let next = region.lastIndex + 1
        if next < plan.segments.count {
            currentSegmentIndex = next
            armBlock()
        } else {
            // Ending the LAST block early ends the session — and it's a partial:
            // the athlete cut the protocol short, so it's never marked 'completed'.
            finish(completeness: .partial)
        }
    }

    // Called whenever the current segment changes. Primes the manual load for
    // strength work and (re)starts the EMOM timer + audio when the new segment is
    // an EMOM; tears EMOM state down otherwise.
    private func onEnterSegment() {
        if reopenedLap?.segmentId != currentSegment?.id { reopenedLap = nil }
        primeManualLoadIfNeeded()
        primeRepsIfNeeded()
        primeSetsIfNeeded()
        primeRxScaledIfNeeded()
        // A structured run takes precedence over the rotating/steady conditioning
        // engine even though its folded scheme (.intervals / .steady) reads as a
        // conditioning timer — the leg cursor, not the rotating machine, drives it.
        if currentSegment?.hasRunStructure == true {
            clearEMOMState()
            clearConditioning()
            startRunStructure()
        } else if currentSegment?.isEMOM == true {
            clearConditioning()
            clearRunStructure()
            startEMOM()
        } else if currentSegment?.isConditioningTimer == true {
            clearEMOMState()
            clearRunStructure()
            startConditioning()
        } else {
            clearEMOMState()
            clearConditioning()
            clearRunStructure()
        }
    }
}
