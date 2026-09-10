import Foundation
import Observation

// Wrist DISTANCE-leg auto-close (#68) — driven by HKLiveWorkoutBuilder distance
// samples (`noteHealthKitDistanceSample`), not a 0.5 s shadow timer.
// Pure structured RUN on wrist should prefer WorkoutKit goals (`AppleWorkoutMapper`);
// this driver covers hybrid sessions in our coach engine.

@Observable
final class WatchRunLegDriver {
    private let session: WorkoutSession
    private var progress = RunLegProgress()

    private(set) var legCoveredMeters: Double = 0

    init(session: WorkoutSession) {
        self.session = session
    }

    func start() {
        tick()
    }

    func stop() {}

    /// Called from `WatchWorkoutCoordinator` on each HK distance delta.
    func noteHealthKitDistanceSample() {
        tick()
    }

    func tick() {
        let covered = session.liveRunDistanceMeters ?? 0
        let key = "\(session.currentSegmentIndex)#\(session.runLegIndex)#\(session.isRunCountIn ? "in" : "go")"
        let runnable = !session.isPaused && !session.isFinished
            && !session.isAwaitingBlockStart && !session.isRunCountIn
        let advance = progress.step(
            legKey: key,
            segmentCoveredMeters: covered,
            goal: session.currentRunLeg?.goal ?? .open,
            isDistanceLeg: session.currentRunLegIsDistance,
            isRunnableNow: runnable
        )
        legCoveredMeters = progress.covered(segmentCoveredMeters: covered)
        if advance { session.primaryAdvance() }
    }
}
