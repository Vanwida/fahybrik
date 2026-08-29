import Foundation

// The TRAMO layer of the live engine — see LiveTramo.swift for why it exists.
//
// One idea, applied everywhere: whatever the athlete is inside RIGHT NOW owns the
// screen, the clock and the device. The three engines (EMOM, rotating conditioning,
// structured run) each have their own cursor; this file reads whichever one is
// driving and answers the four questions the live surfaces actually ask:
//
//   · what am I doing?            → `currentTramo` (label, modality, measure)
//   · how far into it am I?       → `tramoErgDistanceMeters`, `tramoElapsedSeconds`
//   · which round of how many?    → `tramoRoundIndex` / `tramoRoundTotal`
//   · am I working or resting?    → `isTramoResting`, `tramoRestRemaining`
//
// Nothing here writes to the `lap*` accumulators, so the execution record is
// byte-for-byte what it was before this layer existed.
extension WorkoutSession {

    // MARK: - What am I doing right now

    /// The active work window. Falls back to the segment when no format
    /// subdivides it, so every caller has a tramo — never an optional to unwrap.
    var currentTramo: LiveTramo {
        guard let seg = currentSegment else {
            // Sin segmento no sabemos QUÉ hace, pero sí sabemos que está entrenando:
            // eso es lo que se dice. Una raya aquí se pinta como si fuera el nombre
            // del movimiento (§7) — y este label va al HUD, al espejo del reloj y a
            // la presencia de dobles.
            return LiveTramo(segmentIndex: currentSegmentIndex, cursor: .segment,
                             label: "Entreno", modality: .other, measure: nil, boxedSeconds: nil)
        }
        let i = currentSegmentIndex
        // EXTRA WORK. The prescription finished and the athlete chose to keep going,
        // so there is no series and no goal any more: showing "SERIE 1/5 · 500 m"
        // again after he has done all five would be the app inventing a set he was
        // never given. The window is simply the machine and the clock.
        if isExtraWork {
            return LiveTramo(segmentIndex: i, cursor: .segment, label: seg.primaryMovement,
                             modality: seg.resolvedModality, measure: nil, boxedSeconds: nil)
        }
        // A structured run walks its own leg list; its legs already carry measure
        // and intensity, so the tramo is a projection, not a re-derivation.
        if isRunStructureActive, let leg = currentRunLeg {
            // El rest de una serie de correr ES el mismo HUD que el Run.
            // Bajar la calle montaba el overlay gym (91-rest). Sin modo =
            // Descanso; trote/caminar = Recuperación. Sigue siendo correr
            // (cursor, modalidad) para que el motor arme el siguiente tramo.
            return LiveTramo(
                segmentIndex: i,
                cursor: .runLeg(runLegIndex),
                label: leg.isWork ? seg.primaryMovement
                    : (leg.recuperaEnMovimiento ? "Recuperación" : "Descanso"),
                modality: .run,
                measure: leg.measure.asMeasure,
                boxedSeconds: leg.measure.durationSeconds
            )
        }
        // Rest con dueño de tramo: la lectura ES el descanso, no un velo
        // sobre el siguiente work. Carrera estructurada ya salió arriba
        // (su recovery es una pierna). Fuerza sigue en overlay
        // (`restEndsTramo=false`).
        if restRemainingSeconds > 0, restEndsTramo {
            return LiveTramo(
                segmentIndex: i,
                cursor: .segment,
                label: seg.isEMOM ? "Cambio" : "Descanso",
                modality: .other,
                measure: .duration(seconds: Int(restRemainingSeconds.rounded())),
                boxedSeconds: Int(restTotalSeconds.rounded())
            )
        }
        if seg.isEMOM, let plan = seg.emomPlan {
            return seg.rotationTramo(segmentIndex: i,
                                     cursor: .emomInterval(emomIntervalIndex),
                                     index: emomIntervalIndex,
                                     boxedSeconds: plan.workSeconds)
        }
        // A FIXED format authored as a ROUTE (a For Time / HYROX sim / chipper whose
        // list is its stations) does have an honest per-movement cursor: the strike
        // cursor. The athlete tells the app he moved on, or — when a machine measures
        // the station — the machine does. Either way the window is the STATION, so
        // the device, the clock and the screen follow it like any other tramo.
        if seg.isConditioningTimer, seg.fixedListIsStations {
            let station = currentStationIndex
            return seg.rotationTramo(segmentIndex: i, cursor: .fixedStation(station),
                                     index: station,
                                     boxedSeconds: seg.stationBoxSeconds(at: station))
        }
        // Only a ROTATING conditioning format has an honest per-round cursor beyond
        // that. An AMRAP, or a For Time whose list is repeated ROUNDS, is free-order:
        // nothing knows which movement the athlete is on, so the segment stays the
        // tramo and the device data is shown as a strip instead of taking over the
        // screen (it would have to lie about the subject to do otherwise).
        if seg.isConditioningTimer, seg.formatScheme?.presentation == .rotating {
            // The box is the format's FULL work window, never what is left of it —
            // a progress fraction against a shrinking denominator never moves.
            // A distance bout (a 500 m row) has no work window at all: it ends when
            // the metres are done, so it stays unboxed and its clock waits for the
            // machine instead of counting anything down.
            return seg.rotationTramo(segmentIndex: i,
                                     cursor: .conditioningRound(rotRoundIndex),
                                     index: rotRoundIndex,
                                     boxedSeconds: seg.formatWorkSeconds)
        }
        // setTable (series / superserie) and a warmup/cooldown whose OPEN item is
        // a machine: the set IS the tramo. Without this cursor a remo inside a
        // superserie connected and recorded nothing — the segment stayed strength.
        if let setIndex = liveSetIndex(in: seg) {
            let boxed = seg.stationBoxSeconds(at: setIndex)
                ?? seg.rotationSet(at: setIndex).flatMap { set -> Int? in
                    if case let .duration(s, _)? = set.measure, s > 0 { return s }
                    return nil
                }
            return seg.rotationTramo(segmentIndex: i,
                                     cursor: .strengthSet(setIndex),
                                     index: setIndex,
                                     boxedSeconds: boxed)
        }
        return seg.tramo(segmentIndex: i)
    }

    /// The set the athlete is standing on: pending strength set, else 0 when the
    /// format is a list/table that still has to name a machine window (warmup 6
    /// min on the belt, a single remo set).
    private func liveSetIndex(in seg: WorkoutSegment) -> Int? {
        if let pending = pendingSetIndex { return pending }
        guard let sets = seg.prescription?.sets, !sets.isEmpty else { return nil }
        let scheme = seg.formatScheme
        let isTable = scheme == .sets || scheme == .superset || seg.usesMultiSetStrength
        let isList = scheme == .warmup || scheme == .cooldown
        guard isTable || isList else { return nil }
        // A pure iron table with no machine set does not need this cursor — the
        // segment tramo already says strength. Only open it when a machine
        // belongs to the block, so a 4×10 squat does not change identity.
        guard seg.involvesErg || seg.involvesRun else { return nil }
        return 0
    }

    /// The station the athlete is standing on, clamped to the list. The strike
    /// cursor IS this — `fixedRoundsDone` counts what is behind him, so it points
    /// at what is in front of him, and it parks on the last line once the block is
    /// struck out (the block closes on that same strike, so it is only ever read
    /// for a frame).
    var currentStationIndex: Int {
        Swift.min(Swift.max(0, fixedRoundsDone), Swift.max(0, fixedListTotal - 1))
    }

    /// True when the current window is a station of a walk-once checklist.
    var isStationTramo: Bool { currentTramo.isFixedStation }

    /// True when a Concept2 monitor is what measures the CURRENT window — the one
    /// test that replaced `currentSegment.kind == .rowOrSki` everywhere it mattered.
    /// A ski round inside an EMOM answers true here and answered false there.
    var tramoIsErg: Bool { currentTramo.isErg }

    /// True when the current window is running work (belt or street).
    var tramoIsRun: Bool { currentTramo.isRun }

    // MARK: - Round context, unified across the two rotating engines

    /// 0-based round within the current format, or 0 when the segment isn't one.
    var tramoRoundIndex: Int {
        if isExtraWork { return 0 }
        if isRunStructureActive { return runLegIndex }
        if currentSegment?.isEMOM == true { return emomIntervalIndex }
        if currentSegment?.fixedListIsStations == true { return currentStationIndex }
        if isConditioningActive { return rotRoundIndex }
        if case .strengthSet(let i) = currentTramo.cursor { return i }
        return 0
    }

    /// How many rounds the format runs. 1 = there is no series to count, and the
    /// surfaces stay silent rather than showing a meaningless "SERIE 1/1".
    var tramoRoundTotal: Int {
        if isExtraWork { return 1 }
        if isRunStructureActive { return runLegTotal }
        if let plan = currentSegment?.emomPlan { return plan.intervalCount }
        if currentSegment?.fixedListIsStations == true { return fixedListTotal }
        if isConditioningActive { return Swift.max(1, rotTotalRounds) }
        if case .strengthSet = currentTramo.cursor {
            let n = currentSegment?.prescription?.sets?.count ?? setRecords.count
            return Swift.max(1, n)
        }
        return 1
    }

    /// True while the athlete is BETWEEN work windows — an EMOM change window, a
    /// Tabata/interval rest, a structured-run recovery leg. The one test the rest
    /// surface keys off, whichever engine produced it.
    var isTramoResting: Bool {
        if isExtraWork { return false }
        if restRemainingSeconds > 0 { return true }
        if isRunStructureActive { return !isRunCountIn && !isRunLegWork }
        return false
    }

    /// LA RECUPERACIÓN DE UNA SERIE DE CORRER, CUANDO SE HACE EN MOVIMIENTO.
    ///
    /// Sigue siendo una recuperación —el atleta no está haciendo la serie— pero
    /// no es una parada: se trota, y ese trote tiene metros, ritmo y zona. Es
    /// una pregunta aparte de `isTramoResting` a propósito: la FASE no cambia
    /// (todo el cableado del descanso sigue igual), lo que cambia es si hay algo
    /// que medir. Ver `RunLeg.recuperaEnMovimiento`.
    var isTramoRecuperandoEnMovimiento: Bool {
        guard isRunStructureActive, !isRunCountIn, let leg = currentRunLeg else { return false }
        return leg.recuperaEnMovimiento
    }

    /// True cuando algo MIDE la ventana en curso: el trabajo siempre, y la
    /// recuperación cuando es en movimiento. Es lo que decide si el cronómetro
    /// del tramo corre o se congela — congelarlo durante un trote de vuelta
    /// dejaba el ritmo de la recuperación sin denominador y los metros a cero.
    var tramoMide: Bool { !isTramoResting || isTramoRecuperandoEnMovimiento }

    /// LOS METROS DE LA VENTANA SON UN DATO. Hermana de `tramoMide`, y no es la
    /// misma pregunta: aquélla decide si corre el CRONÓMETRO, ésta si cuentan los
    /// METROS. Separarlas es lo que arregla el descanso que no cerraba sin abrir el
    /// agujero de enfrente.
    ///
    /// Una recuperación medida en METROS («trota 200 m») escrita SIN modo no «mide»
    /// —su reloj se congela, y eso está bien— pero sus metros son exactamente lo
    /// que la cierra (`considerDistanceClose`). Tirarlos la dejaba abierta para
    /// siempre: es el «el motor no cierra el rest, la distancia clavada, el
    /// siguiente Run no se arma» del debugger del 29-ago, que eran una línea.
    ///
    /// Un descanso PARADO de 60 s no cuenta, y ahí la puerta se queda: los metros
    /// que llegaran son el atleta andando a por agua, no volumen de carrera. En la
    /// calle eso casi nunca pasa —parado, CoreLocation no reporta movimiento— pero
    /// «casi nunca» no es una regla, y con la cinta o con la muñeca en la mano sí
    /// llegan.
    var tramoMideDistancia: Bool {
        if tramoMide { return true }
        return currentTramo.targetDistanceMeters != nil
    }

    /// Seconds left of the rest, for the countdown that IS the rest screen.
    var tramoRestRemaining: Double { Swift.max(0, restRemainingSeconds) }

    /// Seconds left of the WORK window when the format boxes it (an EMOM minute, a
    /// Tabata 20 s, a timed run leg). nil when the window ends on work done, not on
    /// a clock — a 500 m bout has no countdown and must not invent one.
    var tramoWorkRemaining: Double? {
        guard !isTramoResting, countInRemaining <= 0 else { return nil }
        if workRemaining > 0 { return workRemaining }
        let tramo = currentTramo
        if tramo.isFixedStation, let boxed = tramo.boxedSeconds, boxed > 0 {
            return Swift.max(0, Double(boxed) - tramoElapsedSeconds)
        }
        return nil
    }

    /// True while ANY engine's 3-2-1 is on screen.
    var isTramoCountIn: Bool { countInRemaining > 0 }

    var tramoCountInRemaining: Double { Swift.max(0, countInRemaining) }

    /// What the athlete moves to after this window — the second question of every
    /// rest screen. nil on the last round of the last segment, where "luego" is a lie.
    var nextTramoLine: String? {
        let seg = currentSegment
        let idx = tramoRoundIndex
        if let plan = seg?.emomPlan, idx + 1 < plan.intervalCount,
           let nxt = plan.interval(idx + 1) {
            guard let work = nxt.work else { return nxt.movement }
            return "\(work) · \(nxt.movement)"
        }
        if isRunStructureActive, let legs = currentRunLegs, idx + 1 < legs.count {
            return legs[idx + 1].isWork ? "tramo \(idx + 2)" : "recuperación"
        }
        if isConditioningActive, idx + 1 < tramoRoundTotal, let seg {
            let next = seg.rotationTramo(segmentIndex: currentSegmentIndex,
                                         cursor: .conditioningRound(idx + 1),
                                         index: idx + 1, boxedSeconds: nil)
            if let work = next.workLine { return "\(work) · \(next.label)" }
            return next.label
        }
        return nextSegment?.title
    }

    // MARK: - The tramo's own clock

    /// Wall clock inside the current window, with no display hold — the ONE place
    /// that expression lives (it used to be written out in four).
    var tramoWallClockSeconds: Double {
        Swift.max(0, lapElapsedSeconds - tramoStartElapsed)
    }

    /// Seconds INSIDE the current window, AS DISPLAYED. Held at zero while the clock
    /// is armed (waiting for the machine — the HUD says "empieza al remar" beside
    /// it), and frozen at the closed value during a rest — so "tiempo" answers "how
    /// long is this bout taking", never "how long has the whole block been running",
    /// which is what it used to answer.
    var tramoElapsedSeconds: Double {
        // Congelado sólo cuando NADIE mide: en un trote de recuperación el reloj
        // corre, porque es el denominador de su ritmo.
        if !tramoMide, let last = lastTramoElapsedSeconds { return last }
        if tramoClockArmed { return 0 }
        if gatesBeltWorkClock { return beltWorkElapsedS }
        return tramoWallClockSeconds
    }

    /// Seconds INSIDE the current window, AS RECORDED. Identical to the displayed
    /// value except while armed, where it gives the real wall clock instead of the
    /// hold.
    ///
    /// The distinction is the whole point: zero-while-armed is an honest thing to
    /// SHOW ("this hasn't started yet") and a lie to SAVE. A station closed while
    /// still armed means the monitor never reported work — the athlete did it on an
    /// unpaired machine, or skipped it — and the truth about that window is how long
    /// he spent in it, not zero. A recorded zero is worse than a gap: it reads as a
    /// measurement.
    var tramoRecordedSeconds: Double {
        if !tramoMide, let last = lastTramoElapsedSeconds { return last }
        if gatesBeltWorkClock { return beltWorkElapsedS }
        return tramoWallClockSeconds
    }

    /// Erg meters covered INSIDE the current window — the live progress bar's
    /// numerator. Nil until the first sample of the window lands.
    var tramoErgDistanceMeters: Double? {
        guard let start = tramoErgStartDistance, let last = lapErgLastDistance else { return nil }
        return Swift.max(0, last - start)
    }

    /// Erg calories burned INSIDE the current window, for a calorie-measured bout.
    var tramoErgCalories: Int? {
        guard let start = tramoErgStartCalories, let last = lapErgLastCalories else { return nil }
        return Swift.max(0, last - start)
    }

    /// BELT metres covered INSIDE the current window — the treadmill twin of
    /// `tramoErgDistanceMeters`. Nil until the belt has actually moved in this window,
    /// so a run minute with no machine reports nothing rather than a measured-looking
    /// zero (§7).
    var tramoBeltDistanceMeters: Double? {
        let covered = lapBeltDistanceMeters - tramoBeltStartDistance
        return covered > 0 ? covered : nil
    }

    /// LOS METROS DE ESTA PIERNA CORRIENDO — cinta si la hay, GPS si no.
    ///
    /// Existe porque el cable del espejo leía sólo el acumulador de la cinta, y al
    /// aire libre eso es nil: una serie de 1.000 m en la calle pintaba «te faltan
    /// 1000» los cuatro minutos enteros sin moverse del sitio. La regla de qué
    /// fuente manda ya la tenía el motor para el RITMO de la pierna
    /// (`liveCoveredPaceSecPerKm`); aquí se expone la misma, para que ritmo y
    /// metros no puedan contar cosas distintas de la misma carrera.
    ///
    /// FUERA de una carrera estructurada, «esta pierna» puede seguir siendo UNA
    /// SOLA de varias que comparten segmento — un bloque de 8 movimientos alternos
    /// (Run 1.000 · SkiErg 500 · Run 1.000 · Burpee · …) se pliega en UN segmento
    /// (`mergedConditioningSegment`, `kind = .reps`), así que `liveRunDistanceMeters`
    /// es el acumulado de las CUATRO carreras juntas, no de la que está en curso.
    /// Se resta el ancla que `syncTramoIfNeeded` fija al entrar en la ventana —el
    /// gemelo GPS de `tramoErgStartDistance` / `tramoBeltStartDistance`, mismo
    /// patrón— para que la tercera estación de correr empiece en cero y no en
    /// 2.000-y-pico. En una carrera de un solo tramo (todo el segmento es la
    /// ventana) el ancla se fija en cero al entrar, así que no cambia nada.
    var tramoRunCoveredMeters: Double? {
        guard tramoIsRun else { return nil }
        if lapBeltOwnsDistance {
            return tramoBeltDistanceMeters
        }
        let now = lapGpsDistanceMeters ?? 0
        let start = tramoGpsStartDistance ?? 0
        let covered = now - start
        return covered > 0 ? covered : nil
    }

    var livePicture: LivePicture {
        let tramo = currentTramo
        let primary: LivePicture.Primary
        if isAwaitingBlockStart {
            primary = .startBlock
        } else if countInRemaining > 0 {
            primary = .skipCountIn
        } else if restRemainingSeconds > 0, !restEndsTramo {
            primary = .dismissRest
        } else if isLastSegment && tramoRoundIndex + 1 >= tramoRoundTotal {
            primary = .finish
        } else {
            primary = .closeTramo
        }
        let figure: LivePicture.Figure
        if countInRemaining > 0 {
            figure = .countdown(countInRemaining)
        } else if restRemainingSeconds > 0, !isTramoRecuperandoEnMovimiento {
            figure = .countdown(restRemainingSeconds)
        } else if let m = tramoRunCoveredMeters, tramo.isRun {
            figure = .meters(m)
        } else if let m = tramoErgDistanceMeters, tramo.isErg {
            figure = .meters(m)
        } else if let c = tramoErgCalories, tramo.isErg {
            figure = .calories(c)
        } else if let w = tramoWorkRemaining {
            figure = .countdown(w)
        } else {
            figure = .elapsed(tramoElapsedSeconds)
        }
        return LivePicture(
            label: tramo.label,
            figure: figure,
            planLine: tramo.workLine,
            nextLine: nextTramoLine,
            primary: primary,
            score: liveScore,
            coveredMeters: tramo.isRun ? tramoRunCoveredMeters : nil,
            restRemaining: restRemainingSeconds,
            countInRemaining: countInRemaining
        )
    }

    /// Score inside the open window. The clock does not own this tap.
    var liveScore: LivePicture.Score {
        guard countInRemaining <= 0, restRemainingSeconds <= 0 else { return .none }
        switch currentSegment?.formatScheme {
        case .amrap: return .round
        case .tabata where rotPhase == .work: return .reps
        default: return .none
        }
    }

    func scoreStrike() {
        switch liveScore {
        case .round: bumpAmrapRound()
        case .reps: tabataAddRep()
        case .none: break
        }
    }

    func latchRunProgress() {
        _ = runProgress.step(
            legKey: currentTramo.key,
            segmentCoveredMeters: segmentRunCoveredForProgress,
            goal: .open,
            isDistanceLeg: false,
            isRunnableNow: false
        )
    }

    func considerDistanceClose(beforeMeters: Double? = nil) {
        let tramo = currentTramo
        guard tramo.isRun, let target = tramo.targetDistanceMeters, target > 0 else { return }
        let runnable = !isPaused && !isFinished && !isAwaitingBlockStart && countInRemaining <= 0
            && restRemainingSeconds <= 0
        guard runnable else { return }
        let now = tramoRunCoveredMeters ?? 0
        guard now >= target, (beforeMeters ?? 0) < target else { return }
        closeTramo(auto: true)
    }

    /// Fraction of the tramo's goal covered, 0…1 — the ONE progress number, whether
    /// the goal is meters, calories or seconds. Nil when the tramo prescribes no
    /// measurable goal: a bar with no denominator would be decoration, not data.
    var tramoProgress: Double? {
        let tramo = currentTramo
        if let target = tramo.targetDistanceMeters, let covered = tramoErgDistanceMeters {
            return Swift.min(1, covered / target)
        }
        if let target = tramo.targetCalories, target > 0, let covered = tramoErgCalories {
            return Swift.min(1, Double(covered) / Double(target))
        }
        if let boxed = tramo.boxedSeconds, boxed > 0, let remaining = tramoWorkRemaining {
            return Swift.min(1, Swift.max(0, (Double(boxed) - remaining) / Double(boxed)))
        }
        return nil
    }

    /// The erg work accumulated over the WHOLE segment — every closed window plus
    /// the one open now — as the athlete reads it ("total 1.500 m").
    ///
    /// WHY IT IS NOT A SETTING. Alex asked whether the marker should reset between
    /// rounds or accumulate, and whether that should be chosen before starting. The
    /// prescription already answers it: a goal written PER ROUND (500 m each, five
    /// times) makes the round the thing he is chasing, so the subject is the round
    /// and the window resets; a goal written as a TOTAL is one window, so the subject
    /// IS the accumulated. It falls out of the model — nothing to ask, nothing to
    /// configure, nothing to get wrong.
    ///
    /// So both are shown and neither is a decision: the round is the subject, this is
    /// the secondary line. It answers only when it says something the subject doesn't
    /// — on a piece that IS the segment the two numbers are the same one, and
    /// printing it twice is noise. It reads the SAME lap accumulator the execution
    /// record is built from; there is no parallel counter to fall out of step.
    var accumulatedErgLine: String? {
        guard tramoIsErg else { return nil }
        if let total = lapErgDistanceMeters, total >= 1 {
            let window = tramoErgDistanceMeters ?? 0
            guard total - window >= 1 else { return nil }
            return "total \(Int(total.rounded())) m"
        }
        if let total = lapErgCalories, total >= 1 {
            let window = tramoErgCalories ?? 0
            guard total - window >= 1 else { return nil }
            return "total \(total) cal"
        }
        return nil
    }

    // MARK: - Entering a tramo

    /// Re-anchor every per-window accumulator when the cursor moves. Called from
    /// the tick AND from `sampleErg`, so a device sample can never be attributed to
    /// the window it did not happen in. Idempotent: a no-op while the key is stable.
    func syncTramoIfNeeded() {
        let tramo = currentTramo
        // The WORK ended and the rest began. The round has not changed, so the
        // device window stays anchored (the metres are still this round's), but the
        // clock freezes HERE — it used to keep running through the rest, which is
        // how "tiempo" ended up reporting the block instead of the serie.
        if isTramoResting, !tramoRestLatched {
            tramoRestLatched = true
            lastTramoElapsedSeconds = tramoWallClockSeconds
            lastTramoHRPeak = tramoHRPeak
        }
        guard tramo.key != tramoKey else { return }
        // Close the outgoing window, unless the rest already froze it.
        if !tramoKey.isEmpty, !tramoRestLatched {
            lastTramoElapsedSeconds = tramoWallClockSeconds
            lastTramoHRPeak = tramoHRPeak
        }
        tramoRestLatched = false
        tramoKey = tramo.key
        tramoStartElapsed = lapElapsedSeconds
        resetBeltWorkElapsed()
        tramoHRPeak = nil
        tramoErgStartDistance = lapErgLastDistance
        tramoErgStartCalories = lapErgLastCalories
        tramoBeltStartDistance = lapBeltDistanceMeters
        tramoGpsStartDistance = lapGpsDistanceMeters
        stampTramoSampleCursors()
        latchRunProgress()
        // A device-measured window with no time box starts when the MACHINE starts.
        // The athlete taps "Empezar", walks to the erg, sits down: the bout's clock
        // has no business running through any of that.
        //
        // Only when a monitor is actually connected, though. The arm is released by
        // a device sample and by nothing else, so arming without one held the clock
        // at 0:00 for the whole station and recorded that zero — and pairing the PM5
        // is OPTIONAL. No monitor, nothing to wait for: the clock starts on the tap.
        tramoClockArmed = tramo.isErg && tramo.boxedSeconds == nil && !isTramoResting && ergConnected
    }

    /// Reset the tramo layer wholesale (segment entry / a discarded back-step), so
    /// no stale window survives into new work.
    func resetTramoWindow() {
        tramoKey = ""
        tramoStartElapsed = lapElapsedSeconds
        resetBeltWorkElapsed()
        tramoClockArmed = false
        tramoRestLatched = false
        tramoErgStartDistance = nil
        tramoErgStartCalories = nil
        tramoGpsStartDistance = nil
        lastTramoElapsedSeconds = nil
        tramoHRPeak = nil
        lastTramoHRPeak = nil
        tramoHRStartCount = 0
        tramoPaceSampleStart = 0
        tramoPowerSampleStart = 0
        tramoSpmSampleStart = 0
        runProgress.reset()
    }

    /// What the monitor measured in the window that just closed, as the athlete
    /// reads it ("500 m", "18 cal"). Available DURING the rest because the device
    /// window belongs to the round, not to the phase. nil when nothing was measured
    /// — the rest screen then simply doesn't show the card.
    var lastTramoWorkLine: String? {
        if let m = tramoErgDistanceMeters, m >= 1 { return "\(Int(m.rounded())) m" }
        if let c = tramoErgCalories, c >= 1 { return "\(c) cal" }
        return nil
    }

    /// Current policy for the live tramo (program / close / scope). Surfaces and
    /// the PM5 programmer share this so free and prescribed paths never diverge.
    var currentErgCounterPolicy: ErgCounterPolicy {
        ErgCounterPolicy.resolve(
            tramo: currentTramo,
            segment: currentSegment,
            isResting: isTramoResting,
            isCountIn: isTramoCountIn
        )
    }

    /// The machine moved: release the held clock and stamp its real zero. Called
    /// from `sampleErg` on the first sample that shows actual work.
    func releaseArmedTramoClock() {
        guard tramoClockArmed else { return }
        tramoClockArmed = false
        tramoStartElapsed = lapElapsedSeconds
    }

    /// Track the tramo's HR peak so the rest screen can show a real drop.
    func noteTramoHR(_ bpm: Int) {
        tramoHRPeak = Swift.max(tramoHRPeak ?? 0, bpm)
    }

    // MARK: - Leaving a station by EVENT
    //
    // The RULE lives on LiveTramo (`closesOnMachineGoal` / `closesOnClock`) as pure
    // functions of the window and the readings. These two are only the plumbing: the
    // engine's guards, the numbers, and the one call that closes the station. The
    // manual strike never goes away — a machine can drop, lie, or simply not be
    // there, so the automatic exit removes a tap, never the athlete's freedom.

    /// Can this window close itself at all right now? The shared guard: the session
    /// has to be live and past its count-in for any automatic transition to be real.
    private var stationCanAutoClose: Bool {
        !isPaused && !isFinished && !isAwaitingBlockStart && countInRemaining <= 0
    }

    /// The goal has been REACHED on the machine → advance the work cursor.
    /// Called from `sampleErg` with the window's measured values from BEFORE this
    /// sample landed, because the test is that we watched the goal being CROSSED.
    ///
    /// Applies to every erg window whose `ErgCounterPolicy` advances on machine
    /// goal (series bouts, fixed stations, steady pieces) — not only stations.
    func advanceStationIfMachineGoalMet(beforeMeters: Double?, beforeCalories: Int?) {
        guard stationCanAutoClose else { return }
        let tramo = currentTramo
        let policy = ErgCounterPolicy.resolve(
            tramo: tramo,
            segment: currentSegment,
            isResting: isTramoResting,
            isCountIn: isTramoCountIn
        )
        guard policy.advancesOnMachineGoal else { return }
        guard tramo.crossesMachineGoal(metersBefore: beforeMeters,
                                       metersNow: tramoErgDistanceMeters,
                                       caloriesBefore: beforeCalories,
                                       caloriesNow: tramoErgCalories) else { return }
        routeAutomaticStationAdvance(tramo: tramo)
    }

    /// LA ESTACIÓN DE CORRER SE CIERRA SOLA AL LLEGAR A SUS METROS — lo que el remo
    /// y el ski llevan haciendo desde el principio.
    ///
    /// El desajuste que arregla: en «1.000 m corriendo · 500 m ski · 1.000 m
    /// corriendo · …» el ski se cerraba solo a sus 500 m y la cinta obligaba a
    /// pulsar los cuatro kilómetros a mano. La misma pregunta —¿ha llegado esta
    /// estación a su dosis?— tenía dos respuestas según el aparato. El objetivo del
    /// tramo (`targetDistanceMeters`) SIEMPRE estuvo ahí: lo que faltaba era mirarlo
    /// también cuando los metros los cuenta una cinta o la muñeca en vez de un
    /// monitor Concept2.
    ///
    /// Vale para las dos superficies: la cinta y la calle. `tramoRunCoveredMeters`
    /// ya resuelve de dónde salen los metros de ESTA pierna (cinta si la hay, Apple
    /// si no), así que aquí no hay que volver a elegir fuente.
    ///
    /// `beforeMeters` son los metros de la ventana ANTES de que entrara esta
    /// muestra: la prueba es haber visto CRUZAR el objetivo, no estar por encima —
    /// así una reanudación o una muestra repetida no vuelve a disparar.
    ///
    /// El cierre a mano no desaparece: la cinta puede caerse, el reloj puede no
    /// estar, y sin metros no hay cierre automático. Esto quita un toque, nunca la
    /// libertad de darlo.
    private func routeAutomaticStationAdvance(tramo: LiveTramo) {
        closeTramo(auto: true)
    }

    /// Re-anchor the tramo device window to the monitor's current cumulative
    /// reading. Called at count-in → GO so metres/cal rowed during 3-2-1 do not
    /// count toward the bout (mirrors RunLegProgress `#in`/`#go`).
    func reanchorTramoDeviceWindowAtGo() {
        tramoErgStartDistance = lapErgLastDistance
        tramoErgStartCalories = lapErgLastCalories
        tramoGpsStartDistance = lapGpsDistanceMeters
        tramoStartElapsed = lapElapsedSeconds
        resetBeltWorkElapsed()
        stampTramoSampleCursors()
        latchRunProgress()
        tramoClockArmed = currentTramo.isErg
            && currentTramo.boxedSeconds == nil
            && !isTramoResting
            && ergConnected
    }

    /// The BOX of a clock-measured station ran out → close it and walk on. Called
    /// from the conditioning tick, so it needs no device at all: a "2 min de bici"
    /// station ends after two minutes whether or not anything is paired.
    func advanceStationIfClockGoalMet() {
        guard stationCanAutoClose else { return }
        guard currentTramo.closesOnClock(elapsedInTramo: tramoElapsedSeconds) else { return }
        closeTramo(auto: true)
    }
}

// MARK: - Run leg measure → the shared Measure union

// `asMeasure` vivía aquí, privada, y la previa no podía leerla para decir la dosis
// de una estructura: se ha mudado a `RunStructure.swift`, junto a la gramática, que
// es de donde la leen ahora el tramo Y el formateador.
private extension RunSegmentMeasure {
    var durationSeconds: Int? {
        if case let .duration(s) = self { return s }
        return nil
    }
}
