import Foundation

extension WatchWorkoutCoordinator {
    func previewPlan(for detail: AssignmentDetail?) -> WorkoutPlan? {
        detail.flatMap { WorkoutPlan.from(detail: $0) }
    }

    func runnablePlan(payload: WatchTodayPayload, detail: AssignmentDetail?) -> WorkoutPlan {
        previewPlan(for: detail) ?? WorkoutPlan.minimal(title: payload.title)
    }

    static func hrZones(from payload: WatchTodayPayload) -> HRZoneProfile? {
        payload.athleteHrZones
    }

    func restorableSnapshot(payload: WatchTodayPayload, detail: AssignmentDetail?) async -> PersistedWorkoutState? {
        guard payload.dayKind == WatchDayKind.session,
              let saved = await WorkoutStateStore.shared.load(),
              !saved.plan.id.uuidString.isEmpty,
              Date().timeIntervalSince(saved.savedAt) < Self.snapshotFreshnessWindow,
              saved.plan.name == runnablePlan(payload: payload, detail: detail).name else { return nil }
        return saved
    }
}
