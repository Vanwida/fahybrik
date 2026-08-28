import Foundation
#if os(iOS)
import UIKit
#endif

// RECUPERAR UN ENTRENO QUE SE CORTÓ. La foto que se autoguarda cada 5 s lleva el
// reloj, las vueltas cerradas y los testigos de honestidad del tramo en curso, de
// modo que al volver se REANUDA lo que el atleta declaró en vez de re-precargar la
// prescripción encima. Lo que los motores no pueden reconstruir —la ronda en la que
// murió un Tabata, el stream vivo del PM5 o del GPS— se queda perdido a propósito:
// ese formato arranca de cero antes que apuntar rondas que nadie terminó.
//
// Card 174: la foto también lleva la identidad de ESTA salida, el dueño del motor,
// la superficie (calle/cinta) y el cursor de la carrera estructurada. Sin eso un
// kill dejaba Hoy vacío y el Watch descolgado. Lock / scene / jetsam PERSISTEN;
// no llaman a finish (157: solo un final pedido por una persona).
extension WorkoutSession {
    func persistedSnapshot(leftToResumeLater: Bool = false) -> PersistedWorkoutState {
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
            sessionId: liveSessionId,
            owner: owner,
            runEnvironment: runEnvironment,
            leftToResumeLater: leftToResumeLater,
            autoPaused: autoPaused,
            hasArmedInitial: hasArmedInitial,
            awaitingBlockStart: isAwaitingBlockStart,
            runLegIndex: runLegIndex,
            runCountInRemaining: runCountInRemaining,
            runLegRemaining: runLegRemaining,
            runLegStartElapsed: runLegStartElapsed,
            runStructureSegmentIndex: runStructureSegmentIndex
        )
    }

    /// Write the live photo now. The 5 s tick is not enough: a lock in the first
    /// seconds, or an auto-pause (tick returns early), left nothing on disk.
    func persistNow() {
        let snapshot = persistedSnapshot()
        Task { await WorkoutStateStore.shared.save(snapshot) }
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
        if let env = snapshot.runEnvironment {
            runEnvironment = env
        }
        if let owner = snapshot.owner {
            self.owner = owner
        }
        isPaused = snapshot.isPaused
        autoPaused = snapshot.autoPaused ?? false
        // A photo written mid-run already passed the first gate. Default true so
        // an older snapshot does not re-arm the preview and freeze the clock.
        hasArmedInitial = snapshot.hasArmedInitial ?? true
        if let waiting = snapshot.awaitingBlockStart {
            isAwaitingBlockStart = waiting
        }
        if let idx = snapshot.runLegIndex { runLegIndex = idx }
        if let remaining = snapshot.runCountInRemaining { runCountInRemaining = remaining }
        if let remaining = snapshot.runLegRemaining { runLegRemaining = remaining }
        if let start = snapshot.runLegStartElapsed { runLegStartElapsed = start }
        if let seg = snapshot.runStructureSegmentIndex { runStructureSegmentIndex = seg }
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
        return persistedSnapshot(leftToResumeLater: true)
    }

    /// Lock / scene / terminate write the photo. They never finish (157).
    func attachProcessPersistence() {
        #if os(iOS)
        guard processLifecycleTokens.isEmpty else { return }
        let center = NotificationCenter.default
        let save: (Notification) -> Void = { [weak self] _ in
            self?.persistNow()
        }
        processLifecycleTokens = [
            center.addObserver(
                forName: UIApplication.didEnterBackgroundNotification,
                object: nil,
                queue: .main,
                using: save
            ),
            center.addObserver(
                forName: UIApplication.willTerminateNotification,
                object: nil,
                queue: .main,
                using: save
            ),
        ]
        #endif
    }

    func detachProcessPersistence() {
        #if os(iOS)
        processLifecycleTokens.forEach { NotificationCenter.default.removeObserver($0) }
        processLifecycleTokens = []
        #endif
    }
}
