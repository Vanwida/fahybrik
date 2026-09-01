import Foundation

// EL TIEMPO. Un solo latido de 0,25 s mueve todos los relojes de la sesión: el
// total, el del tramo, la acumulación por zona, el motor del formato que esté
// activo, el descanso entre series y el autoguardado. Que sean uno y no cinco es
// lo que impide que dos cronómetros de la misma sesión digan cosas distintas.
extension WorkoutSession {
    /// El latido nominal del reloj de la sesión.
    static let latidoNormal: TimeInterval = 0.25
    /// Por encima de esto, entre dos latidos no ha habido lentitud: ha habido una
    /// suspensión. Cinco segundos es veinte veces el latido — ningún dispositivo
    /// vivo se retrasa tanto, y queda muy por debajo de cualquier ausencia real.
    static let huecoQueDelataSuspension: TimeInterval = 5

    func tick() {
        // The block-preview gate freezes ALL clocks (elapsed, lap, EMOM count-in/
        // countdown) until the athlete taps Empezar; resetting lastTick means the
        // elapsed clock can't jump by the time spent on the preview.
        guard !isPaused, !isFinished, !isAwaitingBlockStart, !isAwaitingFinishDecision else {
            lastTick = Date()
            return
        }
        let now = Date()
        var dt: Double
        #if os(iOS)
        let appleElapsed: TimeInterval? = MainActor.assumeIsolated {
            PhoneWorkoutRun.shared.session == nil ? nil : PhoneWorkoutRun.shared.elapsedTime
        }
        if let apple = appleElapsed {
            dt = max(0, apple - elapsedSeconds)
            elapsedSeconds = apple
        } else {
            let bruto = now.timeIntervalSince(lastTick)
            dt = bruto
            elapsedSeconds += dt
        }
        #else
        dt = now.timeIntervalSince(lastTick)
        elapsedSeconds += dt
        #endif
        if dt > Self.huecoQueDelataSuspension {
            let bruto = dt
            let midieronDurante = lastMeasuredWorkAt.map { $0 > lastTick } ?? false
            if !midieronDurante {
                discardedSuspendedSeconds += bruto - Self.latidoNormal
                dt = Self.latidoNormal
                elapsedSeconds -= (bruto - Self.latidoNormal)
            }
        }
        lastTick = now
        lapElapsedSeconds += dt
        if let zone = liveZone {
            lapZoneAccumSec[zone.rawValue, default: 0] += dt
        }

        if currentSegment?.hasRunStructure == true { tickRunStructure(dt: dt) }
        else if currentSegment?.isEMOM == true { tickEMOM(dt: dt) }
        else if currentSegment?.isConditioningTimer == true { tickConditioning(dt: dt) }
        // AFTER the engines have moved their cursors: if the athlete crossed into a
        // new work window, re-anchor its clock and its device counters (see
        // WorkoutSession+Tramo). One call covers all three engines.
        syncTramoIfNeeded()

        // Per-set rest countdown. The zero cue must SURVIVE a distracted athlete
        // (Alex, mid-workout: "es fácil distraerse") AND a phone lying on the floor:
        // a heads-up at 10 s, the 3-2-1 ticks, and an unmissable double at zero, all
        // on the workout cue vocabulary rather than the UI-tap one.
        if restRemainingSeconds > 0 {
            let before = restRemainingSeconds
            let after = before - dt
            if before > 10.0 && after <= 10.0 { Haptics.cueStop() } // prepárate
            for boundary in [3.0, 2.0, 1.0] where before > boundary && after <= boundary {
                Haptics.cueTick()
            }
            if after <= 0 {
                restRemainingSeconds = 0
                restTotalSeconds = 0
                Haptics.cueGo()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { Haptics.cueGo() }
            } else {
                restRemainingSeconds = after
            }
        }

        autoSaveTicker += 1
        if autoSaveTicker >= 20 {        // 0.25s × 20 = 5s
            autoSaveTicker = 0
            Task { [snapshot = persistedSnapshot()] in
                await WorkoutStateStore.shared.save(snapshot)
            }
        }
    }
}
