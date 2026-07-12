import Foundation
import Observation

// The live brain of the treadmill HUD. Owns the two device sources (real BLE on
// device, deterministic mocks in the simulator), merges their telemetry, and
// exposes typed live values the view renders. It reads the WorkoutSession for the
// current leg's prescription and drives the SAME progression the rest of the
// workout uses (`primaryAdvance`) — it invents no new segment logic.
//
// Per-segment MEASURED values are kept in memory (`measured`) so a later phase
// can persist the real treadmill work into the execution record; this phase does
// not persist anything.

/// What the treadmill actually measured for one run leg — held in memory only.
struct TreadmillLegMeasurement: Equatable {
    var distanceM: Double
    var elapsedS: Double
    var avgSpeedKmh: Double?
    var avgInclinePct: Double?
    var avgBpm: Int?
}

@Observable
final class TreadmillHUDModel {
    // Live device state (observed by the view).
    private(set) var treadmillLink: DeviceLink = .idle
    private(set) var hrLink: DeviceLink = .idle
    private(set) var latest = TreadmillSample()
    private(set) var bleBpm: Int?

    // Per-segment live accumulation (observed).
    private(set) var segmentDistanceM: Double = 0
    private(set) var segmentElapsedS: Double = 0
    private(set) var isComplete = false
    private(set) var paused = false

    /// Measured work per segment index — the in-memory seam for the persistence
    /// phase. Never written to disk here.
    private(set) var measured: [Int: TreadmillLegMeasurement] = [:]

    let session: WorkoutSession
    let athleteAge: Int?

    private let treadmill: TreadmillDataSource
    private let hr: HeartRateSource

    // Segment timing (wall-clock, pause-aware).
    private var segmentStartedAt = Date()
    private var pausedAccum: TimeInterval = 0
    private var pauseStartedAt: Date?
    private var activeSegmentIndex = 0

    // Distance derivation + running averages for the measurement snapshot.
    private var distanceBaselineM: Double?
    private var lastSampleAt: Date?
    private var speedSum = 0.0
    private var speedCount = 0
    private var inclineSum = 0.0
    private var inclineCount = 0
    private var bpmSum = 0
    private var bpmCount = 0

    private var displayTimer: Timer?

    init(session: WorkoutSession, athleteAge: Int?,
         treadmill: TreadmillDataSource? = nil, hr: HeartRateSource? = nil) {
        self.session = session
        self.athleteAge = athleteAge
        // Real BLE on device; deterministic mocks in the simulator (no Bluetooth).
        #if targetEnvironment(simulator)
        self.treadmill = treadmill ?? MockTreadmillSource()
        self.hr = hr ?? MockHeartRateSource()
        #else
        self.treadmill = treadmill ?? FTMSTreadmillSource()
        self.hr = hr ?? BLEHeartRateSource()
        #endif
    }

    // MARK: - Lifecycle

    func start() {
        activeSegmentIndex = session.currentSegmentIndex
        resetSegmentState()
        treadmill.onLink = { [weak self] in self?.treadmillLink = $0 }
        treadmill.onSample = { [weak self] in self?.ingest($0) }
        hr.onLink = { [weak self] in self?.hrLink = $0 }
        hr.onBpm = { [weak self] in self?.bleBpm = $0 }
        treadmill.start()
        hr.start()
        displayTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    func teardown() {
        // Capture the leg in progress so its measured work stays in memory for the
        // persistence phase, even if the HUD closes without advancing.
        snapshotActiveSegment()
        displayTimer?.invalidate(); displayTimer = nil
        treadmill.stop()
        hr.stop()
    }

    /// Reconnect-free segment change: the view calls this when the session advances
    /// to a new leg while the HUD stays up (consecutive run legs keep the belt
    /// connected). Snapshots the finished leg, then arms the next.
    func handleSegmentChange() {
        snapshotActiveSegment()
        activeSegmentIndex = session.currentSegmentIndex
        resetSegmentState()
    }

    func togglePause() {
        paused.toggle()
        if paused {
            pauseStartedAt = Date()
        } else if let started = pauseStartedAt {
            pausedAccum += Date().timeIntervalSince(started)
            pauseStartedAt = nil
        }
        session.togglePause()
    }

    /// End this leg — the SAME advance the rest of the workout uses.
    func finishSegment() {
        Haptics.medium()
        session.primaryAdvance()
    }

    // MARK: - Live derived values (read by the view)

    var segment: WorkoutSegment? { session.currentSegment }
    var tramoIndex: Int { session.currentSegmentIndex + 1 }
    var tramoCount: Int { session.plan.segments.count }

    var runTarget: RunTarget { segment.map { RunTarget.resolve(from: $0) } ?? .none }
    var goal: SegmentGoal { segment.map { SegmentGoal.resolve(from: $0) } ?? .open }

    var livePaceSecPerKm: Int? {
        guard let kmh = latest.speedKmh else { return nil }
        return TreadmillMath.paceSecPerKm(fromSpeedKmh: kmh)
    }

    /// Preferred HR: the BLE strap when it's live, else the watch/HealthKit stream
    /// the workout already receives (so Apple Watch works with no extra plumbing).
    var currentBpm: Int? {
        if hrLink.isLive, let b = bleBpm { return b }
        return session.liveHRBpm ?? bleBpm
    }

    /// The HR link as the chip should read it: the BLE strap when live, else the
    /// watch/HealthKit stream the workout already receives (shown as "reloj").
    var effectiveHRLink: DeviceLink {
        if hrLink.isLive { return hrLink }
        if session.liveHRBpm != nil { return .connected(name: "reloj") }
        return hrLink
    }

    /// Estimated zone (220−age). Nil without an age or without HR — the HUD then
    /// hides the zone rather than inventing one. Always shown as "estimada".
    var liveZone: HRZone? {
        guard let bpm = currentBpm else { return nil }
        return EstimatedHRZone.zone(forBpm: bpm, age: athleteAge)
    }
    var zoneIsEstimated: Bool { true }

    /// Judgment for the hero: pace targets judge on pace, zone targets on HR zone.
    var heroStatus: TargetStatus {
        switch runTarget {
        case .pace: return runTarget.paceStatus(currentSecPerKm: livePaceSecPerKm)
        case .zone: return runTarget.zoneStatus(currentZone: liveZone)
        case .none: return .unknown
        }
    }

    var progressFraction: Double {
        goal.fraction(distanceM: segmentDistanceM, elapsedS: segmentElapsedS)
    }

    var diagnosticsText: String? { treadmill.diagnosticsText() }

    // MARK: - Ingestion

    private func ingest(_ sample: TreadmillSample) {
        var merged = latest
        if let v = sample.speedKmh { merged.speedKmh = v }
        if let v = sample.inclinePct { merged.inclinePct = v }
        if let v = sample.totalDistanceM { merged.totalDistanceM = v }
        if let v = sample.elapsedS { merged.elapsedS = v }
        if let v = sample.hrBpm { merged.hrBpm = v }
        merged.lastUpdate = sample.lastUpdate
        latest = merged

        updateSegmentDistance(from: merged)
        accumulateAverages(from: merged)
        evaluateCompletion()
    }

    private func updateSegmentDistance(from sample: TreadmillSample) {
        guard !paused else { lastSampleAt = sample.lastUpdate; return }
        if let total = sample.totalDistanceM {
            // Prefer the machine's own odometer, zeroed at this leg's first sample.
            if distanceBaselineM == nil { distanceBaselineM = total }
            segmentDistanceM = max(segmentDistanceM, total - (distanceBaselineM ?? total))
        } else if let kmh = sample.speedKmh {
            // No odometer → integrate speed over the real gap between samples.
            let dt = lastSampleAt.map { sample.lastUpdate.timeIntervalSince($0) } ?? 0
            segmentDistanceM = TreadmillMath.advanceDistance(segmentDistanceM, speedKmh: kmh,
                                                             dt: min(dt, 5))
        }
        lastSampleAt = sample.lastUpdate
    }

    private func accumulateAverages(from sample: TreadmillSample) {
        guard !paused else { return }
        if let v = sample.speedKmh { speedSum += v; speedCount += 1 }
        if let v = sample.inclinePct { inclineSum += v; inclineCount += 1 }
        if let v = currentBpm { bpmSum += v; bpmCount += 1 }
    }

    private func tick() {
        if !paused {
            segmentElapsedS = max(0, Date().timeIntervalSince(segmentStartedAt) - pausedAccum)
        }
        evaluateCompletion()
    }

    private func evaluateCompletion() {
        guard !isComplete else { return }
        if goal.isComplete(distanceM: segmentDistanceM, elapsedS: segmentElapsedS) {
            isComplete = true
            Haptics.success()
        }
    }

    // MARK: - Segment state

    private func resetSegmentState() {
        segmentDistanceM = 0
        segmentElapsedS = 0
        isComplete = false
        paused = false
        segmentStartedAt = Date()
        pausedAccum = 0
        pauseStartedAt = nil
        distanceBaselineM = nil
        lastSampleAt = nil
        speedSum = 0; speedCount = 0
        inclineSum = 0; inclineCount = 0
        bpmSum = 0; bpmCount = 0
    }

    private func snapshotActiveSegment() {
        measured[activeSegmentIndex] = TreadmillLegMeasurement(
            distanceM: segmentDistanceM,
            elapsedS: segmentElapsedS,
            avgSpeedKmh: speedCount > 0 ? speedSum / Double(speedCount) : nil,
            avgInclinePct: inclineCount > 0 ? inclineSum / Double(inclineCount) : nil,
            avgBpm: bpmCount > 0 ? bpmSum / bpmCount : nil
        )
    }
}
