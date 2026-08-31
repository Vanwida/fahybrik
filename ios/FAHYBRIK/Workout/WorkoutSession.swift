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
    /// Where the athlete said they run TODAY (cinta / calle), chosen pre-start.
    /// Drives the auto-open of the right live HUD and keeps GPS off on a treadmill
    /// run (indoor GPS noise reads as phantom pace). Ephemeral — never persisted.
    var runEnvironment: RunEnvironment? = nil

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
    private var repsPrimedSegmentIndex: Int? = nil

    /// Per-set strength detail for the current segment (a 5×5 / pyramid). Primed
    /// from `prescription.sets`; each set defaults to prescribed until touched.
    var setRecords: [SetRecord] = []
    private var setsPrimedSegmentIndex: Int? = nil

    /// Rx / Scaled for the current metcon-family BLOCK (set once per block, stamped
    /// on each of its laps). Reset at block boundaries; primed to "rx".
    var rxScaled: String? = nil
    /// Optional free note on HOW the current WOD was scaled.
    var scaledNote: String? = nil

    /// Block grouping keys whose warmup/cooldown structural completion is already
    /// recorded, so a block is never double-logged (button + auto-infer backstop).
    private var completedStructuralBlockKeys: Set<String> = []
    /// Set once the athlete confirms their first real working set — the trigger to
    /// auto-infer a preceding warmup as done.
    private var firstWorkingSetConfirmed: Bool = false

    /// Rest countdown fired when a strength set is confirmed (from the set's
    /// prescribed `rest_s`). 0 = no rest running. Decremented on the main tick.
    var restRemainingSeconds: Double = 0
    private(set) var restTotalSeconds: Double = 0

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
    private var hasArmedInitial = false

    /// The prescribed work is DONE and the session is asking whether to close or
    /// keep going. It is not finished: nothing is saved, the clock is held, and the
    /// athlete decides. Before this existed the last lap dropped him straight into
    /// the summary — 28-jul: "cuando acaba el entreno, se tiene que permitir al
    /// atleta continuar en caso que quiera, en cambio la pantalla pasa directamente
    /// a finalizar y guardar".
    var isAwaitingFinishDecision: Bool = false
    /// True once the athlete chose to keep training past the prescription, so the
    /// question is asked exactly once and the extra work is never interrupted again.
    private var finishDecisionMade: Bool = false
    /// The prescription is DONE and the athlete is still training. Read by the live
    /// surfaces so they stop showing a series and a goal he has already completed —
    /// re-offering "SERIE 1/5 · 500 m" after all five is the app inventing work.
    private(set) var isExtraWork: Bool = false

    // MARK: - EMOM interval state
    // Live ONLY while the current segment is an EMOM. `emomSegmentIndex` records
    // which segment owns this state so entering / re-entering re-initialises it
    // cleanly and leaving it tears the timer + audio down.
    var emomCountInRemaining: Double = 0    // 3-2-1 pre-roll; 0 once running
    var emomIntervalIndex: Int = 0          // 0-based interval within the EMOM
    /// Which half of the cycle is running. A plain EMOM has no transition, so it
    /// stays `.work` for the whole cycle and behaves exactly as it always has; an
    /// INTERVAL EMOM (45/15, Tabata) flips to `.rest` for its transition window.
    /// Same two-phase vocabulary as the rotating engine — one notion of work vs
    /// change in the whole app.
    var emomPhase: RotatingPhase = .work
    /// Count-DOWN remaining in the CURRENT phase (the whole cycle when there is no
    /// explicit transition).
    var emomPhaseRemaining: Double = 0
    private(set) var emomCompletedIntervals: Int = 0
    private var emomSegmentIndex: Int? = nil
    private static let countInSeconds: Double = 3
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
    var condCountInRemaining: Double = 0
    private var condStartElapsed: Double = 0   // lapElapsedSeconds at GO
    private var condSegmentIndex: Int? = nil

    /// FIXED formats — lines of the checklist the athlete has struck (AMRAP rounds,
    /// For Time rounds, or the STATIONS of a route) and what each closed line
    /// measured. `repsCurrentSegment` carries the AMRAP partial-round rep tally.
    var fixedRoundsDone: Int = 0
    private(set) var fixedRoundSplits: [FixedStationSplit] = []

    /// ROTATING formats (Tabata / Intervals / Death By) — the work/rest phase, the
    /// 0-based round index, the count-DOWN remaining in the current phase, and the
    /// Tabata per-round rep tally. `deathByFailed` ends a Death By on "Fallé".
    enum RotatingPhase: String { case work, rest }
    var rotPhase: RotatingPhase = .work
    var rotRoundIndex: Int = 0
    var rotPhaseRemaining: Double = 0
    /// One entry per round; `nil` = the athlete never counted that round. Counting is
    /// OPTIONAL, so a filled-with-zeros array would publish a Tabata score of 0 reps
    /// for everyone who just did the eight rounds (see `captureConditioningScore`).
    private(set) var rotRepsByRound: [Int?] = []
    /// Rounds actually COMPLETED in the current rotating format — the score's
    /// numerator. `rotRoundIndex` alone can't answer it: the last round closes the
    /// block without advancing the cursor, and abandoning at round 3 must not read
    /// as the eight the coach prescribed.
    private(set) var rotRoundsCompleted: Int = 0
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
    var runCountInRemaining: Double = 0       // 3-2-1 pre-roll; 0 once the first leg runs
    var runLegRemaining: Double = 0           // count-DOWN within a TIME leg (0 for a distance leg)
    private var runLegStartElapsed: Double = 0    // lapElapsedSeconds at the current leg's GO
    private var runStructureSegmentIndex: Int? = nil  // which segment owns the cursor

    // #break-2 — per-WORK-leg execution baselines. A structured/interval run used to
    // collapse into ONE aggregate lap whose pace blended work + recovery (meaningless).
    // We now snapshot each of these at every leg's GO (`markRunLegStart`) and DIFF them
    // when a WORK leg closes (`recordRunLegLap`), so each interval gets its OWN
    // distance/duration/pace/HR/incline/zone. Recovery legs advance the cursor and
    // reset the baselines but are not persisted (the coach's run-compliance zips the
    // prescription's WORK segments to these per-leg laps in order).
    private var runLegBeltStart: Double = 0        // lapBeltDistanceMeters at leg GO
    private var runLegGpsStart: Double = 0         // lapGpsDistanceMeters at leg GO
    private var runLegHRStartCount: Int = 0        // lapHRSamples.count at leg GO
    private var runLegZoneStart: [Int: Double] = [:]   // lapZoneAccumSec snapshot at leg GO
    private var runLegInclineSumStart: Double = 0  // lapInclineSum at leg GO
    private var runLegInclineCountStart: Int = 0   // lapInclineCount at leg GO

    /// Captured final score for the PRINCIPAL conditioning block, set on its close
    /// and read by the post-workout summary to PRE-FILL the result (the athlete
    /// never re-enters what the live timer already counted). Format-aware: time for
    /// For Time / Chipper / Ladder / Rounds / HYROX sim; rounds(+reps) for AMRAP /
    /// Tabata / Death By; nil for pace formats (carried by the per-segment splits).
    private(set) var capturedScoreTimeSeconds: Int? = nil
    private(set) var capturedScoreRounds: Int? = nil
    private(set) var capturedScoreReps: Int? = nil

    /// #break-1 — EMOM completion (rounds done / prescribed) captured on the EMOM's
    /// close BEFORE the live engine's `clearEMOMState()` zeroes `emomCompletedIntervals`
    /// (the bug: it zeroed before the lap closed, so the coach saw blanks). Read by
    /// `closeCurrentSegmentLap` into the LapRecord's emom fields, then cleared.
    private var capturedEmomCompleted: Int? = nil
    private var capturedEmomPrescribed: Int? = nil

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
    private var primedLoadKg: Double? = nil
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

    // Per-segment RUN capture from CoreLocation (phone GPS). Distance is the
    // in-window covered meters; pace is derived on close from distance/duration
    // (a live GPS instantaneous pace is too noisy to average meaningfully here).
    private var lapGpsDistanceMeters: Double? = nil
    private var lapHadGPS: Bool = false

    // Per-segment treadmill INCLINE aggregation (#62). Summed from the belt's live
    // grade over the current run segment (across all its structured legs); averaged
    // on close into the ONE segment lap. Stays nil when no belt fed the segment —
    // never a fabricated grade. Cadence has no on-device source (see LapRecord).
    private var lapInclineSum: Double = 0
    private var lapInclineCount: Int = 0

    // Per-segment treadmill BELT distance — the covered meters the belt measured
    // over the current run segment (summed across all its structured legs, exactly
    // like the incline aggregate). Fed the per-sample increment by the treadmill HUD
    // (`sampleTreadmillDistance`), pause-aware, reset on lap change. On close it is
    // the honest COVERED distance for an indoor run (no GPS, no PM5); the wrist
    // mirror reads it live for the treadmill progress ring. `private(set)` so only
    // the ingest feeds it, but the HUD (reopen rehydration) and the mirror can read.
    private(set) var lapBeltDistanceMeters: Double = 0

    private var timer: Timer?
    private var lastTick: Date = Date()
    private var autoSaveTicker: Int = 0
    private var lapHRSamples: [Int] = []
    private var lapZoneAccumSec: [Int: Double] = [:]

    // MARK: - HRR (tests guiados) — post-effort recovery window
    //
    // A rolling tail of the most recent effort HR readings (~the last 12 s) so
    // `beginRecoveryWindow` can derive hr_end (mean of the final 10 s of effort)
    // at the moment the session finishes. Tiny and always-on: pruned on every
    // reading, so it never grows past a few samples.
    private var recentEffortHR: [(date: Date, bpm: Int)] = []
    private static let effortTailKeepSeconds: TimeInterval = 12
    /// When `finish()` ran — the anchor for recovery offsets. Nil until finished.
    private(set) var finishedAt: Date? = nil
    /// The post-effort HRR capture (tests with an `hrr` result contract). Created
    /// by `beginRecoveryWindow()`; nil for every normal session — the recovery
    /// path in `injectLiveHR` is then inert.
    private(set) var hrRecovery: HRRecoveryCapture? = nil

    // Per-segment PM5 aggregation. We sample the live erg stream each tick while
    // the current segment is an erg AND a PM5 is streaming, then average on lap.
    // Distance/calories use the in-window delta (final − value at segment start)
    // because PM5 distance/kcal are cumulative across the whole piece.
    private var lapErgPaceSamples: [Double] = []
    private var lapErgPowerSamples: [Double] = []
    private var lapErgSpmSamples: [Double] = []
    private var lapErgStartDistance: Double? = nil
    /// The monitor's LATEST cumulative reading. Internal (not private) because the
    /// tramo layer lives in its own file and anchors its window against it.
    private(set) var lapErgLastDistance: Double? = nil
    private var lapErgStartCalories: Int? = nil
    private(set) var lapErgLastCalories: Int? = nil
    private var lapHadPM5: Bool = false
    // Erg detail (#33): drag / cal-per-hour / drive-force are averaged over the
    // segment; the monitor's own avg pace (last value wins) is preferred over our
    // sample mean; the PM5 splits are snapshotted verbatim.
    private var lapErgDragSamples: [Double] = []
    private var lapErgCalPerHourSamples: [Double] = []
    private var lapErgPeakForceSamples: [Double] = []
    private var lapErgAvgForceSamples: [Double] = []
    private var lapErgMonitorAvgPace500: Double? = nil
    private var lapErgSplits: [PM5Split] = []

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

    // A previously-closed segment REOPENED via stepBack / jumpTo. Its captured
    // aggregates (HR / zone / distance / calories) are merged back in when the
    // segment is re-closed, so a back-step never silently drops recorded work.
    private var reopenedLap: LapRecord? = nil

    init(plan: WorkoutPlan, hrZones: HRZoneProfile? = nil, startedAt: Date = Date()) {
        self.plan = plan
        self.hrZones = hrZones
        self.startedAt = startedAt
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

    /// True when the current segment is a running EMOM (past its count-in).
    var isEMOMActive: Bool { currentSegment?.isEMOM == true }

    // MARK: Conditioning accessors (read by the format HUDs)

    /// True when the current segment runs a non-EMOM conditioning timer.
    var isConditioningActive: Bool { currentSegment?.isConditioningTimer == true }

    /// True while the conditioning 3-2-1 count-in is on screen.
    var isCondCountIn: Bool { condCountInRemaining > 0 }

    // MARK: Structured-run accessors (read by the run / interval / treadmill HUDs)

    /// The expanded legs of the CURRENT structured run segment, or nil (legacy path).
    var currentRunLegs: [RunLeg]? { currentSegment?.runStructureLegs }

    /// True while the current segment is driven by the structured-run engine.
    var isRunStructureActive: Bool { currentSegment?.hasRunStructure == true }

    /// The current leg, or nil when not structured / the cursor is out of range.
    var currentRunLeg: RunLeg? {
        guard let legs = currentRunLegs, runLegIndex >= 0, runLegIndex < legs.count else { return nil }
        return legs[runLegIndex]
    }

    /// True while the structured-run 3-2-1 count-in is on screen.
    var isRunCountIn: Bool { runCountInRemaining > 0 }

    /// 1-based "Tramo N de M" WITHIN the current structured run segment.
    var runLegNumber: Int { Swift.min(runLegTotal, runLegIndex + 1) }
    var runLegTotal: Int { Swift.max(1, currentRunLegs?.count ?? 1) }

    /// True when the current leg is a WORK bout (false = a recovery). Defaults to
    /// work for a legacy/absent leg so callers never mis-flag a rest.
    var isRunLegWork: Bool { currentRunLeg?.isWork ?? true }

    /// Elapsed seconds in the current leg since its GO (the count-in excluded).
    var runLegElapsed: Double { Swift.max(0, lapElapsedSeconds - runLegStartElapsed) }

    /// True when the current structured leg is DISTANCE-measured — so the app-only
    /// HUD can pick the honest close affordance (belt auto-close when a treadmill is
    /// live, else manual "Tramo hecho"; a TIME leg auto-rolls on the clock). Kept
    /// treadmill-agnostic here because the shared engine also compiles on the watch.
    var currentRunLegIsDistance: Bool {
        guard let leg = currentRunLeg else { return false }
        return leg.distanceMeters != nil
    }

    /// Format clock time since GO (the count-in excluded), in seconds — the base
    /// for the FIXED count-up / count-down and the CONTINUOUS countdown.
    var condElapsed: Double { max(0, lapElapsedSeconds - condStartElapsed) }

    /// AMRAP / Steady time remaining in the fixed window (count-DOWN, never < 0).
    var condRemaining: Double {
        guard let total = currentSegment?.formatTotalSeconds else { return 0 }
        return max(0, Double(total) - condElapsed)
    }

    /// Total rounds the current ROTATING format runs (Tabata / Intervals), else 0.
    var rotTotalRounds: Int { currentSegment?.formatRounds ?? 0 }

    /// Reps logged so far this Tabata round (the live tally shown on the HUD). A
    /// round not yet counted reads 0 — live that IS the running tally, and the
    /// undeclared/zero distinction only matters when the score is sealed.
    var rotRepsThisRound: Int {
        guard rotRoundIndex >= 0, rotRoundIndex < rotRepsByRound.count else { return 0 }
        return rotRepsByRound[rotRoundIndex] ?? 0
    }

    /// Death By target for the CURRENT minute = start + increment × roundsCompleted.
    var deathByTarget: Int {
        guard let seg = currentSegment else { return 0 }
        return seg.deathByStart + seg.deathByIncrement * rotRoundIndex
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
    var liveCoveredPaceSecPerKm: Int? {
        let pace: Double?
        if isRunStructureActive {
            let beltDelta = Swift.max(0, lapBeltDistanceMeters - runLegBeltStart)
            let gpsDelta = Swift.max(0, (lapGpsDistanceMeters ?? 0) - runLegGpsStart)
            let covered = beltDelta > 0 ? beltDelta : gpsDelta
            pace = Self.paceSecPerKm(meters: covered, seconds: runLegElapsed)
        } else {
            pace = Self.paceSecPerKm(meters: liveRunDistanceMeters, seconds: lapElapsedSeconds)
        }
        return pace.map { Int($0.rounded()) }
    }

    /// EMOM intervals still ahead of the current one (0 on the last interval).
    var emomIntervalsRemaining: Int {
        guard let plan = currentSegment?.emomPlan else { return 0 }
        return max(0, plan.intervalCount - emomIntervalIndex - 1)
    }

    /// True when going back is possible — a previous EMOM interval or a previous
    /// segment. Drives the (low-emphasis) back chevron's enabled state.
    var canStepBack: Bool {
        if currentSegment?.isEMOM == true, emomCountInRemaining <= 0, emomIntervalIndex > 0 { return true }
        return currentSegmentIndex > 0
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

    /// True when the THRESHOLD behind these bands was inferred rather than measured
    /// (label them "estimado"); false when it came from the athlete's own test.
    var hrZonesEstimated: Bool { hrZones?.estimated ?? false }

    func start() {
        // AUDIT-3 — (re)enable persistence for this workout; a previous session may
        // have closed the store on finish/discard.
        Task { await WorkoutStateStore.shared.open() }
        guard timer == nil else { return }
        lastTick = Date()
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            self?.tick()
        }
        // First appearance: ARM the current block (show its preview, hold the
        // clock) so the session begins with the athlete's approval, not a timer
        // that's already running. A crash-recovered EMOM keeps its live interval
        // state (emomSegmentIndex != nil) and resumes running, exactly as before.
        // Re-appearances (hasArmedInitial) just resume the timer — they never
        // re-arm a block mid-session.
        if !hasArmedInitial {
            hasArmedInitial = true
            #if os(iOS)
            AudioCoach.shared.beginWorkout()   // fresh voice-coaching state for this workout (#63, iOS-only)
            #endif
            if emomSegmentIndex == nil { armBlock() }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        WorkoutAudio.shared.deactivate()
    }

    func togglePause() {
        Haptics.medium()
        // A MANUAL action always wins over auto-pause: pausing by hand makes it a
        // manual hold (never auto-resumed), and resuming by hand clears any
        // auto-pause that was holding the clock.
        autoPaused = false
        if isPaused {
            isPaused = false
            lastTick = Date()
        } else {
            isPaused = true
        }
    }

    /// Engage AUTO-pause (outdoor GPS #64): the athlete stopped moving, so freeze the
    /// clock exactly like a manual pause — `elapsedSeconds` then measures MOVING time
    /// and the covered pace stays honest — while remembering that WE paused, so
    /// resumed movement can lift it. No-op when already paused / finished / parked on
    /// a block preview. The caller owns the haptic + the non-modal "Auto-pausa" banner.
    func autoPause() {
        guard !isPaused, !isFinished, !isAwaitingBlockStart else { return }
        isPaused = true
        autoPaused = true
    }

    /// Resume from an AUTO-pause when movement returns. ONLY lifts a pause WE set — a
    /// manual pause (autoPaused == false) is the athlete's own hold and is never
    /// touched. Resets the tick baseline so the clock can't jump by the stopped span.
    func autoResume() {
        guard isPaused, autoPaused, !isFinished else { return }
        isPaused = false
        autoPaused = false
        lastTick = Date()
    }

    /// Pause the clock for a transient, NON-modal interruption — e.g. the athlete
    /// taps the technique video mid-set. Unlike `togglePause` it fires no haptic
    /// and never drives the pause modal. Returns true only when it actually paused
    /// a running clock, so the caller knows whether to resume on dismiss (an
    /// already-paused or finished session is left untouched).
    @discardableResult
    func pauseForVideo() -> Bool {
        guard !isPaused, !isFinished else { return false }
        isPaused = true
        return true
    }

    /// Resume after `pauseForVideo`. Resets the tick baseline so the elapsed
    /// clock can't jump by the time the video sheet was open.
    func resumeFromVideo() {
        guard isPaused, !isFinished else { return }
        isPaused = false
        lastTick = Date()
    }

    func tap(reps: Int = 1) {
        guard !isPaused, !isFinished, !isAwaitingBlockStart else { return }
        repsCurrentSegment = max(0, repsCurrentSegment + reps)
        repsConfirmed = true
        repsSkipped = false
        registerFirstWorkingSet()
    }

    /// Stepper setter for the pre-filled rep HUD — sets the ACTUAL reps and marks
    /// the value confirmed (the athlete touched it), clearing any skip.
    func setReps(_ value: Int) {
        guard !isFinished else { return }
        repsCurrentSegment = max(0, value)
        repsConfirmed = true
        repsSkipped = false
        registerFirstWorkingSet()
    }

    /// Explicit SKIP for the current rep/strength segment → actual = null,
    /// status = skipped. Toggleable so a mis-tap is reversible before advancing.
    func setRepsSkipped(_ skipped: Bool) {
        guard !isFinished else { return }
        repsSkipped = skipped
        repsConfirmed = true
    }

    // MARK: - Forward / back navigation
    //
    // ONE path drives the bottom primary button, the back chevron, the phase rail
    // and the segment stepper: `primaryAdvance` (forward one step), `stepBack`
    // (back one step, REOPENING the previous segment / interval), and `jumpTo`
    // (the rail / stepper shortcut — close-then-skip forward, or reopen backward).

    /// The bottom primary button. For an EMOM it advances the PHASE — finishing the
    /// work early lands on the change window (you still have to move to the next
    /// station), and tapping during the change starts the next round; a plain EMOM
    /// has no change, so it advances the interval exactly as it always did. This is
    /// the same behaviour the rotating engine gives "Serie hecha". For every other
    /// format it closes the current segment's lap and advances — the classic manual
    /// lap, unchanged.
    func primaryAdvance() {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, let seg = currentSegment else { return }
        if seg.hasRunStructure {
            runStructurePrimary()
        } else if seg.isEMOM {
            if emomCountInRemaining > 0 { skipCountIn(); return }
            guard let plan = seg.emomPlan else { return }
            rollEMOMPhase(plan)
        } else if seg.isConditioningTimer {
            conditioningPrimary(seg)
        } else {
            lap()
        }
    }

    // Closes current segment's lap, advances to next. Behavior shared by For
    // Time / AMRAP / Circuit / HYROX Sim. EMOM auto-advances its intervals instead.
    func lap() {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, currentSegment != nil else { return }
        Haptics.medium()
        let origin = currentSegmentIndex
        closeCurrentSegmentLap()
        if currentSegmentIndex < plan.segments.count - 1 {
            currentSegmentIndex += 1
            enterOrArm(from: origin)
        } else {
            finishPrescribedWork()
        }
    }

    /// #23 — advance past a PARTNER relay station. In HYROX dobles the partner
    /// works this station while the athlete recovers, so the athlete logs NOTHING:
    /// we DISCARD any live state and close NO work lap (mirrors jumpTo's "skipped →
    /// no lap"), so the station never enters this athlete's volume/analytics. The
    /// relay time still elapses on the session clock. Advances to the next segment
    /// (or finishes on the last).
    func advanceRelay() {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, currentSegment != nil else { return }
        Haptics.medium()
        let origin = currentSegmentIndex
        discardCurrentLiveState()
        if currentSegmentIndex < plan.segments.count - 1 {
            currentSegmentIndex += 1
            enterOrArm(from: origin)
        } else {
            finishPrescribedWork()
        }
    }

    /// Back one step. EMOM mid-block → previous interval (no data loss). Otherwise
    /// → previous segment, REOPENED with its recorded lap restored so it can be
    /// resumed + re-closed. No-op at the very start.
    func stepBack() {
        guard !isPaused, !isFinished else { return }
        if let seg = currentSegment, seg.isEMOM, emomCountInRemaining <= 0, emomIntervalIndex > 0 {
            Haptics.light()
            emomIntervalIndex -= 1
            emomCompletedIntervals = min(emomCompletedIntervals, emomIntervalIndex)
            // Stepping back restarts the round at the top of its WORK phase.
            emomPhase = .work
            emomPhaseRemaining = Double(seg.emomPlan?.workSeconds ?? 60)
            WorkoutAudio.shared.playIntervalStart()
            return
        }
        guard currentSegmentIndex > 0 else { return }
        Haptics.light()
        let origin = currentSegmentIndex
        clearEMOMState()
        clearConditioning()
        clearRunStructure()
        currentSegmentIndex -= 1
        reopenCurrentSegment()
        // Stepping back into an EARLIER block lands on that block's preview (the
        // athlete re-approves before its clock runs); stepping back WITHIN the same
        // multi-segment block resumes the reopened segment running, as before.
        enterOrArm(from: origin)
    }

    /// Jump to an arbitrary segment (phase rail / stepper). Forward closes the
    /// current segment then SKIPS the intermediate ones (they produce no lap — not
    /// performed); backward reopens segment-by-segment until the target.
    func jumpTo(_ index: Int) {
        guard !isPaused, !isFinished, !isAwaitingBlockStart,
              index >= 0, index < plan.segments.count, index != currentSegmentIndex else { return }
        Haptics.medium()
        let origin = currentSegmentIndex
        clearEMOMState()
        clearConditioning()
        clearRunStructure()
        if index > currentSegmentIndex {
            closeCurrentSegmentLap()
            currentSegmentIndex = index
        } else {
            discardCurrentLiveState()
            while currentSegmentIndex > index {
                currentSegmentIndex -= 1
                reopenCurrentSegment()
            }
        }
        // A jump that lands in a DIFFERENT block (the phase rail always does)
        // shows that block's preview; a jump within the same block runs straight in.
        enterOrArm(from: origin)
    }

    /// The prescription just ran out on its own. EVERY natural-completion path goes
    /// through here instead of straight to `finish()`, so the athlete is asked once
    /// whether that is the end of his session — the prescribed work is already
    /// closed into its lap either way, so answering "seguir" costs him nothing and
    /// answering "terminar" saves exactly what it used to.
    ///
    /// The question is asked ONCE per session: after he chooses to keep going, the
    /// engine never interrupts him again and he closes the session himself.
    func finishPrescribedWork() {
        guard !isFinished else { return }
        guard !finishDecisionMade else { finish(); return }
        finishDecisionMade = true
        isAwaitingFinishDecision = true
        Haptics.cueFinish()
        WorkoutAudio.shared.playFinish()
    }

    /// "Seguir entrenando" — the prescribed work stays recorded exactly as it was
    /// closed; the session simply stays open and the clock runs again. Extra work is
    /// extra: nothing already logged is reopened or altered.
    func continueAfterPrescribedWork() {
        guard isAwaitingFinishDecision else { return }
        isAwaitingFinishDecision = false
        isExtraWork = true
        isPaused = false
        lastTick = Date()
        resetTramoWindow()
        Haptics.cueGo()
    }

    /// End the session and route to the post-workout summary. `completeness` is the
    /// EARNED outcome: `.full` only when the protocol ran to its end (the default,
    /// the happy path); `.partial` when the athlete terminated early ("Terminar y
    /// guardar" / "Terminar bloque"). The summary reads it to mark the assignment
    /// 'completed' vs 'partial' — never a fabricated completion. Discarding
    /// (ABANDONAR) does NOT come through here: it saves nothing.
    func finish(completeness: WorkoutCompleteness = .full) {
        self.completeness = completeness
        isAwaitingFinishDecision = false
        Haptics.cueFinish()
        // Capture the in-flight conditioning score before the engine is torn down
        // (a "Terminar y guardar" mid-AMRAP keeps the rounds so far). No-op when
        // the engine already closed itself via `closeConditioningAndAdvance`.
        captureConditioningScore()
        captureEMOMScore()   // a "Terminar y guardar" mid-EMOM keeps X/Y rondas (#break-1)
        clearEMOMState()
        clearConditioning()
        clearRunStructure()
        // Close the in-flight segment so the final segment is never dropped from
        // the execution record (finish can be reached via the last lap auto-finish,
        // "Terminar bloque", or "Terminar y guardar" mid-session). lap() will have
        // already closed and zeroed lapElapsedSeconds, so a residual >0 means work
        // is pending. A structural warmup/cooldown only ever logs via its own
        // "hecho" button — an untapped one emits NO row (null = not done).
        if !isFinished, currentSegment != nil, lapElapsedSeconds > 0, !currentBlockIsStructural {
            closeCurrentSegmentLap()
        }
        // HRR anchor: recovery offsets measure from the moment the EFFORT ended.
        // First finish wins (finish can re-enter via auto-finish + button races).
        if finishedAt == nil { finishedAt = Date() }
        isFinished = true
        // Voice the total time BEFORE stop() tears the tone session down — the coach
        // holds the session active for the cue and releases it when the cue ends (#63).
        #if os(iOS)
        AudioCoach.shared.finishWorkout(totalSeconds: Int(elapsedSeconds.rounded()))
        #endif
        stop()
        // AUDIT-2/3 — CLOSE (clear + latch) instead of saving: a finished session must
        // never be re-offered as "recuperar entreno en curso", and the latch stops a
        // late autosave Task from re-creating the snapshot after this.
        Task { await WorkoutStateStore.shared.close() }
    }

    /// AUDIT-3 — abandon (clean exit, nothing recorded): stop the engine, then close
    /// persistence. Ordered through the store's latch so a late autosave can never
    /// resurrect the discarded session.
    func discardAndClose() {
        stop()
        Task { await WorkoutStateStore.shared.close() }
    }

    /// Open the post-effort HRR window (tests guiados). Called by the container
    /// right after a LIVE finish when the test's contract asks for an `hrr`
    /// result; a no-op otherwise. Snapshots the effort tail (hr_end) and starts
    /// accepting recovery samples through `injectLiveHR` for the next 90 s.
    func beginRecoveryWindow(now: Date = Date()) {
        guard isFinished, hrRecovery == nil else { return }
        let anchor = finishedAt ?? now
        let tail = recentEffortHR.map {
            (secondsBeforeFinish: anchor.timeIntervalSince($0.date), bpm: $0.bpm)
        }
        hrRecovery = HRRecoveryCapture(effortTail: tail)
    }

    // MARK: - Segment entry / EMOM lifecycle

    // MARK: Block-transition gate

    /// Decide, after a move that changed `currentSegmentIndex`, whether we crossed
    /// a BLOCK boundary (→ park on the new block's preview) or merely moved within
    /// the same block (→ enter it running, keeping intra-block auto-advance). The
    /// block a segment belongs to is its `blockGroupingKey`; comparing origin vs
    /// destination is the single boundary test for forward, back AND jump moves.
    private func enterOrArm(from origin: Int) {
        if blockKey(at: origin) != blockKey(at: currentSegmentIndex) {
            armBlock()
        } else {
            onEnterSegment()
        }
    }

    private func blockKey(at index: Int) -> String? {
        guard index >= 0, index < plan.segments.count else { return nil }
        return plan.segments[index].blockGroupingKey
    }

    /// Park on the current block's PREVIEW: tear down any running EMOM so the
    /// preview never shows stale interval state, prime the strength load, and clear
    /// a stale pause (the gate is its own hold). The clock stays frozen until
    /// `beginBlock`. Does NOT touch a reopened lap — a back-step into an earlier
    /// block keeps its restored progress, ready to resume on Empezar.
    private func armBlock() {
        clearEMOMState()
        clearConditioning()
        clearRunStructure()
        // A new block resets the block-scoped Rx/Scaled choice; priming re-defaults
        // it to "rx" for a metcon block (nil otherwise).
        rxScaled = nil
        scaledNote = nil
        primeManualLoadIfNeeded()
        primeRepsIfNeeded()
        primeSetsIfNeeded()
        primeRxScaledIfNeeded()
        isPaused = false
        isAwaitingBlockStart = true
    }

    /// "Empezar" — leave the preview and START the current block. Resets the tick
    /// baseline (no elapsed jump), then runs the real segment entry: an EMOM kicks
    /// its 3-2-1 count-in + audio AFTER this tap (never as a between-blocks
    /// transition); every other format just starts its clock.
    func beginBlock() {
        guard isAwaitingBlockStart, !isFinished else { return }
        isAwaitingBlockStart = false
        isPaused = false
        lastTick = Date()
        Haptics.medium()
        onEnterSegment()
    }

    /// "Terminar bloque" — end the CURRENT block before it's complete (e.g. an
    /// EMOM 15 abandoned at round 12 because the athlete is spent). The in-flight
    /// segment is recorded HONESTLY: `closeCurrentSegmentLap` logs only the real
    /// elapsed time + work actually done — never the full prescription — and any
    /// remaining segments of this block are SKIPPED (not performed → no lap), so
    /// the block reads as partial in the execution, not 100% complete. Then it
    /// parks on the next block's preview, or finishes the session if this was the
    /// last block. Applies to every format; EMOM is the live case today.
    func endBlockEarly() {
        guard canEndBlockEarly, let region = currentBlockRegion else { return }
        Haptics.heavy()   // a firm, intentional cue — NOT the success chord
        // An in-flight conditioning block records its partial score (rounds/time so
        // far) before the engine is torn down.
        captureConditioningScore()
        clearEMOMState()
        clearConditioning()
        clearRunStructure()
        // A structural warmup/cooldown closes as ONE completion, never a partial
        // per-exercise lap.
        if currentBlockIsStructural {
            appendStructuralLap(for: region, durationSeconds: max(0, lapElapsedSeconds))
            discardCurrentLiveState()
        } else {
            closeCurrentSegmentLap()
        }
        let next = region.lastIndex + 1
        if next < plan.segments.count {
            currentSegmentIndex = next
            armBlock()
        } else {
            // Ending the LAST block early ends the session — and it's a partial:
            // the athlete cut the protocol short, so it's never marked 'completed'.
            finish(completeness: .partial)
        }
    }

    // Called whenever the current segment changes. Primes the manual load for
    // strength work and (re)starts the EMOM timer + audio when the new segment is
    // an EMOM; tears EMOM state down otherwise.
    private func onEnterSegment() {
        if reopenedLap?.segmentId != currentSegment?.id { reopenedLap = nil }
        primeManualLoadIfNeeded()
        primeRepsIfNeeded()
        primeSetsIfNeeded()
        primeRxScaledIfNeeded()
        // A structured run takes precedence over the rotating/steady conditioning
        // engine even though its folded scheme (.intervals / .steady) reads as a
        // conditioning timer — the leg cursor, not the rotating machine, drives it.
        if currentSegment?.hasRunStructure == true {
            clearEMOMState()
            clearConditioning()
            startRunStructure()
        } else if currentSegment?.isEMOM == true {
            clearConditioning()
            clearRunStructure()
            startEMOM()
        } else if currentSegment?.isConditioningTimer == true {
            clearEMOMState()
            clearRunStructure()
            startConditioning()
        } else {
            clearEMOMState()
            clearConditioning()
            clearRunStructure()
        }
    }

    private func startEMOM() {
        guard let plan = currentSegment?.emomPlan else { clearEMOMState(); return }
        emomSegmentIndex = currentSegmentIndex
        emomIntervalIndex = 0
        emomCompletedIntervals = 0
        emomPhase = .work
        emomPhaseRemaining = Double(plan.workSeconds)
        emomCountInRemaining = Self.countInSeconds
        WorkoutAudio.shared.activate()
        WorkoutAudio.shared.playTick()   // the opening "3" of the 3-2-1 count-in
    }

    private func clearEMOMState() {
        if emomSegmentIndex != nil { WorkoutAudio.shared.deactivate() }
        emomSegmentIndex = nil
        emomCountInRemaining = 0
        emomIntervalIndex = 0
        emomPhase = .work
        emomPhaseRemaining = 0
        emomCompletedIntervals = 0
    }

    private func skipCountIn() {
        guard let plan = currentSegment?.emomPlan else { return }
        emomCountInRemaining = 0
        emomPhase = .work
        emomPhaseRemaining = Double(plan.workSeconds)
        WorkoutAudio.shared.playGo()
        Haptics.cueGo()
    }

    // Advance to the next EMOM interval, or close the block on the last one. Reached
    // both by the timer rolling over and by the athlete tapping through — the result
    // is identical either way, so it takes no "was this automatic" flag.
    private func advanceEMOMInterval() {
        guard let plan = currentSegment?.emomPlan else { return }
        emomCompletedIntervals = max(emomCompletedIntervals, emomIntervalIndex + 1)
        let next = emomIntervalIndex + 1
        if next >= plan.intervalCount {
            WorkoutAudio.shared.playFinish()
            Haptics.cueFinish()
            closeEMOMAndAdvance()
            return
        }
        let changed = plan.interval(next)?.movement != plan.interval(emomIntervalIndex)?.movement
        emomIntervalIndex = next
        emomPhase = .work
        emomPhaseRemaining = Double(plan.workSeconds)
        if changed {
            WorkoutAudio.shared.playMovementChange()
            Haptics.heavy()
        } else {
            WorkoutAudio.shared.playIntervalStart()
            Haptics.cueGo()
        }
    }

    // Capture the EMOM's completion (X of Y intervals) BEFORE the engine is torn
    // down — mirrors captureConditioningScore. `emomCompletedIntervals` is zeroed by
    // clearEMOMState(), so without this the lap closed with the rounds LOST (#break-1).
    // Only fires for the ACTIVE EMOM segment, so a non-EMOM close never captures it.
    private func captureEMOMScore() {
        guard emomSegmentIndex == currentSegmentIndex, let plan = currentSegment?.emomPlan else { return }
        capturedEmomCompleted = emomCompletedIntervals
        capturedEmomPrescribed = plan.intervalCount
    }

    // Close the EMOM segment's lap (reusing the standard segment-close path) and
    // advance to the next segment, or finish the session. Crossing into the next
    // block parks on its preview (the gate) instead of auto-starting it.
    private func closeEMOMAndAdvance() {
        let wasLast = isLastSegment
        let origin = currentSegmentIndex
        captureEMOMScore()   // BEFORE clearEMOMState zeroes the counters (#break-1)
        clearEMOMState()
        closeCurrentSegmentLap()
        if wasLast {
            finishPrescribedWork()
        } else {
            currentSegmentIndex += 1
            enterOrArm(from: origin)
        }
    }

    // MARK: - Conditioning format engine (non-EMOM live timers)
    //
    // Drives For Time / AMRAP / Tabata / Intervals / Death By / Steady / Chipper /
    // Ladder / Rounds / HYROX sim. Self-contained and parallel to the EMOM engine
    // (which it never touches): a 3-2-1 count-in, then a FIXED count-up/down, a
    // ROTATING work/rest phase clock, or a CONTINUOUS countdown — each off the same
    // 0.25s tick, reusing WorkoutAudio for the cues.

    private func startConditioning() {
        guard let seg = currentSegment, seg.isConditioningTimer else { clearConditioning(); return }
        condSegmentIndex = currentSegmentIndex
        condStartElapsed = lapElapsedSeconds          // provisional; reset at GO
        condCountInRemaining = Self.countInSeconds
        fixedRoundsDone = 0
        fixedRoundSplits = []
        rotRoundIndex = 0
        rotRoundsCompleted = 0
        rotPhase = .work
        rotPhaseRemaining = 0
        deathByFailed = false
        repsCurrentSegment = 0                          // AMRAP partial-round reps
        rotRepsByRound = Array(repeating: nil, count: max(1, seg.formatRounds ?? 1))
        WorkoutAudio.shared.activate()
        WorkoutAudio.shared.playTick()                  // opening "3" of the count-in
    }

    private func clearConditioning() {
        if condSegmentIndex != nil { WorkoutAudio.shared.deactivate() }
        condSegmentIndex = nil
        condCountInRemaining = 0
        condStartElapsed = 0
        fixedRoundsDone = 0
        fixedRoundSplits = []
        rotRoundIndex = 0
        rotRoundsCompleted = 0
        rotPhaseRemaining = 0
        rotPhase = .work
        rotRepsByRound = []
        deathByFailed = false
    }

    /// The number of strike-able list items in a FIXED checklist: the movements for
    /// a Chipper (one pass), else the round count (For Time / Ladder / Rounds).
    var fixedListTotal: Int {
        guard let seg = currentSegment else { return 1 }
        switch seg.formatScheme {
        case .chipper:
            return max(1, seg.components.count)
        case .forTime, .ladder, .rounds, .hyroxSim:
            return max(1, seg.formatRounds ?? seg.components.count)
        default:
            return max(1, seg.formatRounds ?? 1)
        }
    }

    // Seconds in the WORK phase of a rotating format (Tabata / Intervals work, a
    // Death By minute). nil for a distance-based interval bout → no auto-roll, the
    // athlete (or a GPS auto-lap) ends it via "Serie hecha".
    private func workPhaseSeconds(_ seg: WorkoutSegment) -> Int? {
        switch seg.formatScheme {
        case .deathBy:            return seg.formatWorkSeconds ?? 60
        case .tabata, .intervals: return seg.formatWorkSeconds
        default:                  return nil
        }
    }

    private func startRotatingFirstPhase(_ seg: WorkoutSegment) {
        guard seg.formatScheme?.presentation == .rotating else { return }
        rotPhase = .work
        rotPhaseRemaining = Double(workPhaseSeconds(seg) ?? 0)
    }

    private func skipCondCountIn() {
        guard let seg = currentSegment else { return }
        condCountInRemaining = 0
        condStartElapsed = lapElapsedSeconds
        startRotatingFirstPhase(seg)
        WorkoutAudio.shared.playGo()
        Haptics.cueGo()
    }

    private func tickConditioning(dt: Double) {
        guard let seg = currentSegment, let scheme = seg.formatScheme else { return }

        // Count-in: 3-2-1 with a tick on each whole-second transition, "go" at 0.
        if condCountInRemaining > 0 {
            let before = condCountInRemaining
            condCountInRemaining = max(0, before - dt)
            if before.rounded(.up) != condCountInRemaining.rounded(.up) {
                if condCountInRemaining <= 0 {
                    condStartElapsed = lapElapsedSeconds      // GO — the format clock starts now
                    startRotatingFirstPhase(seg)
                    WorkoutAudio.shared.playGo()
                    Haptics.cueGo()
                } else {
                    WorkoutAudio.shared.playTick()
                    Haptics.cueTick()
                }
            }
            return
        }

        switch scheme.presentation {
        case .rotating:   tickRotating(dt: dt, seg: seg, scheme: scheme)
        case .fixed:      tickFixed(dt: dt, seg: seg)
        case .continuous: tickDeadline(dt: dt, seg: seg)
        case .setTable, .list: break
        }
    }

    // FIXED — AMRAP counts DOWN a fixed window and closes at 0:00; a capped For
    // Time counts UP and closes when the cap is hit (the capped finish). An open
    // For Time has no deadline → it just counts up until "Hecho".
    private func tickFixed(dt: Double, seg: WorkoutSegment) {
        // A CLOCK-measured station inside the route ("2 min de bici") ends on its own
        // seconds — the one station transition that needs no machine, because the
        // thing that measures it is the clock this tick is already running. Checked
        // before the block deadline so a station never outlives the cap.
        advanceStationIfClockGoalMet()
        tickDeadline(dt: dt, seg: seg)
    }

    // Shared deadline tick for AMRAP / capped For-Time / Steady: tick the final 3s,
    // bocina + close at zero. No-op when the format has no cap/window (open clock).
    private func tickDeadline(dt: Double, seg: WorkoutSegment) {
        guard let total = seg.formatTotalSeconds else { return }
        let remaining = Double(total) - condElapsed
        let before = remaining + dt
        for boundary in [3.0, 2.0, 1.0] where before > boundary && remaining <= boundary {
            WorkoutAudio.shared.playTick()
            Haptics.cueTick()
        }
        if remaining <= 0 {
            WorkoutAudio.shared.playFinish()
            Haptics.cueFinish()
            closeConditioningAndAdvance()
        }
    }

    // ROTATING — count DOWN the current phase, tick the last 3s, roll at zero.
    private func tickRotating(dt: Double, seg: WorkoutSegment, scheme: PrescriptionScheme) {
        // A distance-based interval bout has no fixed duration → it waits for
        // "Serie hecha" / a GPS auto-lap; nothing to tick down.
        guard rotPhaseRemaining > 0 else { return }
        let before = rotPhaseRemaining
        let after = before - dt
        for boundary in [3.0, 2.0, 1.0] where before > boundary && after <= boundary {
            WorkoutAudio.shared.playTick()
            Haptics.cueTick()
        }
        if after <= 0 {
            rollRotatingPhase(seg: seg, scheme: scheme)
        } else {
            rotPhaseRemaining = after
        }
    }

    private func rollRotatingPhase(seg: WorkoutSegment, scheme: PrescriptionScheme) {
        switch scheme {
        case .deathBy:
            advanceDeathByMinute()          // a completed minute = an implicit "logré"
        case .tabata, .intervals:
            if rotPhase == .work, let rest = seg.formatRestSeconds {
                rotPhase = .rest
                rotPhaseRemaining = Double(rest)
                // "Para" — NOT the movement-change tone this used to borrow, which
                // is the cue for "next round, different movement". Under effort the
                // two must not sound alike.
                WorkoutAudio.shared.playWorkEnd()
                Haptics.cueStop()
            } else {
                advanceRotatingRound(seg: seg)
            }
        default:
            break
        }
    }

    private func advanceRotatingRound(seg: WorkoutSegment) {
        let total = max(1, seg.formatRounds ?? 1)
        let next = rotRoundIndex + 1
        // Getting here means the round the athlete was in just ended — count it,
        // including the last one (which closes the block instead of advancing).
        rotRoundsCompleted = min(next, total)
        if next >= total {
            WorkoutAudio.shared.playFinish()
            Haptics.cueFinish()
            closeConditioningAndAdvance()
            return
        }
        rotRoundIndex = next
        rotPhase = .work
        rotPhaseRemaining = Double(workPhaseSeconds(seg) ?? 0)
        if rotRepsByRound.count < total {
            rotRepsByRound += Array(repeating: nil, count: total - rotRepsByRound.count)
        }
        WorkoutAudio.shared.playIntervalStart()   // work tone
        Haptics.cueGo()
    }

    private func advanceDeathByMinute() {
        guard let seg = currentSegment else { return }
        rotRoundIndex += 1                // survived another minute; the target rises
        rotPhase = .work
        rotPhaseRemaining = Double(seg.formatWorkSeconds ?? 60)
        WorkoutAudio.shared.playIntervalStart()
        Haptics.cueGo()
    }

    // The bottom primary button, routed by scheme.
    private func conditioningPrimary(_ seg: WorkoutSegment) {
        if condCountInRemaining > 0 { skipCondCountIn(); return }
        switch seg.formatScheme {
        case .amrap:                                          bumpAmrapRound()
        case .tabata:                                         tabataAddRep()
        case .intervals:                                      intervalsBoutDone()
        case .deathBy:                                        deathByLogged()
        // A ROUTE closes one STATION at a time: the big button and the active line
        // do the same thing, and the last station closes the block on its own. Only
        // a format with nothing smaller than itself to close ends the block outright
        // — otherwise the biggest button on the screen skipped the rest of the WOD.
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim:
            if seg.fixedListIsStations { markRoundDone() } else { closeConditioningAndAdvance() }
        case .steady:                                         closeConditioningAndAdvance()
        default:                                              lap()
        }
    }

    // MARK: Conditioning actions (called by the format HUDs / the view)

    /// AMRAP "+ Ronda" — one tap per completed round; the partial-round rep tally
    /// resets for the new round. The block auto-closes when the window hits 0:00.
    func bumpAmrapRound() {
        guard isConditioningActive, condCountInRemaining <= 0, !isPaused, !isFinished else { return }
        fixedRoundsDone += 1
        repsCurrentSegment = 0
        WorkoutAudio.shared.playIntervalStart()
        Haptics.cueGo()
    }

    /// AMRAP partial-round rep tally (+/−1).
    func amrapAddRep(_ delta: Int) {
        guard isConditioningActive, !isPaused, !isFinished else { return }
        repsCurrentSegment = max(0, repsCurrentSegment + delta)
        Haptics.light()
    }

    /// For Time / Chipper / Ladder list strike — records the split, advances the
    /// active line; the LAST item closes the block (the final time).
    ///
    /// `auto` = the STATION closed itself because its goal was met (the monitor hit
    /// the metres, the box ran out) rather than the athlete tapping. Same close, same
    /// record — only the cue differs, because a transition he did not ask for has to
    /// announce itself: he is not looking at the phone, he is gasping at a rower.
    func markRoundDone(auto: Bool = false) {
        guard isConditioningActive, condCountInRemaining <= 0, !isPaused, !isFinished else { return }
        let total = fixedListTotal
        guard fixedRoundsDone < total else { return }
        // Read the closing window BEFORE the cursor moves — one line later these
        // accessors already answer for the station he is walking into.
        // `tramoRecordedSeconds`, never the displayed one: a station closed while the
        // clock is still armed did happen, it just wasn't measured by a monitor, and
        // saving its 0:00 turns "unmeasured" into "instant".
        fixedRoundSplits.append(FixedStationSplit(
            elapsed: condElapsed,
            seconds: tramoRecordedSeconds,
            meters: tramoErgDistanceMeters,
            calories: tramoErgCalories
        ))
        fixedRoundsDone += 1
        if auto { Haptics.cueGo() } else { Haptics.medium() }
        if fixedRoundsDone >= total {
            WorkoutAudio.shared.playFinish()
            closeConditioningAndAdvance()
        } else {
            WorkoutAudio.shared.playIntervalStart()
            // Open the new window HERE rather than on the next tick, so the station's
            // clock and its device counters start at the strike and not up to a
            // quarter of a second into it. Idempotent — the tick's own call is a no-op
            // once the key is stable.
            syncTramoIfNeeded()
        }
    }

    /// Undo the last For Time / Chipper / Ladder strike (a mis-tap), restoring the
    /// previous split.
    func unmarkLastRound() {
        guard isConditioningActive, condCountInRemaining <= 0, !isPaused, !isFinished else { return }
        guard fixedRoundsDone > 0 else { return }
        fixedRoundsDone -= 1
        if !fixedRoundSplits.isEmpty { fixedRoundSplits.removeLast() }
        Haptics.light()
    }

    /// Tabata per-round rep tally (the classic min-reps score). The bottom "+ Reps"
    /// adds one; the in-HUD stepper passes ±1.
    ///
    /// A round starts UNDECLARED (nil), not at 0: counting reps is optional, and a
    /// round nobody counted is unknown, not a zero. The first tap declares it — from
    /// there 0 is a legal, real value (you failed the round), reachable with +1 then
    /// −1. That distinction is what keeps `capturedScoreReps` from inventing a score.
    func tabataAddRep(_ delta: Int = 1) {
        guard isConditioningActive, condCountInRemaining <= 0, !isPaused, !isFinished else { return }
        guard rotRepsByRound.indices.contains(rotRoundIndex) else { return }
        rotRepsByRound[rotRoundIndex] = max(0, (rotRepsByRound[rotRoundIndex] ?? 0) + delta)
        Haptics.light()
    }

    /// Intervals "Serie hecha" — end the current work bout (→ rest, or the next
    /// round when there's no rest), e.g. a distance bout finished by feel/GPS.
    func intervalsBoutDone() {
        guard isConditioningActive, condCountInRemaining <= 0, !isPaused, !isFinished,
              let seg = currentSegment else { return }
        Haptics.medium()
        if rotPhase == .work {
            rollRotatingPhase(seg: seg, scheme: .intervals)
        } else {
            advanceRotatingRound(seg: seg)
        }
    }

    /// Death By "Lo logré" — completed this minute's target; advance to the next
    /// (the target rises). Auto-roll on the minute does the same implicitly.
    func deathByLogged() {
        guard isConditioningActive, condCountInRemaining <= 0, !isPaused, !isFinished else { return }
        advanceDeathByMinute()
    }

    /// Death By "Fallé" — missed this minute's target; the block ends. Score =
    /// rounds survived (the last full minute completed).
    func deathByFail() {
        guard isConditioningActive, !isFinished else { return }
        deathByFailed = true
        // The block ends, but missing the minute is not a win — the STOP cue, never
        // the finish one.
        Haptics.cueStop()
        WorkoutAudio.shared.playFinish()
        closeConditioningAndAdvance()
    }

    // Capture the PRINCIPAL conditioning block's headline score before the engine
    // is torn down. Idempotent: a no-op once the engine has cleared (so the
    // close-then-finish path can't re-capture zeros over the real result).
    private func captureConditioningScore() {
        guard condSegmentIndex == currentSegmentIndex,
              let seg = currentSegment, let scheme = seg.formatScheme,
              scheme == plan.format else { return }
        switch scheme {
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim:
            let elapsed = Int(condElapsed.rounded())
            capturedScoreTimeSeconds = seg.formatTotalSeconds.map { min(elapsed, $0) } ?? elapsed
        case .amrap:
            capturedScoreRounds = fixedRoundsDone
            capturedScoreReps = repsCurrentSegment
        case .deathBy:
            capturedScoreRounds = rotRoundIndex          // minutes survived
        case .tabata:
            // Rounds DONE, never the rounds prescribed: abandoning at round 3 of 8
            // used to be sealed as 8. The min-reps score exists only when every
            // round that ran was counted — a minimum over a subset is a lower bound,
            // not the score, and counting is optional, so most Tabatas have none.
            capturedScoreRounds = rotRoundsCompleted > 0 ? rotRoundsCompleted : nil
            let counted = rotRepsByRound.prefix(rotRoundsCompleted)
            capturedScoreReps = (!counted.isEmpty && counted.allSatisfy { $0 != nil })
                ? counted.compactMap { $0 }.min()
                : nil
        default:
            break
        }
    }

    // Close the conditioning segment's lap (reusing the standard close path) and
    // advance to the next segment, or finish the session — mirrors
    // `closeEMOMAndAdvance`. Crossing into the next block parks on its preview.
    private func closeConditioningAndAdvance() {
        let wasLast = isLastSegment
        let origin = currentSegmentIndex
        captureConditioningScore()
        clearConditioning()
        closeCurrentSegmentLap()
        if wasLast {
            finishPrescribedWork()
        } else {
            currentSegmentIndex += 1
            enterOrArm(from: origin)
        }
    }

    // MARK: - Structured-run engine (non-EMOM, non-conditioning)
    //
    // Drives a folded run block that carries a `structure` (#61): a FLAT leg cursor
    // over the expanded leg list, one work/recovery bout at a time. Self-contained
    // and parallel to the EMOM / conditioning engines (which it never touches) — a
    // 3-2-1 count-in, then, per leg, a TIME countdown (auto-roll) or a DISTANCE leg
    // that waits for the belt / a manual "Tramo hecho". Reuses `closeCurrentSegmentLap`
    // for the ONE aggregate lap, exactly like the other engines.

    private func startRunStructure() {
        guard let legs = currentSegment?.runStructureLegs, !legs.isEmpty else { clearRunStructure(); return }
        runStructureSegmentIndex = currentSegmentIndex
        runLegIndex = 0
        runCountInRemaining = Self.countInSeconds
        primeRunLeg()
        WorkoutAudio.shared.activate()
        WorkoutAudio.shared.playTick()   // opening "3" of the 3-2-1 count-in
    }

    private func clearRunStructure() {
        if runStructureSegmentIndex != nil { WorkoutAudio.shared.deactivate() }
        runStructureSegmentIndex = nil
        runCountInRemaining = 0
        runLegIndex = 0
        runLegRemaining = 0
        runLegStartElapsed = 0
    }

    /// Snapshot the per-WORK-leg execution baselines at a leg's GO (#break-2). Each
    /// leg's measured distance / HR / incline / zone is the DIFF between the values at
    /// close and these. Called wherever a leg's clock starts (prime + both GO paths).
    private func markRunLegStart() {
        runLegStartElapsed = lapElapsedSeconds
        runLegBeltStart = lapBeltDistanceMeters
        runLegGpsStart = lapGpsDistanceMeters ?? 0
        runLegHRStartCount = lapHRSamples.count
        runLegZoneStart = lapZoneAccumSec
        runLegInclineSumStart = lapInclineSum
        runLegInclineCountStart = lapInclineCount
    }

    /// Set the current leg's GO baseline + its countdown (a TIME leg counts down; a
    /// DISTANCE leg has no clock countdown — the belt / manual close ends it).
    private func primeRunLeg() {
        markRunLegStart()
        runLegRemaining = currentRunLeg?.durationSeconds.map(Double.init) ?? 0
    }

    private func skipRunCountIn() {
        runCountInRemaining = 0
        markRunLegStart()
        WorkoutAudio.shared.playGo()
        Haptics.cueGo()
        #if os(iOS)
        AudioCoach.shared.announceRunLeg(in: self)   // voice the first tramo (#63, iOS-only)
        #endif
    }

    // The bottom primary button for a structured run ("Tramo hecho" / "Saltar
    // descanso"): skip the count-in, else advance the current leg.
    private func runStructurePrimary() {
        if runCountInRemaining > 0 { skipRunCountIn(); return }
        advanceRunLeg(auto: false)
    }

    // Advance to the next leg, or close the block on the last one. `auto` = the leg's
    // own TIME countdown rolled over (or the belt auto-closed via primaryAdvance);
    // otherwise the athlete tapped through.
    private func advanceRunLeg(auto: Bool) {
        guard let legs = currentSegment?.runStructureLegs, !legs.isEmpty else { return }
        // #break-2: the just-finished leg's OWN measured split (covered distance /
        // duration / pace / HR) is available HERE at the boundary. Record a WORK leg as
        // its own segment execution so each interval's pace reaches the coach instead
        // of blending into one aggregate lap. Recovery legs advance the cursor only.
        // Se graba TODO tramo que termina, trabajo Y recuperación. Grabar solo las
        // series es guardar los números y tirar las unidades: un 5×1000 quedaba con
        // cinco fuertes y NADA contra lo que compararlos, y el contraste es lo que
        // define una sesión de series. Sin la recuperación no se puede saber si el
        // atleta trotó o anduvo, si se la recortó, ni cuánto le bajó el pulso entre
        // series — y el volumen total de carrera salía corto por todo lo trotado.
        // El rol viaja en la fila (`leg_role`), así que la analítica distingue una
        // cosa de la otra sin tener que adivinarlo por el ritmo.
        let finished = legs[runLegIndex]
        recordRunLegLap(finished, at: runLegIndex)
        let next = runLegIndex + 1
        if next >= legs.count {
            WorkoutAudio.shared.playFinish()
            Haptics.cueFinish()
            closeRunStructureAndAdvance()
            return
        }
        let kindChanged = legs[next].kind != legs[runLegIndex].kind
        runLegIndex = next
        primeRunLeg()
        if kindChanged {
            WorkoutAudio.shared.playMovementChange()   // work↔recovery transition tone
            Haptics.cueStop()
        } else {
            WorkoutAudio.shared.playIntervalStart()
            Haptics.cueGo()
        }
        #if os(iOS)
        AudioCoach.shared.announceRunLeg(in: self)   // voice the new tramo / recovery (#63, iOS-only)
        #endif
    }

    // Close the structured run and advance. The WORK legs were each recorded as their
    // own segment execution during advanceRunLeg; closeCurrentSegmentLap detects the
    // structure and only resets the per-segment accumulators (no aggregate lap).
    private func closeRunStructureAndAdvance() {
        let wasLast = isLastSegment
        let origin = currentSegmentIndex
        clearRunStructure()
        closeCurrentSegmentLap()
        if wasLast {
            finishPrescribedWork()
        } else {
            currentSegmentIndex += 1
            enterOrArm(from: origin)
        }
    }

    // #break-2: graba UNA segment execution por tramo terminado — serie O recuperación.
    // Todos los tramos comparten el `templateSegmentId` del bloque de carrera; lo que
    // los distingue en el servidor es `leg_index` (el índice en la lista PLANA de
    // tramos de la prescripción, el mismo espacio que `flattenSegments`), `leg_role`
    // (work/recovery) y `leg_phase` (warmup/main/cooldown). Con esos tres, «tramo 3
    // hecho» casa con «tramo 3 prescrito» sin zipear por orden de llegada.
    // Captura la distancia / duración / ritmo / FC / pendiente / zona PROPIAS del
    // tramo desde las bases tomadas en su GO — así una pirámide 1200/1000/800 aterriza
    // como tres ritmos honestos y no como una media.
    private func recordRunLegLap(_ leg: RunLeg, at legIndex: Int) {
        guard let seg = currentSegment else { return }
        let now = Date()
        let dur = runLegElapsed   // lapElapsedSeconds − runLegStartElapsed (this leg only)
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
        let source = beltDelta > 0 ? "treadmill" : (gpsDelta > 0 ? "gps" : (avgHR != nil ? "healthkit" : "manual"))
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
            runCadenceSpm: nil
        )
        laps.append(lap)
    }

    // Drives the structured-run count-in + the current TIME leg's countdown off the
    // 0.25s tick. A DISTANCE leg (runLegRemaining == 0) never auto-rolls here — it
    // waits for the belt (TreadmillHUDModel → primaryAdvance) or a manual "Tramo
    // hecho". Parallel to tickEMOM / tickConditioning.
    private func tickRunStructure(dt: Double) {
        // Count-in: 3-2-1 with a tick on each whole-second transition, "go" at 0.
        if runCountInRemaining > 0 {
            let before = runCountInRemaining
            runCountInRemaining = Swift.max(0, before - dt)
            if before.rounded(.up) != runCountInRemaining.rounded(.up) {
                if runCountInRemaining <= 0 {
                    markRunLegStart()   // GO — the leg clock + per-leg baselines start now
                    WorkoutAudio.shared.playGo()
                    Haptics.cueGo()
                    #if os(iOS)
                    AudioCoach.shared.announceRunLeg(in: self)   // voice the first tramo (#63, iOS-only)
                    #endif
                } else {
                    WorkoutAudio.shared.playTick()
                    Haptics.cueTick()
                }
            }
            return
        }
        // TIME leg: count down, tick the final 3s, auto-roll at zero. A DISTANCE leg
        // has no countdown → nothing to tick.
        guard runLegRemaining > 0 else { return }
        let before = runLegRemaining
        let after = before - dt
        for boundary in [3.0, 2.0, 1.0] where before > boundary && after <= boundary {
            WorkoutAudio.shared.playTick()
            Haptics.cueTick()
        }
        #if os(iOS)
        AudioCoach.shared.runLegTimeRemaining(after, in: self)   // once-per-leg "10 segundos" (#63, iOS-only)
        #endif
        if after <= 0 {
            advanceRunLeg(auto: true)
        } else {
            runLegRemaining = after
        }
    }

    // Reset the in-progress live state WITHOUT recording a lap — used when the
    // current segment is abandoned to step / jump backward.
    private func discardCurrentLiveState() {
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
    private func reopenCurrentSegment() {
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
    private func closeCurrentSegmentLap() {
        guard let seg = currentSegment else { return }
        // #break-2: a structured/interval run records ONE lap per WORK leg during
        // advanceRunLeg (each with its own pace), so there is no blended aggregate to
        // build here — just reset the per-segment accumulators the per-leg path used.
        if seg.hasRunStructure {
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
        let usedGPS = seg.kind == .running && lapHadGPS
        let beltDistance: Double? = (seg.kind == .running && lapBeltDistanceMeters > 0) ? lapBeltDistanceMeters : nil
        let runDistance: Double? = usedGPS ? lapGpsDistanceMeters : manualRunDistanceMeters
        let distance = ergDistance ?? beltDistance ?? runDistance

        // Run pace COVERED — derived from real covered distance over the segment
        // duration (km/min). Only when we actually measured a distance; otherwise
        // nil (no fabricated pace from the prescription). The belt's covered meters
        // feed it exactly like GPS/manual do.
        let avgPaceKm: Double? = seg.kind == .running
            ? Self.paceSecPerKm(meters: beltDistance ?? runDistance, seconds: lapElapsedSeconds)
            : nil

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
            setRecordsOut = [SetRecord(
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
            )]
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
            ergSplits: ergSplits ?? reopen?.ergSplits
        )
        laps.append(lap)
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

    /// Pre-fills the manual load field for the current strength/sled segment from
    /// the prescription. Called when a segment becomes current so the athlete
    /// only has to adjust, not type from scratch. Idempotent: won't clobber a
    /// value the athlete already edited for this same segment.
    ///
    /// The primed value is remembered in `primedLoadKg` so `loadConfirmed` can
    /// tell "the coach wrote 100" from "the athlete says 100" — priming feeds the
    /// HUD, it never feeds the record. Mirrors `primeRepsIfNeeded`.
    func primeManualLoadIfNeeded() {
        guard manualLoadKg == nil,
              let seg = currentSegment,
              seg.kind == .strength || seg.kind == .sled,
              let kg = seg.loadKg else { return }
        manualLoadKg = kg
        primedLoadKg = kg
    }

    /// Pre-fills the current segment's reps from the prescription so an untouched
    /// advance records the PRESCRIBED value (confirmed=false), never a fabricated
    /// 0. Idempotent per segment (the `repsPrimedSegmentIndex` sentinel), so it
    /// never clobbers an athlete edit or a reopened lap. Open-score (AMRAP) and
    /// target-less reps are NOT primed — there reps count up from a legal 0.
    /// Mirrors `primeManualLoadIfNeeded`.
    func primeRepsIfNeeded() {
        guard repsPrimedSegmentIndex != currentSegmentIndex, let seg = currentSegment else { return }
        repsPrimedSegmentIndex = currentSegmentIndex
        repsConfirmed = false
        repsSkipped = false
        guard seg.repsArePrimable, let prescribed = seg.prescribedRepsForLog else { return }
        repsCurrentSegment = prescribed
    }

    /// Builds the per-set strength records for a multi-set segment. Reps default to
    /// the prescribed value (confirmed=false until touched — the rep rule); the
    /// ACTUAL LOAD starts nil, because a load nobody declared is not a load that was
    /// lifted. The prescription stays visible in `loadPrescribedKg` (the HUD reads it
    /// for display), and `confirmSet` promotes it to actual on the athlete's tap.
    /// Idempotent per segment; clears the list for non-multi-set segments.
    func primeSetsIfNeeded() {
        guard setsPrimedSegmentIndex != currentSegmentIndex else { return }
        setsPrimedSegmentIndex = currentSegmentIndex
        guard let seg = currentSegment, seg.usesMultiSetStrength,
              let sets = seg.prescription?.sets else {
            setRecords = []
            return
        }
        setRecords = sets.enumerated().map { i, s in
            SetRecord(
                setIndex: i + 1,
                repsPrescribed: s.prescribedReps,
                repsActual: s.prescribedReps,          // default = did as written
                loadPrescribedKg: s.prescribedLoadKg,
                loadActualKg: nil,                     // unknown until the athlete says so
                rpe: nil,                              // collected only if entered
                rir: nil,
                status: "done",                        // assumed until touched/skipped
                confirmed: false,
                tempo: s.tempo,
                restS: s.restS
            )
        }
    }

    /// Defaults the block-scoped Rx/Scaled to "rx" for a metcon-family block (the
    /// athlete switches to "scaled" if they deviated); nil for non-metcon blocks.
    /// Only sets a default when unset, so it stays stable across the block's segments.
    func primeRxScaledIfNeeded() {
        if currentSegmentIsMetcon {
            if rxScaled == nil { rxScaled = "rx" }
        } else {
            rxScaled = nil
            scaledNote = nil
        }
    }

    // MARK: - Per-set strength logging

    /// Confirm a set "as written" — marks it confirmed, recomputes done/scaled,
    /// and fires the rest timer from its prescribed rest. One tap = did as prescribed.
    ///
    /// This tap is the DECLARATION: only here does the prescribed load become the
    /// actual one. Priming never does it (see `primeSetsIfNeeded`), so a set the
    /// athlete never touched reaches the coach with `load_actual_kg` null instead
    /// of echoing the plan back as if it had been measured.
    func confirmSet(_ index: Int) {
        guard setRecords.indices.contains(index) else { return }
        setRecords[index].confirmed = true
        if setRecords[index].loadActualKg == nil {
            setRecords[index].loadActualKg = setRecords[index].loadPrescribedKg
        }
        recomputeSetStatus(index)
        registerFirstWorkingSet()
        startRest(setRecords[index].restS)
    }

    func setSetReps(_ index: Int, _ reps: Int) {
        guard setRecords.indices.contains(index) else { return }
        setRecords[index].repsActual = max(0, reps)
        setRecords[index].confirmed = true
        recomputeSetStatus(index)
        registerFirstWorkingSet()
    }

    func setSetLoad(_ index: Int, _ kg: Double?) {
        guard setRecords.indices.contains(index) else { return }
        setRecords[index].loadActualKg = kg.map { max(0, $0) }
        setRecords[index].confirmed = true
        recomputeSetStatus(index)
        registerFirstWorkingSet()
    }

    /// Ajustar la carga EN VIVO con herencia (IMG_2385: "en la siguiente serie
    /// quiero subir de peso"): fija la carga de `index` y la HEREDAN todas las
    /// series posteriores aún no hechas ni saltadas. Las hechas conservan su peso
    /// real — el registro que ve el coach es lo que de verdad se levantó. Solo la
    /// serie editada se marca confirmada; las herederas siguen pendientes con el
    /// nuevo objetivo.
    func setSetLoadCascade(_ index: Int, _ kg: Double?) {
        setSetLoad(index, kg)
        guard let value = kg.map({ max(0, $0) }) else { return }
        for i in setRecords.indices where i > index
            && !setRecords[i].confirmed && setRecords[i].status != "skipped" {
            setRecords[i].loadActualKg = value
        }
    }

    func setSetRPE(_ index: Int, _ rpe: Double?) {
        guard setRecords.indices.contains(index) else { return }
        setRecords[index].rpe = rpe
        setRecords[index].confirmed = true
    }

    func setSetRIR(_ index: Int, _ rir: Double?) {
        guard setRecords.indices.contains(index) else { return }
        setRecords[index].rir = rir
        setRecords[index].confirmed = true
    }

    func setSetSkipped(_ index: Int, _ skipped: Bool) {
        guard setRecords.indices.contains(index) else { return }
        if skipped {
            setRecords[index].status = "skipped"
            setRecords[index].repsActual = nil
            setRecords[index].loadActualKg = nil
        } else {
            // Un-skip: restore prescribed defaults and recompute.
            setRecords[index].repsActual = setRecords[index].repsPrescribed
            setRecords[index].loadActualKg = setRecords[index].loadPrescribedKg
            recomputeSetStatus(index)
        }
        setRecords[index].confirmed = true
        // Last pending skip closes the exercise: same `lap()` as "exercise done",
        // without `confirmSet` (that copies kg) and without a picker hook.
        if skipped && !setRecords.contains(where: { !$0.confirmed && $0.status != "skipped" }) {
            lap()
        }
    }

    /// done when reps AND load match the prescription, else scaled. A skipped set
    /// stays skipped (only `setSetSkipped` clears it).
    private func recomputeSetStatus(_ index: Int) {
        guard setRecords.indices.contains(index) else { return }
        guard setRecords[index].status != "skipped" else { return }
        let s = setRecords[index]
        let repsDiff = s.repsPrescribed != nil && s.repsActual != s.repsPrescribed
        let loadDiff = s.loadPrescribedKg != nil && s.loadActualKg != nil
            && s.loadActualKg != s.loadPrescribedKg
        setRecords[index].status = (repsDiff || loadDiff) ? "scaled" : "done"
    }

    // MARK: - Rest timer (per-set strength)

    /// Start a rest countdown from a set's prescribed rest. No-op when there's no
    /// prescribed rest. Drives off the same 0.25s tick as the main clock.
    func startRest(_ seconds: Int?) {
        guard let s = seconds, s > 0 else { return }
        restTotalSeconds = Double(s)
        restRemainingSeconds = Double(s)
    }

    func dismissRest() {
        restRemainingSeconds = 0
        restTotalSeconds = 0
    }

    // MARK: - Warmup / cooldown structural completion

    /// Stable grouping key for a region (its first segment's block key) — the
    /// dedupe key for structural completion.
    private func structuralKey(_ region: WorkoutBlockRegion) -> String {
        plan.segments[region.firstIndex].blockGroupingKey
    }

    /// Append ONE structural completion lap for a warmup/cooldown block (idempotent
    /// per block). No reps/load — completion-only, excluded from analytics.
    private func appendStructuralLap(for region: WorkoutBlockRegion, durationSeconds: Double) {
        let key = structuralKey(region)
        guard !completedStructuralBlockKeys.contains(key) else { return }
        completedStructuralBlockKeys.insert(key)
        let first = plan.segments[region.firstIndex]
        let now = Date()
        laps.append(
            LapRecord(
                id: UUID(),
                segmentId: first.id,
                templateSegmentId: first.templateSegmentId,
                position: first.order,
                // Same single source as a worked lap: identical to `kind.modality`
                // for everything that is not an erg, and correct for the one case
                // that differs — a warmup or cooldown done on the ski or the bike.
                modality: first.wireModality,
                startedAt: now.addingTimeInterval(-durationSeconds),
                endedAt: now,
                durationSeconds: durationSeconds,
                avgHRBpm: nil,
                maxHRBpm: nil,
                zoneSecondsByZone: [:],
                repsCompleted: nil,
                distanceCoveredMeters: nil,
                avgPaceSecPer500m: nil,
                avgPaceSecPerKm: nil,
                avgPowerWatts: nil,
                strokeRateSpm: nil,
                calories: nil,
                weightUsedKg: nil,
                source: "manual",
                repsPrescribed: nil,
                repsStatus: "done",
                repsConfirmed: true,
                isStructural: true,
                rxScaled: nil,
                scaledNote: nil,
                sets: nil
            )
        )
    }

    /// "Calentamiento hecho" / "Vuelta a la calma hecha" — close the WHOLE
    /// structural block as ONE completion and advance past it. One tap, never
    /// per-exercise.
    func completeStructuralBlock() {
        guard !isPaused, !isFinished, !isAwaitingBlockStart,
              let region = currentBlockRegion, currentBlockIsStructural else { return }
        Haptics.success()
        appendStructuralLap(for: region, durationSeconds: max(0, lapElapsedSeconds))
        // No per-exercise laps for the block — drop any live state, jump past it.
        discardCurrentLiveState()
        let next = region.lastIndex + 1
        if next < plan.segments.count {
            let origin = currentSegmentIndex
            currentSegmentIndex = next
            enterOrArm(from: origin)
        } else {
            finishPrescribedWork()
        }
    }

    /// Backstop: when the athlete confirms their first real working set, infer that
    /// any PRECEDING warmup block was done (covers a skip/jump past it without the
    /// button). Cooldown is last, so it's never auto-inferred — only its button logs it.
    private func registerFirstWorkingSet() {
        guard !currentBlockIsStructural else { return }
        guard !firstWorkingSetConfirmed else { return }
        firstWorkingSetConfirmed = true
        for region in plan.blockRegions
        where region.phase == .warmup && region.lastIndex < currentSegmentIndex {
            appendStructuralLap(for: region, durationSeconds: 0)
        }
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
        // Gated on the TRAMO, not on the segment: a ski round inside an EMOM is erg
        // work and its numbers are real, even though the segment that wraps it reads
        // as strength/reps. That guard was why an EMOM on the erg recorded nothing.
        guard !isPaused, !isFinished, !isAwaitingBlockStart, tramoIsErg else { return }
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
        // Every reading is real HR → it updates the live value and the lap
        // aggregation regardless of who owns provenance. But the SOURCE label is a
        // latch: a lower-priority reading (e.g. a PM5 strap under an active
        // watch/strap stream) must not steal it. Only an equal-or-higher priority
        // source takes over the provenance.
        liveHRBpm = bpm
        lapHRSamples.append(bpm)
        // The tramo's own peak, so the rest screen can show a REAL drop ("162 → 138")
        // instead of a bare current value that says nothing about recovering.
        noteTramoHR(bpm)
        // HRR effort tail — keep the last ~12 s of readings so a test finish can
        // derive hr_end (mean of the final 10 s of effort). Pruned every reading.
        let now = Date()
        recentEffortHR.append((date: now, bpm: bpm))
        let cutoff = now.addingTimeInterval(-Self.effortTailKeepSeconds)
        while let first = recentEffortHR.first, first.date < cutoff {
            recentEffortHR.removeFirst()
        }
        if let current = hrSource, source.priority < current.priority,
           Date().timeIntervalSince(hrSourceLastSeenAt) < Self.hrSourceStaleSeconds {
            return   // the owner is alive — a lower-priority reading never steals the label
        }
        hrSource = source
        hrSourceLastSeenAt = Date()
    }

    /// Accumulates phone-GPS covered distance for the current RUN segment. The
    /// provider passes the incremental meters since its last callback; we sum
    /// them into the in-window total. Ignored for non-run segments and when an
    /// erg owns the distance.
    func sampleRunGPS(deltaMeters: Double) {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, currentSegment?.kind == .running, deltaMeters > 0 else { return }
        lapHadGPS = true
        lapGpsDistanceMeters = (lapGpsDistanceMeters ?? 0) + deltaMeters
    }

    /// Feeds one treadmill INCLINE reading (%) into the current run segment's average
    /// (#62). Called from the treadmill HUD's telemetry so the session stays the
    /// single owner of per-segment capture (mirrors `sampleErg` / `sampleRunGPS`). A
    /// flat belt (0%) is a real reading and counts; ignored off a run segment or
    /// while paused. Averaged into the ONE segment lap on close; nil when never fed.
    func sampleTreadmillIncline(_ inclinePct: Double) {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, currentSegment?.kind == .running else { return }
        lapInclineSum += inclinePct
        lapInclineCount += 1
    }

    /// Feeds the covered-meters INCREMENT the treadmill belt measured since the last
    /// sample into the current run segment's total (mirrors `sampleRunGPS`). The HUD
    /// computes the increment from the belt odometer / speed and the SESSION owns the
    /// running total, so it survives the live HUD cover being dismissed and re-opened
    /// (the per-tramo truth lives here, not in the ephemeral view model). Pause-aware
    /// by the same guard as the incline/GPS feeds; only positive deltas count.
    func sampleTreadmillDistance(deltaMeters: Double) {
        guard !isPaused, !isFinished, !isAwaitingBlockStart,
              currentSegment?.kind == .running, deltaMeters > 0 else { return }
        lapBeltDistanceMeters += deltaMeters
    }

    /// Live AVERAGE pace (sec/km) covered on the belt this segment — the covered belt
    /// meters over the segment's elapsed. nil until both are meaningful (never a
    /// fabricated pace). The wrist mirror's treadmill glance shows THIS honest covered
    /// average; the phone HUD hero shows the belt's instantaneous pace alongside it.
    var liveBeltPaceSecPerKm: Int? {
        Self.paceSecPerKm(meters: lapBeltDistanceMeters, seconds: lapElapsedSeconds)
            .map { Int($0.rounded()) }
    }

    /// Live covered distance for the current run segment for HUD display
    /// (GPS sum when available, else the athlete's manual entry).
    var liveRunDistanceMeters: Double? {
        currentSegment?.kind == .running ? (lapGpsDistanceMeters ?? manualRunDistanceMeters) : nil
    }

    private func tick() {
        // The block-preview gate freezes ALL clocks (elapsed, lap, EMOM count-in/
        // countdown) until the athlete taps Empezar; resetting lastTick means the
        // elapsed clock can't jump by the time spent on the preview.
        guard !isPaused, !isFinished, !isAwaitingBlockStart, !isAwaitingFinishDecision else {
            lastTick = Date()
            return
        }
        let now = Date()
        let dt = now.timeIntervalSince(lastTick)
        lastTick = now
        elapsedSeconds += dt
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

    // Drive the EMOM count-in and per-PHASE countdown. Fires the count-in ticks +
    // "go", the last-3s ticks, the end-of-work cue (interval EMOMs only), the
    // top-of-interval beep and the auto-roll to the next interval (or the block
    // close on the last one). Runs off the same 0.25s tick as the main clock.
    private func tickEMOM(dt: Double) {
        guard let plan = currentSegment?.emomPlan else { return }

        // Count-in: 3-2-1 with a tick on each whole-second transition, "go" at 0.
        if emomCountInRemaining > 0 {
            let before = emomCountInRemaining
            emomCountInRemaining = max(0, before - dt)
            if before.rounded(.up) != emomCountInRemaining.rounded(.up) {
                if emomCountInRemaining <= 0 {
                    emomPhase = .work
                    emomPhaseRemaining = Double(plan.workSeconds)
                    WorkoutAudio.shared.playGo()
                    Haptics.cueGo()
                } else {
                    WorkoutAudio.shared.playTick()
                    Haptics.cueTick()
                }
            }
            return
        }

        // Running phase: count down, tick the final 3 seconds, roll at zero. On an
        // interval EMOM those ticks now also run into the END OF THE WORK, which is
        // the whole point of the format — the athlete is warned when to STOP, not
        // only when to start.
        let before = emomPhaseRemaining
        let after = before - dt
        for boundary in [3.0, 2.0, 1.0] where before > boundary && after <= boundary {
            WorkoutAudio.shared.playTick()
            Haptics.cueTick()
        }
        if after <= 0 {
            rollEMOMPhase(plan)
        } else {
            emomPhaseRemaining = after
        }
    }

    /// A phase hit zero. An INTERVAL EMOM (explicit transition) closes the WORK
    /// first — the distinct "para" cue + a firm haptic — and only rolls to the next
    /// round when the transition is spent. A plain EMOM has no transition, so its
    /// work phase IS the cycle and it rolls straight through exactly as before.
    private func rollEMOMPhase(_ plan: EmomPlan) {
        // The LAST work window ends the block — a Rogue clock doesn't make you stand
        // through a change with nowhere to change to.
        let isLastRound = emomIntervalIndex + 1 >= plan.intervalCount
        if plan.hasTransition, emomPhase == .work, !isLastRound {
            emomPhase = .rest
            emomPhaseRemaining = Double(plan.restSeconds)
            WorkoutAudio.shared.playWorkEnd()
            Haptics.cueStop()
            return
        }
        advanceEMOMInterval()   // beep + roll (or close on the last one)
    }

    private func persistedSnapshot() -> PersistedWorkoutState {
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
            scaledNote: scaledNote
        )
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
    }

}
