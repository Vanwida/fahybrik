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
    /// Strong hold while the live UI is dismissed but the engine stays running
    /// (FH-111 minimize / ✕). Keeps `WorkoutSession` + `PhoneLiveSession.engine`
    /// alive until reopen or finish/discard.
    private(set) var parkedCover: RecoveredLiveCover?
    /// Weak while the cover is on screen — `parkedCover` owns after minimize.
    @ObservationIgnored private weak var tracked: WorkoutSession?
    /// `.task` and `scenePhase.active` can enter together on cold launch.
    @ObservationIgnored private var isRecovering = false

    private init() {}

    func track(_ session: WorkoutSession) {
        tracked = session
    }

    /// True when the athlete minimized live chrome (✕) — UI gone, session ACTIVE.
    var isUIMinimized: Bool { parkedCover != nil && cover == nil }

    var hasLiveSession: Bool { cover != nil || parkedCover != nil || tracked != nil }

    func persistTracked() {
        tracked?.persistNow()
        cover?.session.persistNow()
        parkedCover?.session.persistNow()
    }

    /// Cold launch AND `scenePhase.active`. Always. No bearer gate. Free included.
    /// Apple recover (iOS 26) is in addition to the disk plan, not instead of it.
    func recoverOnLaunch(hrZones: HRZoneProfile?) async {
        if isRecovering { return }
        isRecovering = true
        defer { isRecovering = false }
        _ = await PhoneWorkoutRun.shared.recover()
        presentParkedCoverIfNeeded()
        if !hasLiveSession {
            await reopenFreshSnapshotIfNeeded(hrZones: hrZones)
        }
        await reconcilePhoneWatchAsymmetry(hrZones: hrZones)
    }

    /// Phone ↔ Watch asymmetry: wrist recording without a live phone owner.
    func reconcilePhoneWatchAsymmetry(hrZones: HRZoneProfile?) async {
        if PhoneLiveSession.shared.wristFinishedByAthlete {
            await handleWristAthleteFinishWhenBackgrounded(hrZones: hrZones)
            return
        }
        let mirror = PhoneLiveSession.shared
        let wristActive = PhoneWatchRuntimeReconcile.wristClaimsActiveSession(
            mirrorJoined: mirror.wristJoined,
            hasMirroredHKSession: mirror.hasMirroredHKSession,
            phoneRunSessionActive: PhoneWorkoutRun.shared.session != nil
        )
        let saved = await WorkoutStateStore.shared.load()
        let fresh = saved.map { WorkoutRecoveryGate.isFresh($0) } ?? false
        switch PhoneWatchRuntimeReconcile.phoneAction(
            hasLiveCoverOrTracked: hasLiveSession,
            wristClaimsActive: wristActive,
            hasFreshSnapshot: fresh
        ) {
        case .none:
            return
        case .reopenFromSnapshot:
            guard !hasLiveSession else { return }
            await reopenFreshSnapshotIfNeeded(hrZones: hrZones)
        case .endWristCleanly:
            await endWristSessionCleanly()
        }
    }

    /// Wrist Terminar while the phone cover is gone — reopen from disk so the
    /// bilateral finish can complete through WorkoutContainer.
    func handleWristAthleteFinishWhenBackgrounded(hrZones: HRZoneProfile?) async {
        guard PhoneLiveSession.shared.wristFinishedByAthlete else { return }
        if cover != nil { return }
        if let parked = parkedCover, !parked.session.isFinished {
            presentParkedCoverIfNeeded()
            parked.session.finish(completeness: .partial)
            return
        }
        if let tracked, !tracked.isFinished {
            tracked.finish(completeness: .partial)
        }
        await reopenFreshSnapshotIfNeeded(hrZones: hrZones)
    }

    /// Idempotent bilateral teardown when the phone has no UI owner.
    @MainActor
    func endWristSessionCleanly() async {
        PhoneLiveSession.shared.end(save: false)
        WatchConnectivityiOSService.shared.endLiveWorkout(save: false)
        PhoneWorkoutRun.shared.end()
        await WorkoutStateStore.shared.close()
        dismiss()
    }

    private func reopenFreshSnapshotIfNeeded(hrZones: HRZoneProfile?) async {
        guard cover == nil, parkedCover == nil else { return }
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
                runUUID: saved.hkSessionUUID,
                environment: saved.runEnvironment
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
            freeItemsJSON: saved.freeItemsJSON,
            mirrorActivityKind: WatchConnectivityiOSService.activityKind(
                from: saved.freeModalityWire ?? saved.plan.principalModalityWire
            )
        )
    }

    func dismiss() {
        cover = nil
        parkedCover = nil
        tracked = nil
    }

    /// FH-111 — ✕ minimize: dismiss live chrome, keep the SAME engine + HK mirror.
    func minimizeUI(parked: RecoveredLiveCover) {
        parkedCover = parked
        cover = nil
        tracked = nil
        PhoneLiveSession.shared.kickFrame()
    }

    /// Re-present the live cover for a parked session (Plan banner / foreground).
    func presentParkedCoverIfNeeded() {
        guard cover == nil, let parked = parkedCover else { return }
        cover = parked
        parkedCover = nil
        tracked = parked.session
        PhoneLiveSession.shared.begin(
            session: parked.session,
            activityKind: parked.mirrorActivityKind
        )
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
    /// Watch PRIMARY vocabulary (`running` | `strength` | `hyrox` | `mixed`).
    let mirrorActivityKind: String

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
