import Foundation

// LO QUE ENTRA DE LOS APARATOS: el monitor Concept2, el pulso de una banda o del
// reloj, los metros del GPS y los de la cinta con su pendiente. Un solo sitio por
// señal, y todos con las mismas puertas: nada entra pausado, terminado, en la
// previa de un bloque ni fuera de un tramo que mida eso.
//
// La sesión es la dueña del acumulado — no la pantalla — así que cerrar y reabrir
// un HUD no pierde ni un metro. Los contadores del PM5 son acumulativos del piece
// entero, de modo que lo que se guarda es siempre el DELTA de la ventana; y un
// monitor que se reinicia a mitad se re-ancla en vez de congelar la cuenta.
extension WorkoutSession {
    /// Erg meters covered IN THIS SEGMENT'S WINDOW — the PM5's cumulative distance
    /// minus the window's start anchor (the same delta `lap()` records; the raw
    /// counter spans the whole piece, so it would lie on serie 2+). Nil until the
    /// first PM5 sample of the segment lands. This is the SAVED window: it spans
    /// the whole segment, rests included, and is what the execution record carries.
    /// The LIVE surfaces read the tramo window below instead.
    var lapErgDistanceMeters: Double? {
        guard let start = lapErgStartDistance, let last = lapErgLastDistance else { return nil }
        return max(0, last - start)
    }

    /// Erg calories burned IN THIS SEGMENT'S WINDOW — the calorie twin of
    /// `lapErgDistanceMeters`, same anchoring, same reason.
    var lapErgCalories: Int? {
        guard let start = lapErgStartCalories, let last = lapErgLastCalories else { return nil }
        return max(0, last - start)
    }

    /// Pulls one erg sample into the current segment's aggregation. Called from
    /// the view's PM5 onChange so the session stays the single owner of capture
    /// state without depending on the PM5 store directly (testable seam).
    func sampleErg(
        paceSecPer500m: Double?,
        powerWatts: Int?,
        strokeRate: Int?,
        distanceMeters: Double?,
        caloriesKcal: Int?,
        dragFactor: Int? = nil,
        caloriesPerHour: Int? = nil,
        monitorAvgPaceSecPer500m: Double? = nil,
        peakDriveForceLbs: Double? = nil,
        avgDriveForceLbs: Double? = nil
    ) {
        // Gated on the TRAMO law, not on a hard-coded format: a ski round inside
        // an EMOM, a remo inside a superserie, or a PM5 under a free-order AMRAP
        // all record. Connect without a live window still does not count.
        guard !isPaused, !isFinished, !isAwaitingBlockStart,
              MachineTramoLaw.recordsPM5(tramo: currentTramo, segment: currentSegment)
        else { return }
        // The cursor may have moved since the last tick; anchor this sample in the
        // window it actually belongs to before it is counted.
        syncTramoIfNeeded()
        // What the window had measured BEFORE this sample. The station's automatic
        // exit fires on the goal being CROSSED, not merely on a reading that sits
        // past it — which is what keeps a reconnection from closing a piece the
        // athlete is still in the middle of.
        let ergMetersBefore = tramoErgDistanceMeters
        let ergCaloriesBefore = tramoErgCalories
        lapHadPM5 = true
        if let p = paceSecPer500m, p > 0 { lapErgPaceSamples.append(p) }
        if let w = powerWatts, w > 0 { lapErgPowerSamples.append(Double(w)) }
        if let s = strokeRate, s > 0 { lapErgSpmSamples.append(Double(s)) }
        // The PM5's counters are CUMULATIVE — until the monitor RESETS them: a
        // programmed piece landing ("row to begin") or the athlete pressing Menu
        // zeroes distance/calories mid-segment. On a backward jump, re-anchor so
        // the meters already covered in this window are preserved instead of the
        // delta silently freezing at max(0, small − big).
        if let d = distanceMeters {
            if lapErgStartDistance == nil {
                lapErgStartDistance = d
            } else if let last = lapErgLastDistance, d < last {
                lapErgStartDistance = d - (last - (lapErgStartDistance ?? d))
                // The TRAMO window re-anchors the SAME way, preserving what this
                // window had already covered. Re-anchoring it to `d` instead threw
                // those metres away, so a monitor reset — or a reconnection that
                // comes back from zero mid-piece — silently sent the athlete back to
                // 0/1.000 and asked him to row the piece again.
                tramoErgStartDistance = d - Swift.max(0, last - (tramoErgStartDistance ?? last))
            }
            // The bout's own zero, so serie 2 of a 5×500 starts at 0 m and not at
            // the 1000 m the piece has covered so far.
            if tramoErgStartDistance == nil { tramoErgStartDistance = d }
            // Real work in this window: the held bout clock starts HERE, not when
            // the athlete tapped Empezar and walked to the machine.
            if let anchor = tramoErgStartDistance, d > anchor { releaseArmedTramoClock() }
            lapErgLastDistance = d
        }
        if let c = caloriesKcal {
            if lapErgStartCalories == nil {
                lapErgStartCalories = c
            } else if let last = lapErgLastCalories, c < last {
                lapErgStartCalories = c - (last - (lapErgStartCalories ?? c))
                tramoErgStartCalories = c - Swift.max(0, last - (tramoErgStartCalories ?? last))
            }
            if tramoErgStartCalories == nil { tramoErgStartCalories = c }
            // Calories alone can free the armed clock (bike/ski cal pieces often
            // tick cal before a meaningful distance).
            if let anchor = tramoErgStartCalories, c > anchor { releaseArmedTramoClock() }
            lapErgLastCalories = c
        }
        // A calorie-measured bout on a static machine can produce calories before a
        // measurable metre: honour power as movement too.
        if let w = powerWatts, w > 0 { releaseArmedTramoClock() }
        if let df = dragFactor, df > 0 { lapErgDragSamples.append(Double(df)) }
        if let ch = caloriesPerHour, ch > 0 { lapErgCalPerHourSamples.append(Double(ch)) }
        if let pf = peakDriveForceLbs, pf > 0 { lapErgPeakForceSamples.append(pf) }
        if let af = avgDriveForceLbs, af > 0 { lapErgAvgForceSamples.append(af) }
        // The monitor's own average pace (last value wins — it's already the mean
        // over the piece), preferred over our sample mean when persisting.
        if let ap = monitorAvgPaceSecPer500m, ap > 0 { lapErgMonitorAvgPace500 = ap }
        // LAST, once the window has counted this sample: the machine may have just
        // finished the station's piece. Only a goal REACHED leaves a station — a
        // monitor that goes quiet is a rest, not an exit.
        advanceStationIfMachineGoalMet(beforeMeters: ergMetersBefore,
                                       beforeCalories: ergCaloriesBefore)
    }

    /// Snapshots the PM5's completed splits for the current erg segment. Called
    /// from the view's PM5-splits onChange, mirroring `sampleErg` — the session
    /// stays the single owner of per-segment capture without touching the store.
    /// Replace-semantics: the store always holds the full ordered split list.
    func captureErgSplits(_ splits: [PM5Split]) {
        guard !isFinished, currentSegment?.kind.isErg == true else { return }
        lapErgSplits = splits
    }

    /// Feeds a live HR reading from a wearable. `source` records WHERE it came from
    /// (a BLE chest/arm strap, Apple Watch/iPhone via HealthKit, or a strap paired
    /// through the PM5) so the connection strip can show provenance.
    func injectLiveHR(_ bpm: Int, source: HRSource) {
        // Finished minutes are NOT training data — but a test's HRR window IS a
        // measurement: post-finish readings feed ONLY the recovery capture (live
        // value + HRR engine), never the lap aggregation. With no window open
        // (every normal session) they're dropped exactly as before.
        if isFinished {
            guard let hrRecovery, let finishedAt else { return }
            let offset = Date().timeIntervalSince(finishedAt)
            guard offset <= HRRecoveryCapture.windowSeconds else { return }
            liveHRBpm = bpm
            hrRecovery.addSample(bpm: bpm, secondsSinceFinish: offset)
            return
        }
        // Paused minutes are NOT training data: a rest-HR reading taken while the
        // athlete paused must not enter the lap's HR aggregation. Objectively
        // correct on both platforms — the phone pauses the same engine, and the
        // watch pauses the HK session alongside it (WatchWorkoutCoordinator
        // .togglePause), so no stream should feed through.
        guard !isPaused else { return }
        // OWNERSHIP decides BEFORE anything is recorded, not after. With two
        // sources streaming at once (a chest strap + the Watch via HealthKit, or
        // the Watch + a PM5-paired strap — both normal), only the source that OWNS
        // this instant may feed the live number and every aggregate. A
        // lower-priority reading while the owner is alive is real HR, but not the
        // device this instant belongs to: accepting it blended two pulses into one
        // meaningless average, let whichever reading arrived last win the
        // on-screen number regardless of label, and let a weaker source's
        // artifact become the tramo's recorded max. Same latch as before
        // (strap=3 > healthkit=2 > pm5=1, `hrSourceStaleSeconds` quiet window) —
        // it now gates the NUMBER too, not only the label.
        let now = Date()
        if let current = hrSource, source.priority < current.priority,
           now.timeIntervalSince(hrSourceLastSeenAt) < Self.hrSourceStaleSeconds {
            return   // the owner is alive — a lower-priority reading feeds nothing
        }
        // Either this source already owns the window, it is taking over (equal or
        // higher priority), or the previous owner went quiet past the window and
        // this is the handoff — a dead strap must not leave the session pulseless.
        hrSource = source
        hrSourceLastSeenAt = now

        liveHRBpm = bpm
        lapHRSamples.append(bpm)
        // EL ARCHIVO. La media del tramo se queda con un número; la traza se queda con
        // el latido. Va aquí y no antes de la puerta de precedencia a propósito: se
        // archiva lo que la sesión ACEPTÓ, no lo que llegó — así la serie y la media
        // cuentan lo mismo, y un relevo de banda a reloj se ve como dos series
        // consecutivas en vez de como una mezcla de dos pulsos.
        trace.record(.hr, source: source.traceSource, value: Double(bpm), atSecond: traceSecond(now))
        // The tramo's own peak, so the rest screen can show a REAL drop ("162 → 138")
        // instead of a bare current value that says nothing about recovering.
        noteTramoHR(bpm)
        // HRR effort tail — keep the last ~12 s of readings so a test finish can
        // derive hr_end (mean of the final 10 s of effort). Pruned every reading.
        recentEffortHR.append((date: now, bpm: bpm))
        let cutoff = now.addingTimeInterval(-Self.effortTailKeepSeconds)
        while let first = recentEffortHR.first, first.date < cutoff {
            recentEffortHR.removeFirst()
        }
    }

    /// Accumulates phone-GPS covered distance for the current RUN work. The provider
    /// passes the incremental meters since its last callback; we sum them into the
    /// in-window total. TRAMO-gated like the belt and the monitor, so an outdoor run
    /// leg inside ANY format (a HYROX sim, a circuit, a For Time) records its metres
    /// instead of only a segment the coach happened to author as a pure run.
    /// `source` es QUIÉN midió estos metros, y por eso viaja: en el teléfono los pone
    /// un fix de CoreLocation (`gps`, el defecto), pero en la muñeca los pone la
    /// distancia acumulada de HealthKit (`distanceWalkingRunning`), que es fusión de
    /// Apple y no un fix. Sellar los dos como «gps» sería etiquetar el archivo con un
    /// aparato que no lo midió. El defecto mantiene intactos los dos sitios del
    /// teléfono que ya llamaban aquí.
    /// LA DISTANCIA ES UN HECHO FÍSICO; EL TIEMPO PARADO ES UNA POLÍTICA. Por eso la
    /// puerta mira la pausa MANUAL y no la autopausa: con la autopausa enganchada el
    /// crono se congela —eso es lo que el atleta espera— pero los metros se siguen
    /// contando, que es lo que hacen Garmin y Strava. Antes se tiraban, así que una
    /// autopausa disparada por señal floja mientras el atleta seguía corriendo
    /// borraba esos metros para siempre. Sólo la pausa a mano, que es cuando el
    /// atleta ha dicho explícitamente que pare TODO, deja de contar.
    /// Ya no se llama «GPS» y no tiene defecto A PROPÓSITO: desde el 12-ago los metros
    /// no los cuenta CoreLocation sino Apple (podómetro en el teléfono, HealthKit en la
    /// muñeca), así que quien los mete tiene que DECIR de dónde salen. Un defecto `.gps`
    /// regalaba una etiqueta falsa al siguiente que llamara.
    func sampleRunDistance(deltaMeters: Double, source: TraceSource) {
        guard !isManuallyPaused, !isFinished, !isAwaitingBlockStart, tramoIsRun, deltaMeters > 0 else { return }
        lapHadGPS = true
        lapGpsDistanceMeters = (lapGpsDistanceMeters ?? 0) + deltaMeters
        // La distancia va a la traza ACUMULADA sobre el eje de la sesión, no por
        // tramo: con ella cualquier instante del gráfico se puede llevar a un punto
        // del recorrido, que es lo que la polilínea sola no puede hacer porque no
        // lleva tiempos.
        trace.accumulate(.distance, source: source, delta: deltaMeters, atSecond: traceSecond())
    }

    /// Feeds one treadmill INCLINE reading (%) into the current run segment's average
    /// (#62). Called from the treadmill HUD's telemetry so the session stays the
    /// single owner of per-segment capture (mirrors `sampleErg` / `sampleRunDistance`). A
    /// flat belt (0%) is a real reading and counts; ignored off a run segment or
    /// while paused. Averaged into the ONE segment lap on close; nil when never fed.
    func sampleTreadmillIncline(_ inclinePct: Double) {
        // Gated on the TRAMO, not on the segment — the same fix `sampleErg` carries and
        // for the same reason: a RUN minute inside an EMOM is running work whose belt
        // data is real, even though the folded segment that wraps it reads as
        // reps/functional. That guard is why a remo→ski→cinta EMOM recorded nothing
        // from the treadmill (4-ago).
        guard !isPaused, !isFinished, !isAwaitingBlockStart,
              MachineTramoLaw.recordsFTMS(tramo: currentTramo, segment: currentSegment)
        else { return }
        lapInclineSum += inclinePct
        lapInclineCount += 1
    }

    /// Feeds the covered-meters INCREMENT the treadmill belt measured since the last
    /// sample into the current run segment's total (mirrors `sampleRunDistance`). The HUD
    /// computes the increment from the belt odometer / speed and the SESSION owns the
    /// running total, so it survives the live HUD cover being dismissed and re-opened
    /// (the per-tramo truth lives here, not in the ephemeral view model). Pause-aware
    /// by the same guard as the incline/GPS feeds; only positive deltas count.
    func sampleTreadmillDistance(deltaMeters: Double) {
        // TRAMO-gated, like the incline feed above and like `sampleErg`: the belt
        // measures the run minute of a mixed EMOM just as truly as it measures a
        // dedicated run block.
        guard !isPaused, !isFinished, !isAwaitingBlockStart,
              MachineTramoLaw.recordsFTMS(tramo: currentTramo, segment: currentSegment),
              deltaMeters > 0 else { return }
        // The cursor may have moved since the last sample: anchor this one in the
        // window it actually belongs to BEFORE counting it, exactly as `sampleErg`
        // does — otherwise minute 4's metres land in minute 3's bout.
        syncTramoIfNeeded()
        lapBeltDistanceMeters += deltaMeters
        // En cinta la distancia la da la MÁQUINA, y eso queda sellado en la fuente de
        // la traza: quien la lea sabe que estos metros no son de un GPS.
        trace.accumulate(.distance, source: .treadmill, delta: deltaMeters, atSecond: traceSecond())
    }

    /// Live AVERAGE pace (sec/km) covered on the belt this segment — the covered belt
    /// meters over the segment's elapsed. nil until both are meaningful (never a
    /// fabricated pace). The wrist mirror's treadmill glance shows THIS honest covered
    /// average; the phone HUD hero shows the belt's instantaneous pace alongside it.
    var liveBeltPaceSecPerKm: Int? {
        Self.paceSecPerKm(meters: lapBeltDistanceMeters, seconds: lapElapsedSeconds)
            .map { Int($0.rounded()) }
    }

    /// Live covered distance for the current RUN work for HUD display (GPS sum when
    /// available, else the athlete's manual entry). Tramo-gated like the feed that
    /// fills it, so a run station inside any format can show its covered metres.
    var liveRunDistanceMeters: Double? {
        tramoIsRun ? (lapGpsDistanceMeters ?? manualRunDistanceMeters) : nil
    }
}
