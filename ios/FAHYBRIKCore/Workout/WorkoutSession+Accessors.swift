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

    /// LOS METROS DE CORRER DE LA SESIÓN ENTERA — los tramos ya cerrados más el
    /// abierto. Es la otra pregunta que contesta la carrera: `runLegCoveredMeters`
    /// dice lo que llevas de ESTA pierna, y en un 6×800 con trote de vuelta eso no
    /// se parece a lo que llevas corrido.
    ///
    /// No se acumula en una variable nueva: los tramos cerrados YA guardan sus
    /// metros (`LapRecord.distanceCoveredMeters`, que sale de este mismo
    /// acumulador antes de resetearse) y el abierto es el acumulador en curso. Un
    /// segundo contador sería una segunda verdad sobre la misma carrera.
    var sessionRunMeters: Double {
        let cerrados = laps
            .filter { $0.modality == SegmentKind.running.modality }
            .compactMap(\.distanceCoveredMeters)
            .reduce(0, +)
        let abierto = lapBeltOwnsDistance ? lapBeltDistanceMeters : (lapGpsDistanceMeters ?? 0)
        return cerrados + abierto
    }

    /// El ritmo medio de la CARRERA (sec/km), por la misma derivación única que el
    /// resto. Nil mientras no haya metros: sin numerador no hay ritmo, y un número
    /// aquí sería una media inventada.
    var sessionRunPaceSecPerKm: Int? {
        Self.paceSecPerKm(meters: sessionRunMeters, seconds: elapsedSeconds)
            .map { Int($0.rounded()) }
            .flatMap { $0 <= RunLegDisplay.maxPaceSecPerKm ? $0 : nil }
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

    /// True when the current block is a warmup / cooldown.
    /// Excluded from volume/analytics. Un gesto sigue siendo un tramo:
    /// no cierra el bloque entero.
    var currentBlockIsStructural: Bool {
        guard let phase = currentBlockRegion?.phase else { return false }
        return phase == .warmup || phase == .cooldown
    }

    /// Último ítem del calentamiento / vuelta a la calma: el botón
    /// puede decir HECHO de fase; el gesto igual cierra solo este tramo.
    var isLastStructuralSegment: Bool {
        guard currentBlockIsStructural, let region = currentBlockRegion else { return false }
        return currentSegmentIndex == region.lastIndex
    }

    /// HAY ALGO MEDIDO QUE SE PERDERÍA AL SALIR. Es la única pregunta que decide si
    /// el aspa puede irse callando.
    ///
    /// AQUÍ VIVÍA `hasRecordedWork`, y era la pregunta equivocada en este sitio.
    /// Contestaba «¿esto cuenta como TRABAJO?» —para la completitud— y por eso
    /// EXCLUÍA el calentamiento: un «calentamiento hecho» no puede marcar la sesión
    /// como cumplida. Correcto para lo suyo. Pero se usaba además para decidir si al
    /// salir hay algo que guardar, y ahí la exclusión miente.
    ///
    /// Lo que costó, en el debugger del 29-ago: el día caminado es un híbrido de 17
    /// tramos cuyo tramo 1 es un calentamiento de 8:00. Con 1:52 corridos, 307 m de
    /// GPS y su mapa en pantalla, `currentBlockIsStructural` valía true, el progreso
    /// vivo se anulaba, y la salida se iba por la rama «no hay nada que guardar»:
    /// descarte SILENCIOSO. El atleta volvía a Plan con EMPEZAR y sin recap, con los
    /// metros y el recorrido tirados. SALIR NO ERA TERMINAR.
    ///
    /// Se borra en vez de dejarla al lado, y por dos razones: no le quedaba ningún
    /// llamante —era el único—, y su propio comentario describía una regla que ya no
    /// existe («sin trabajo real sólo se ofrece ABANDONAR»), cuando la hoja de salida
    /// ofrece las cuatro opciones desde hace tiempo. Un accesor muerto que documenta
    /// un comportamiento que no pasa es la trampa lista para que alguien la vuelva a
    /// cablear en el sitio equivocado.
    ///
    /// Aquí no se pregunta de qué FASE es el bloque: se pregunta si alguien MIDIÓ
    /// algo. Un calentamiento con 307 m medidos es una carrera de 307 m — cómo se
    /// llame el bloque no borra el GPS.
    var hayMedidoQueSePerderia: Bool {
        !laps.isEmpty || currentSegmentHasLiveProgress
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
