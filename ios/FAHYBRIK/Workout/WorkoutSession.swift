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
    }

    func stop() {
        timer?.invalidate()
        timer = nil
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

    func tap(reps: Int = 1) {
        guard !isPaused, !isFinished else { return }
        repsCurrentSegment = max(0, repsCurrentSegment + reps)
    }

    // Closes current segment's lap, advances to next. Behavior shared by For
    // Time / AMRAP / Circuit / HYROX Sim. EMOM / Intervals auto-advance instead.
    func lap() {
        guard !isPaused, !isFinished, currentSegment != nil else { return }
        Haptics.medium()
        closeCurrentSegmentLap()

        if currentSegmentIndex < plan.segments.count - 1 {
            currentSegmentIndex += 1
        } else {
            finish()
        }
    }

    func finish() {
        Haptics.success()
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

        // Source precedence: the most specific real measurement wins. Device
        // movement data (pm5 / gps) > athlete manual entry > HR-only wearable.
        let hasManualEntry = (runDistance != nil) || (manualLoadKg != nil)
        let source: String
        if usedPM5 { source = "pm5" }
        else if usedGPS { source = "gps" }
        else if hasManualEntry { source = "manual" }
        else if !lapHRSamples.isEmpty { source = "healthkit" }
        else { source = "manual" }

        let lap = LapRecord(
            id: UUID(),
            segmentId: seg.id,
            templateSegmentId: seg.templateSegmentId,
            position: seg.order,
            modality: seg.kind.modality,
            startedAt: now.addingTimeInterval(-lapElapsedSeconds),
            endedAt: now,
            durationSeconds: lapElapsedSeconds,
            avgHRBpm: lapHRSamples.isEmpty ? nil : lapHRSamples.reduce(0, +) / lapHRSamples.count,
            maxHRBpm: lapHRSamples.max(),
            zoneSecondsByZone: lapZoneAccumSec.reduce(into: [Int: Double]()) {
                $0[$1.key] = $1.value
            },
            repsCompleted: reps,
            distanceCoveredMeters: distance,
            avgPaceSecPer500m: avgPace500,
            avgPaceSecPerKm: avgPaceKm,
            avgPowerWatts: avgPower,
            strokeRateSpm: avgSpm,
            calories: ergCalories,
            weightUsedKg: weight,
            source: source
        )
        laps.append(lap)

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

        autoSaveTicker += 1
        if autoSaveTicker >= 20 {        // 0.25s × 20 = 5s
            autoSaveTicker = 0
            Task { [snapshot = persistedSnapshot()] in
                await WorkoutStateStore.shared.save(snapshot)
            }
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
