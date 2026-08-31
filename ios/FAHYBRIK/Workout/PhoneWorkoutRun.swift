import Foundation
import HealthKit
import Observation

// iPhone PRIMARY `HKWorkoutSession` + `HKLiveWorkoutBuilder` (Apple, iOS 17+,
// deploy 18). This object IS the run. The coach plan hangs off `runUUID`.
// The homemade Timer in WorkoutSession is a poller of `builder.elapsedTime`,
// not the clock (FH-48).
//
// One primary only. Watch ADOPTS via `workoutSessionMirroringStartHandler`.
// Do not also create an HKWorkoutSession on the wrist (two primaries desync).
@MainActor
@Observable
final class PhoneWorkoutRun: NSObject {
    static let shared = PhoneWorkoutRun()

    /// Custom HK metadata key — the coach-plan snapshot hangs off this UUID.
    /// Not an Apple key; Apple has no public session UUID until finishWorkout.
    static let metadataRunUUIDKey = "com.fahybrid.workout.run_uuid"

    @ObservationIgnored private let healthStore = HKHealthStore()
    @ObservationIgnored private let delegateShim = PhoneWorkoutRunDelegate()

    private(set) var session: HKWorkoutSession?
    private(set) var builder: HKLiveWorkoutBuilder?
    private(set) var runUUID: UUID?

    /// True while THIS process owns a primary (not mirrored) HK session.
    var hasPrimarySession: Bool {
        guard let session else { return false }
        return session.type == .primary
    }

    /// Apple's clock, including pauses. Nil until the builder is attached.
    var elapsedTime: TimeInterval? { builder?.elapsedTime }

    @ObservationIgnored private var pendingSave = false
    @ObservationIgnored private var didMarkFirstBlock = false

    private override init() {
        super.init()
        delegateShim.owner = self
    }

    // MARK: - Activity map (DRY with the mirror / watch vocabulary)

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

    /// Create and retain the primary session on Empezar. Idempotent — recover
    /// and a second onAppear must not birth another session.
    func startIfNeeded(activityKind: String) {
        guard session == nil, HKHealthStore.isHealthDataAvailable() else { return }
        let config = HKWorkoutConfiguration()
        config.activityType = Self.activityType(for: activityKind)
        config.locationType = Self.locationType(for: activityKind)
        do {
            let session = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(
                healthStore: healthStore, workoutConfiguration: config
            )
            session.delegate = delegateShim
            builder.delegate = delegateShim
            let uuid = UUID()
            self.session = session
            self.builder = builder
            self.runUUID = uuid
            self.didMarkFirstBlock = false
            builder.addMetadata([Self.metadataRunUUIDKey: uuid.uuidString]) { _, _ in }

            let start = Date()
            session.startActivity(with: start)
            builder.beginCollection(withStart: start) { _, _ in }
            // Do not pause here. Fresh start parks on the preview via armBlock()
            // → pause(). Restore already passed the gate — pausing here would
            // freeze Apple's clock forever (start() must not armBlock).
            Task { try? await self.healthStore.requestAuthorization(
                toShare: HealthKitPermissions.shareTypes, read: []
            ) }
        } catch {
            self.session = nil
            self.builder = nil
            self.runUUID = nil
        }
    }

    /// Reattach a session Apple handed back from `recoverActiveWorkoutSession`.
    /// Recreates the live data source (WWDC: the session/builder restore; the
    /// data source does not). Does not start a new activity.
    func attachRecovered(_ recovered: HKWorkoutSession) {
        session = recovered
        let builder = recovered.associatedWorkoutBuilder()
        builder.dataSource = HKLiveWorkoutDataSource(
            healthStore: healthStore,
            workoutConfiguration: recovered.workoutConfiguration
        )
        recovered.delegate = delegateShim
        builder.delegate = delegateShim
        self.builder = builder
        if let raw = builder.metadata[Self.metadataRunUUIDKey] as? String,
           let uuid = UUID(uuidString: raw) {
            runUUID = uuid
        } else {
            runUUID = runUUID ?? UUID()
        }
        didMarkFirstBlock = true
    }

    /// Pin `@available` against deploy 18.0. MCP listed mixed iOS 26 / watchOS 5
    /// for neighbouring symbols; `recoverActiveWorkoutSession` is on HKHealthStore
    /// and the iPhone session it returns is the iOS 17+ `HKWorkoutSession`.
    func recover() async -> HKWorkoutSession? {
        if let session { return session }
        guard HKHealthStore.isHealthDataAvailable() else { return nil }
        return await withCheckedContinuation { cont in
            healthStore.recoverActiveWorkoutSession { session, _ in
                Task { @MainActor in
                    if let session { self.attachRecovered(session) }
                    cont.resume(returning: session)
                }
            }
        }
    }

    // MARK: - Pause / resume / end / segments / mirror

    func pause() { session?.pause() }
    func resume() { session?.resume() }

    /// Apple segment for a coach-block crossing. First block already started
    /// with `startActivity` — only later blocks call `beginNewActivity`.
    func markCoachBlockStart(activityKind: String) {
        guard let session else { return }
        if !didMarkFirstBlock {
            didMarkFirstBlock = true
            session.resume()
            return
        }
        let config = HKWorkoutConfiguration()
        config.activityType = Self.activityType(for: activityKind)
        config.locationType = Self.locationType(for: activityKind)
        let now = Date()
        session.endCurrentActivity(on: now)
        var meta: [String: Any] = [:]
        if let runUUID { meta[Self.metadataRunUUIDKey] = runUUID.uuidString }
        session.beginNewActivity(configuration: config, date: now, metadata: meta)
        session.resume()
    }

    /// Mirror the iPhone primary TO the Watch. Watch adopts — it must not create.
    func startMirroring() {
        guard let session, session.type == .primary else { return }
        session.startMirroringToCompanionDevice { _, _ in }
    }

    /// Stop the Apple session. `save` finishes the builder (Salud); discard drops it.
    /// HealthKitWorkoutWriter still writes at end and adopts by overlap — do not
    /// change that file. The uuid rides `consumeWorkoutRef` when we finish.
    func end(save: Bool) {
        guard session != nil else { return }
        pendingSave = save
        session?.stopActivity(with: Date())
    }

    func handleStateChange(to state: HKWorkoutSessionState, date: Date) {
        guard state == .stopped || state == .ended else { return }
        if state == .stopped {
            Task { await self.closeBuilder(at: date, save: pendingSave) }
        }
        if state == .ended {
            clear()
        }
    }

    func handleFailure() {
        builder?.discardWorkout()
        session?.end()
        clear()
    }

    private func closeBuilder(at date: Date, save: Bool) async {
        guard let builder else {
            session?.end()
            return
        }
        if save {
            do {
                try await builder.endCollection(at: date)
                let workout = try await builder.finishWorkout()
                PhoneMirrorService.shared.notePhoneFinished(workoutUUID: workout?.uuid.uuidString)
            } catch {
                PhoneMirrorService.shared.notePhoneFinished(workoutUUID: nil)
            }
        } else {
            builder.discardWorkout()
        }
        session?.end()
    }

    private func clear() {
        session = nil
        builder = nil
        runUUID = nil
        pendingSave = false
        didMarkFirstBlock = false
    }
}

// NSObject shim — HKWorkoutSessionDelegate / HKLiveWorkoutBuilderDelegate are
// NSObjectProtocol. Delegate is weak on the session/builder.
private final class PhoneWorkoutRunDelegate: NSObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    weak var owner: PhoneWorkoutRun?

    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor [weak self] in self?.owner?.handleStateChange(to: toState, date: date) }
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

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {}
}
