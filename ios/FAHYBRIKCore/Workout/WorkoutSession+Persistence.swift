import Foundation

// RECUPERAR UN ENTRENO QUE SE CORTÓ. La foto que se autoguarda cada 5 s lleva el
// reloj, las vueltas cerradas y los testigos de honestidad del tramo en curso, de
// modo que al volver se REANUDA lo que el atleta declaró en vez de re-precargar la
// prescripción encima. Lo que los motores no pueden reconstruir —la ronda en la que
// murió un Tabata, el stream vivo del PM5 o del GPS— se queda perdido a propósito:
// ese formato arranca de cero antes que apuntar rondas que nadie terminó.
extension WorkoutSession {
    func persistedSnapshot() -> PersistedWorkoutState {
        PersistedWorkoutState(
            plan: plan,
            startedAt: startedAt,
            currentSegmentIndex: currentSegmentIndex,
            elapsedSeconds: elapsedSeconds,
            lapElapsedSeconds: lapElapsedSeconds,
            laps: laps,
            repsByCurrentSegment: repsCurrentSegment,
            isPaused: isPaused,
            savedAt: Date(),
            assignmentId: assignmentId,
            // The in-flight segment's honesty carriers travel with it, so a recovered
            // session resumes what the athlete DECLARED instead of re-priming the
            // prescription over it. Only the DECLARED load rides along — a primed one
            // is the plan and is re-derived from the plan on re-entry.
            currentSegmentPrimed: repsPrimedSegmentIndex == currentSegmentIndex,
            repsConfirmed: repsConfirmed,
            repsSkipped: repsSkipped,
            setRecords: setRecords.isEmpty ? nil : setRecords,
            declaredLoadKg: loadConfirmed ? manualLoadKg : nil,
            manualRunDistanceMeters: manualRunDistanceMeters,
            rxScaled: rxScaled,
            scaledNote: scaledNote,
            hkSessionUUID: hkSessionUUID,
            isFree: isFreeRun || assignmentId == nil,
            freeTitle: freeTitle,
            freeModalityWire: freeModalityWire,
            freeItemsJSON: freeItemsJSON,
            runEnvironment: runEnvironment,
            hasArmedInitial: hasArmedInitial,
            isAwaitingBlockStart: isAwaitingBlockStart,
            isAwaitingFinishDecision: isAwaitingFinishDecision,
            isExtraWork: isExtraWork,
            autoPaused: autoPaused,
            restRemainingSeconds: restRemainingSeconds,
            restTotalSeconds: restTotalSeconds,
            emomCountInRemaining: emomCountInRemaining,
            emomIntervalIndex: emomIntervalIndex,
            emomPhase: emomSegmentIndex == nil ? nil : emomPhase.rawValue,
            emomPhaseRemaining: emomPhaseRemaining,
            emomCompletedIntervals: emomCompletedIntervals,
            emomSegmentIndex: emomSegmentIndex,
            runLegIndex: runStructureSegmentIndex == nil ? nil : runLegIndex,
            runCountInRemaining: runCountInRemaining,
            runLegRemaining: runLegRemaining,
            runLegStartElapsed: runLegStartElapsed,
            runStructureSegmentIndex: runStructureSegmentIndex,
            condCountInRemaining: condCountInRemaining,
            condStartElapsed: condStartElapsed,
            condSegmentIndex: condSegmentIndex,
            fixedRoundsDone: fixedRoundsDone,
            rotPhase: condSegmentIndex == nil ? nil : rotPhase.rawValue,
            rotRoundIndex: rotRoundIndex,
            rotPhaseRemaining: rotPhaseRemaining,
            rotRoundsCompleted: rotRoundsCompleted
        )
    }

    /// Resume from a crash-recovery snapshot. The ONE restore path: it re-seats the
    /// clock + the closed laps AND the in-flight segment's honesty carriers, marking
    /// that segment already primed so re-entry can't overwrite the athlete's own
    /// numbers with the prescription. What the snapshot doesn't know (an older build,
    /// a carrier that was never set) is left to the normal priming — assumed and
    /// unconfirmed — never promoted to declared.
    ///
    /// Anything the engines cannot rebuild (the round a Tabata died in, the live
    /// PM5/GPS stream) stays lost rather than guessed: the recovered session starts
    /// that format from zero instead of claiming rounds nobody finished.
    func restore(from snapshot: PersistedWorkoutState) {
        assignmentId = snapshot.assignmentId
        hkSessionUUID = snapshot.hkSessionUUID
        isFreeRun = snapshot.isFree == true || snapshot.assignmentId == nil
        freeTitle = snapshot.freeTitle
        freeModalityWire = snapshot.freeModalityWire
        freeItemsJSON = snapshot.freeItemsJSON
        runEnvironment = snapshot.runEnvironment
        currentSegmentIndex = snapshot.currentSegmentIndex
        elapsedSeconds = snapshot.elapsedSeconds
        lapElapsedSeconds = snapshot.lapElapsedSeconds
        laps = snapshot.laps
        repsCurrentSegment = snapshot.repsByCurrentSegment
        repsConfirmed = snapshot.repsConfirmed ?? false
        repsSkipped = snapshot.repsSkipped ?? false
        rxScaled = snapshot.rxScaled
        scaledNote = snapshot.scaledNote
        manualRunDistanceMeters = snapshot.manualRunDistanceMeters
        if let kg = snapshot.declaredLoadKg {
            manualLoadKg = kg
            primedLoadKg = nil          // declared, not primed → `loadConfirmed` holds
        }
        // "Estrenar vs reanudar" lives HERE, in the same sentinels a back-step uses:
        // a segment the athlete had already entered is RESUMED (priming is spent, so
        // it can't overwrite the recovered numbers); one merely reached is STARTED
        // and primes normally. An older snapshot carries neither → it starts.
        if snapshot.currentSegmentPrimed == true {
            repsPrimedSegmentIndex = currentSegmentIndex
            setsPrimedSegmentIndex = currentSegmentIndex
        }
        if let sets = snapshot.setRecords, !sets.isEmpty {
            setRecords = sets
            setsPrimedSegmentIndex = currentSegmentIndex
        }
        hasArmedInitial = snapshot.hasArmedInitial ?? true
        isAwaitingBlockStart = snapshot.isAwaitingBlockStart ?? false
        isAwaitingFinishDecision = snapshot.isAwaitingFinishDecision ?? false
        isExtraWork = snapshot.isExtraWork ?? false
        isPaused = snapshot.isPaused
        autoPaused = snapshot.autoPaused ?? false
        restRemainingSeconds = snapshot.restRemainingSeconds ?? 0
        restTotalSeconds = snapshot.restTotalSeconds ?? 0
        emomCountInRemaining = snapshot.emomCountInRemaining ?? 0
        emomIntervalIndex = snapshot.emomIntervalIndex ?? 0
        if let phase = snapshot.emomPhase { emomPhase = RotatingPhase(rawValue: phase) ?? .work }
        emomPhaseRemaining = snapshot.emomPhaseRemaining ?? 0
        emomCompletedIntervals = snapshot.emomCompletedIntervals ?? 0
        emomSegmentIndex = snapshot.emomSegmentIndex
        runLegIndex = snapshot.runLegIndex ?? 0
        runCountInRemaining = snapshot.runCountInRemaining ?? 0
        runLegRemaining = snapshot.runLegRemaining ?? 0
        runLegStartElapsed = snapshot.runLegStartElapsed ?? 0
        runStructureSegmentIndex = snapshot.runStructureSegmentIndex
        condCountInRemaining = snapshot.condCountInRemaining ?? 0
        condStartElapsed = snapshot.condStartElapsed ?? 0
        condSegmentIndex = snapshot.condSegmentIndex
        fixedRoundsDone = snapshot.fixedRoundsDone ?? 0
        if let phase = snapshot.rotPhase { rotPhase = RotatingPhase(rawValue: phase) ?? .work }
        rotRoundIndex = snapshot.rotRoundIndex ?? 0
        rotPhaseRemaining = snapshot.rotPhaseRemaining ?? 0
        rotRoundsCompleted = snapshot.rotRoundsCompleted ?? 0
    }

    /// Card 142 — "Salir y seguir luego". El atleta se va A PROPÓSITO a media
    /// sesión (entre bloque y bloque, un descanso de verdad) con intención clara
    /// de volver a ESTA misma sesión — no es un abandono ni un fin de entreno.
    /// Congela el reloj (idempotente: si el propio sheet de salida ya pausó para
    /// pedir la decisión, no hace nada) y devuelve la instantánea que hay que
    /// guardar. El llamador tiene que:
    ///   1) guardarla YA (nunca esperar al tick de autoguardado de 5 s — si el
    ///      atleta cierra la app antes de ese tick se perdía lo declarado), y
    ///   2) NO llamar jamás a `WorkoutStateStore.clear()/close()` en esta ruta:
    ///      la instantánea es justo lo que permite retomarla luego, por el mismo
    ///      camino que ya usa la recuperación tras un cierre inesperado
    ///      (`WorkoutRecoveryGate` + `restore(from:)`).
    @discardableResult
    func leaveToResumeLater() -> PersistedWorkoutState {
        if !isPaused, !isFinished { isPaused = true }
        // El almacén tiene un cerrojo: cuando una sesión termina o se descarta se
        // cierra, y a partir de ahí TODO guardado se descarta en silencio. Salir a
        // medias es lo contrario de terminar, así que se reabre antes de guardar —
        // si un cerrojo viejo siguiera echado, la instantánea se perdería sin que
        // nadie se enterara, que es exactamente el fallo más caro que puede tener
        // esta ruta.
        Task { await WorkoutStateStore.shared.open() }
        return persistedSnapshot()
    }
}
