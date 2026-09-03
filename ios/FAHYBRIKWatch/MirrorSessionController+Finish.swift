import Foundation
import HealthKit

// One teardown. liveEnd / MirrorEnd / Terminar close this PRIMARY.
extension MirrorSessionController {

    func finish(save: Bool) {
        guard state == .recording, !isClosing else { return }
        state = .ending
        let reason = save ? MirrorWire.EndReason.phone : MirrorWire.EndReason.discarded
        Task { await closeRecording(save: save, reason: reason) }
    }

    /// WCSession `liveEnd`. Same `finish(save:)` as `MirrorEnd` — not a second teardown.
    func finishFromPhone(save: Bool) {
        finish(save: save)
    }

    func finishLocally() {
        finishByAthlete()
    }

    func finishByAthlete() {
        guard state == .recording, !isClosing else { return }
        state = .ending
        Task { await closeRecording(save: true, reason: MirrorWire.EndReason.athlete) }
    }

    func discardLocally() {
        guard state == .recording, !isClosing else { return }
        state = .ending
        Task { await closeRecording(save: false, reason: MirrorWire.EndReason.discarded) }
    }

    /// Solo finalize awaits the saved HKWorkout UUID.
    func endPrimary(save: Bool) async -> String? {
        guard state == .recording, !isClosing else { return nil }
        state = .ending
        return await closeRecording(
            save: save,
            reason: save ? MirrorWire.EndReason.athlete : MirrorWire.EndReason.discarded
        )
    }

    @discardableResult
    func closeRecording(save: Bool, reason: String) async -> String? {
        isClosing = true
        stopWatchdog()

        let now = Date()
        session?.stopActivity(with: now)

        var workoutUuid: String?
        if save {
            workoutUuid = await endAndSave(at: now)
        } else {
            builder?.discardWorkout()
        }
        let endedPacket = MirrorEnvelope.encoding(
            type: MirrorWire.MessageType.ended,
            MirrorEnded(workoutUuid: workoutUuid, reason: reason)
        )
        if let session, let endedPacket {
            try? await session.sendToRemoteWorkoutSession(data: endedPacket)
        }
        session?.end()
        if let session, let endedPacket {
            try? await session.sendToRemoteWorkoutSession(data: endedPacket)
        }

        WatchHaptics.success()
        try? await Task.sleep(for: Self.savedBeat)
        resetToIdle()
        return workoutUuid
    }

    private func endAndSave(at date: Date) async -> String? {
        guard let builder else { return nil }
        do {
            try await builder.endCollection(at: date)
            let workout = try await builder.finishWorkout()
            return workout?.uuid.uuidString
        } catch {
            return nil
        }
    }

    func resetToIdle() {
        stopWatchdog()
        session = nil
        builder = nil
        appliedPlan = nil
        startedPlan = nil
        pendingPlan = nil
        lastReportedDistance = 0
        locationGate.stop()
        frame = nil
        frameReceivedAt = nil
        liveHR = nil
        activeKcal = 0
        distanceMeters = 0
        isConnectionLost = false
        hkPaused = false
        isClosing = false
        mode = .idle
        state = .idle
        if let pending = pendingStartConfiguration {
            pendingStartConfiguration = nil
            let nextMode = pendingStartMode
            pendingStartMode = .mirror
            Task { await beginPrimary(configuration: pending, mode: nextMode) }
        }
    }

    func startWatchdog() {
        stopWatchdog()
        let t = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.checkConnection() }
        }
        RunLoop.main.add(t, forMode: .common)
        watchdog = t
    }

    private func checkConnection() {
        guard state == .recording else { return }
        isConnectionLost = Date().timeIntervalSince(lastSignalAt) > Self.connectionLostAfter
    }

    func stopWatchdog() {
        watchdog?.invalidate()
        watchdog = nil
    }
}
