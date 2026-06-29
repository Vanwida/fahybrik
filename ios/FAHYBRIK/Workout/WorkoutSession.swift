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
    /// used to gate a confirm before a back / jump that would discard it.
    var currentSegmentHasLiveProgress: Bool {
        lapElapsedSeconds > 3
            || repsCurrentSegment > 0
            || (lapGpsDistanceMeters ?? 0) > 0
            || !lapHRSamples.isEmpty
            || lapHadPM5
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
        // Initialise whichever segment we resume on (count-in + audio if it's an
        // EMOM, prime the manual load otherwise). Guarded by emomSegmentIndex so a
        // restart while already on an EMOM doesn't re-trigger the count-in.
        if emomSegmentIndex == nil { onEnterSegment() }
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
        guard !isPaused, !isFinished else { return }
        repsCurrentSegment = max(0, repsCurrentSegment + reps)
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
        guard !isPaused, !isFinished, let seg = currentSegment else { return }
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
        guard !isPaused, !isFinished, currentSegment != nil else { return }
        Haptics.medium()
        closeCurrentSegmentLap()
        if currentSegmentIndex < plan.segments.count - 1 {
            currentSegmentIndex += 1
            onEnterSegment()
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
        clearEMOMState()
        currentSegmentIndex -= 1
        reopenCurrentSegment()
        onEnterSegment()
    }

    /// Jump to an arbitrary segment (phase rail / stepper). Forward closes the
    /// current segment then SKIPS the intermediate ones (they produce no lap — not
    /// performed); backward reopens segment-by-segment until the target.
    func jumpTo(_ index: Int) {
        guard !isPaused, !isFinished,
              index >= 0, index < plan.segments.count, index != currentSegmentIndex else { return }
        Haptics.medium()
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
        onEnterSegment()
    }

    func finish() {
        Haptics.success()
        clearEMOMState()
        // Close the in-flight segment so the final segment is never dropped from
        // the execution record (finish can be reached directly via "Abandonar"
        // or after the last lap auto-finishes). lap() will have already closed
        // and zeroed lapElapsedSeconds, so a residual >0 means work is pending.
        if !isFinished, currentSegment != nil, lapElapsedSeconds > 0 {
            closeCurrentSegmentLap()
        }
        isFinished = true
        stop()
        Task { [snapshot = persistedSnapshot()] in
            await WorkoutStateStore.shared.save(snapshot)
        }
    }

    // MARK: - Segment entry / EMOM lifecycle

    // Called whenever the current segment changes. Primes the manual load for
    // strength work and (re)starts the EMOM timer + audio when the new segment is
    // an EMOM; tears EMOM state down otherwise.
    private func onEnterSegment() {
        if reopenedLap?.segmentId != currentSegment?.id { reopenedLap = nil }
        primeManualLoadIfNeeded()
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
    // advance to the next segment, or finish the session.
    private func closeEMOMAndAdvance() {
        let wasLast = isLastSegment
        clearEMOMState()
        closeCurrentSegmentLap()
        if wasLast {
            finish()
        } else {
            currentSegmentIndex += 1
            onEnterSegment()
        }
    }

    // Reset the in-progress live state WITHOUT recording a lap — used when the
    // current segment is abandoned to step / jump backward.
    private func discardCurrentLiveState() {
        lapElapsedSeconds = 0
        repsCurrentSegment = 0
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
        let weight: Double? = (seg.kind == .strength || seg.kind == .sled)
            ? (manualLoadKg ?? seg.loadKg)
            : nil
        let reps: Int? = (seg.kind == .reps || seg.kind == .strength) ? repsCurrentSegment : nil

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
            source: source
        )
        laps.append(lap)
        reopenedLap = nil

        lapElapsedSeconds = 0
        lapHRSamples.removeAll(keepingCapacity: true)
        lapZoneAccumSec.removeAll(keepingCapacity: true)
        repsCurrentSegment = 0
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
        guard !isPaused, !isFinished, currentSegment?.kind.isErg == true else { return }
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
        guard !isPaused, !isFinished, currentSegment?.kind == .running, deltaMeters > 0 else { return }
        lapHadGPS = true
        lapGpsDistanceMeters = (lapGpsDistanceMeters ?? 0) + deltaMeters
    }

    /// Live covered distance for the current run segment for HUD display
    /// (GPS sum when available, else the athlete's manual entry).
    var liveRunDistanceMeters: Double? {
        currentSegment?.kind == .running ? (lapGpsDistanceMeters ?? manualRunDistanceMeters) : nil
    }

    private func tick() {
        guard !isPaused, !isFinished else {
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
