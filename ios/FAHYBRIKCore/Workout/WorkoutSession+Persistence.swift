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
            scaledNote: scaledNote
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
    }
}
