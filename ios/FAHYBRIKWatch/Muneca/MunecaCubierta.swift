import Foundation

// ¿PINTA LA CARA NUEVA ESTE BLOQUE? — para el reloj en solitario, que elige cara en cada
// latido de la sesión y no puede construir el plan entero cada vez.
//
// La regla es UNA, la de `Vivo.familiaMuneca` (todo salvo la lista de movilidad). Aquí solo se le da lo que
// necesita —los pasos del segmento en curso— y se guarda la respuesta por sesión, segmento y
// entorno: el plan de un segmento no cambia mientras dura el entreno.

@MainActor
enum MunecaCubierta {

    private static var respuestas: [String: Bool] = [:]

    static func cubre(_ session: WorkoutSession) -> Bool {
        let s = session.currentSegmentIndex
        let clave = "\(session.plan.id)|\(s)|\(session.runEnvironment?.rawValue ?? "-")"
        if let r = respuestas[clave] { return r }
        guard session.plan.segments.indices.contains(s) else { return false }
        let pasos = Vivo.pasosDelPlan(session.plan.segments[s], indice: s, entorno: session.runEnvironment)
        let i = pasos.firstIndex { $0.rol == .trabajo } ?? 0
        let r = !pasos.isEmpty && Vivo.cubreLaMuneca(pasos, i)
        respuestas[clave] = r
        return r
    }
}
