import Foundation

// UN ENTRENO HECHO, ABIERTO POR SU EJECUCIÓN — `GET /api/athlete/executions/{id}/detail`
// (DECISIONS 2026-09-28, «los lectores»).
//
// Misma respuesta que el detalle por asignación con tres diferencias: `assignment` es
// null cuando la ejecución no tiene asignación (una importación de Salud que no casó
// con el plan, un entreno guardado «fuera del plan»), y entonces `workout` también;
// y arriba vienen `execution_id` y `off_plan_reason`.
//
// Por qué un tipo aparte y no `AssignmentDetail` con la asignación opcional: esa
// asignación la leen el vivo, el reloj y la caché como obligatoria, y relajarla ahí
// obligaría a desenvolverla en sitios que nunca verán una ejecución suelta. Lo que
// comparten los dos es lo que se LEE de un entreno hecho, y eso es el protocolo de
// abajo.

struct ExecutionDetail: Decodable, Equatable {
    let executionId: String
    let offPlanReason: String?
    let assignment: AssignmentInfo?
    let workout: WorkoutDetail?
    let execution: ExecutionSummary?
    let runCompliance: RunCompliance?
}

/// Lo que las lecturas de un entreno hecho (sesión y carrera) necesitan saber, venga
/// de la asignación o de la ejecución.
protocol DetalleDeEntrenoHecho {
    var workout: WorkoutDetail? { get }
    var execution: ExecutionSummary? { get }
    var runCompliance: RunCompliance? { get }
    /// YYYY-MM-DD del día del entreno. Nil = no se sabe, y entonces la cabecera no
    /// dice cuándo (nunca «hoy» por defecto).
    var fechaISO: String? { get }
}

extension AssignmentDetail: DetalleDeEntrenoHecho {
    var fechaISO: String? { assignment.scheduledFor }
}

extension ExecutionDetail: DetalleDeEntrenoHecho {
    /// El día del plan si lo hay; si no, el día (del móvil) en que empezó o acabó.
    var fechaISO: String? {
        if let dia = assignment?.scheduledFor { return dia }
        let instante = (execution?.startedAt).flatMap(ISO8601DateFormatters.parse)
            ?? (execution?.endedAt).flatMap(ISO8601DateFormatters.parse)
        return instante.map(FechaES.iso)
    }
}
