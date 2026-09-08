import Foundation

/// Borrado compartido de sesiones libre del atleta (`origin = self`).
enum FreeSessionDelete {
    static func perform(assignmentId: String, bearer: String) async throws {
        guard let id = Int(assignmentId) else { return }
        try await PlanService.deleteFreeSession(assignmentId: id, bearer: bearer)
        CompletedAssignmentsStore.unmark(assignmentId)
        AssignmentDetailCache.remove(assignmentId)
    }
}
