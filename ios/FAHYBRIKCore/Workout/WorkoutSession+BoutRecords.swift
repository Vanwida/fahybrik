import Foundation

// UNA VENTANA DE TRABAJO CERRADA = UNA FILA. Los tres motores graban su bout de la
// misma manera y el código lo venía diciendo por escrito («el gemelo de erg de
// recordRunLegLap», «igual que en las series de erg y en la carrera estructurada»):
// aquí están los tres juntos, para que sigan contestando lo mismo.
//
// El reparto es siempre el mismo: la ventana del tramo ya latchada da la duración y
// lo que midió la máquina, los cursores de muestra (`stampTramoSampleCursors`)
// recortan el pulso / ritmo / potencia a ESTA serie, y `runLegIndex` lleva el
// ordinal para que el servidor re-secuencie sin adivinar por orden de llegada.
// Nada de esto inventa un número: sin medida, nil.
extension WorkoutSession {
    /// Stamp sample-array cursors for the open tramo (HR / pace / power / SPM).
    /// Called from the tramo layer (other file) so `private` arrays stay in this file.
    func stampTramoSampleCursors() {
        tramoHRStartCount = lapHRSamples.count
        tramoPaceSampleStart = lapErgPaceSamples.count
        tramoPowerSampleStart = lapErgPowerSamples.count
        tramoSpmSampleStart = lapErgSpmSamples.count
    }

    /// One WORK bout of an erg interval series → its own LapRecord (distance / cal /
    /// duration / pace / power / SPM / HR for THIS serie only). Uses the tramo window
    /// already latched for the live HUD. `runLegIndex` carries the 0-based bout index
    /// so `SegmentPayloadBuilder` re-sequences positions and ships `leg_index`.
    func recordErgIntervalBout(at boutIndex: Int) {
        guard let seg = currentSegment else { return }
        let now = Date()
        let dur = tramoRecordedSeconds
        let meters = tramoErgDistanceMeters.flatMap { $0 >= 1 ? $0 : nil }
        let cals = tramoErgCalories.flatMap { $0 >= 1 ? Double($0) : nil }
        // Per-bout HR / erg samples: slice from the cursors stamped at tramo open.
        let hrStart = Swift.min(tramoHRStartCount, lapHRSamples.count)
        let hrSlice = Array(lapHRSamples[hrStart...])
        let avgHR = hrSlice.isEmpty ? nil : hrSlice.reduce(0, +) / hrSlice.count
        let maxHR = hrSlice.max()
        func meanSlice(_ xs: [Double], from: Int) -> Double? {
            let i = Swift.min(from, xs.count)
            let s = Array(xs[i...])
            guard !s.isEmpty else { return nil }
            return s.reduce(0, +) / Double(s.count)
        }
        let avgPace500 = meanSlice(lapErgPaceSamples, from: tramoPaceSampleStart)
        let avgPower = meanSlice(lapErgPowerSamples, from: tramoPowerSampleStart)
        let avgSpm = meanSlice(lapErgSpmSamples, from: tramoSpmSampleStart)
        // Covered /500 m from the bout's own metres when the sample mean is missing.
        let derivedPace500: Double? = {
            if let p = avgPace500, p > 0 { return p }
            guard let m = meters, m > 0, dur > 0 else { return nil }
            return (dur / m) * 500.0
        }()
        let source = lapHadPM5 ? "pm5" : (avgHR != nil ? "healthkit" : "manual")
        let lap = LapRecord(
            id: UUID(),
            segmentId: seg.id,
            templateSegmentId: seg.templateSegmentId,
            position: seg.order,
            modality: seg.wireModality,
            startedAt: now.addingTimeInterval(-dur),
            endedAt: now,
            durationSeconds: dur,
            avgHRBpm: avgHR,
            maxHRBpm: maxHR,
            zoneSecondsByZone: [:],
            repsCompleted: nil,
            distanceCoveredMeters: meters,
            avgPaceSecPer500m: derivedPace500,
            avgPaceSecPerKm: nil,
            avgPowerWatts: avgPower,
            strokeRateSpm: avgSpm,
            calories: cals,
            weightUsedKg: nil,
            source: source,
            repsPrescribed: nil,
            repsStatus: nil,
            repsConfirmed: false,
            isStructural: false,
            rxScaled: nil,
            scaledNote: nil,
            sets: nil,
            runLegIndex: boutIndex,
            runLegRole: "work",
            runLegPhase: "main",
            // Qué APARATO midió el pulso de este bout — el dueño actual del latch de
            // prioridad, y solo si este bout tuvo alguna muestra propia (nunca una
            // procedencia heredada de una serie que no midió nada). Mismo criterio
            // que `recordRunLegLap` y que el merge de `closeCurrentSegmentLap`.
            hrSource: hrSlice.isEmpty ? nil : hrSource?.rawValue
        )
        laps.append(lap)
        ergIntervalBoutsRecorded += 1
    }

    func recordRunLegLap(_ leg: RunLeg, at legIndex: Int) {
        guard let seg = currentSegment else { return }
        let now = Date()
        // Reloj de trabajo de la cinta (card 167) cuando este tramo lo midió;
        // si no, la pared de la pierna. El HUD ya lee beltWorkElapsedS.
        let dur = (leg.isWork && beltWorkElapsedS > 0) ? beltWorkElapsedS : runLegElapsed
        // Covered distance for THIS leg: belt delta wins (a belt IS the tramo's truth),
        // else GPS delta; nil when no device measured it (never the prescribed target).
        let beltDelta = Swift.max(0, lapBeltDistanceMeters - runLegBeltStart)
        let gpsDelta = Swift.max(0, (lapGpsDistanceMeters ?? 0) - runLegGpsStart)
        let distance: Double? = beltDelta > 0 ? beltDelta : (gpsDelta > 0 ? gpsDelta : nil)
        // Run pace /km from the leg's OWN covered distance + duration — the whole point
        // of per-leg recording. nil without a measured distance (no fabricated pace).
        let paceKm = Self.paceSecPerKm(meters: distance, seconds: dur)
        // Per-leg HR = the samples logged since this leg's GO.
        let startIdx = Swift.min(runLegHRStartCount, lapHRSamples.count)
        let hrSlice = Array(lapHRSamples[startIdx...])
        let avgHR = hrSlice.isEmpty ? nil : hrSlice.reduce(0, +) / hrSlice.count
        let maxHR = hrSlice.max()
        // Which DEVICE measured this leg's pulse — the priority latch's current
        // owner, tagged only when this leg actually had a sample (never invented
        // off a stale session-level source from a leg with no HR at all).
        let legHRSource: String? = hrSlice.isEmpty ? nil : hrSource?.rawValue
        // Per-leg zone seconds = the accumulation delta since GO.
        var zone: [Int: Double] = [:]
        for (k, v) in lapZoneAccumSec {
            let d = v - (runLegZoneStart[k] ?? 0)
            if d > 0 { zone[k] = d }
        }
        // Per-leg average incline from the belt readings that fed THIS leg.
        let inclineCountDelta = lapInclineCount - runLegInclineCountStart
        let inclinePct: Double? = inclineCountDelta > 0
            ? (lapInclineSum - runLegInclineSumStart) / Double(inclineCountDelta)
            : nil
        // Source precedence mirrors the aggregate close: real movement data > HR-only.
        let source = beltDelta > 0 ? "treadmill" : (gpsDelta > 0 ? "healthkit" : (avgHR != nil ? "healthkit" : "manual"))
        let lap = LapRecord(
            id: UUID(),
            segmentId: seg.id,
            templateSegmentId: seg.templateSegmentId,
            position: seg.order,
            modality: "run",
            startedAt: now.addingTimeInterval(-dur),
            endedAt: now,
            durationSeconds: dur,
            avgHRBpm: avgHR,
            maxHRBpm: maxHR,
            zoneSecondsByZone: zone,
            repsCompleted: nil,
            distanceCoveredMeters: distance,
            avgPaceSecPer500m: nil,
            avgPaceSecPerKm: paceKm,
            avgPowerWatts: nil,
            strokeRateSpm: nil,
            calories: nil,
            weightUsedKg: nil,
            source: source,
            repsPrescribed: nil,
            repsStatus: nil,
            repsConfirmed: false,
            isStructural: false,
            rxScaled: nil,
            scaledNote: nil,
            sets: nil,
            runLegIndex: legIndex,
            runLegRole: leg.kind.rawValue,
            runLegPhase: leg.phaseRole.rawValue,
            inclinePct: inclinePct,
            runCadenceSpm: nil,
            hrSource: legHRSource
        )
        laps.append(lap)
    }

    /// One EMOM WORK minute → its own LapRecord (pace / cal / power / SPM / HR of
    /// THIS station only). `runLegIndex` = minute ordinal so the post-workout table
    /// and payload re-sequence like erg series / structured run. Modality is the
    /// tramo's machine (row/ski/run/…), not the folded block's "functional".
    func recordEMOMIntervalBout(at index: Int) {
        guard let seg = currentSegment, seg.isEMOM else { return }
        let tramo = currentTramo
        let now = Date()
        let dur = tramoRecordedSeconds
        let isErg = tramo.isErg
        let isRun = tramo.isRun
        let meters: Double? = {
            if isErg, let m = tramoErgDistanceMeters, m >= 1 { return m }
            if isRun {
                // THIS MINUTE's belt metres, not the segment's running total — the belt
                // read `lapBeltDistanceMeters` here while the erg read its tramo window,
                // so minute 4 of a run/row EMOM claimed every earlier run minute too.
                if let m = tramoBeltDistanceMeters, m >= 1 { return m }
                if lapHadGPS, let g = lapGpsDistanceMeters, g > 0 { return g }
            }
            return nil
        }()
        let cals: Double? = {
            guard isErg, let c = tramoErgCalories, c >= 1 else { return nil }
            return Double(c)
        }()
        let hrStart = Swift.min(tramoHRStartCount, lapHRSamples.count)
        let hrSlice = Array(lapHRSamples[hrStart...])
        let avgHR = hrSlice.isEmpty ? nil : hrSlice.reduce(0, +) / hrSlice.count
        let maxHR = hrSlice.max()
        func meanSlice(_ xs: [Double], from: Int) -> Double? {
            let i = Swift.min(from, xs.count)
            let s = Array(xs[i...])
            guard !s.isEmpty else { return nil }
            return s.reduce(0, +) / Double(s.count)
        }
        let avgPace500: Double? = {
            guard isErg else { return nil }
            if let p = meanSlice(lapErgPaceSamples, from: tramoPaceSampleStart), p > 0 { return p }
            guard let m = meters, m > 0, dur > 0 else { return nil }
            return (dur / m) * 500.0
        }()
        let avgPaceKm: Double? = {
            guard isRun, let m = meters, m > 0, dur > 0 else { return nil }
            return Self.paceSecPerKm(meters: m, seconds: dur)
        }()
        let avgPower = isErg ? meanSlice(lapErgPowerSamples, from: tramoPowerSampleStart) : nil
        let avgSpm = isErg ? meanSlice(lapErgSpmSamples, from: tramoSpmSampleStart) : nil
        let source: String = {
            if isErg && lapHadPM5 { return "pm5" }
            if isRun && tramoBeltDistanceMeters != nil { return "treadmill" }
            if isRun && lapHadGPS { return "healthkit" }
            if avgHR != nil { return "healthkit" }
            return "manual"
        }()
        // Wire modality of THIS minute (row/ski/run/functional), never the folded block.
        let modality = tramo.modality.rawValue
        let lap = LapRecord(
            id: UUID(),
            segmentId: seg.id,
            templateSegmentId: seg.templateSegmentId,
            position: seg.order,
            modality: modality,
            startedAt: now.addingTimeInterval(-dur),
            endedAt: now,
            durationSeconds: dur,
            avgHRBpm: avgHR,
            maxHRBpm: maxHR,
            zoneSecondsByZone: [:],
            repsCompleted: nil,
            distanceCoveredMeters: meters,
            avgPaceSecPer500m: avgPace500,
            avgPaceSecPerKm: avgPaceKm,
            avgPowerWatts: avgPower,
            strokeRateSpm: avgSpm,
            calories: cals,
            weightUsedKg: nil,
            source: source,
            repsPrescribed: nil,
            repsStatus: nil,
            repsConfirmed: false,
            isStructural: false,
            rxScaled: nil,
            scaledNote: nil,
            sets: nil,
            runLegIndex: index,
            runLegRole: "work",
            runLegPhase: "main",
            // Igual que en las series de erg y en la carrera estructurada: de qué
            // aparato salió el pulso de ESTE minuto, y solo si el minuto midió algo.
            hrSource: hrSlice.isEmpty ? nil : hrSource?.rawValue
        )
        laps.append(lap)
        emomIntervalBoutsRecorded += 1
    }
}
