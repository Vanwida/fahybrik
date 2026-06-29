import Foundation
import Observation

@Observable
final class WorkoutSession {
    let plan: WorkoutPlan
    let athleteHRMax: Int
    let startedAt: Date

    var currentSegmentIndex: Int = 0
    var elapsedSeconds: Double = 0
    var lapElapsedSeconds: Double = 0
    var liveHRBpm: Int? = nil
    var laps: [LapRecord] = []
    var repsCurrentSegment: Int = 0
    var isPaused: Bool = false
    var isFinished: Bool = false

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

    // MARK: - EMOM interval state
    // Live ONLY while the current segment is an EMOM. `emomSegmentIndex` records
    // which segment owns this state so entering / re-entering re-initialises it
    // cleanly and leaving it tears the timer + audio down.
    var emomCountInRemaining: Double = 0    // 3-2-1 pre-roll; 0 once running
    var emomIntervalIndex: Int = 0          // 0-based interval within the EMOM
    var emomIntervalRemaining: Double = 0   // count-DOWN within the current interval
    private(set) var emomCompletedIntervals: Int = 0
    private var emomSegmentIndex: Int? = nil
    private static let countInSeconds: Double = 3
    /// Seconds left in an interval at/under which the countdown reads as "urgent"
    /// (drives the last-3s ticks + the HUD's accent colour).
    static let emomUrgentThreshold: Double = 3

    /// Provenance of the live heart-rate signal currently feeding the session,
    /// so the connection strip can show WHERE HR comes from. nil = no HR.
    enum HRSource: String { case healthkit, pm5 }
    var hrSource: HRSource? = nil

    /// Athlete-entered actual load for the current strength/sled segment (kg).
    /// Pre-filled from the prescription on segment entry; the athlete can adjust
    /// to what they really lifted. This is the PRIMARY strength data when no
    /// device is present — it overrides the prescribed load in the record.
    var manualLoadKg: Double? = nil
    /// Athlete-entered actual distance for the current run segment (meters), used
    /// only when no GPS/erg distance is captured. Never pre-filled from the
    /// prescription (target ≠ covered) so the recorded distance stays honest.
    var manualRunDistanceMeters: Double? = nil

    // Per-segment RUN capture from CoreLocation (phone GPS). Distance is the
    // in-window covered meters; pace is derived on close from distance/duration
    // (a live GPS instantaneous pace is too noisy to average meaningfully here).
    private var lapGpsDistanceMeters: Double? = nil
    private var lapHadGPS: Bool = false

    private var timer: Timer?
    private var lastTick: Date = Date()
    private var autoSaveTicker: Int = 0
    private var lapHRSamples: [Int] = []
    private var lapZoneAccumSec: [Int: Double] = [:]

    // Per-segment PM5 aggregation. We sample the live erg stream each tick while
    // the current segment is an erg AND a PM5 is streaming, then average on lap.
    // Distance/calories use the in-window delta (final − value at segment start)
    // because PM5 distance/kcal are cumulative across the whole piece.
    private var lapErgPaceSamples: [Double] = []
    private var lapErgPowerSamples: [Double] = []
    private var lapErgSpmSamples: [Double] = []
    private var lapErgStartDistance: Double? = nil
    private var lapErgLastDistance: Double? = nil
    private var lapErgStartCalories: Int? = nil
    private var lapErgLastCalories: Int? = nil
    private var lapHadPM5: Bool = false

    // A previously-closed segment REOPENED via stepBack / jumpTo. Its captured
    // aggregates (HR / zone / distance / calories) are merged back in when the
    // segment is re-closed, so a back-step never silently drops recorded work.
    private var reopenedLap: LapRecord? = nil

    init(plan: WorkoutPlan, athleteHRMax: Int = 190, startedAt: Date = Date()) {
        self.plan = plan
        self.athleteHRMax = athleteHRMax
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

    /// True when the current segment is a running EMOM (past its count-in).
    var isEMOMActive: Bool { currentSegment?.isEMOM == true }

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
            || setRecords.contains { $0.confirmed }
            || (lapGpsDistanceMeters ?? 0) > 0
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

    /// True when the current segment belongs to a metcon-family block (Rx/Scaled
    /// axis applies) and is not a structural warmup/cooldown.
    var currentSegmentIsMetcon: Bool {
        !currentBlockIsStructural && currentSegment?.isMetconFamily == true
    }

    var liveZone: HRZone? {
        guard let bpm = liveHRBpm else { return nil }
        return HRZoneClassifier.zone(forBpm: bpm, hrMax: athleteHRMax)
    }

    func start() {
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
        if isPaused {
            isPaused = false
            lastTick = Date()
        } else {
            isPaused = true
        }
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

    /// The bottom primary button. For an EMOM it advances the INTERVAL (or, on the
    /// last one, closes the block); for every other format it closes the current
    /// segment's lap and advances — the classic manual lap, unchanged.
    func primaryAdvance() {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, let seg = currentSegment else { return }
        if seg.isEMOM {
            if emomCountInRemaining > 0 { skipCountIn(); return }
            advanceEMOMInterval(auto: false)
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
            finish()
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
            emomIntervalRemaining = Double(seg.emomPlan?.intervalSeconds ?? 60)
            WorkoutAudio.shared.playIntervalStart()
            return
        }
        guard currentSegmentIndex > 0 else { return }
        Haptics.light()
        let origin = currentSegmentIndex
        clearEMOMState()
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

    func finish() {
        Haptics.success()
        clearEMOMState()
        // Close the in-flight segment so the final segment is never dropped from
        // the execution record (finish can be reached directly via "Abandonar"
        // or after the last lap auto-finishes). lap() will have already closed
        // and zeroed lapElapsedSeconds, so a residual >0 means work is pending.
        // A structural warmup/cooldown only ever logs via its own "hecho" button —
        // an untapped one emits NO row (null = not done; we don't nag).
        if !isFinished, currentSegment != nil, lapElapsedSeconds > 0, !currentBlockIsStructural {
            closeCurrentSegmentLap()
        }
        isFinished = true
        stop()
        Task { [snapshot = persistedSnapshot()] in
            await WorkoutStateStore.shared.save(snapshot)
        }
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
        clearEMOMState()
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
            finish()
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
        if currentSegment?.isEMOM == true {
            startEMOM()
        } else {
            clearEMOMState()
        }
    }

    private func startEMOM() {
        guard let plan = currentSegment?.emomPlan else { clearEMOMState(); return }
        emomSegmentIndex = currentSegmentIndex
        emomIntervalIndex = 0
        emomCompletedIntervals = 0
        emomIntervalRemaining = Double(plan.intervalSeconds)
        emomCountInRemaining = Self.countInSeconds
        WorkoutAudio.shared.activate()
        WorkoutAudio.shared.playTick()   // the opening "3" of the 3-2-1 count-in
    }

    private func clearEMOMState() {
        if emomSegmentIndex != nil { WorkoutAudio.shared.deactivate() }
        emomSegmentIndex = nil
        emomCountInRemaining = 0
        emomIntervalIndex = 0
        emomIntervalRemaining = 0
        emomCompletedIntervals = 0
    }

    private func skipCountIn() {
        guard let plan = currentSegment?.emomPlan else { return }
        emomCountInRemaining = 0
        emomIntervalRemaining = Double(plan.intervalSeconds)
        WorkoutAudio.shared.playGo()
        Haptics.medium()
    }

    // Advance to the next EMOM interval, or close the block on the last one.
    // `auto` = the timer rolled over; otherwise the athlete tapped through.
    private func advanceEMOMInterval(auto: Bool) {
        guard let plan = currentSegment?.emomPlan else { return }
        emomCompletedIntervals = max(emomCompletedIntervals, emomIntervalIndex + 1)
        let next = emomIntervalIndex + 1
        if next >= plan.intervalCount {
            WorkoutAudio.shared.playFinish()
            Haptics.success()
            closeEMOMAndAdvance()
            return
        }
        let changed = plan.interval(next)?.movement != plan.interval(emomIntervalIndex)?.movement
        emomIntervalIndex = next
        emomIntervalRemaining = Double(plan.intervalSeconds)
        if changed {
            WorkoutAudio.shared.playMovementChange()
            Haptics.heavy()
        } else {
            WorkoutAudio.shared.playIntervalStart()
            Haptics.medium()
        }
    }

    // Close the EMOM segment's lap (reusing the standard segment-close path) and
    // advance to the next segment, or finish the session. Crossing into the next
    // block parks on its preview (the gate) instead of auto-starting it.
    private func closeEMOMAndAdvance() {
        let wasLast = isLastSegment
        let origin = currentSegmentIndex
        clearEMOMState()
        closeCurrentSegmentLap()
        if wasLast {
            finish()
        } else {
            currentSegmentIndex += 1
            enterOrArm(from: origin)
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
        let now = Date()
        let isErg = seg.kind.isErg
        let usedPM5 = isErg && lapHadPM5

        let avgPace500 = usedPM5 ? mean(lapErgPaceSamples) : nil
        let avgPower = usedPM5 ? mean(lapErgPowerSamples) : nil
        let avgSpm = usedPM5 ? mean(lapErgSpmSamples) : nil
        // In-window distance delta (PM5 distance is cumulative across the piece).
        let ergDistance: Double? = {
            guard usedPM5, let start = lapErgStartDistance, let last = lapErgLastDistance else { return nil }
            return max(0, last - start)
        }()
        let ergCalories: Double? = {
            guard usedPM5, let start = lapErgStartCalories, let last = lapErgLastCalories else { return nil }
            return Double(max(0, last - start))
        }()

        // Distance COVERED (not prescribed): erg in-window delta, else phone-GPS
        // covered meters, else the athlete's manual entry. We never record the
        // prescribed target as "covered" — target is a HUD hint, not measured work.
        let usedGPS = seg.kind == .running && lapHadGPS
        let runDistance: Double? = usedGPS ? lapGpsDistanceMeters : manualRunDistanceMeters
        let distance = ergDistance ?? runDistance

        // Run pace COVERED — derived from real covered distance over the segment
        // duration (km/min). Only when we actually measured a distance; otherwise
        // nil (no fabricated pace from the prescription).
        let avgPaceKm: Double? = {
            guard seg.kind == .running, let d = runDistance, d > 0, lapElapsedSeconds > 0 else { return nil }
            return lapElapsedSeconds / (d / 1000.0)   // seconds per km
        }()

        // Load USED (kg) — athlete's manual actual when present, else prescribed.
        var weight: Double? = (seg.kind == .strength || seg.kind == .sled)
            ? (manualLoadKg ?? seg.loadKg)
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
            // Representative load for the segment aggregate = max ACTUAL load logged.
            if let maxLoad = recs.compactMap({ $0.loadActualKg }).max() { weight = maxLoad }
        } else if (seg.kind == .reps || seg.kind == .strength) && !seg.isEMOM {
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

        // Source precedence: the most specific real measurement wins. Device
        // movement data (pm5 / gps) > athlete manual entry > HR-only wearable.
        let hasManualEntry = (runDistance != nil) || (manualLoadKg != nil)
        let computedSource: String
        if usedPM5 { computedSource = "pm5" }
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
            modality: seg.kind.modality,
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
            sets: setRecordsOut
        )
        laps.append(lap)
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
        dismissRest()
        resetErgAccumulators()
        resetSegmentManualAndGPS()
    }

    // Clears the per-segment manual-entry + GPS capture so the next segment
    // starts from its own prescription, not the previous segment's values.
    private func resetSegmentManualAndGPS() {
        manualLoadKg = nil
        manualRunDistanceMeters = nil
        lapGpsDistanceMeters = nil
        lapHadGPS = false
    }

    /// Pre-fills the manual load field for the current strength/sled segment from
    /// the prescription. Called when a segment becomes current so the athlete
    /// only has to adjust, not type from scratch. Idempotent: won't clobber a
    /// value the athlete already edited for this same segment.
    func primeManualLoadIfNeeded() {
        guard manualLoadKg == nil,
              let seg = currentSegment,
              seg.kind == .strength || seg.kind == .sled,
              let kg = seg.loadKg else { return }
        manualLoadKg = kg
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

    /// Builds the per-set strength records for a multi-set segment, each defaulting
    /// to its prescribed reps/load (confirmed=false until touched). Idempotent per
    /// segment; clears the list for non-multi-set segments.
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
                loadActualKg: s.prescribedLoadKg,
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
    func confirmSet(_ index: Int) {
        guard setRecords.indices.contains(index) else { return }
        setRecords[index].confirmed = true
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
                modality: first.kind.modality,
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
            finish()
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
    }

    private func mean(_ xs: [Double]) -> Double? {
        guard !xs.isEmpty else { return nil }
        return xs.reduce(0, +) / Double(xs.count)
    }

    /// Pulls one erg sample into the current segment's aggregation. Called from
    /// the view's PM5 onChange so the session stays the single owner of capture
    /// state without depending on the PM5 store directly (testable seam).
    func sampleErg(paceSecPer500m: Double?, powerWatts: Int?, strokeRate: Int?, distanceMeters: Double?, caloriesKcal: Int?) {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, currentSegment?.kind.isErg == true else { return }
        lapHadPM5 = true
        if let p = paceSecPer500m, p > 0 { lapErgPaceSamples.append(p) }
        if let w = powerWatts, w > 0 { lapErgPowerSamples.append(Double(w)) }
        if let s = strokeRate, s > 0 { lapErgSpmSamples.append(Double(s)) }
        if let d = distanceMeters {
            if lapErgStartDistance == nil { lapErgStartDistance = d }
            lapErgLastDistance = d
        }
        if let c = caloriesKcal {
            if lapErgStartCalories == nil { lapErgStartCalories = c }
            lapErgLastCalories = c
        }
    }

    /// Feeds a live HR reading from a wearable. `source` records WHERE it came
    /// from (Apple Watch/iPhone via HealthKit, or a strap paired through the PM5)
    /// so the connection strip can show provenance. PM5 passthrough is preferred
    /// only as a fallback: once HealthKit is streaming it stays the source.
    func injectLiveHR(_ bpm: Int, source: HRSource) {
        // Don't let an intermittent PM5 strap reading override an active
        // HealthKit/watch stream that's already the chosen source.
        if hrSource == .healthkit && source == .pm5 { liveHRBpm = bpm; lapHRSamples.append(bpm); return }
        liveHRBpm = bpm
        hrSource = source
        lapHRSamples.append(bpm)
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

    /// Live covered distance for the current run segment for HUD display
    /// (GPS sum when available, else the athlete's manual entry).
    var liveRunDistanceMeters: Double? {
        currentSegment?.kind == .running ? (lapGpsDistanceMeters ?? manualRunDistanceMeters) : nil
    }

    private func tick() {
        // The block-preview gate freezes ALL clocks (elapsed, lap, EMOM count-in/
        // countdown) until the athlete taps Empezar; resetting lastTick means the
        // elapsed clock can't jump by the time spent on the preview.
        guard !isPaused, !isFinished, !isAwaitingBlockStart else {
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

        if currentSegment?.isEMOM == true { tickEMOM(dt: dt) }

        // Per-set rest countdown: tick the final 3s, soft cue at zero.
        if restRemainingSeconds > 0 {
            let before = restRemainingSeconds
            let after = before - dt
            for boundary in [3.0, 2.0, 1.0] where before > boundary && after <= boundary {
                Haptics.light()
            }
            if after <= 0 {
                restRemainingSeconds = 0
                restTotalSeconds = 0
                Haptics.medium()
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

    // Drive the EMOM count-in and per-interval countdown. Fires the count-in
    // ticks + "go", the last-3s ticks, the top-of-interval beep and the auto-roll
    // to the next interval (or the block close on the last one). Runs off the same
    // 0.25s tick as the main clock.
    private func tickEMOM(dt: Double) {
        guard let plan = currentSegment?.emomPlan else { return }

        // Count-in: 3-2-1 with a tick on each whole-second transition, "go" at 0.
        if emomCountInRemaining > 0 {
            let before = emomCountInRemaining
            emomCountInRemaining = max(0, before - dt)
            if before.rounded(.up) != emomCountInRemaining.rounded(.up) {
                if emomCountInRemaining <= 0 {
                    emomIntervalRemaining = Double(plan.intervalSeconds)
                    WorkoutAudio.shared.playGo()
                    Haptics.medium()
                } else {
                    WorkoutAudio.shared.playTick()
                    Haptics.light()
                }
            }
            return
        }

        // Running interval: count down, tick the final 3 seconds, roll at zero.
        let before = emomIntervalRemaining
        let after = before - dt
        for boundary in [3.0, 2.0, 1.0] where before > boundary && after <= boundary {
            WorkoutAudio.shared.playTick()
            Haptics.light()
        }
        if after <= 0 {
            advanceEMOMInterval(auto: true)   // beep + auto-roll (or close on last)
        } else {
            emomIntervalRemaining = after
        }
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
            savedAt: Date()
        )
    }

    static func formatElapsed(_ s: Double) -> String {
        let total = Int(s.rounded())
        if total >= 3600 {
            return String(format: "%d:%02d:%02d", total / 3600, (total % 3600) / 60, total % 60)
        }
        return String(format: "%02d:%02d", total / 60, total % 60)
    }
}
