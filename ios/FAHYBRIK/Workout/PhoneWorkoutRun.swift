import Foundation
import HealthKit
import Observation

/// iPhone PRIMARY `HKWorkoutSession` when Apple can create it (iOS 26).
/// FAHYBRID owns only the coach plan hanging off `runUUID`.
///
/// Clock: `HKWorkoutSession.startDate` + pause/resume of THAT session
/// (`WorkoutRunClock`). Create / recover / Live builder /
/// `associatedWorkoutBuilder` are iOS 26. Deploy 18 has no iOS initializer
/// (Apple: `init(configuration:)` is watchOS 3 only, unavailable on iOS).
/// On 18 the coach plan lives on disk; we do not construct a session.
///
/// One primary. Watch ADOPTS if Apple delivers a mirrored session.
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

    /// True while THIS process owns the run (not a session mirrored FROM the Watch).
    var hasPrimarySession: Bool {
        guard let session else { return false }
        return session.type != .mirrored
    }

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
        switch activityKind {
        case "running":  return .running
        case "strength": return .functionalStrengthTraining
        case "hyrox":    return .functionalStrengthTraining
        case "mixed":    return .mixedCardio
        default:         return .other
        }
    }

    static func locationType(for activityKind: String) -> HKWorkoutSessionLocationType {
        activityKind == "running" ? .outdoor : .indoor
    }

    // MARK: - Start / attach / recover

    /// Bind the coach-plan hang-off id. Apple does not expose `HKWorkoutSession`
    /// uuid (`startDate` / `state` / `type` only) — this id lives on disk.
    func bindRunUUID(_ id: UUID?) {
        if let id { runUUID = id }
    }

    /// Retain the hang-off UUID. Create Apple's session only on iOS 26
    /// (`init(healthStore:configuration:)`). Idempotent. iOS 18 does not
    /// construct — there is no iOS-available initializer below 26.
    func startIfNeeded(
        activityKind: String,
        diskOffset: TimeInterval = 0,
        startPaused: Bool = false,
        runUUID preferred: UUID? = nil
    ) {
        guard session == nil else { return }
        runUUID = runUUID ?? preferred ?? UUID()
        self.diskOffset = max(0, diskOffset)
        pauseBeganAt = nil
        pausedAccumulated = 0

        guard #available(iOS 26.0, *), HKHealthStore.isHealthDataAvailable() else {
            if startPaused { pauseBeganAt = Date() }
            return
        }
        let config = HKWorkoutConfiguration()
        config.activityType = Self.activityType(for: activityKind)
        config.locationType = Self.locationType(for: activityKind)
        do {
            let session = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            session.delegate = delegateShim
            self.session = session
            session.startActivity(with: Date())
            if startPaused { pause() }
            Task { try? await self.healthStore.requestAuthorization(
                toShare: HealthKitPermissions.shareTypes, read: []
            ) }
        } catch {
            self.session = nil
            if startPaused { pauseBeganAt = Date() }
        }
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

    /// `recoverActiveWorkoutSession` is iOS 26.0 / watchOS 5. On 18 this is a
    /// no-op — the coach plan on disk reopens the live.
    func recover() async -> HKWorkoutSession? {
        if let session { return session }
        guard HKHealthStore.isHealthDataAvailable() else { return nil }
        guard #available(iOS 26.0, *) else { return nil }
        return await withCheckedContinuation { cont in
            healthStore.recoverActiveWorkoutSession { session, _ in
                Task { @MainActor in
                    if let session { self.attachRecovered(session) }
                    cont.resume(returning: session)
                }
            }
        }
    }

    // MARK: - Pause / resume / end / mirror

    func pause() {
        guard pauseBeganAt == nil else { return }
        pauseBeganAt = Date()
        session?.pause()
    }

    func resume() {
        if let began = pauseBeganAt {
            pausedAccumulated += Date().timeIntervalSince(began)
            pauseBeganAt = nil
        }
        session?.resume()
    }

    /// Watch adopts if Apple delivers a mirrored session. Apple docs (HealthKit):
    /// `startMirroringToCompanionDevice` is watchOS 10 — Watch → companion iOS.
    /// There is no iOS symbol that mirrors an iPhone primary onto the Watch.
    /// `startWatchApp` is "to create a new workout session" — we do not call it.
    /// If the wrist never joins, the phone remains the owner.
    func startMirroring() {
        #if os(watchOS)
        guard let session, session.type != .mirrored else { return }
        session.startMirroringToCompanionDevice { _, _ in }
        #endif
    }

    func sendToWatch(_ data: Data) {
        guard let session, session.type != .mirrored else { return }
        Task { try? await session.sendToRemoteWorkoutSession(data: data) }
    }

    func end() {
        guard let session else { return }
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
        Task { @MainActor [weak self] in
            guard self?.owner?.hasPrimarySession == true else { return }
            PhoneMirrorService.shared.handleIncoming(data)
        }
    }
}
