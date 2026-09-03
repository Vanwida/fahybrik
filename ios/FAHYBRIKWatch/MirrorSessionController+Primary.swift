import Foundation
import HealthKit

// Create / adopt / recover / pause. One PRIMARY. `adopt` never calls `startActivity`.
extension MirrorSessionController {

    /// Apple `recoverActiveWorkoutSession` — same path from launch and crash recovery.
    func recoverActiveIfNeeded() {
        guard state == .idle, session == nil else { return }
        store.recoverActiveWorkoutSession { [weak self] incoming, _ in
            guard let incoming else { return }
            Task { @MainActor in
                guard let self, self.state == .idle, self.session == nil else { return }
                self.adopt(incoming, mode: .orphan)
            }
        }
    }

    /// Apple `handle(_:)` after `startWatchApp`: create the PRIMARY, mirror it.
    func startPrimary(configuration: HKWorkoutConfiguration) {
        guard WatchWorkoutCoordinator.shared.phase == .idle else {
            Self.log.warning("startPrimary declined — standalone live")
            return
        }
        queueOrBegin(configuration, mode: .mirror)
    }

    func start(config: HKWorkoutConfiguration) {
        startPrimary(configuration: config)
    }

    /// Coordinator asks this owner for the PRIMARY. Mirror is best-effort.
    func startSolo(configuration: HKWorkoutConfiguration, reuseIfPresent: Bool) {
        if reuseIfPresent, state == .recording, session != nil {
            mode = .solo
            if let pending = pendingPlan { syncSoloActivity(pending) }
            return
        }
        queueOrBegin(configuration, mode: .solo)
    }

    private func queueOrBegin(_ configuration: HKWorkoutConfiguration, mode: Mode) {
        if state != .idle {
            Self.log.warning("PRIMARY leftover state=\(String(describing: self.state), privacy: .public) — finishing then starting")
            pendingStartConfiguration = configuration
            pendingStartMode = mode
            if state == .recording { finish(save: true) }
            return
        }
        Task { await beginPrimary(configuration: configuration, mode: mode) }
    }

    func beginPrimary(configuration: HKWorkoutConfiguration, mode: Mode) async {
        guard state == .idle else { return }
        if mode == .mirror, WatchWorkoutCoordinator.shared.phase != .idle { return }
        await LiveWorkoutSession.requestWorkoutAuthorization(store: store)
        guard state == .idle else { return }
        if mode == .mirror, WatchWorkoutCoordinator.shared.phase != .idle { return }
        do {
            let created = try HKWorkoutSession(healthStore: store, configuration: configuration)
            attach(created, mode: mode, configuration: configuration)
            do {
                try await created.startMirroringToCompanionDevice()
            } catch {
                // Phone unreachable; the primary still records on the wrist.
            }
            let start = Date()
            created.startActivity(with: start)
            await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                builder?.beginCollection(withStart: start) { _, _ in
                    cont.resume()
                }
            }
            lastSignalAt = start
            if let pending = pendingPlan { syncSoloActivity(pending) }
            armAfterAttach(mode: mode)
            if mode == .mirror { WatchHaptics.start() }
        } catch {
            resetToIdle()
        }
    }

    /// Session Apple already has running. Do not `startActivity`.
    func adopt(_ incoming: HKWorkoutSession, mode: Mode = .orphan) {
        guard state == .idle, session == nil else { return }
        if mode == .mirror, WatchWorkoutCoordinator.shared.phase != .idle { return }
        attach(incoming, mode: mode, configuration: incoming.workoutConfiguration)
        lastSignalAt = Date()
        armAfterAttach(mode: mode)
        WatchHaptics.start()
    }

    private func attach(
        _ incoming: HKWorkoutSession,
        mode: Mode,
        configuration: HKWorkoutConfiguration
    ) {
        self.mode = mode
        state = .recording
        frame = nil
        frameReceivedAt = nil
        liveHR = nil
        activeKcal = 0
        distanceMeters = 0
        isConnectionLost = false
        hkPaused = false
        isClosing = false
        session = incoming
        incoming.delegate = self
        let liveBuilder = incoming.associatedWorkoutBuilder()
        let dataSource = HKLiveWorkoutDataSource(
            healthStore: store,
            workoutConfiguration: configuration
        )
        WatchHKActivityPlan.enableDistanceCollection(on: dataSource)
        liveBuilder.dataSource = dataSource
        liveBuilder.delegate = self
        builder = liveBuilder
        startedPlan = WatchHKActivityPlan(
            isRunPiece: configuration.activityType == .running,
            activityType: configuration.activityType,
            locationType: configuration.locationType,
            wantsGPS: configuration.activityType == .running && configuration.locationType == .outdoor,
            collectDistance: configuration.activityType == .running
        )
        appliedPlan = startedPlan
    }

    private func armAfterAttach(mode: Mode) {
        if mode == .mirror || mode == .orphan {
            startWatchdog()
            requestSyncUntilFirstFrame()
        }
    }

    func pausePrimary() {
        guard state == .recording, !hkPaused else { return }
        session?.pause()
        hkPaused = true
    }

    func resumePrimary() {
        guard state == .recording, hkPaused else { return }
        session?.resume()
        hkPaused = false
    }

    func requestSyncUntilFirstFrame() {
        for delay in [0.5, 2.0, 5.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self, self.state == .recording, self.frame == nil else { return }
                self.sendCommand(MirrorWire.CommandKind.sync)
            }
        }
    }
}
