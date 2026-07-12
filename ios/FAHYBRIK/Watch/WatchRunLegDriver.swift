import Foundation
import Observation

// The wrist's DISTANCE-leg auto-close for a structured run (#68). The shared engine
// already drives the structured cursor on the watch — count-in, per-leg TIME
// countdown, leg-change haptics, block close — but a DISTANCE leg is closed on the
// iPhone by the treadmill (belt odometer → session.primaryAdvance()). The wrist has
// no belt, so this thin driver plays that role from the HealthKit covered distance:
// exactly TreadmillHUDModel.maybeAutoAdvance without any device / BLE.
//
// LIFECYCLE = the WORKOUT, not a view. It is created + started by
// WatchWorkoutCoordinator.launch and stopped at reset, so its timer runs for the
// whole session: a DISTANCE tramo auto-closes even while the athlete has paged away
// to the music / metrics screen, and the per-leg baseline (inside `progress`)
// survives the structured view being recreated by watchOS paging. It only READS the
// engine's public state and calls the SAME public `primaryAdvance()` the treadmill
// uses, so WorkoutSession + coordinator recording stay the aggregate one-lap-per-
// block they are today. The baseline / covered / auto-close decision is the pure,
// tested `RunLegProgress`; this shell owns only the display timer + the side effect.
//
// Shared into both targets (like WatchWireModels) so `tick()` is unit-tested from
// FAHYBRIKTests (there is no watch test target); the iPhone never instantiates it
// (its runs are belt-driven). Not @MainActor — the timer is scheduled on RunLoop.main
// (so the @Observable mutation is on main), mirroring TreadmillHUDModel.
@Observable
final class WatchRunLegDriver {
    private let session: WorkoutSession
    private var progress = RunLegProgress()
    private var timer: Timer?

    /// How often the covered distance is re-evaluated for the display + auto-close —
    /// matches the treadmill HUD's display cadence (HK distance updates are coarser
    /// than this anyway).
    private static let tickSeconds: TimeInterval = 0.5

    /// The CURRENT leg's covered distance (m), for the "510 / 800 m" progress readout.
    private(set) var legCoveredMeters: Double = 0

    init(session: WorkoutSession) {
        self.session = session
    }

    func start() {
        guard timer == nil else { return }
        tick()   // seed the baseline at the current reading
        let t = Timer.scheduledTimer(withTimeInterval: Self.tickSeconds, repeats: true) { [weak self] _ in
            self?.tick()
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    /// One evaluation of the covered distance → per-leg covered + the DISTANCE-leg
    /// auto-close. Internal (not private) so it is unit-tested deterministically from
    /// FAHYBRIKTests without waiting on the timer; the timer just calls it each tick.
    /// Does NOT depend on any view being visible — the close is a function of covered
    /// distance + the session's runnable state only.
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
