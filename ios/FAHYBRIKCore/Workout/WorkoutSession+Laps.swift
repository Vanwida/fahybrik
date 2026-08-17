import Foundation

// EL REGISTRO DEL TRAMO: lo que se GUARDA cuando un segmento se cierra, se
// reabre (un paso atrás) o se abandona. Aquí vive la única construcción del
// LapRecord agregado — con sus reglas de honestidad: distancia medida y nunca la
// prescrita, carga solo si el atleta la declaró, reps con su estado
// (done/scaled/skipped) y su confianza, y el merge de lo ya grabado cuando se
// vuelve a un segmento. Un motor que graba por bout (series de erg, minutos de
// EMOM, tramos de carrera) se salta el agregado en vez de duplicarlo.
extension WorkoutSession {
    // Reset the in-progress live state WITHOUT recording a lap — used when the
    // current segment is abandoned to step / jump backward.
    func discardCurrentLiveState() {
        lapElapsedSeconds = 0
        repsCurrentSegment = 0
        repsConfirmed = false
        repsSkipped = false
        repsPrimedSegmentIndex = nil
        setRecords = []
        setsPrimedSegmentIndex = nil
        dismissRest()
        lapHRSamples.removeAll(keepingCapacity: true)
        lapZoneAccumSec.removeAll(keepingCapacity: true)
        resetErgAccumulators()
        resetSegmentManualAndGPS()
    }

    // Pop the returned-to segment's recorded lap back into editable live state so
    // it resumes from where it ended (clock, reps, load, distance). The HR / zone
    // / calorie aggregates ride along on `reopenedLap` and are merged on re-close
    // (see closeCurrentSegmentLap). A skipped segment (no lap) starts fresh.
    func reopenCurrentSegment() {
        discardCurrentLiveState()
        guard let seg = currentSegment, let last = laps.last, last.segmentId == seg.id else {
            reopenedLap = nil
            return
        }
        let popped = laps.removeLast()
        reopenedLap = popped
        lapElapsedSeconds = popped.durationSeconds
        repsCurrentSegment = popped.repsCompleted ?? 0
        // Restore the honesty carriers and mark this segment already primed, so the
        // re-entry's `primeRepsIfNeeded` / `primeSetsIfNeeded` can't clobber the
        // values the athlete recorded before stepping back.
        repsConfirmed = popped.repsConfirmed
        repsSkipped = popped.repsStatus == "skipped"
        repsPrimedSegmentIndex = currentSegmentIndex
        if let sets = popped.sets {
            setRecords = sets
            setsPrimedSegmentIndex = currentSegmentIndex
        }
        if let rx = popped.rxScaled { rxScaled = rx }
        if let note = popped.scaledNote { scaledNote = note }
        // A recorded weight is by construction a DECLARED one, and the reset above
        // cleared `primedLoadKg`, so restoring it keeps `loadConfirmed` true. A lap
        // that carried no weight re-primes from the prescription, unconfirmed.
        if let kg = popped.weightUsedKg { manualLoadKg = kg }
        if seg.kind == .running, let d = popped.distanceCoveredMeters {
            manualRunDistanceMeters = d
            if popped.source == "gps" { lapGpsDistanceMeters = d; lapHadGPS = true }
        }
    }

    // Builds the enriched LapRecord for the current segment from the accumulated
    // HR / zone / PM5 samples, appends it, and resets the per-segment accumulators.
    func closeCurrentSegmentLap() {
        guard let seg = currentSegment else { return }
        // #break-2: a structured/interval run records ONE lap per WORK leg during
        // advanceRunLeg (each with its own pace), so there is no blended aggregate to
        // build here — just reset the per-segment accumulators the per-leg path used.
        if seg.hasRunStructure {
            resetSegmentAccumulators()
            return
        }
        // Erg series (5×500 / 8×20 cal): each WORK bout already wrote its own LapRecord
        // via `recordErgIntervalBout`. Do not emit a second blended aggregate.
        if seg.formatScheme == .intervals, ergIntervalBoutsRecorded > 0 {
            ergIntervalBoutsRecorded = 0
            resetSegmentAccumulators()
            return
        }
        // EMOM multi-station: each WORK minute already has its own LapRecord
        // (remo / ski / run / …). Stamp rounds on the last bout; skip the blend.
        if emomIntervalBoutsRecorded > 0 {
            if let i = laps.lastIndex(where: { $0.segmentId == seg.id && $0.runLegIndex != nil }) {
                laps[i].emomRoundsCompleted = capturedEmomCompleted
                laps[i].emomRoundsPrescribed = capturedEmomPrescribed
            }
            emomIntervalBoutsRecorded = 0
            resetSegmentAccumulators()
            return
        }
        let now = Date()
        let isErg = seg.kind.isErg
        let usedPM5 = isErg && lapHadPM5

        // Prefer the monitor's OWN average pace (a truer mean over the whole piece)
        // over the mean of our 1 Hz samples; fall back to the sample mean.
        let avgPace500 = usedPM5 ? (lapErgMonitorAvgPace500 ?? mean(lapErgPaceSamples)) : nil
        let avgPower = usedPM5 ? mean(lapErgPowerSamples) : nil
        let avgSpm = usedPM5 ? mean(lapErgSpmSamples) : nil
        // Erg detail aggregates (#33) — all nil off an erg / when unreported.
        let avgDrag: Int? = usedPM5 ? mean(lapErgDragSamples).map { Int($0.rounded()) } : nil
        let avgCalPerHour: Double? = usedPM5 ? mean(lapErgCalPerHourSamples) : nil
        let peakForce: Double? = usedPM5 ? lapErgPeakForceSamples.max() : nil
        let avgForce: Double? = usedPM5 ? mean(lapErgAvgForceSamples) : nil
        let ergSplits: [PM5Split]? = (usedPM5 && !lapErgSplits.isEmpty) ? lapErgSplits : nil
        // In-window distance delta (PM5 distance is cumulative across the piece).
        let ergDistance: Double? = usedPM5 ? lapErgDistanceMeters : nil
        let ergCalories: Double? = usedPM5 ? lapErgCalories.map(Double.init) : nil

        // Distance COVERED (not prescribed): erg in-window delta, else the treadmill
        // BELT's covered meters (indoor run), else phone-GPS covered meters, else the
        // athlete's manual entry. The belt beats GPS/manual — if a belt measured this
        // run it IS the truth of the tramo. We never record the prescribed target as
        // "covered" — target is a HUD hint, not measured work.
        // MEASURED IS MEASURED, whatever format wrapped it. These used to be gated on
        // `seg.kind == .running`, which silently threw the belt's / GPS's metres away
        // for every run that lives INSIDE another format — a run station in a For Time,
        // a HYROX sim, a circuit, an AMRAP, an EMOM. The block folds to a functional
        // segment, so the run work was measured, accumulated, and then dropped on close.
        // The feeds themselves are already tramo-gated (`sampleTreadmillDistance` /
        // `sampleRunDistance`), so anything that reached these accumulators IS run work and
        // there is nothing left to re-check here.
        let usedGPS = lapHadGPS
        let beltDistance: Double? = lapBeltDistanceMeters > 0 ? lapBeltDistanceMeters : nil
        let runDistance: Double? = usedGPS ? lapGpsDistanceMeters : manualRunDistanceMeters
        let distance = ergDistance ?? beltDistance ?? runDistance

        // Run pace COVERED — derived from real covered distance over the segment
        // duration (km/min). Only when we actually measured a distance; otherwise
        // nil (no fabricated pace from the prescription). The belt's covered meters
        // feed it exactly like GPS/manual do.
        let avgPaceKm: Double? = Self.paceSecPerKm(
            meters: beltDistance ?? runDistance, seconds: lapElapsedSeconds
        )

        // Load USED (kg) — ONLY what the athlete DECLARED. It used to fall back to
        // `seg.loadKg`, so a sentadilla done at 80 over a prescription of 100 read
        // back as "5 × 100 kg" and drove the %1RM of the next plan. The prescription
        // is not lost: it stays in `SetRecord.loadPrescribedKg` (→ set_executions),
        // where it is labelled as the plan. Untouched → nil, never the plan echoed
        // back as a measurement.
        var weight: Double? = (seg.kind == .strength || seg.kind == .sled) && loadConfirmed
            ? manualLoadKg
            : nil

        // Honest reps / strength logging. Three states (done/scaled/skipped) plus
        // a confidence flag; NEVER a fabricated 0. EMOM is excluded (its work is
        // interval/time driven, recorded by the EMOM HUD, not the rep field).
        var repsActual: Int? = nil          // canonical actual; nil ONLY when skipped
        var repsPrescribedOut: Int? = nil
        var repsStatusOut: String? = nil
        var repsConfirmedOut = false
        var setRecordsOut: [SetRecord]? = nil

        if seg.usesMultiSetStrength {
            // Per-set strength: aggregate for back-compat analytics; detail in `sets`.
            let recs = setRecords
            setRecordsOut = recs.isEmpty ? nil : recs
            let actuals = recs.compactMap { $0.repsActual }
            repsActual = actuals.isEmpty ? nil : actuals.reduce(0, +)
            let prescribed = recs.compactMap { $0.repsPrescribed }
            repsPrescribedOut = prescribed.isEmpty ? nil : prescribed.reduce(0, +)
            if recs.allSatisfy({ $0.status == "skipped" }) {
                repsStatusOut = "skipped"; repsActual = nil
            } else if recs.contains(where: { $0.status == "scaled" }) {
                repsStatusOut = "scaled"
            } else {
                repsStatusOut = "done"
            }
            repsConfirmedOut = recs.contains { $0.confirmed }
            // Representative load for the segment aggregate = max DECLARED load. A
            // set nobody confirmed carries no actual load (see `primeSetsIfNeeded`),
            // so an untouched 5×5 no longer publishes the prescription as its weight.
            if let maxLoad = recs.compactMap({ $0.loadActualKg }).max() { weight = maxLoad }
        } else if (seg.kind == .reps || seg.kind == .strength) && !seg.isEMOM && !seg.isConditioningTimer {
            if repsSkipped {
                repsActual = nil
                repsStatusOut = "skipped"
                repsConfirmedOut = true
            } else if seg.repsAreOpenScore {
                // Reps ARE the score — a real 0 is legal; no prescribed reference.
                repsActual = repsCurrentSegment
                repsPrescribedOut = nil
                repsStatusOut = "done"
                repsConfirmedOut = repsConfirmed
            } else {
                // Prescribed chunk: untouched advance = primed prescribed value,
                // confirmed=false (assumed). An edit makes it scaled + confirmed.
                repsPrescribedOut = seg.prescribedRepsForLog
                repsActual = repsCurrentSegment
                if let p = repsPrescribedOut, let a = repsActual, a != p {
                    repsStatusOut = "scaled"
                } else {
                    repsStatusOut = "done"
                }
                repsConfirmedOut = repsConfirmed
            }
        }

        // #break-3(b): a genuine single-set STRENGTH lift used to drop its tempo / rest
        // (they lived ONLY in the multi-set `sets[]`, never on the single-set path).
        // Emit a ONE-element set so those prescribed cues reach `set_executions` — the
        // SAME home the coach's per-set analytics read for multi-set work (no new
        // columns, no split-brain). Skipped / open-score / bodyweight-rep work carries
        // no such detail, so it is left exactly as before. RPE/RIR stay nil (collected
        // only if entered, mirroring the multi-set prime — no single-set RPE UI yet).
        //
        // `confirmed` means the athlete TOUCHED this set — the reps OR the load. It
        // used to carry the reps flag alone, so confirming reps also stamped an
        // untouched prescribed load as confirmed. Prescribed and actual load keep
        // their own columns, so a nil actual reads "not declared", never "lifted".
        if seg.kind == .strength, !seg.usesMultiSetStrength, !repsSkipped, !seg.repsAreOpenScore {
            let planned = seg.prescription?.sets?.first
            var single = SetRecord(
                setIndex: 1,
                repsPrescribed: repsPrescribedOut,
                repsActual: repsActual,
                loadPrescribedKg: planned?.prescribedLoadKg ?? seg.loadKg,
                loadActualKg: weight,
                rpe: nil,
                rir: nil,
                status: repsStatusOut ?? "done",
                confirmed: repsConfirmedOut || loadConfirmed,
                tempo: planned?.tempo,
                restS: planned?.restS ?? seg.prescription?.restS
            )
            if let c = sensorConclusions {
                single.meanVelocityFirstMs = c.meanVelocityFirstMs
                single.meanVelocityLastMs = c.meanVelocityLastMs ?? c.lastRepVelocityMs
                single.velocityLossPct = c.velocityLossPct
                single.velocityConfidence = c.velocityConfidence
                single.repsSource = repsConfirmedOut
                    ? (c.reps != nil ? RepsSource.sensorCorrected.rawValue : RepsSource.athleteTap.rawValue)
                    : (c.repsLevel == "counted" ? RepsSource.sensor.rawValue : RepsSource.athleteTap.rawValue)
                single.repsConfidence = c.repsConfidence
            }
            setRecordsOut = [single]
        }

        // Back-compat `repsCompleted` == actual (nil stays nil on a skip — never 0).
        let reps: Int? = repsActual

        // Rx / Scaled only on metcon-family laps (block-scoped choice).
        let lapRxScaled: String? = seg.isMetconFamily ? rxScaled : nil
        let lapScaledNote: String? = (lapRxScaled == "scaled") ? scaledNote : nil

        // Merge aggregates from a REOPENED lap (this segment was re-entered via
        // stepBack / jumpTo) so the back-step never drops the HR / zone / distance
        // / calories already recorded. Raw per-sample data can't be reconstructed,
        // so we fold the stored aggregates: new HR wins when present (else keep
        // the prior avg), max HR is the max of both, zone seconds sum, and the
        // measured distance / calories keep the live value or fall back to prior.
        let reopen = (reopenedLap?.segmentId == seg.id) ? reopenedLap : nil
        let newAvgHR = lapHRSamples.isEmpty ? nil : lapHRSamples.reduce(0, +) / lapHRSamples.count
        let mergedAvgHR = newAvgHR ?? reopen?.avgHRBpm
        let mergedMaxHR = [lapHRSamples.max(), reopen?.maxHRBpm].compactMap { $0 }.max()
        // Which DEVICE measured this segment's pulse — same "new wins, else keep
        // the reopened lap's" merge as the HR values themselves above.
        let newHRSource: String? = lapHRSamples.isEmpty ? nil : hrSource?.rawValue
        let mergedHRSource = newHRSource ?? reopen?.hrSource
        var mergedZone = lapZoneAccumSec
        if let rz = reopen?.zoneSecondsByZone { for (k, v) in rz { mergedZone[k, default: 0] += v } }
        let mergedDistance = distance ?? reopen?.distanceCoveredMeters
        let mergedCalories = ergCalories ?? reopen?.calories
        // Segment AVERAGE treadmill incline (#62): the mean of the belt readings fed
        // this segment, else the reopened lap's stored value; nil when no belt fed it.
        let avgIncline: Double? = lapInclineCount > 0 ? lapInclineSum / Double(lapInclineCount) : nil
        let mergedIncline = avgIncline ?? reopen?.inclinePct

        // Source precedence: the most specific real measurement wins. Device
        // movement data (pm5 / gps) > athlete manual entry > HR-only wearable.
        let usedBelt = beltDistance != nil
        // A PRIMED load is not an entry: `manualLoadKg` carries the prescription until
        // the athlete moves it, so testing it non-nil used to stamp every strength
        // segment as "manual" and hide a real HR-only wearable behind it.
        let hasManualEntry = (runDistance != nil) || loadConfirmed
        let computedSource: String
        if usedPM5 { computedSource = "pm5" }
        else if usedBelt { computedSource = "treadmill" }
        else if usedGPS { computedSource = "gps" }
        else if hasManualEntry { computedSource = "manual" }
        else if !lapHRSamples.isEmpty { computedSource = "healthkit" }
        else { computedSource = "manual" }
        // Keep a richer provenance from the reopened lap if this re-close captured
        // nothing more specific than "manual".
        let source = (computedSource == "manual") ? (reopen?.source ?? computedSource) : computedSource

        let lap = LapRecord(
            id: UUID(),
            segmentId: seg.id,
            templateSegmentId: seg.templateSegmentId,
            position: seg.order,
            modality: seg.wireModality,   // #erg-2: row/ski/bike, not a merged "row"
            startedAt: now.addingTimeInterval(-lapElapsedSeconds),
            endedAt: now,
            durationSeconds: lapElapsedSeconds,
            avgHRBpm: mergedAvgHR,
            maxHRBpm: mergedMaxHR,
            zoneSecondsByZone: mergedZone,
            repsCompleted: reps,
            distanceCoveredMeters: mergedDistance,
            avgPaceSecPer500m: avgPace500,
            avgPaceSecPerKm: avgPaceKm,
            avgPowerWatts: avgPower,
            strokeRateSpm: avgSpm,
            calories: mergedCalories,
            weightUsedKg: weight,
            source: source,
            repsPrescribed: repsPrescribedOut,
            repsStatus: repsStatusOut,
            repsConfirmed: repsConfirmedOut,
            isStructural: false,
            rxScaled: lapRxScaled,
            scaledNote: lapScaledNote,
            sets: setRecordsOut,
            emomRoundsCompleted: capturedEmomCompleted,     // #break-1 (nil off an EMOM)
            emomRoundsPrescribed: capturedEmomPrescribed,
            inclinePct: mergedIncline,
            runCadenceSpm: nil,   // no on-device running-cadence source yet (see LapRecord)
            // Fall back to a reopened lap's erg detail so a back-step never drops it.
            dragFactor: avgDrag ?? reopen?.dragFactor,
            avgCaloriesPerHour: avgCalPerHour ?? reopen?.avgCaloriesPerHour,
            peakDriveForceLbs: peakForce ?? reopen?.peakDriveForceLbs,
            avgDriveForceLbs: avgForce ?? reopen?.avgDriveForceLbs,
            ergSplits: ergSplits ?? reopen?.ergSplits,
            hrSource: mergedHRSource
        )
        // Sensor fases 1–2: stamp work/rest + rep provenance onto the closed lap.
        var stamped = lap
        if let c = sensorConclusions {
            stamped.sensorWorkS = c.sensorWorkS
            stamped.sensorRestS = c.sensorRestS
            stamped.sensorTimingConfidence = c.sensorTimingConfidence
            if stamped.repsSource == nil {
                if let src = setRecordsOut?.compactMap(\.repsSource).last {
                    stamped.repsSource = src
                    stamped.repsConfidence = setRecordsOut?.compactMap(\.repsConfidence).last
                } else if c.repsLevel == "counted" {
                    stamped.repsSource = RepsSource.sensor.rawValue
                    stamped.repsConfidence = c.repsConfidence
                }
            }
        }
        laps.append(stamped)
        resetSegmentAccumulators()
    }

    // Reset every per-segment accumulator after a lap closes (or, for a structured run
    // whose WORK legs were recorded individually, after the per-leg path consumed them)
    // so the next segment starts from its own prescription, not the previous one's data.
    private func resetSegmentAccumulators() {
        reopenedLap = nil
        lapElapsedSeconds = 0
        lapHRSamples.removeAll(keepingCapacity: true)
        lapZoneAccumSec.removeAll(keepingCapacity: true)
        repsCurrentSegment = 0
        repsConfirmed = false
        repsSkipped = false
        repsPrimedSegmentIndex = nil
        setRecords = []
        setsPrimedSegmentIndex = nil
        sensorConclusions = nil
        lastSensorSeq = -1
        // #break-1: the captured EMOM rounds have been written to the lap — clear them
        // so a following non-EMOM segment never inherits a stale count.
        capturedEmomCompleted = nil
        capturedEmomPrescribed = nil
        dismissRest()
        resetErgAccumulators()
        resetTramoWindow()
        resetSegmentManualAndGPS()
    }

    // Clears the per-segment manual-entry + GPS capture so the next segment
    // starts from its own prescription, not the previous segment's values.
    private func resetSegmentManualAndGPS() {
        manualLoadKg = nil
        primedLoadKg = nil
        manualRunDistanceMeters = nil
        lapGpsDistanceMeters = nil
        lapHadGPS = false
        lapInclineSum = 0
        lapInclineCount = 0
        lapBeltDistanceMeters = 0
    }

    private func resetErgAccumulators() {
        lapErgPaceSamples.removeAll(keepingCapacity: true)
        lapErgPowerSamples.removeAll(keepingCapacity: true)
        lapErgSpmSamples.removeAll(keepingCapacity: true)
        lapErgStartDistance = nil
        lapErgLastDistance = nil
        lapErgStartCalories = nil
        lapErgLastCalories = nil
        lapHadPM5 = false
        lapErgDragSamples.removeAll(keepingCapacity: true)
        lapErgCalPerHourSamples.removeAll(keepingCapacity: true)
        lapErgPeakForceSamples.removeAll(keepingCapacity: true)
        lapErgAvgForceSamples.removeAll(keepingCapacity: true)
        lapErgMonitorAvgPace500 = nil
        lapErgSplits.removeAll(keepingCapacity: true)
    }

    private func mean(_ xs: [Double]) -> Double? {
        guard !xs.isEmpty else { return nil }
        return xs.reduce(0, +) / Double(xs.count)
    }
}
