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

    private var timer: Timer?
    private var lastTick: Date = Date()
    private var autoSaveTicker: Int = 0
    private var lapHRSamples: [Int] = []
    private var lapZoneAccumSec: [Int: Double] = [:]

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
        guard !isPaused, !isFinished, let seg = currentSegment else { return }
        Haptics.medium()
        let now = Date()
        let lap = LapRecord(
            id: UUID(),
            segmentId: seg.id,
            startedAt: now.addingTimeInterval(-lapElapsedSeconds),
            endedAt: now,
            durationSeconds: lapElapsedSeconds,
            avgHRBpm: lapHRSamples.isEmpty ? nil : lapHRSamples.reduce(0, +) / lapHRSamples.count,
            maxHRBpm: lapHRSamples.max(),
            zoneSecondsByZone: lapZoneAccumSec.reduce(into: [Int: Double]()) {
                $0[$1.key] = $1.value
            },
            repsCompleted: seg.kind == .reps ? repsCurrentSegment : nil,
            distanceCoveredMeters: seg.targetDistanceMeters
        )
        laps.append(lap)
        lapElapsedSeconds = 0
        lapHRSamples.removeAll(keepingCapacity: true)
        lapZoneAccumSec.removeAll(keepingCapacity: true)
        repsCurrentSegment = 0

        if currentSegmentIndex < plan.segments.count - 1 {
            currentSegmentIndex += 1
        } else {
            finish()
        }
    }

    func finish() {
        Haptics.success()
        isFinished = true
        stop()
        Task { [snapshot = persistedSnapshot()] in
            await WorkoutStateStore.shared.save(snapshot)
        }
    }

    func injectLiveHR(_ bpm: Int) {
        liveHRBpm = bpm
        lapHRSamples.append(bpm)
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
