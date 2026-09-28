import Foundation

extension WatchWorkoutCoordinator {
    /// Lo que la muñeca puede hacer con la sesión de hoy (`WatchSessionPlan`): correr
    /// el plan del coach, esperar su detalle o decir que se hace en el iPhone. Nunca un
    /// plan de solo título contra la asignación.
    func sessionPlan(for detail: AssignmentDetail?) -> WatchSessionPlan {
        WatchSessionPlan.resolve(detail: detail)
    }

    func previewPlan(for detail: AssignmentDetail?) -> WorkoutPlan? {
        sessionPlan(for: detail).runnable
    }

    static func hrZones(from payload: WatchTodayPayload) -> HRZoneProfile? {
        payload.athleteHrZones
    }

    /// Reanudar no necesita el detalle: la foto trae su propio plan. Casa con la
    /// sesión de hoy por nombre (el del plan del coach, o el título empujado).
    func restorableSnapshot(payload: WatchTodayPayload, detail: AssignmentDetail?) async -> PersistedWorkoutState? {
        guard payload.dayKind == WatchDayKind.session,
              let saved = await WorkoutStateStore.shared.load(),
              !saved.plan.id.uuidString.isEmpty,
              Date().timeIntervalSince(saved.savedAt) < Self.snapshotFreshnessWindow,
              saved.plan.name == (previewPlan(for: detail)?.name ?? payload.title) else { return nil }
        return saved
    }
}
