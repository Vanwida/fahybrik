import Foundation

// QUÉ PUEDE CORRER LA MUÑECA SOLA CON LO QUE TIENE DE LA SESIÓN DEL COACH (28-sep).
//
// El detalle de la sesión viaja del iPhone al reloj dentro del contexto de
// WatchConnectivity (`WatchTodayPayload.detailJson`). Cuando pasaba de 60 KB, o el
// móvil no lo tenía en caché, llegaba solo el título, y «Empezar» corría
// `WorkoutPlan.minimal`: un tramo «Sesión» que al terminar se guardaba contra la
// asignación del coach como HECHA y con el tiempo de la sesión como marca. El móvil
// ya había retirado ese plan falso para una asignación real (`WorkoutContainer`,
// «fallar honesto»); la muñeca no.
//
// Ahora:
//   · el detalle que no cabe en el contexto viaja como FICHERO (`transferFile`) y el
//     reloj lo pide si le falta (`WatchWireKeys.detailRequest`);
//   · sin detalle la muñeca NO empieza nada contra la asignación: dice que espera la
//     sesión del iPhone. Jamás un plan de solo título contra una sesión del coach;
//   · un test de salto (cámara del iPhone) o una sesión sin cuerpo se dicen como
//     tales, en vez de correr «Sesión».
//
// Puro a propósito: los tests del iPhone lo prueban sin WatchConnectivity.

/// Lo que la muñeca hace con la sesión de hoy.
enum WatchSessionPlan {
    /// El plan del coach, construido de su detalle: se puede empezar.
    case run(WorkoutPlan)
    /// Falta el detalle: se pide al iPhone y no se empieza nada.
    case needsDetail
    /// El detalle está, pero en la muñeca no hay entreno que correr.
    case phoneOnly(PhoneOnlyReason)

    enum PhoneOnlyReason: Equatable {
        /// Un test de salto se hace con la cámara del iPhone (igual que en el móvil,
        /// donde el test de salto manda sobre los bloques que traiga).
        case jumpTest
        /// Sin bloques que correr (sin cuerpo, o un cuerpo vacío).
        case noBody
    }

    static func resolve(detail: AssignmentDetail?) -> WatchSessionPlan {
        guard let detail else { return .needsDetail }
        if detail.isJumpVideo { return .phoneOnly(.jumpTest) }
        guard let plan = WorkoutPlan.from(detail: detail) else { return .phoneOnly(.noBody) }
        return .run(plan)
    }

    /// El plan que se puede empezar, si lo hay.
    var runnable: WorkoutPlan? {
        if case .run(let plan) = self { return plan }
        return nil
    }
}

/// De dónde sale el detalle del día en la muñeca, y cuándo hay que pedirlo.
enum WatchDayDetail {
    /// El que vino en el contexto manda. Si no vino (no cabía), el que llegó por
    /// fichero para ESA asignación; uno de otra asignación no vale.
    static func pick(
        assignmentId: String?,
        fromContext: AssignmentDetail?,
        fromFile: (assignmentId: String, detail: AssignmentDetail)?
    ) -> AssignmentDetail? {
        if let fromContext { return fromContext }
        guard let assignmentId, let fromFile, fromFile.assignmentId == assignmentId else { return nil }
        return fromFile.detail
    }

    /// La asignación cuyo detalle hay que pedir al iPhone: un día de sesión por
    /// hacer sin detalle. Nil si no hay nada que pedir (descanso, hecha, ya está).
    static func toRequest(today: WatchTodayPayload?, detail: AssignmentDetail?) -> String? {
        guard detail == nil, let today,
              today.dayKind == WatchDayKind.session, !today.isDone,
              let id = today.assignmentId, !id.isEmpty else { return nil }
        return id
    }
}
