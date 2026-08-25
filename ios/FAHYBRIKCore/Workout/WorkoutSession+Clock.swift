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
        let bruto = now.timeIntervalSince(lastTick)
        // MIRAR EL MÓVIL A MITAD DE ENTRENO NO ALARGA EL ENTRENO (card 143).
        //
        // Este reloj suma el hueco entre un latido y el siguiente, no lee la hora
        // de fin menos la de inicio. Mientras la app está delante eso es exacto.
        // Cuando el sistema la manda al fondo SUSPENDE los latidos sin cancelarlos,
        // así que al volver el primer latido traía de golpe todo el rato ausente y
        // se sumaba entero: 40 minutos de entreno con una llamada de 15 se
        // guardaban como 55. Y no es cosmético — la duración alimenta la carga de
        // la semana, que es con lo que el entrenador decide si alguien se está
        // pasando.
        //
        // POR QUÉ NO BASTA CON DESCONTAR SIEMPRE EL SEGUNDO PLANO: el que corre por
        // la calle con el móvil en el bolsillo y la pantalla apagada SÍ está
        // entrenando, y ese tiempo tiene que contar. La diferencia no es si la app
        // estaba delante: es si alguien seguía MIDIENDO trabajo.
        //
        // Por eso el hueco cuenta cuando durante él entraron metros —de calle, de
        // cinta o de ergómetro— y no cuenta cuando no entró nada. El pulso no vale
        // como prueba: el reloj sigue latiendo mientras descansas.
        //
        // Y cuando no cuenta, no se tira: se guarda en `discardedSuspendedSeconds`,
        // porque un entreno que dice 40 minutos cuando pasaron 55 tiene que poder
        // explicarse.
        var dt = bruto
        if bruto > Self.huecoQueDelataSuspension {
            let midieronDurante = lastMeasuredWorkAt.map { $0 > lastTick } ?? false
            if !midieronDurante {
                discardedSuspendedSeconds += bruto - Self.latidoNormal
                dt = Self.latidoNormal
            }
        }
        lastTick = now
        elapsedSeconds += dt
        lapElapsedSeconds += dt
        if let zone = liveZone {
            lapZoneAccumSec[zone.rawValue, default: 0] += dt
        }

        let workDt = BeltWorkClock.workTick(wallDt: dt,
                                            surface: beltClockSurface,
                                            window: beltClockWindow,
                                            beltMoving: treadmillBeltWorking)
        if BeltWorkClock.applies(surface: beltClockSurface, window: beltClockWindow,
                                 beltMoving: treadmillBeltWorking) {
            beltWorkElapsedS += workDt
        }

        if currentSegment?.hasRunStructure == true { tickRunStructure(dt: workDt) }
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

    var beltClockSurface: BeltWorkClock.Surface {
        runEnvironment == .treadmill ? .ftms : .other
    }

    var beltClockWindow: BeltWorkClock.Window {
        if isTramoCountIn { return .countIn }
        if isTramoResting { return .recovery }
        if tramoIsRun { return .work }
        return .format
    }

    var gatesBeltWorkClock: Bool {
        BeltWorkClock.applies(surface: beltClockSurface, window: beltClockWindow,
                              beltMoving: treadmillBeltWorking)
    }

    func noteTreadmillBeltWorking(_ working: Bool) {
        treadmillBeltWorking = working
    }

    func resetBeltWorkElapsed() {
        beltWorkElapsedS = 0
    }
}
