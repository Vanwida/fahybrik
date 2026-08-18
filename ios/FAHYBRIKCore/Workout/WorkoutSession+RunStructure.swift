import Foundation

// EL MOTOR DE LA CARRERA ESTRUCTURADA (#61): un cursor PLANO sobre la lista de
// tramos expandida, uno cada vez, cada uno con su propia medida / objetivo /
// pendiente. Autocontenido y paralelo a los otros dos motores. Un tramo de TIEMPO
// rueda con el reloj; uno de DISTANCIA lo cierra la cinta o la mano del atleta —
// nunca se queda esperando algo que no va a llegar.
extension WorkoutSession {
    // MARK: Structured-run accessors (read by the run / interval / treadmill HUDs)

    /// The expanded legs of the CURRENT structured run segment, or nil (legacy path).
    var currentRunLegs: [RunLeg]? { currentSegment?.runStructureLegs }

    /// True while the current segment is driven by the structured-run engine.
    var isRunStructureActive: Bool { currentSegment?.hasRunStructure == true }

    /// The current leg, or nil when not structured / the cursor is out of range.
    var currentRunLeg: RunLeg? {
        guard let legs = currentRunLegs, runLegIndex >= 0, runLegIndex < legs.count else { return nil }
        return legs[runLegIndex]
    }

    /// True while the structured-run 3-2-1 count-in is on screen.
    var isRunCountIn: Bool { runCountInRemaining > 0 }

    /// 1-based "Tramo N de M" WITHIN the current structured run segment.
    var runLegNumber: Int { Swift.min(runLegTotal, runLegIndex + 1) }
    var runLegTotal: Int { Swift.max(1, currentRunLegs?.count ?? 1) }

    /// True when the current leg is a WORK bout (false = a recovery). Defaults to
    /// work for a legacy/absent leg so callers never mis-flag a rest.
    var isRunLegWork: Bool { currentRunLeg?.isWork ?? true }

    /// Elapsed seconds in the current leg since its GO (the count-in excluded).
    var runLegElapsed: Double { Swift.max(0, lapElapsedSeconds - runLegStartElapsed) }

    /// True when the current structured leg is DISTANCE-measured — so the app-only
    /// HUD can pick the honest close affordance (belt auto-close when a treadmill is
    /// live, else manual "Tramo hecho"; a TIME leg auto-rolls on the clock). Kept
    /// treadmill-agnostic here because the shared engine also compiles on the watch.
    var currentRunLegIsDistance: Bool {
        guard let leg = currentRunLeg else { return false }
        return leg.distanceMeters != nil
    }

    // MARK: - Structured-run engine (non-EMOM, non-conditioning)
    //
    // Drives a folded run block that carries a `structure` (#61): a FLAT leg cursor
    // over the expanded leg list, one work/recovery bout at a time. Self-contained
    // and parallel to the EMOM / conditioning engines (which it never touches) — a
    // 3-2-1 count-in, then, per leg, a TIME countdown (auto-roll) or a DISTANCE leg
    // that waits for the belt / a manual "Tramo hecho". Reuses `closeCurrentSegmentLap`
    // for the ONE aggregate lap, exactly like the other engines.

    func startRunStructure() {
        guard let legs = currentSegment?.runStructureLegs, !legs.isEmpty else { clearRunStructure(); return }
        runStructureSegmentIndex = currentSegmentIndex
        runLegIndex = 0
        runCountInRemaining = Self.countInSeconds
        primeRunLeg()
        WorkoutAudio.shared.activate()
        WorkoutAudio.shared.playTick()   // opening "3" of the 3-2-1 count-in
    }

    func clearRunStructure() {
        if runStructureSegmentIndex != nil { WorkoutAudio.shared.deactivate() }
        runStructureSegmentIndex = nil
        runCountInRemaining = 0
        runLegIndex = 0
        runLegRemaining = 0
        runLegStartElapsed = 0
    }

    /// Snapshot the per-WORK-leg execution baselines at a leg's GO (#break-2). Each
    /// leg's measured distance / HR / incline / zone is the DIFF between the values at
    /// close and these. Called wherever a leg's clock starts (prime + both GO paths).
    private func markRunLegStart() {
        runLegStartElapsed = lapElapsedSeconds
        runLegBeltStart = lapBeltDistanceMeters
        runLegGpsStart = lapGpsDistanceMeters ?? 0
        runLegHRStartCount = lapHRSamples.count
        runLegZoneStart = lapZoneAccumSec
        runLegInclineSumStart = lapInclineSum
        runLegInclineCountStart = lapInclineCount
    }

    /// Set the current leg's GO baseline + its countdown (a TIME leg counts down; a
    /// DISTANCE leg has no clock countdown — the belt / manual close ends it).
    private func primeRunLeg() {
        markRunLegStart()
        runLegRemaining = currentRunLeg?.durationSeconds.map(Double.init) ?? 0
    }

    private func skipRunCountIn() {
        runCountInRemaining = 0
        markRunLegStart()
        WorkoutAudio.shared.playGo()
        Haptics.cueGo()
        #if os(iOS)
        AudioCoach.shared.announceRunLeg(in: self)   // voice the first tramo (#63, iOS-only)
        #endif
    }

    // The bottom primary button for a structured run ("Tramo hecho" / "Saltar
    // descanso"): skip the count-in, else advance the current leg.
    func runStructurePrimary() {
        if runCountInRemaining > 0 { skipRunCountIn(); return }
        advanceRunLeg(auto: false)
    }

    // Advance to the next leg, or close the block on the last one. `auto` = the leg's
    // own TIME countdown rolled over (or the belt auto-closed via primaryAdvance);
    // otherwise the athlete tapped through.
    private func advanceRunLeg(auto: Bool) {
        guard let legs = currentSegment?.runStructureLegs, !legs.isEmpty else { return }
        // #break-2: the just-finished leg's OWN measured split (covered distance /
        // duration / pace / HR) is available HERE at the boundary. Record a WORK leg as
        // its own segment execution so each interval's pace reaches the coach instead
        // of blending into one aggregate lap. Recovery legs advance the cursor only.
        // Se graba TODO tramo que termina, trabajo Y recuperación. Grabar solo las
        // series es guardar los números y tirar las unidades: un 5×1000 quedaba con
        // cinco fuertes y NADA contra lo que compararlos, y el contraste es lo que
        // define una sesión de series. Sin la recuperación no se puede saber si el
        // atleta trotó o anduvo, si se la recortó, ni cuánto le bajó el pulso entre
        // series — y el volumen total de carrera salía corto por todo lo trotado.
        // El rol viaja en la fila (`leg_role`), así que la analítica distingue una
        // cosa de la otra sin tener que adivinarlo por el ritmo.
        let finished = legs[runLegIndex]
        recordRunLegLap(finished, at: runLegIndex)
        let next = runLegIndex + 1
        if next >= legs.count {
            WorkoutAudio.shared.playFinish()
            Haptics.cueFinish()
            closeRunStructureAndAdvance()
            return
        }
        let kindChanged = legs[next].kind != legs[runLegIndex].kind
        runLegIndex = next
        primeRunLeg()
        if kindChanged {
            WorkoutAudio.shared.playMovementChange()   // work↔recovery transition tone
            Haptics.cueStop()
        } else {
            WorkoutAudio.shared.playIntervalStart()
            Haptics.cueGo()
        }
        #if os(iOS)
        AudioCoach.shared.announceRunLeg(in: self)   // voice the new tramo / recovery (#63, iOS-only)
        #endif
    }

    // Close the structured run and advance. The WORK legs were each recorded as their
    // own segment execution during advanceRunLeg; closeCurrentSegmentLap detects the
    // structure and only resets the per-segment accumulators (no aggregate lap).
    private func closeRunStructureAndAdvance() {
        let wasLast = isLastSegment
        let origin = currentSegmentIndex
        clearRunStructure()
        closeCurrentSegmentLap()
        if wasLast {
            finishPrescribedWork()
        } else {
            currentSegmentIndex += 1
            enterOrArm(from: origin)
        }
    }

    // #break-2: graba UNA segment execution por tramo terminado — serie O recuperación.
    // Todos los tramos comparten el `templateSegmentId` del bloque de carrera; lo que
    // los distingue en el servidor es `leg_index` (el índice en la lista PLANA de
    // tramos de la prescripción, el mismo espacio que `flattenSegments`), `leg_role`
    // (work/recovery) y `leg_phase` (warmup/main/cooldown). Con esos tres, «tramo 3
    // hecho» casa con «tramo 3 prescrito» sin zipear por orden de llegada.
    // Captura la distancia / duración / ritmo / FC / pendiente / zona PROPIAS del
    // tramo desde las bases tomadas en su GO — así una pirámide 1200/1000/800 aterriza
    // como tres ritmos honestos y no como una media.

    // Drives the structured-run count-in + the current TIME leg's countdown off the
    // 0.25s tick. A DISTANCE leg (runLegRemaining == 0) never auto-rolls here — it
    // waits for the belt (TreadmillHUDModel → primaryAdvance) or a manual "Tramo
    // hecho". Parallel to tickEMOM / tickConditioning.
    func tickRunStructure(dt: Double) {
        // Count-in: 3-2-1 with a tick on each whole-second transition, "go" at 0.
        if runCountInRemaining > 0 {
            let before = runCountInRemaining
            runCountInRemaining = Swift.max(0, before - dt)
            if before.rounded(.up) != runCountInRemaining.rounded(.up) {
                if runCountInRemaining <= 0 {
                    markRunLegStart()   // GO — the leg clock + per-leg baselines start now
                    WorkoutAudio.shared.playGo()
                    Haptics.cueGo()
                    #if os(iOS)
                    AudioCoach.shared.announceRunLeg(in: self)   // voice the first tramo (#63, iOS-only)
                    #endif
                } else {
                    WorkoutAudio.shared.playTick()
                    Haptics.cueTick()
                }
            }
            return
        }
        // TIME leg: count down, tick the final 3s, auto-roll at zero. A DISTANCE leg
        // has no countdown → nothing to tick.
        guard runLegRemaining > 0 else { return }
        let before = runLegRemaining
        let after = before - dt
        for boundary in [3.0, 2.0, 1.0] where before > boundary && after <= boundary {
            WorkoutAudio.shared.playTick()
            Haptics.cueTick()
        }
        #if os(iOS)
        AudioCoach.shared.runLegTimeRemaining(after, in: self)   // once-per-leg "10 segundos" (#63, iOS-only)
        #endif
        if after <= 0 {
            advanceRunLeg(auto: true)
        } else {
            runLegRemaining = after
        }
    }
}
