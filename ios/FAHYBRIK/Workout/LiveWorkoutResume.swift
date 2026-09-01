import Foundation
import Observation
import SwiftUI

/// Process-level owner of a recovered live cover. `workoutLaunch` is `@State`
/// on Inicio/Plan/Free/Tests — nil after process death. On iOS 18 Apple cannot
/// recover the HK session; the coach plan on disk reopens the SAME cover.
@MainActor
@Observable
final class LiveWorkoutResume {
    static let shared = LiveWorkoutResume()

    var cover: RecoveredLiveCover?
    /// Weak so a finished container can deallocate. Used to persist on background
    /// and to skip a second cover while the live is already up.
    @ObservationIgnored private weak var tracked: WorkoutSession?
    /// `.task` and `scenePhase.active` can enter together on cold launch.
    @ObservationIgnored private var isRecovering = false

    private init() {}

    func track(_ session: WorkoutSession) {
        tracked = session
    }

    var hasLiveSession: Bool { cover != nil || tracked != nil }

    func persistTracked() {
        tracked?.persistNow()
        cover?.session.persistNow()
    }

    /// Cold launch AND `scenePhase.active`. Always. No bearer gate. Free included.
    /// Apple recover (iOS 26) is in addition to the disk plan, not instead of it.
    func recoverOnLaunch(hrZones: HRZoneProfile?) async {
        if hasLiveSession || isRecovering { return }
        isRecovering = true
        defer { isRecovering = false }
        _ = await PhoneWorkoutRun.shared.recover()
        guard let saved = await WorkoutStateStore.shared.load(),
              WorkoutRecoveryGate.isFresh(saved) else { return }
        guard LiveWorkoutResumeGate.shouldReopenCoachPlan(
            boundRunUUID: PhoneWorkoutRun.shared.runUUID,
            snapshotUUID: saved.hkSessionUUID
        ) else { return }
        await WorkoutStateStore.shared.open()
        PhoneWorkoutRun.shared.bindRunUUID(saved.hkSessionUUID)
        let session = WorkoutSession(plan: saved.plan, hrZones: hrZones, startedAt: saved.startedAt)
        session.restore(from: saved)
        let kind = WatchConnectivityiOSService.activityKind(from: saved.plan.principalModalityWire)
        if PhoneWorkoutRun.shared.session == nil {
            PhoneWorkoutRun.shared.startIfNeeded(
                activityKind: kind,
                diskOffset: saved.elapsedSeconds,
                startPaused: saved.isPaused || (saved.isAwaitingBlockStart ?? false),
                runUUID: saved.hkSessionUUID
            )
            session.hkSessionUUID = PhoneWorkoutRun.shared.runUUID ?? saved.hkSessionUUID
        } else {
            PhoneWorkoutRun.shared.adoptDiskElapsed(saved.elapsedSeconds, isPaused: saved.isPaused)
            if saved.isPaused || (saved.isAwaitingBlockStart ?? false) {
                PhoneWorkoutRun.shared.pause()
            } else {
                PhoneWorkoutRun.shared.resume()
            }
        }
        session.isFreeRun = saved.isFree == true || saved.assignmentId == nil
        track(session)
        cover = RecoveredLiveCover(
            session: session,
            assignmentId: saved.assignmentId,
            title: saved.freeTitle ?? saved.plan.name,
            isFree: session.isFreeRun,
            freeModalityWire: saved.freeModalityWire,
            freeItemsJSON: saved.freeItemsJSON
        )
    }

    func dismiss() {
        cover = nil
        tracked = nil
    }
}

/// Apple has no `HKWorkoutSession` uuid. Reopen unless this process already
/// bound a different hang-off than the snapshot (26 recover vs leftover plan).
enum LiveWorkoutResumeGate {
    static func shouldReopenCoachPlan(boundRunUUID: UUID?, snapshotUUID: UUID?) -> Bool {
        guard let bound = boundRunUUID, let snap = snapshotUUID else { return true }
        return bound == snap
    }
}

struct RecoveredLiveCover: Identifiable {
    var id: String {
        assignmentId ?? session.plan.id.uuidString
    }
    let session: WorkoutSession
    let assignmentId: String?
    let title: String?
    let isFree: Bool
    let freeModalityWire: String?
    let freeItemsJSON: Data?

    var freeContext: FreeWorkoutContext? {
        guard isFree else { return nil }
        let items: [FreeWorkoutItemPayload]? = freeItemsJSON.flatMap {
            try? JSONDecoder().decode([FreeWorkoutItemPayload].self, from: $0)
        }
        return FreeWorkoutContext(
            title: title ?? session.plan.name,
            modalityWire: freeModalityWire ?? session.plan.principalModalityWire,
            prescription: session.plan.segments.first?.prescription,
            items: items,
            plan: session.plan,
            runEnvironment: session.runEnvironment
        )
    }
}
