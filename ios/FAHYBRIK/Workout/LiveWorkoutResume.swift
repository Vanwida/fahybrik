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
    /// `.task`, `scenePhase.active` and an adopt from the mirroring handler can
    /// enter together — passes run one after another, never interleaved.
    @ObservationIgnored private var recovering: Task<Void, Never>?
    /// Last zones a caller handed us — an adopt-driven reopen (FH-56) has no
    /// identity store at hand and reuses them.
    @ObservationIgnored private(set) var lastKnownHRZones: HRZoneProfile?

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

    /// Cold launch AND `scenePhase.active` AND adopt-without-engine. Always. No
    /// bearer gate. Free included. Apple recover (iOS 26) is in addition to the
    /// disk plan, not instead of it. Serialized: a second caller waits for the
    /// pass in flight and then runs its own (cheap when nothing is left to do).
    func recoverOnLaunch(hrZones: HRZoneProfile?) async {
        if let hrZones { lastKnownHRZones = hrZones }
        if let running = recovering { await running.value }
        let pass = Task { await self.performRecover(hrZones: hrZones ?? lastKnownHRZones) }
        recovering = pass
        await pass.value
        if recovering == pass { recovering = nil }
    }

    private func performRecover(hrZones: HRZoneProfile?) async {
        await PhoneLiveSession.shared.recoverMirroredSessionIfNeeded()
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
        let saved = await WorkoutStateStore.shared.load()
        let fresh = saved.map { WorkoutRecoveryGate.isFresh($0) } ?? false
        switch PhoneWatchRuntimeReconcile.phoneAction(
            hasLiveCoverOrTracked: hasLiveSession,
            wristClaimsActive: PhoneLiveSession.shared.hasMirroredHKSession,
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

    /// Idempotent bilateral teardown when the phone has no UI owner. SAVING:
    /// the wrist recording is the athlete's, the phone never discards it (FH-56).
    @MainActor
    func endWristSessionCleanly() async {
        PhoneLiveSession.shared.end(save: true)
        await WorkoutStateStore.shared.close()
        dismissFully()
    }

    private func reopenFreshSnapshotIfNeeded(hrZones: HRZoneProfile?) async {
        guard cover == nil, parkedCover == nil else { return }
        guard let saved = await WorkoutStateStore.shared.load(),
              WorkoutRecoveryGate.isFresh(saved) else { return }
        await WorkoutStateStore.shared.open()
        let session = WorkoutSession(plan: saved.plan, hrZones: hrZones, startedAt: saved.startedAt)
        session.restore(from: saved)
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

    /// Drop the live chrome only. After FH-111 ✕ minimize, `parkedCover` holds the
    /// ACTIVE session — AppShell `onClose` must not wipe it (Devil's Advocate P0).
    func dismiss() {
        cover = nil
        tracked = nil
        guard !isUIMinimized else { return }
        parkedCover = nil
    }

    /// Finish, discard, conflict terminate, wrist cleanup — full teardown.
    func dismissFully() {
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
