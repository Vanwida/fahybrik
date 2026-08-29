import Foundation
import Observation

/// Did the athlete reach the END of the prescribed protocol, or stop short?
/// `.full` → the assignment is marked 'completed'; `.partial` → 'partial' (the
/// honest "terminé antes" save — concept §B/§D). Set once, at `finish()`. A
/// `completed` status is EARNED (ran to the end); it is never fabricated for a
/// barely-started or early-terminated session.
enum WorkoutCompleteness: String {
    case full
    case partial
}

// EL ESTADO DE LA SESIÓN VIVE AQUÍ, Y NO ES PRIVADO.
//
// Los motores que lo mueven viven cada uno en su fichero — los `WorkoutSession+*`
// de al lado: la máquina de la sesión, el reloj, EMOM, formatos, carrera
// estructurada, registro, hierro, señal, contador y recuperación. Swift no deja
// declarar una propiedad almacenada en una extensión, así que el estado entero se
// queda en este fichero; y como `private` sólo alcanza UN fichero, lo que antes era
// `private` / `private(set)` pasa a interno. Es el precio del reparto, no una
// invitación a escribirlo desde fuera del motor que lo posee — el mismo criterio,
// y por la misma razón, que ya llevaban `lapErgLastDistance` y los acumuladores
// del tramo. Los métodos que NO cruzan el reparto siguen privados en su fichero.
@Observable
final class WorkoutSession {
    let plan: WorkoutPlan
    /// The athlete's HR zones as the SERVER resolved them (absolute bpm bands off
    /// their threshold). Drives `liveZone` + time-in-zone.
    ///
    /// Nil → NO zones, and the session records no time in them. That is now true
    /// end to end: this doc used to claim "we never fabricate a max" while the
    /// only construction path handed the engine a generic 184 bpm, so every
    /// second-in-zone the coach read was bucketed against a number nobody measured.
    let hrZones: HRZoneProfile?
    let startedAt: Date
    /// AUDIT-1 — the backend assignment this session logs to, stamped onto the
    /// crash-recovery snapshot so recovery is never cross-attributed. Set by the
    /// container after creation; nil for ad-hoc / free sessions.
    var assignmentId: String? = nil
    /// Where the athlete said they run TODAY (calle / cinta enchufada / cinta
    /// tonta), chosen pre-start. Drives the HUD and the fuente de los metros.
    /// Ephemeral — never persisted.
    var runEnvironment: RunEnvironment? = nil
    /// Última lectura resuelta de la cinta FTMS. `nil` = no hay feed (cinta tonta,
    /// reloj, calle). `false` = la máquina está conectada y no manda velocidad.
    var treadmillBeltWorking: Bool? = nil
    /// Segundos de TRABAJO en la ventana de cinta, solo mientras la banda manda
    /// velocidad. El lap de sesión sigue siendo de pared.
    var beltWorkElapsedS: Double = 0

    var currentSegmentIndex: Int = 0
    var elapsedSeconds: Double = 0
    var lapElapsedSeconds: Double = 0
    var liveHRBpm: Int? = nil
    var laps: [LapRecord] = []
    var repsCurrentSegment: Int = 0
    var isPaused: Bool = false
    /// AUTO-pause (outdoor GPS #64) currently holds the session — distinct from a
    /// manual pause. Kept separate from `isPaused` so the two can never be confused:
    /// only an auto-pause is auto-resumed on movement, and any MANUAL action clears
    /// it (the athlete's own pause/resume always wins). Invariant: true ⇒ isPaused.
    var autoPaused: Bool = false
    /// El atleta ha parado la sesión A MANO. Distinto de estar pausado: la autopausa
    /// la ponemos nosotros al ver que dejó de moverse, y eso congela el CRONO pero no
    /// puede borrar los metros que siga cubriendo. Lo que se mide se guarda; lo que se
    /// cuenta como tiempo es otra pregunta.
    var isManuallyPaused: Bool { isPaused && !autoPaused }
    /// EL ÚLTIMO AVANCE, para que un toque de más no cueste una serie (card 113).
    /// El 20-ago un doble toque sin querer cerró DOS series de golpe. El sello vive
    /// en el motor y no en la pantalla a propósito: el botón «Siguiente» del reloj
    /// entra por el mismo sitio, y una regla de dominio metida en una vista es
    /// justo el agujero que ya nos mordió el 4-ago.
    @ObservationIgnored var lastPrimaryAdvanceAt: Date? = nil

    /// LO ÚLTIMO QUE ALGUIEN MIDIÓ (card 143). Metros de calle, de cinta o de
    /// ergómetro: trabajo de verdad, no pulso. Sirve para decidir si un hueco en
    /// el que la app estuvo dormida fue entreno o fue el atleta mirando el móvil.
    @ObservationIgnored var lastMeasuredWorkAt: Date? = nil

    /// Segundos que el reloj NO se apuntó porque la app estuvo suspendida sin que
    /// nadie midiera nada. Se guarda en vez de tirarse: que un entreno diga «duró
    /// 40 min» cuando pasaron 55 tiene que ser explicable, no invisible.
    var discardedSuspendedSeconds: Double = 0

    /// QUÉ PUERTA ES LA QUE ESTÁ ESPERANDO (card 112).
    ///
    /// `isAwaitingBlockStart` significa «aparcado en una puerta, con el reloj
    /// congelado», y así lo entienden ya una docena de sitios: los guardas del
    /// tick, los de los sensores, los HUD. No se duplica esa bandera — se le
    /// añade DE QUÉ puerta se trata, y sólo la pantalla necesita mirarlo.
    ///
    /// Meter una segunda bandera paralela habría obligado a repetir cada uno de
    /// esos guardas, y el que se olvidara sería un sensor contando trabajo que
    /// el atleta todavía no ha empezado.
    enum GateKind { case block, nextExercise }
    var awaitingGate: GateKind? = nil

    /// Aparcado antes de un EJERCICIO nuevo dentro del mismo bloque de hierro.
    /// El 20-ago, al cerrar las series de peso muerto la app saltó sola al peso
    /// muerto rumano y arrancó el reloj: el atleta no tenía los discos puestos.
    var isAwaitingNextExercise: Bool { isAwaitingBlockStart && awaitingGate == .nextExercise }

    var isFinished: Bool = false
    /// Set by `finish(completeness:)` — whether the session ran to the natural end
    /// (`.full` → 'completed') or was terminated early via "Terminar y guardar" /
    /// "Terminar bloque" (`.partial` → 'partial'). Read by the post-workout summary
    /// when building the execution payload. Never fabricates a fake completion.
    var completeness: WorkoutCompleteness = .full

    /// The outdoor run's GPS trace (#64) as an encoded polyline, written by the
    /// OutdoorRunHUDModel on teardown and read by the post-workout summary to ship it
    /// in the execution payload + draw the run's mini-map. Session-scoped (not per
    /// segment): the outdoor HUD seeds from it on open so re-opening continues the
    /// same trace. nil when the run was never outdoors (no fabricated route).
    var capturedRoutePolyline: String? = nil

    /// EL NEGATIVO DE LA SESIÓN: la serie entera de lo que se midió, no la media.
    /// Se llena desde los mismos puntos de entrada que ya alimentan los tramos
    /// (`injectLiveHR`, `sampleRunDistance`, `sampleTreadmillDistance` y los de velocidad
    /// y altitud), así que hereda sus mismas puertas de honestidad — nada entra
    /// pausado, terminado ni fuera de un tramo. El resumen la entrega al terminar.
    /// Ver `WorkoutSession+Trace.swift`.
    let trace = WorkoutTraceRecorder()

    // MARK: - Honest rep / strength / WOD logging (FASE 2 · PASO 2)
    //
    // Per logged unit of work we record what was ACTUALLY done vs prescribed
    // (done / scaled / skipped) plus a confidence flag. The headline bug this
    // kills: `repsCurrentSegment` seeded to 0, so advancing an untouched
    // prescribed-reps segment used to write a fabricated 0. Now prescribed reps
    // are PRE-FILLED on segment entry (`primeRepsIfNeeded`) and the lap records
    // that primed value with `repsConfirmed=false` (assumed) until the athlete
    // edits it.

    /// TRUE once the athlete explicitly touched/confirmed the current segment's
    /// reps (stepper edit or open-score tap). FALSE = assumed from the prescription.
    var repsConfirmed: Bool = false
    /// The athlete explicitly skipped the current segment → actual = null.
    var repsSkipped: Bool = false
    /// Which segment index the reps were primed for — the idempotency sentinel,
    /// reset (alongside EMOM / manual-load state) on segment change so re-entry
    /// re-primes but a same-segment re-entry never clobbers an athlete edit.
    var repsPrimedSegmentIndex: Int? = nil

    /// Per-set strength detail for the current segment (a 5×5 / pyramid). Primed
    /// from `prescription.sets`; each set defaults to prescribed until touched.
    var setRecords: [SetRecord] = []
    var setsPrimedSegmentIndex: Int? = nil

    /// Rx / Scaled for the current metcon-family BLOCK (set once per block, stamped
    /// on each of its laps). Reset at block boundaries; primed to "rx".
    var rxScaled: String? = nil
    /// Optional free note on HOW the current WOD was scaled.
    var scaledNote: String? = nil

    /// Block grouping keys whose warmup/cooldown structural completion is already
    /// recorded, so a block is never double-logged (button + auto-infer backstop).
    var completedStructuralBlockKeys: Set<String> = []
    /// Set once the athlete confirms their first real working set — the trigger to
    /// auto-infer a preceding warmup as done.
    var firstWorkingSetConfirmed: Bool = false

    // MARK: - Sensor conclusions (plan fases 1–3)
    //
    // Live values from the wrist pipeline (standalone local, or MirrorWire
    // `sensor` packets in mirror mode). Never the raw stream — only conclusions.
    // UI (semáforo m/s, contador precargado) reads these; Claude owns the surface.

    /// Latest sensor conclusions for the open work window. Nil until the wrist
    /// has enough signal. `objectWillChange` fires via the published engine tick /
    /// explicit assign so the vivo HUD can bind.
    var sensorConclusions: MirrorSensorConclusions?
    /// Seq of the last applied packet — drops out-of-order mirror frames.
    var lastSensorSeq: Int = -1

    /// LA VENTANA DE TRABAJO que el contador de repeticiones necesita: qué serie
    /// está abierta, de qué movimiento, y si ahora mismo se está descansando.
    ///
    /// Existe porque contar depende de dos cosas y solo una es señal: la geometría
    /// del gesto la resuelve el reloj, pero «esto es una serie de sentadillas y ha
    /// empezado» solo lo sabe el motor. Sin esto el contador corría también mientras
    /// el atleta andaba hacia la barra — y ocho pasos son ocho repeticiones para
    /// cualquier detector honesto.
    struct SensorWindow {
        let key: String?
        let exerciseId: Int?
        let modality: String?
        let name: String?
        let resting: Bool
    }

    /// La última cuenta del reloj que ya se registró en el log, para no repetir
    /// la misma línea dos veces por segundo (ver `WorkoutSession+RepCounter`).
    var lastLoggedSensorReps: Int?

    /// Rest countdown fired when a strength set is confirmed (from the set's
    /// prescribed `rest_s`). 0 = no rest running. Decremented on the main tick.
    var restRemainingSeconds: Double = 0
    var restTotalSeconds: Double = 0

    /// One count-in, one boxed-work countdown, one rest. Format clocks write here.
    var countInRemaining: Double = 0
    var workRemaining: Double = 0
    /// When the rest hits zero, close the current tramo (EMOM change, run recovery).
    /// Strength rest is overlay: expiry does not close the set.
    var restEndsTramo: Bool = false
    /// The only RunLegProgress. GPS, belt and wrist feed it. HUD reads it.
    var runProgress = RunLegProgress()

    // MARK: - Block-transition gate
    //
    // Each coach BLOCK starts and ends with the athlete's approval. While
    // `isAwaitingBlockStart` is true the session is parked on the upcoming block's
    // PREVIEW: the main clock and any EMOM count-in stay frozen until the athlete
    // taps "Empezar" (`beginBlock`). The gate fires at BLOCK boundaries only —
    // crossing from one coach block into another (warmup→principal, fuerza→metcon,
    // …) and at the very first block. WITHIN a block, intervals/items still
    // auto-advance (EMOM minute-to-minute), so the gate never interrupts the work.
    var isAwaitingBlockStart: Bool = false
    var hasArmedInitial = false

    /// The prescribed work is DONE and the session is asking whether to close or
    /// keep going. It is not finished: nothing is saved, the clock is held, and the
    /// athlete decides. Before this existed the last lap dropped him straight into
    /// the summary — 28-jul: "cuando acaba el entreno, se tiene que permitir al
    /// atleta continuar en caso que quiera, en cambio la pantalla pasa directamente
    /// a finalizar y guardar".
    var isAwaitingFinishDecision: Bool = false
    /// True once the athlete chose to keep training past the prescription, so the
    /// question is asked exactly once and the extra work is never interrupted again.
    var finishDecisionMade: Bool = false
    /// The prescription is DONE and the athlete is still training. Read by the live
    /// surfaces so they stop showing a series and a goal he has already completed —
    /// re-offering "SERIE 1/5 · 500 m" after all five is the app inventing work.
    var isExtraWork: Bool = false

    // MARK: - EMOM interval state
    // Live ONLY while the current segment is an EMOM. `emomSegmentIndex` records
    // which segment owns this state so entering / re-entering re-initialises it
    // cleanly and leaving it tears the timer + audio down.
    var emomIntervalIndex: Int = 0          // 0-based interval within the EMOM
    /// Which half of the cycle is running. A plain EMOM has no transition, so it
    /// stays `.work` for the whole cycle and behaves exactly as it always has; an
    /// INTERVAL EMOM (45/15, Tabata) flips to `.rest` for its transition window.
    /// Same two-phase vocabulary as the rotating engine — one notion of work vs
    /// change in the whole app.
    var emomPhase: RotatingPhase = .work
    var emomCompletedIntervals: Int = 0
    var emomSegmentIndex: Int? = nil
    static let countInSeconds: Double = 3
    /// Seconds left in an interval at/under which the countdown reads as "urgent"
    /// (drives the last-3s ticks + the HUD's accent colour).
    static let emomUrgentThreshold: Double = 3

    // MARK: - Conditioning format clock (non-EMOM live timers)
    //
    // Parallel to the EMOM engine (which it never touches): live ONLY while the
    // current segment runs a NON-EMOM conditioning timer (For Time, AMRAP, Tabata,
    // Intervals, Death By, Steady, Chipper, Ladder, Rounds, HYROX sim). A 3-2-1
    // count-in fires after "Empezar"; `condStartElapsed` marks GO so the count-in
    // (and pre-GO time) never inflates the format clock / score. `condSegmentIndex`
    // records which segment owns the state so re-entry re-initialises cleanly.
    var condStartElapsed: Double = 0   // lapElapsedSeconds at GO
    var condSegmentIndex: Int? = nil

    /// FIXED formats — lines of the checklist the athlete has struck (AMRAP rounds,
    /// For Time rounds, or the STATIONS of a route) and what each closed line
    /// measured. `repsCurrentSegment` carries the AMRAP partial-round rep tally.
    var fixedRoundsDone: Int = 0
    var fixedRoundSplits: [FixedStationSplit] = []
    /// Última lista FIXED sellada al ir al «has acabado». Un solo hueco, no un stack.
    var conditioningUndoHold: ConditioningUndoHold? = nil

    /// DESCANSO ENTRE ESTACIONES de una lista fija (el 2:00 del HYROX Conditioning
    /// Test entre remo y burpees). Hasta ahora el motor FIXED no tenía NINGUNA fase
    /// de descanso: el `rest_s` que el coach prescribía se guardaba y no lo leía
    /// nadie, así que las estaciones encadenaban sin pausa y el atleta no sabía si
    /// parar (Alex, 8-ago). Alimenta `isTramoResting`, que es la ÚNICA superficie de
    /// descanso — así el móvil y el reloj lo pintan con la pantalla que ya existe,
    /// sin una segunda forma de decir lo mismo.
    ///
    /// Una simulación HYROX no prescribe descansos y sigue yendo seguida, que es lo
    /// correcto: en carrera el reloj no para.
    /// ROTATING formats (Tabata / Intervals / Death By) — the work/rest phase, the
    /// 0-based round index, the count-DOWN remaining in the current phase, and the
    /// Tabata per-round rep tally. `deathByFailed` ends a Death By on "Fallé".
    enum RotatingPhase: String { case work, rest }
    var rotPhase: RotatingPhase = .work
    var rotRoundIndex: Int = 0
    /// One entry per round; `nil` = the athlete never counted that round. Counting is
    /// OPTIONAL, so a filled-with-zeros array would publish a Tabata score of 0 reps
    /// for everyone who just did the eight rounds (see `captureConditioningScore`).
    var rotRepsByRound: [Int?] = []
    /// Rounds actually COMPLETED in the current rotating format — the score's
    /// numerator. `rotRoundIndex` alone can't answer it: the last round closes the
    /// block without advancing the cursor, and abandoning at round 3 must not read
    /// as the eight the coach prescribed.
    var rotRoundsCompleted: Int = 0
    var deathByFailed: Bool = false

    // MARK: - Structured-run engine (#61) — the native leg cursor
    //
    // A folded run block that carries a `structure` (WorkoutSegment.hasRunStructure)
    // is driven by a FLAT leg cursor over its expanded leg list — one work/recovery
    // bout at a time, each with its OWN measure/target/incline/cadence — instead of
    // the binary work/rest rotating machine (which cannot express a heterogeneous
    // pyramid, a distance recovery, a work-only progression or phase legs). SELF-
    // CONTAINED and parallel to the EMOM / conditioning engines; fires ONLY while
    // `hasRunStructure`, so a legacy run keeps the rotating path byte-for-byte.
    // Recording stays AGGREGATE (one lap per folded block) — the cursor drives
    // DISPLAY + AUTO-CLOSE, never a per-bout record.
    //
    // COMPLETION per leg (surfaced explicitly in the HUD): a TIME leg auto-rolls on
    // the session clock; a DISTANCE leg auto-closes on the treadmill (the belt owns
    // it), else closes MANUALLY ("Tramo hecho") — there is no live phone GPS yet
    // (#64), so a distance leg without a belt is never left waiting on nothing.
    var runLegIndex: Int = 0                  // 0-based cursor into the expanded leg list
    var runLegStartElapsed: Double = 0    // lapElapsedSeconds at the current leg's GO
    var runStructureSegmentIndex: Int? = nil  // which segment owns the cursor

    // #break-2 — per-WORK-leg execution baselines. A structured/interval run used to
    // collapse into ONE aggregate lap whose pace blended work + recovery (meaningless).
    // We now snapshot each of these at every leg's GO (`markRunLegStart`) and DIFF them
    // when a WORK leg closes (`recordRunLegLap`), so each interval gets its OWN
    // distance/duration/pace/HR/incline/zone. Recovery legs advance the cursor and
    // reset the baselines but are not persisted (the coach's run-compliance zips the
    // prescription's WORK segments to these per-leg laps in order).
    var runLegBeltStart: Double = 0        // lapBeltDistanceMeters at leg GO
    var runLegGpsStart: Double = 0         // lapGpsDistanceMeters at leg GO
    var runLegHRStartCount: Int = 0        // lapHRSamples.count at leg GO
    var runLegZoneStart: [Int: Double] = [:]   // lapZoneAccumSec snapshot at leg GO
    var runLegInclineSumStart: Double = 0  // lapInclineSum at leg GO
    var runLegInclineCountStart: Int = 0   // lapInclineCount at leg GO

    /// Captured final score for the PRINCIPAL conditioning block, set on its close
    /// and read by the post-workout summary to PRE-FILL the result (the athlete
    /// never re-enters what the live timer already counted). Format-aware: time for
    /// For Time / Chipper / Ladder / Rounds / HYROX sim; rounds(+reps) for AMRAP /
    /// Tabata / Death By; nil for pace formats (carried by the per-segment splits).
    var capturedScoreTimeSeconds: Int? = nil
    var capturedScoreRounds: Int? = nil
    var capturedScoreReps: Int? = nil

    /// #break-1 — EMOM completion (rounds done / prescribed) captured on the EMOM's
    /// close BEFORE the live engine's `clearEMOMState()` zeroes `emomCompletedIntervals`
    /// (the bug: it zeroed before the lap closed, so the coach saw blanks). Read by
    /// `closeCurrentSegmentLap` into the LapRecord's emom fields, then cleared.
    var capturedEmomCompleted: Int? = nil
    var capturedEmomPrescribed: Int? = nil

    /// Provenance of the live heart-rate signal currently feeding the session,
    /// so the connection strip can show WHERE HR comes from. nil = no HR.
    ///
    /// PRIORITY (who OWNS the provenance when several stream at once): a dedicated
    /// BLE chest/arm `strap` is the most trustworthy exercise-HR signal, the
    /// Apple Watch / iPhone `healthkit` stream next, an intermittent PM5-paired
    /// strap (`pm5`) last. A higher-priority source takes over; a lower-priority
    /// reading still feeds the live value + lap samples but never steals the label.
    enum HRSource: String {
        case strap, healthkit, pm5
        var priority: Int {
            switch self {
            case .strap:     return 3
            case .healthkit: return 2
            case .pm5:       return 1
            }
        }
    }
    var hrSource: HRSource? = nil
    /// When the provenance-OWNING source last reported. A strap that dies mid-workout
    /// (battery, contact) must not keep the "HR · Banda" label while the watch is the
    /// one actually recording — past this quiet window a live lower-priority stream
    /// takes the label over. Internal (not private) so tests can backdate it.
    var hrSourceLastSeenAt: Date = .distantPast
    /// How long the owning source may go silent before it loses the label (straps
    /// report ~1 Hz, so 10 missed beats = gone, while a brief BLE hiccup survives).
    static let hrSourceStaleSeconds: TimeInterval = 10

    /// Athlete-entered actual load for the current strength/sled segment (kg).
    /// Pre-filled from the prescription on segment entry so the HUD shows a
    /// number to adjust — but a pre-filled value is the COACH's plan, not the
    /// athlete's data. Only what survives `loadConfirmed` reaches the record.
    var manualLoadKg: Double? = nil
    /// What `primeManualLoadIfNeeded` wrote into `manualLoadKg` for the current
    /// segment (nil when nothing was primed). The load counts as DECLARED only
    /// when it differs from this — the exact rule the reps already follow
    /// (`repsConfirmed`): an untouched advance is an assumption, not a
    /// measurement. Reset per segment alongside `manualLoadKg`.
    var primedLoadKg: Double? = nil
    /// TRUE once the athlete moved the load away from the primed prescription —
    /// the load's twin of `repsConfirmed`. A sentadilla done at 80 kg over a
    /// prescription of 100 must never read back as "5 × 100 kg", so an
    /// unconfirmed load is NOT recorded as the load used: the prescription stays
    /// where it belongs (`SetRecord.loadPrescribedKg`) and the actual stays nil.
    var loadConfirmed: Bool { manualLoadKg != nil && manualLoadKg != primedLoadKg }
    /// Athlete-entered actual distance for the current run segment (meters), used
    /// only when no GPS/erg distance is captured. Never pre-filled from the
    /// prescription (target ≠ covered) so the recorded distance stays honest.
    var manualRunDistanceMeters: Double? = nil

    // Per-segment RUN capture from Apple (HKWorkout / distanceWalkingRunning).
    // The property names keep `Gps` because the lap/undo paths already speak that
    // vocabulary; the METERS themselves are no longer a CoreLocation integrator.
    var lapGpsDistanceMeters: Double? = nil
    var lapHadGPS: Bool = false
    /// FTMS ha reclamado esta ventana. Una fuente: Apple deja de firmar metros.
    var lapBeltOwnsDistance: Bool = false

    // Per-segment treadmill INCLINE aggregation (#62). Summed from the belt's live
    // grade over the current run segment (across all its structured legs); averaged
    // on close into the ONE segment lap. Stays nil when no belt fed the segment —
    // never a fabricated grade. Cadence has no on-device source (see LapRecord).
    var lapInclineSum: Double = 0
    var lapInclineCount: Int = 0

    // Per-segment treadmill BELT distance — the covered meters the belt measured
    // over the current run segment (summed across all its structured legs, exactly
    // like the incline aggregate). Fed the per-sample increment by the treadmill HUD
    // (`sampleTreadmillDistance`), pause-aware, reset on lap change. On close it is
    // the honest COVERED distance for an indoor run (no GPS, no PM5); the wrist
    // mirror reads it live for the treadmill progress ring. `private(set)` so only
    // the ingest feeds it, but the HUD (reopen rehydration) and the mirror can read.
    var lapBeltDistanceMeters: Double = 0

    // EL KILÓMETRO NO SE CUENTA AQUÍ, Y NO ES UN OLVIDO.
    //
    // Hubo aquí un cursor (`RunKmSplits`) que cortaba el kilómetro con los metros del
    // tramo y su reloj. Era una SEGUNDA regla:
    // `shared/domain/running/km-splits.ts` ya corta el kilómetro, y su cabecera lo
    // dice con todas las letras — «UNA fuente (la traza cruda de `workout_traces`), N
    // proyecciones; los kilómetros NUNCA se persisten; este módulo es el único sitio
    // que sabe derivarlos». Dos reglas sobre la misma traza acaban discrepando, y el
    // sitio donde se nota es el peor: la voz diciendo un ritmo y la fila del recap
    // diciendo otro para el mismo kilómetro.
    //
    // Así que el corte vive donde ya vivía, y el aviso en vivo es de Apple (ver
    // `AppleWorkoutMapper.kmSteps`). El motor sigue alimentando la traza —
    // `sampleRunDistance` acumula la señal `.distance`— que es de donde sale todo.

    var timer: Timer?
    var lastTick: Date = Date()
    var autoSaveTicker: Int = 0
    var lapHRSamples: [Int] = []
    var lapZoneAccumSec: [Int: Double] = [:]

    // MARK: - HRR (tests guiados) — post-effort recovery window
    //
    // A rolling tail of the most recent effort HR readings (~the last 12 s) so
    // `beginRecoveryWindow` can derive hr_end (mean of the final 10 s of effort)
    // at the moment the session finishes. Tiny and always-on: pruned on every
    // reading, so it never grows past a few samples.
    var recentEffortHR: [(date: Date, bpm: Int)] = []
    static let effortTailKeepSeconds: TimeInterval = 12
    /// When `finish()` ran — the anchor for recovery offsets. Nil until finished.
    var finishedAt: Date? = nil
    /// The post-effort HRR capture (tests with an `hrr` result contract). Created
    /// by `beginRecoveryWindow()`; nil for every normal session — the recovery
    /// path in `injectLiveHR` is then inert.
    var hrRecovery: HRRecoveryCapture? = nil

    // Per-segment PM5 aggregation. We sample the live erg stream each tick while
    // the current segment is an erg AND a PM5 is streaming, then average on lap.
    // Distance/calories use the in-window delta (final − value at segment start)
    // because PM5 distance/kcal are cumulative across the whole piece.
    var lapErgPaceSamples: [Double] = []
    var lapErgPowerSamples: [Double] = []
    var lapErgSpmSamples: [Double] = []
    var lapErgStartDistance: Double? = nil
    /// The monitor's LATEST cumulative reading. Internal (not private) because the
    /// tramo layer lives in its own file and anchors its window against it.
    var lapErgLastDistance: Double? = nil
    var lapErgStartCalories: Int? = nil
    var lapErgLastCalories: Int? = nil
    var lapHadPM5: Bool = false
    // Erg detail (#33): drag / cal-per-hour / drive-force are averaged over the
    // segment; the monitor's own avg pace (last value wins) is preferred over our
    // sample mean; the PM5 splits are snapshotted verbatim.
    var lapErgDragSamples: [Double] = []
    var lapErgCalPerHourSamples: [Double] = []
    var lapErgPeakForceSamples: [Double] = []
    var lapErgAvgForceSamples: [Double] = []
    var lapErgMonitorAvgPace500: Double? = nil
    var lapErgSplits: [PM5Split] = []

    // MARK: - Active tramo window (see LiveTramo + WorkoutSession+Tramo)
    //
    // The TRAMO is the window the athlete is inside right now — an EMOM round, an
    // interval bout, a run leg, or the segment itself when no format subdivides it.
    // These are the engine-owned accumulators that re-anchor whenever that window
    // changes. They are deliberately SEPARATE from the `lap*` accumulators above:
    // the lap is what gets SAVED (segment-wide, unchanged), the tramo is what the
    // athlete SEES. Touched only by WorkoutSession+Tramo.swift — internal rather
    // than private solely because Swift scopes `private` to a single file.

    /// Identity of the tramo currently open. Empty before the first entry.
    var tramoKey: String = ""
    /// `lapElapsedSeconds` at the moment the tramo opened — the tramo clock's zero.
    var tramoStartElapsed: Double = 0
    /// The tramo clock is HELD at zero waiting for the machine to move. Only ever
    /// true for a device-measured tramo with no time box: a 500 m bout starts when
    /// the erg starts, not when the athlete taps.
    var tramoClockArmed: Bool = false
    /// TRUE while a monitor is actually streaming to us. Set by the live view from
    /// the PM5 store; the engine never talks to Bluetooth itself.
    ///
    /// It gates the arm above, and it must: arming is a BET that a machine will
    /// report, and the only thing that releases it is a device sample. Pairing the
    /// PM5 is optional ("Empezar sin monitor · lo apuntas tú"), so with no monitor
    /// the bet could never be settled — the station sat at 0:00 for its whole
    /// duration and closed with a recorded zero. With nothing to wait for, the
    /// clock simply starts when the athlete taps, which is what he expects.
    var ergConnected: Bool = false
    /// PM5 cumulative distance / calories at tramo entry — the live progress bar's
    /// zero, so serie 2 of a 5×500 starts from 0 m again instead of 1000/500.
    var tramoErgStartDistance: Double? = nil
    var tramoErgStartCalories: Int? = nil
    /// Belt metres covered THIS SEGMENT at tramo entry — the treadmill twin of
    /// `tramoErgStartDistance`. Without it a multi-station EMOM reported the whole
    /// segment's belt distance on every run minute (minute 4 claiming minute 1 + 4's
    /// metres); with it each minute owns exactly what it covered.
    var tramoBeltStartDistance: Double = 0
    /// GPS metres covered THIS SEGMENT at tramo entry — the outdoor twin of
    /// `tramoBeltStartDistance`. Without it a mixed block whose stations alternate
    /// Run / SkiErg / Burpees / Row / Wall Balls (a HYROX sim folds to ONE segment,
    /// `mergedConditioningSegment`) reported the WHOLE segment's GPS distance on
    /// every run station — the third 1.000 m of the block reading 2.000-y-pico
    /// instead of starting at zero, because `lapGpsDistanceMeters` accumulates
    /// across all four run stations of the same folded segment.
    var tramoGpsStartDistance: Double? = nil
    /// How long the tramo that just closed lasted — the number the rest screen
    /// shows so "tiempo" stops counting the moment the work stops.
    var lastTramoElapsedSeconds: Double? = nil
    /// Highest HR seen inside the tramo that just closed. The rest screen turns it
    /// into real recovery information ("162 → 138"); nil when no HR was streaming.
    var tramoHRPeak: Int? = nil
    var lastTramoHRPeak: Int? = nil
    /// The WORK of this window has ended and its rest is running. Separate from the
    /// tramo key because a rest belongs to the round that just finished: the clock
    /// must freeze, but the metres the athlete just covered are still this round's
    /// and must stay on screen.
    var tramoRestLatched: Bool = false
    /// Sample-array cursors at the OPEN of the current work tramo — so a per-bout
    /// erg series lap can slice HR / pace / power / SPM to THIS serie only (same
    /// idea as `runLegHRStartCount` for structured runs).
    var tramoHRStartCount: Int = 0
    var tramoPaceSampleStart: Int = 0
    var tramoPowerSampleStart: Int = 0
    var tramoSpmSampleStart: Int = 0
    /// How many interval WORK bouts have been written as their own LapRecord for
    /// the current segment. When > 0, `closeCurrentSegmentLap` skips the blended
    /// aggregate (mirrors structured-run per-leg recording).
    var ergIntervalBoutsRecorded: Int = 0
    /// How many EMOM WORK minutes have been written as their own LapRecord for
    /// the current segment (one row per station/minute: remo, ski, wallballs…).
    /// When > 0, `closeCurrentSegmentLap` skips the blended block aggregate.
    var emomIntervalBoutsRecorded: Int = 0

    // A previously-closed segment REOPENED via stepBack / jumpTo. Its captured
    // aggregates (HR / zone / distance / calories) are merged back in when the
    // segment is re-closed, so a back-step never silently drops recorded work.
    var reopenedLap: LapRecord? = nil

    /// UNA AUTO-PAUSA NO PUEDE SOBREVIVIR A QUIEN LA VIGILA.
    ///
    /// La auto-pausa la decide quien mira la velocidad del GPS, y eso vive en una
    /// pantalla. Cuando esa pantalla se va —el atleta la cierra, cambia de tramo,
    /// pasa a la cinta— ya no hay nadie evaluando si el atleta ha vuelto a correr,
    /// y la sesión se quedaba **pausada para siempre**: el crono parado en un
    /// semáforo, y encima el entreno se guardaba con ese tiempo de menos.
    ///
    /// El fallo no era que faltara una llamada en un `teardown`: era que el
    /// invariante estaba en manos de la vista. Ahora lo garantiza la sesión —
    /// quien evalúe se registra, y al irse cualquier auto-pausa suya se levanta
    /// sola. Una pausa MANUAL no se toca nunca: ésa es del atleta.
    var autoPauseEvaluadores = 0

    /// El reloj de la sesión cuando se cerró la última serie. Nil hasta que se cierra
    /// la primera del tramo: antes no hay pausa que contar, y un 0:00 se leería como
    /// una medida (§7).
    var lastSetClosedElapsed: Double?

    init(plan: WorkoutPlan, hrZones: HRZoneProfile? = nil, startedAt: Date = Date()) {
        self.plan = plan
        self.hrZones = hrZones
        self.startedAt = startedAt
    }
}
