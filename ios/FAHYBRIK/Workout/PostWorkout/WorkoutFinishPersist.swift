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

    /// CUÁNDO ACABÓ EL ENTRENO. El sello del motor si lo hay; si no —un registro a
    /// mano, donde ningún reloj llegó a correr— el instante de guardarlo.
    ///
    /// Existe porque el 20-ago el guardado estuvo roto y el atleta se quedó horas en
    /// la pantalla de resumen dándole a reintentar: el entreno acabó a las 12:36 y se
    /// archivó como si hubiera terminado a las 16:35, casi cinco horas de ventana
    /// para 47 minutos de trabajo. La hora de fin no puede depender de cuándo la red
    /// deja pasar.
    static func endedAt(finishedAt: Date?, now: Date) -> Date {
        finishedAt ?? now
    }

    /// Lo que viaja a `workout_executions.notes`. Vacío no se manda; el techo
    /// es el del schema (4000) para que una nota larga no tumbe el POST entero.
    static func notesOnWire(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return String(trimmed.prefix(notesLimit))
    }
}
