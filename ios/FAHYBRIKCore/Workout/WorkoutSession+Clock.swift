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

        tickTramo(dt: dt, workDt: workDt)
        syncTramoIfNeeded()
        considerDistanceClose()

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

    /// Duración que se GUARDA al cerrar un tramo de correr en cinta: el reloj
    /// de trabajo si hubo feed FTMS, la pared si no. No deshace 167: conecta
    /// el mismo reloj al lap.
    var lapEffortSeconds: Double {
        if tramoIsRun, beltWorkElapsedS > 0 { return beltWorkElapsedS }
        return lapElapsedSeconds
    }

    /// One clock. Count-in, rest, boxed work, then the segment cap.
    func tickTramo(dt: Double, workDt: Double) {
        if countInRemaining > 0 {
            tickCountIn(dt)
            return
        }
        if restRemainingSeconds > 0 {
            tickUnifiedRest(dt)
        }
        if workRemaining > 0, restRemainingSeconds <= 0 {
            let phaseDt = (tramoIsRun && !isTramoResting) ? workDt : dt
            tickWorkBox(phaseDt)
        }
        if restRemainingSeconds <= 0 {
            advanceStationIfClockGoalMet()
        }
    }

    private func tickCountIn(_ dt: Double) {
        let before = countInRemaining
        countInRemaining = max(0, before - dt)
        if before.rounded(.up) == countInRemaining.rounded(.up) { return }
        if countInRemaining <= 0 {
            finishCountIn()
        } else {
            WorkoutAudio.shared.playTick()
            Haptics.cueTick()
        }
    }

    func skipCountIn() {
        guard countInRemaining > 0 else { return }
        countInRemaining = 0
        finishCountIn()
    }

    func finishCountIn() {
        countInRemaining = 0
        if currentSegment?.isConditioningTimer == true {
            condStartElapsed = lapElapsedSeconds
            if let seg = currentSegment {
                startRotatingFirstPhase(seg)
                if seg.formatScheme?.presentation != .rotating,
                   let total = seg.formatTotalSeconds, total > 0 {
                    workRemaining = Double(total)
                }
            }
        }
        if isRunStructureActive { markRunLegStart() }
        if currentSegment?.isEMOM == true, let plan = currentSegment?.emomPlan {
            emomPhase = .work
            workRemaining = Double(plan.workSeconds)
        }
        reanchorTramoDeviceWindowAtGo()
        latchRunProgress()
        WorkoutAudio.shared.playGo()
        Haptics.cueGo()
        #if os(iOS)
        if isRunStructureActive { AudioCoach.shared.announceRunLeg(in: self) }
        #endif
    }

    private func tickUnifiedRest(_ dt: Double) {
        let before = restRemainingSeconds
        let after = before - dt
        if before > 10.0 && after <= 10.0 { Haptics.cueStop() }
        for boundary in [3.0, 2.0, 1.0] where before > boundary && after <= boundary {
            WorkoutAudio.shared.playTick()
            Haptics.cueTick()
        }
        if after <= 0 {
            restRemainingSeconds = 0
            restTotalSeconds = 0
            let ends = restEndsTramo
            restEndsTramo = false
            Haptics.cueGo()
            if ends {
                WorkoutAudio.shared.playIntervalStart()
                closeTramo(auto: true)
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { Haptics.cueGo() }
            }
        } else {
            restRemainingSeconds = after
        }
    }

    private func tickWorkBox(_ dt: Double) {
        let before = workRemaining
        let after = before - dt
        for boundary in [3.0, 2.0, 1.0] where before > boundary && after <= boundary {
            WorkoutAudio.shared.playTick()
            Haptics.cueTick()
        }
        #if os(iOS)
        if isRunStructureActive {
            AudioCoach.shared.runLegTimeRemaining(after, in: self)
        }
        #endif
        if after <= 0 {
            workRemaining = 0
            closeTramo(auto: true)
        } else {
            workRemaining = after
        }
    }

}
