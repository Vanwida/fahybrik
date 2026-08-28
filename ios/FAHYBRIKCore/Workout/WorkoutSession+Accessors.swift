import Foundation

// LO QUE SE DEDUCE DEL ESTADO, sin tocarlo: qué tramo es el de ahora, en qué bloque
// cae, qué zona marca el pulso y a qué ritmo se está cubriendo. Puras lecturas — si
// algo de aquí escribe, está en el fichero equivocado.
extension WorkoutSession {
    /// Old names read the one clock. They are not a second engine.
    var emomCountInRemaining: Double {
        get { countInRemaining }
        set { countInRemaining = newValue }
    }
    var condCountInRemaining: Double {
        get { countInRemaining }
        set { countInRemaining = newValue }
    }
    var runCountInRemaining: Double {
        get { countInRemaining }
        set { countInRemaining = newValue }
    }
    var emomPhaseRemaining: Double {
        get { emomPhase == .rest ? restRemainingSeconds : workRemaining }
        set {
            if emomPhase == .rest { restRemainingSeconds = newValue }
            else { workRemaining = newValue }
        }
    }
    var rotPhaseRemaining: Double {
        get { rotPhase == .rest ? restRemainingSeconds : workRemaining }
        set {
            if rotPhase == .rest { restRemainingSeconds = newValue }
            else { workRemaining = newValue }
        }
    }
    var runLegRemaining: Double {
        get { isRunLegWork ? workRemaining : restRemainingSeconds }
        set {
            if isRunLegWork { workRemaining = newValue }
            else { restRemainingSeconds = newValue }
        }
    }
    var fixedRestRemaining: Double {
        get { restRemainingSeconds }
        set { restRemainingSeconds = newValue }
    }
    var fixedRestTotal: Double {
        get { restTotalSeconds }
        set { restTotalSeconds = newValue }
    }

    var currentSegment: WorkoutSegment? {
        guard currentSegmentIndex < plan.segments.count else { return nil }
        return plan.segments[currentSegmentIndex]
    }

    var nextSegment: WorkoutSegment? {
        let i = currentSegmentIndex + 1
        guard i < plan.segments.count else { return nil }
        return plan.segments[i]
    }

    /// True when the current segment is the final one in the session.
    var isLastSegment: Bool { currentSegmentIndex >= plan.segments.count - 1 }

    /// #23 — the current station is the PARTNER's half of a HYROX dobles reparto:
    /// they work, the athlete relays/recovers. Drives the relay screen in the live
    /// view and the "no work logged for me" advance (`advanceRelay`).
    var currentSegmentIsPartnerRelay: Bool {
        currentSegment?.doblesSplit?.role == .partner
    }

    /// The coach block the session is currently in (or parked at, during the gate).
    var currentBlockRegion: WorkoutBlockRegion? {
        plan.blockRegion(containing: currentSegmentIndex)
    }

    /// True when the current block is the last block of the session — so ending it
    /// (naturally or early) ends the whole session rather than opening another gate.
    var isLastBlock: Bool {
        guard let r = currentBlockRegion else { return true }
        return r.id >= plan.blockRegions.count - 1
    }

    /// 1-based "block N of M" position, for the preview header.
    var blockNumber: Int { (currentBlockRegion?.id ?? 0) + 1 }
    var blockCount: Int { max(1, plan.blockRegions.count) }

    /// True while a block is actually running (not on a preview, not finished) —
    /// gates the "Terminar bloque" early-finish action.
    var canEndBlockEarly: Bool { !isAwaitingBlockStart && !isFinished && currentSegment != nil }

    /// True when another block exists AFTER the current one — gates the wrist's
    /// "Siguiente bloque" early exit (cutting the LAST block short is Terminar).
    var hasBlockAfterCurrent: Bool {
        guard let region = currentBlockRegion else { return false }
        return region.lastIndex + 1 < plan.segments.count
    }

    /// % of the current bout spent in the target HR zone (Steady adherence) — read
    /// from the per-bout zone accumulation, over THE BOUT'S CLOCK. nil when no
    /// target zone is prescribed or no HR has been sampled yet (no fabricated 100%).
    ///
    /// The base is `lapElapsedSeconds`, not the sum of the accumulated zones: the
    /// clock runs every tick and the zones only accumulate while a strap is
    /// feeding a classifiable pulse, so dividing by the sum reports the share of
    /// the MEASURED time and calls it the share of the bout. Ten minutes of Z2
    /// with the strap alive for four of them is 40 % in target, not 100 %.
    var liveZonePctInTarget: Int? {
        guard let z = currentSegment?.targetZone,
              lapElapsedSeconds > 0,
              lapZoneAccumSec.values.reduce(0, +) > 0
        else { return nil }
        return Int(((lapZoneAccumSec[z.rawValue] ?? 0) / lapElapsedSeconds * 100).rounded())
    }

    /// Seconds per km from covered metres over elapsed seconds. THE one pace
    /// derivation — the live HUD, the per-leg split and the segment close all read
    /// it, so the number the athlete sees and the number the coach receives can
    /// never be two different truths. nil unless both inputs are real.
    static func paceSecPerKm(meters: Double?, seconds: Double) -> Double? {
        guard let m = meters, m > 0, seconds > 0 else { return nil }
        return seconds / (m / 1000.0)
    }

    /// Live covered pace (sec/km) for the current run bout, or nil when nothing has
    /// been measured yet.
    ///
    /// In a STRUCTURED run (6×800 con trote de vuelta) the bout is the LEG, not the
    /// segment: measuring over the whole segment folds the recovery jogs into the
    /// denominator and the HUD read 5:33/km while the athlete was running 3:30 —
    /// and the lap archived for the coach (`recordRunLegLap`) was already the right
    /// one. Same window, same baselines, same answer as what gets saved.
    /// Los metros cubiertos en la PIERNA en curso — cinta si la hay, GPS si no.
    /// Una sola regla, para que el ritmo de la pierna y los metros que se pintan
    /// no puedan contar cosas distintas de la misma carrera.
    var segmentRunCoveredForProgress: Double {
        if lapBeltOwnsDistance { return lapBeltDistanceMeters }
        return lapGpsDistanceMeters ?? 0
    }

    var runLegCoveredMeters: Double {
        tramoRunCoveredMeters ?? 0
    }

    var liveCoveredPaceSecPerKm: Int? {
        let pace: Double?
        if isRunStructureActive {
            let covered = runLegCoveredMeters
            pace = Self.paceSecPerKm(meters: covered, seconds: runLegElapsed)
        } else {
            pace = Self.paceSecPerKm(meters: liveRunDistanceMeters, seconds: lapElapsedSeconds)
        }
        // El mismo techo que aplica RunLegDisplay: por encima de 20:00/km no se
        // está corriendo, y un número así en la muñeca parece una medida sin
        // serlo. Se aplica AQUÍ además de allí porque este accesor lo leen el HUD
        // del móvil y el cable del espejo, y los tres tienen que callar a la vez.
        return pace.map { Int($0.rounded()) }.flatMap { $0 <= RunLegDisplay.maxPaceSecPerKm ? $0 : nil }
    }

    /// True when the last advance can be undone without leaving live.
    var canStepBack: Bool { LiveUndo.canUndo(liveUndoCursor) }

    var liveUndoCursor: LiveUndo.Cursor {
        LiveUndo.Cursor(
            finished: isFinished,
            awaitingFinish: isAwaitingFinishDecision,
            hasConfirmedSet: currentSegment?.usesMultiSetStrength == true
                && setRecords.contains { $0.confirmed },
            segmentIndex: currentSegmentIndex,
            sameBlockAsPrevious: sameBlockAsPrevious,
            roundsDone: (isConditioningActive && condCountInRemaining <= 0) ? fixedRoundsDone : 0,
            emomIntervalIndex: emomIntervalIndex,
            isEmom: currentSegment?.isEMOM == true && emomCountInRemaining <= 0)
    }

    var sameBlockAsPrevious: Bool {
        guard currentSegmentIndex > 0, currentSegmentIndex < plan.segments.count else { return false }
        return plan.segments[currentSegmentIndex - 1].blockGroupingKey
            == plan.segments[currentSegmentIndex].blockGroupingKey
    }

    /// True when the CURRENT segment has accumulated real, not-yet-saved work —
    /// used to gate a confirm before a back / jump that would discard it. A
    /// PRE-FILLED but untouched prescription is NOT progress (only an explicit
    /// rep/set confirmation counts), so a primed value never triggers the prompt.
    var currentSegmentHasLiveProgress: Bool {
        lapElapsedSeconds > 3
            || repsConfirmed
            || loadConfirmed
            || setRecords.contains { $0.confirmed }
            || (lapGpsDistanceMeters ?? 0) > 0
            || lapBeltDistanceMeters > 0
            || !lapHRSamples.isEmpty
            || lapHadPM5
    }

    /// True when the current block is a warmup / cooldown — logged as ONE
    /// structural completion (a checklist gated behind a single button), never
    /// per-exercise. Excluded from volume/analytics.
    var currentBlockIsStructural: Bool {
        guard let phase = currentBlockRegion?.phase else { return false }
        return phase == .warmup || phase == .cooldown
    }

    /// The completeness lock (concept §B / decision F.2): TRUE when the session
    /// holds at least one unit of REAL work — a closed working lap or live progress
    /// on a NON-structural segment. Warmup/cooldown completions are EXCLUDED: a
    /// "calentamiento hecho" tap must not force a false partial nor block a clean
    /// discard. No real work → only ABANDONAR (discard) is offered; "Terminar y
    /// guardar" never appears, so a barely-started session can't be saved as done.
    var hasRecordedWork: Bool {
        laps.contains { !$0.isStructural }
            || (currentSegmentHasLiveProgress && !currentBlockIsStructural)
    }

    /// Blocks the athlete has actually COMPLETED — fully moved past
    /// (`currentSegmentIndex` is beyond the block) AND with recorded work in it.
    /// The in-flight block is NOT counted (it isn't "hecho" yet), nor is a block
    /// jumped past without doing anything. Drives the exit sheet's honest "N de M
    /// bloques hechos"; M is `blockCount`. Counts structural blocks too, so it
    /// reflects every completed block the athlete moved through.
    var completedBlockCount: Int {
        let lapBlockIds = Set(laps.compactMap { lap -> Int? in
            guard let idx = plan.segments.firstIndex(where: { $0.id == lap.segmentId }) else { return nil }
            return plan.blockRegion(containing: idx)?.id
        })
        return plan.blockRegions.filter {
            lapBlockIds.contains($0.id) && currentSegmentIndex > $0.lastIndex
        }.count
    }

    /// True when the current segment belongs to a metcon-family block (Rx/Scaled
    /// axis applies) and is not a structural warmup/cooldown.
    var currentSegmentIsMetcon: Bool {
        !currentBlockIsStructural && currentSegment?.isMetconFamily == true
    }

    var liveZone: HRZone? {
        guard let bpm = liveHRBpm else { return nil }
        return hrZones?.zone(forBpm: bpm)
    }

    /// DÓNDE está dentro de su zona, y hacia dónde va. Lo que «Z3» no dice: a
    /// 145 y a 158 pone lo mismo, y uno de los dos está a un latido de Z4.
    /// Nil sin pulso o sin bandas — y entonces la página de zona no existe.
    var liveZonePosition: HRZoneProfile.Posicion? {
        guard let bpm = liveHRBpm else { return nil }
        return hrZones?.posicion(forBpm: bpm)
    }

    /// True when the THRESHOLD behind these bands was inferred rather than measured
    /// (label them "estimado"); false when it came from the athlete's own test.
    var hrZonesEstimated: Bool { hrZones?.estimated ?? false }
}
