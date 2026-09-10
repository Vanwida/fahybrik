import Foundation
import HealthKit
import Observation

/// Hang-off for the coach plan (`runUUID`) and Apple recover of a *mirrored*
/// session. FAHYBRID does not mint an iPhone `HKWorkoutSession`.
///
/// Apple (HealthKit `HKWorkoutSessionType`): primary runs on watchOS;
/// mirrored runs on the companion iOS device. `startMirroringToCompanionDevice`
/// is watchOS 10 — Watch → iPhone. There is no iOS symbol that mirrors an
/// iPhone primary onto the Watch. Creating a primary here made HealthKit
/// error 3 ("Workout session is not currently mirroring to the companion
/// device") and left the wrist with nothing to adopt.
///
/// Clock: if Apple handed us a recovered mirrored session, `startDate` +
/// pause of THAT session (`WorkoutRunClock`). Otherwise the coach engine.
@MainActor
@Observable
final class PhoneWorkoutRun: NSObject {
    static let shared = PhoneWorkoutRun()

    @ObservationIgnored private let healthStore = HKHealthStore()
    @ObservationIgnored private let delegateShim = PhoneWorkoutRunDelegate()

    private(set) var session: HKWorkoutSession?
    private(set) var runUUID: UUID?

    /// Elapsed already earned before THIS process session (snapshot after jetsam
    /// on iOS 18, where Apple cannot recover the old session).
    @ObservationIgnored private var diskOffset: TimeInterval = 0
    @ObservationIgnored private var pauseBeganAt: Date?
    @ObservationIgnored private var pausedAccumulated: TimeInterval = 0

    /// Apple's clock. One formula — see `WorkoutRunClock`.
    var elapsedTime: TimeInterval {
        WorkoutRunClock.elapsed(
            diskOffset: diskOffset,
            sessionStart: session?.startDate,
            pauseBeganAt: pauseBeganAt,
            pausedAccumulated: pausedAccumulated,
            now: Date()
        )
    }

    private override init() {
        super.init()
        delegateShim.owner = self
    }

    static func activityType(for activityKind: String) -> HKWorkoutActivityType {
        WorkoutLocationType.activityType(for: activityKind)
    }

    nonisolated static func locationType(
        for activityKind: String,
        environment: RunEnvironment? = nil
    ) -> HKWorkoutSessionLocationType {
        WorkoutLocationType.resolve(activityKind: activityKind, environment: environment)
    }

    // MARK: - Start / attach / recover

    /// Bind the coach-plan hang-off id. Apple does not expose `HKWorkoutSession`
    /// uuid (`startDate` / `state` / `type` only) — this id lives on disk.
    func bindRunUUID(_ id: UUID?) {
        if let id { runUUID = id }
    }

    /// Retain the hang-off UUID. Does not construct `HKWorkoutSession`.
    /// The Watch creates the primary; iPhone adopts via
    /// `workoutSessionMirroringStartHandler` (`PhoneLiveSession`).
    func startIfNeeded(
        activityKind: String,
        diskOffset: TimeInterval = 0,
        startPaused: Bool = false,
        runUUID preferred: UUID? = nil,
        environment: RunEnvironment? = nil
    ) {
        _ = activityKind
        _ = environment
        guard session == nil else { return }
        runUUID = runUUID ?? preferred ?? UUID()
        self.diskOffset = max(0, diskOffset)
        pauseBeganAt = nil
        pausedAccumulated = 0
        if startPaused { pauseBeganAt = Date() }
    }

    /// Reattach a session Apple handed back from `recoverActiveWorkoutSession`.
    /// iOS 26 only. Clock stays `startDate` — we do not read a builder.
    /// Does not mint a hang-off id (Apple has none); disk binds it.
    func attachRecovered(_ recovered: HKWorkoutSession) {
        session = recovered
        recovered.delegate = delegateShim
        diskOffset = 0
        pausedAccumulated = 0
        pauseBeganAt = recovered.state == .paused ? Date() : nil
    }

    /// Align pause accounting so `elapsedTime` matches the coach snapshot after
    /// Apple recover (same session, original `startDate`).
    func adoptDiskElapsed(_ snapshotElapsed: TimeInterval, isPaused: Bool) {
        guard let start = session?.startDate else {
            diskOffset = snapshotElapsed
            return
        }
        diskOffset = 0
        let wall = Date().timeIntervalSince(start)
        pausedAccumulated = max(0, wall - snapshotElapsed)
        pauseBeganAt = isPaused ? Date() : nil
    }

    /// Apple `recoverActiveWorkoutSession` — reattach a mirrored session the
    /// Watch is still running. Availability is Apple's, not a homemade split
    /// of who owns the primary.
    func recover() async -> HKWorkoutSession? {
        if let session { return session }
        guard HKHealthStore.isHealthDataAvailable() else { return nil }
        guard #available(iOS 26.0, *) else { return nil }
        return await withCheckedContinuation { cont in
            healthStore.recoverActiveWorkoutSession { session, _ in
                Task { @MainActor in
                    if let session {
                        PhoneLiveSession.shared.attachRecovered(session)
                    }
                    cont.resume(returning: session)
                }
            }
        }
    }

    // MARK: - Pause / resume / end / mirror

    func pause() {
        guard pauseBeganAt == nil else { return }
        pauseBeganAt = Date()
        // Clock only. `HKWorkoutSession.pause()` belongs to the Watch PRIMARY.
        PhoneLiveSession.shared.pauseRemote()
    }

    func resume() {
        if let began = pauseBeganAt {
            pausedAccumulated += Date().timeIntervalSince(began)
            pauseBeganAt = nil
        }
        PhoneLiveSession.shared.resumeRemote()
    }

    func sendToWatch(_ data: Data) {
        guard let session, session.type != .mirrored else { return }
        Task { try? await session.sendToRemoteWorkoutSession(data: data) }
    }

    func end() {
        guard let session else {
            clear()
            return
        }
        let now = Date()
        session.stopActivity(with: now)
        session.end()
        clear()
    }

    func handleStateChange(to state: HKWorkoutSessionState) {
        if state == .ended || state == .stopped {
            if state == .ended { clear() }
        }
    }

    func handleFailure() {
        session?.end()
        clear()
    }

    private func clear() {
        session = nil
        runUUID = nil
        diskOffset = 0
        pauseBeganAt = nil
        pausedAccumulated = 0
    }
}

private final class PhoneWorkoutRunDelegate: NSObject, HKWorkoutSessionDelegate {
    weak var owner: PhoneWorkoutRun?

    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor [weak self] in self?.owner?.handleStateChange(to: toState) }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor [weak self] in self?.owner?.handleFailure() }
    }

    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didReceiveDataFromRemoteWorkoutSession data: [Data]
    ) {
        Task { @MainActor in
            PhoneLiveSession.shared.handleIncoming(data)
        }
    }
}
