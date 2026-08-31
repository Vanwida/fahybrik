import Foundation
import Observation
import SwiftUI

// Process-level owner of a recovered live cover. `workoutLaunch` is `@State` on
// Inicio/Plan/Free/Tests — nil after process death. Apple's session survives;
// this presenter reopens the SAME cover so we do not birth an empty session.
@MainActor
@Observable
final class LiveWorkoutResume {
    static let shared = LiveWorkoutResume()

    var cover: RecoveredLiveCover?

    private init() {}

    /// Cold launch: `recoverActiveWorkoutSession`. If Apple has a session, reattach.
    /// A matching coach snapshot reopens the SAME cover — never an empty one, never
    /// `armBlock` (restore already armed). Free / ad-hoc resume too. A fresh
    /// snapshot without a recovered HK object still resumes the coach plan so
    /// process death does not birth an empty session (startIfNeeded is then the
    /// only create, and it no-ops if recover already attached).
    func recoverOnLaunch(hrZones: HRZoneProfile?) async {
        guard cover == nil else { return }
        _ = await PhoneWorkoutRun.shared.recover()
        guard let saved = await WorkoutStateStore.shared.load(),
              WorkoutRecoveryGate.isFresh(saved) else { return }
        if let appleUUID = PhoneWorkoutRun.shared.runUUID,
           let snapUUID = saved.hkSessionUUID,
           appleUUID != snapUUID {
            return
        }
        await WorkoutStateStore.shared.open()
        let session = WorkoutSession(plan: saved.plan, hrZones: hrZones, startedAt: saved.startedAt)
        session.restore(from: saved)
        session.phoneActivityKind = WatchConnectivityiOSService.activityKind(
            from: saved.plan.principalModalityWire
        )
        session.isFreeRun = saved.isFree || saved.assignmentId == nil
        if saved.isPaused { PhoneWorkoutRun.shared.pause() } else { PhoneWorkoutRun.shared.resume() }
        cover = RecoveredLiveCover(
            session: session,
            assignmentId: saved.assignmentId,
            title: saved.plan.name,
            isFree: session.isFreeRun
        )
    }

    func dismiss() { cover = nil }
}

struct RecoveredLiveCover: Identifiable {
    var id: String {
        assignmentId ?? session.plan.id.uuidString
    }
    let session: WorkoutSession
    let assignmentId: String?
    let title: String?
    let isFree: Bool

    /// Enough to save a resumed free session through the existing free path.
    var freeContext: FreeWorkoutContext? {
        guard isFree else { return nil }
        return FreeWorkoutContext(
            title: title ?? session.plan.name,
            modalityWire: session.plan.principalModalityWire,
            prescription: session.plan.segments.first?.prescription,
            items: nil,
            plan: session.plan,
            runEnvironment: session.runEnvironment
        )
    }
}
