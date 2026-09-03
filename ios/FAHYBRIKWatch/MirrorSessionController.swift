import Foundation
import Observation
import HealthKit
import os

// ONE Watch PRIMARY owner. Apple (HealthKit):
// `HKWorkoutSessionType.primary` runs on watchOS;
// `startMirroringToCompanionDevice` (watchOS 10) mirrors to companion iOS;
// `recoverActiveWorkoutSession` reattaches an orphan PRIMARY (no `startActivity`).
// iPhone `workoutSessionMirroringStartHandler` receives the mirrored session.
//
// Modes, not stacks: mirror (`handle`) · solo (coordinator) · orphan (recover).
// `has PRIMARY` ≠ MirrorHUD. LiveWorkoutSession does not mint.
@MainActor
@Observable
final class MirrorSessionController: NSObject {

    static let shared = MirrorSessionController()

    enum State { case idle, recording, ending }

    /// How the PRIMARY was claimed. Not a second session type.
    enum Mode { case idle, mirror, solo, orphan }

    private(set) var state: State = .idle
    private(set) var mode: Mode = .idle

    /// PRIMARY exists. Not the HUD switch — RootView uses `showsMirrorHUD`.
    var isActive: Bool { state != .idle }
    var hasLocalSession: Bool { session != nil }
    /// Phone is coach, or recover without a coach motor. Solo keeps LiveFlowView.
    var showsMirrorHUD: Bool { mode == .mirror || mode == .orphan }

    /// Last engine snapshot the phone pushed. Frames decorate; they are not the HUD clock.
    private(set) var frame: MirrorStateFrame?
    private(set) var frameReceivedAt: Date?
    private(set) var liveHR: Int?
    private(set) var activeKcal: Double = 0
    private(set) var distanceMeters: Double = 0
    /// Apple `HKLiveWorkoutBuilder.elapsedTime` (includes pauses). 0 until a builder exists.
    var builderElapsed: TimeInterval { builder?.elapsedTime ?? 0 }
    /// No frame within the watchdog window — recording CONTINUES; MirrorHUD
    /// controls then offer a local save/discard.
    private(set) var isConnectionLost = false

    /// Pipes for the solo coach motor. Mirror relays HR/distance to the phone instead.
    var onHeartRate: ((Int) -> Void)?
    var onDistanceDelta: ((Double) -> Void)?

    var liveZone: HRZone? {
        guard let zones = WatchPlanModel.shared.today?.athleteHrZones else { return nil }
        return liveHR.flatMap { zones.zone(forBpm: $0) }
    }

    static let connectionLostAfter: TimeInterval = 15
    static let hrRelayMinInterval: TimeInterval = 1
    static let savedBeat: Duration = .milliseconds(900)

    let store = HKHealthStore()
    var session: HKWorkoutSession?
    var builder: HKLiveWorkoutBuilder?
    var hkPaused = false
    var isClosing = false
    var lastHRRelayAt: Date = .distantPast
    var lastReportedDistance: Double = 0
    var appliedPlan: WatchHKActivityPlan?
    var startedPlan: WatchHKActivityPlan?
    var pendingPlan: WatchHKActivityPlan?
    let locationGate = WatchRunLocationGate()
    var lastSignalAt: Date = .distantPast
    var watchdog: Timer?
    /// Card 72 — leftover PRIMARY: `handle(_:)` is a NEW session. Finish first.
    var pendingStartConfiguration: HKWorkoutConfiguration?
    var pendingStartMode: Mode = .mirror
    static let log = Logger(subsystem: Marca.subsistemaLog("mirror"), category: "watch-lifecycle")

    private override init() { super.init() }

    // MARK: - Incoming (phone → watch)

    func handleRemote(_ data: Data) {
        guard let envelope = MirrorEnvelope.decoding(data) else { return }
        switch envelope.type {
        case MirrorWire.MessageType.frame:
            if let f = envelope.body(as: MirrorStateFrame.self) { applyFrame(f) }
        case MirrorWire.MessageType.end:
            if let e = envelope.body(as: MirrorEnd.self) { finish(save: e.save) }
        default:
            break
        }
    }

    private func applyFrame(_ f: MirrorStateFrame) {
        frame = f
        frameReceivedAt = Date()
        lastSignalAt = frameReceivedAt ?? Date()
        isConnectionLost = false
        if mode == .orphan { mode = .mirror }
        applyPhase(f.phase)
        syncRunActivity(from: f)
    }

    /// Engine pause → Watch PRIMARY `pause()` / `resume()`. Not the iPhone mirror.
    private func applyPhase(_ phase: String) {
        switch phase {
        case MirrorWire.Phase.paused:
            pausePrimary()
        case MirrorWire.Phase.active, MirrorWire.Phase.gate, MirrorWire.Phase.countIn:
            resumePrimary()
        default:
            break
        }
    }

    func sendCommand(_ kind: String) {
        send(type: MirrorWire.MessageType.command, MirrorCommand(kind: kind))
    }

    private func syncRunActivity(from frame: MirrorStateFrame) {
        guard let session else { return }
        let pieceIsRun = frame.tramo?.modalidad == PrescriptionModality.run.rawValue
        let plan = WatchHKActivityPlan.make(
            pieceIsRun: pieceIsRun,
            dayActivityKind: Self.dayKind(from: session.workoutConfiguration.activityType),
            environment: frame.runEnvironment ?? Self.environment(
                dayType: session.workoutConfiguration.activityType,
                sessionLocation: session.workoutConfiguration.locationType
            )
        )
        applyActivityPlan(plan)
    }

    func syncSoloActivity(_ plan: WatchHKActivityPlan) {
        if let dataSource = builder?.dataSource, plan.collectDistance {
            WatchHKActivityPlan.enableDistanceCollection(on: dataSource)
        }
        guard state == .recording, session != nil else {
            pendingPlan = plan
            return
        }
        applyActivityPlan(plan)
    }

    private func applyActivityPlan(_ plan: WatchHKActivityPlan) {
        guard let session else { return }
        if let dataSource = builder?.dataSource, plan.collectDistance {
            WatchHKActivityPlan.enableDistanceCollection(on: dataSource)
        }
        pendingPlan = nil
        if mode == .solo {
            applySoloActivityPlan(plan, session: session)
        } else if appliedPlan != plan {
            let sessionMatches = session.workoutConfiguration.activityType == plan.activityType
                && session.workoutConfiguration.locationType == plan.locationType
            if plan.isRunPiece {
                if appliedPlan != nil || !sessionMatches {
                    session.beginNewActivity(configuration: plan.configuration, date: Date(), metadata: nil)
                }
            } else if appliedPlan?.isRunPiece == true {
                session.endCurrentActivity(on: Date())
                session.beginNewActivity(configuration: plan.configuration, date: Date(), metadata: nil)
            }
            appliedPlan = plan
        }
        locationGate.apply(wantsGPS: plan.wantsGPS)
    }

    /// Same `beginNewActivity` gate LiveWorkoutSession used for solo.
    private func applySoloActivityPlan(_ plan: WatchHKActivityPlan, session: HKWorkoutSession) {
        if appliedPlan == plan { return }
        let matchesStart = appliedPlan == nil
            && startedPlan?.activityType == plan.activityType
            && startedPlan?.locationType == plan.locationType
        if matchesStart {
            appliedPlan = plan
            return
        }
        if plan.isRunPiece {
            session.beginNewActivity(configuration: plan.configuration, date: Date(), metadata: nil)
        } else if appliedPlan?.isRunPiece == true {
            session.endCurrentActivity(on: Date())
            session.beginNewActivity(configuration: plan.configuration, date: Date(), metadata: nil)
        }
        appliedPlan = plan
    }

    private static func dayKind(from type: HKWorkoutActivityType) -> String? {
        switch type {
        case .running: return "running"
        case .functionalStrengthTraining: return "strength"
        case .mixedCardio: return "mixed"
        default: return nil
        }
    }

    private static func environment(
        dayType: HKWorkoutActivityType,
        sessionLocation: HKWorkoutSessionLocationType
    ) -> RunEnvironment? {
        guard dayType == .running else { return nil }
        return sessionLocation == .indoor ? .indoor : .outdoor
    }

    func relayDistance(_ meters: Double) {
        distanceMeters = meters
        guard let delta = WatchHKActivityPlan.distanceDelta(
            fromCumulative: meters, lastReported: lastReportedDistance
        ) else { return }
        lastReportedDistance = meters
        onDistanceDelta?(delta)
        if mode == .mirror || mode == .orphan {
            send(type: MirrorWire.MessageType.distance, MirrorDistanceSample(deltaMeters: delta))
        }
    }

    func relayHR(_ bpm: Int) {
        onHeartRate?(bpm)
        guard mode == .mirror || mode == .orphan else { return }
        let now = Date()
        guard now.timeIntervalSince(lastHRRelayAt) >= Self.hrRelayMinInterval else { return }
        lastHRRelayAt = now
        send(type: MirrorWire.MessageType.hr, MirrorHRSample(bpm: bpm))
    }

    func send<P: Encodable>(type: String, _ payload: P) {
        guard let session, let data = MirrorEnvelope.encoding(type: type, payload) else { return }
        Task { try? await session.sendToRemoteWorkoutSession(data: data) }
    }

    func applyHR(_ stats: HKStatistics?) {
        guard let q = stats?.mostRecentQuantity() else { return }
        let bpm = Int(q.doubleValue(for: .count().unitDivided(by: .minute())).rounded())
        guard bpm > 0 else { return }
        liveHR = bpm
        relayHR(bpm)
    }

    func applyEnergy(_ stats: HKStatistics?) {
        guard let q = stats?.sumQuantity() else { return }
        activeKcal = q.doubleValue(for: .kilocalorie())
    }
}

// MARK: - HKWorkoutSessionDelegate

extension MirrorSessionController: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didReceiveDataFromRemoteWorkoutSession data: [Data]
    ) {
        Task { @MainActor [weak self] in
            for packet in data { self?.handleRemote(packet) }
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor [weak self] in
            guard let self, toState == .ended, !self.isClosing, self.state == .recording else { return }
            self.resetToIdle()
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didFailWithError error: Error
    ) {
        Task { @MainActor [weak self] in
            guard let self, !self.isClosing else { return }
            self.resetToIdle()
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension MirrorSessionController: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        let hrType = HKQuantityType(.heartRate)
        let kcalType = HKQuantityType(.activeEnergyBurned)
        let distanceType = WatchHKActivityPlan.distanceType
        let hr = collectedTypes.contains(hrType)
        let kcal = collectedTypes.contains(kcalType)
        let distance = collectedTypes.contains(distanceType)
        guard hr || kcal || distance else { return }
        let hrStats = hr ? workoutBuilder.statistics(for: hrType) : nil
        let kcalStats = kcal ? workoutBuilder.statistics(for: kcalType) : nil
        let distStats = distance ? workoutBuilder.statistics(for: distanceType) : nil
        Task { @MainActor [weak self] in
            if hr { self?.applyHR(hrStats) }
            if kcal { self?.applyEnergy(kcalStats) }
            if let q = distStats?.sumQuantity() {
                self?.relayDistance(q.doubleValue(for: .meter()))
            }
        }
    }
}
