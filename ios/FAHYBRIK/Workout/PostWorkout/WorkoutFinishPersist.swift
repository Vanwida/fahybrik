import Foundation

// Finish no miente. El atleta solo oye «guardado» cuando el POST dejó fila
// (`workout_executions` + notes). Encolar para más tarde, un 4xx o un silencio
// no es persistir: se queda en el resumen y reintenta.
enum WorkoutFinishPersist {
    enum Decision: Equatable {
        case dismissSaved(executionId: String?)
        case showRetry
    }

    static let retryMessage = "No se ha guardado. Reintenta."
    static let notesLimit = 4000

    static func decide(_ submission: ExecutionSubmission) -> Decision {
        if submission.persisted {
            return .dismissSaved(executionId: submission.response?.executionId)
        }
        return .showRetry
    }

    /// Lo que viaja a `workout_executions.notes`. Vacío no se manda; el techo
    /// es el del schema (4000) para que una nota larga no tumbe el POST entero.
    static func notesOnWire(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return String(trimmed.prefix(notesLimit))
    }
}
