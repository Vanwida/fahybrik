import Foundation
import HealthKit
import Observation

// iPhone PRIMARY `HKWorkoutSession` (Apple, iOS 17+, deploy 18). This object
// IS the run. The coach plan hangs off `runUUID`.
//
// Builder (Apple, not a Fahybrid clock):
//   • iOS 26+: `associatedWorkoutBuilder()` → `HKLiveWorkoutBuilder.elapsedTime`
//     (session-associated; pauses included).
//   • iOS 18–25: `HKWorkoutBuilder` (iOS 12+) + `elapsedTime(at:)`. The Live
//     builder / data source / `associatedWorkoutBuilder` are iOS 26 in this SDK.
//     Pause/resume are recorded as `HKWorkoutEvent` so Apple's duration
//     accounts for holds.
//
// One primary only. Watch ADOPTS via `workoutSessionMirroringStartHandler`.
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
    /// `HKWorkoutBuilder` is iOS 12+. On iOS 26 the value is the Live subclass
    /// from `associatedWorkoutBuilder()`.
    private(set) var builder: HKWorkoutBuilder?
    private(set) var runUUID: UUID?

    /// True while THIS process owns a primary (not mirrored) HK session.
    var hasPrimarySession: Bool {
        guard let session else { return false }
        return session.type == .primary
    }

    /// Apple's clock. Live `elapsedTime` on iOS 26; `elapsedTime(at:)` on 18.
    var elapsedTime: TimeInterval? {
        guard let builder else { return nil }
        if #available(iOS 26.0, *), let live = builder as? HKLiveWorkoutBuilder {
            return live.elapsedTime
        }
        return builder.elapsedTime(at: Date())
    }

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
            session.delegate = delegateShim
            let uuid = UUID()
            self.session = session
            self.runUUID = uuid
            self.didMarkFirstBlock = false

            let start = Date()
            let builder: HKWorkoutBuilder
            if #available(iOS 26.0, *) {
                let live = session.associatedWorkoutBuilder()
                live.dataSource = HKLiveWorkoutDataSource(
                    healthStore: healthStore, workoutConfiguration: config
                )
                builder = live
            } else {
                builder = HKWorkoutBuilder(
                    healthStore: healthStore, configuration: config, device: .local()
                )
            }
            self.builder = builder
            builder.addMetadata([Self.metadataRunUUIDKey: uuid.uuidString]) { _, _ in }
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
    /// iOS 26 only (`associatedWorkoutBuilder` + Live data source). Recreates
    /// the live data source (WWDC: session/builder restore; data source does not).
    func attachRecovered(_ recovered: HKWorkoutSession) {
        session = recovered
        recovered.delegate = delegateShim
        if #available(iOS 26.0, *) {
            let live = recovered.associatedWorkoutBuilder()
            live.dataSource = HKLiveWorkoutDataSource(
                healthStore: healthStore,
                workoutConfiguration: recovered.workoutConfiguration
            )
            builder = live
            if let raw = live.metadata[Self.metadataRunUUIDKey] as? String,
               let uuid = UUID(uuidString: raw) {
                runUUID = uuid
            } else {
                runUUID = runUUID ?? UUID()
            }
        } else {
            builder = nil
            runUUID = runUUID ?? UUID()
        }
        didMarkFirstBlock = true
    }

    /// `recoverActiveWorkoutSession` is iOS 26.0 in this SDK (watchOS 5). Pin
    /// against deploy 18: no-op below 26; `LiveWorkoutResume` still restores
    /// the coach snapshot so process death does not birth an empty cover.
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

    // MARK: - Pause / resume / end / segments / mirror

    func pause() {
        session?.pause()
        recordDisconnectedPauseEvent(.pause)
    }

    func resume() {
        session?.resume()
        recordDisconnectedPauseEvent(.resume)
    }

    /// On iOS 18 the builder is not associated with the session. Apple's
    /// `elapsedTime(at:)` only subtracts holds if we record `HKWorkoutEvent`.
    /// iOS 26 Live builder is wired to the session — do not double-count.
    private func recordDisconnectedPauseEvent(_ type: HKWorkoutEventType) {
        if #available(iOS 26.0, *) { return }
        guard let builder else { return }
        let now = Date()
        let event = HKWorkoutEvent(
            type: type,
            dateInterval: DateInterval(start: now, end: now),
            metadata: nil
        )
        builder.addWorkoutEvents([event]) { _, _ in }
    }

    /// Apple segment for a coach-block crossing. First block already started
    /// with `startActivity` — only later blocks call `beginNewActivity`.
    func markCoachBlockStart(activityKind: String) {
        guard let session else { return }
        if !didMarkFirstBlock {
            didMarkFirstBlock = true
            resume()
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

// NSObject shim — HKWorkoutSessionDelegate is NSObjectProtocol.
// `HKLiveWorkoutBuilderDelegate` is iOS 26; we do not conform (those
// callbacks were empty — the phone does not own Watch meters).
private final class PhoneWorkoutRunDelegate: NSObject, HKWorkoutSessionDelegate {
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
}
