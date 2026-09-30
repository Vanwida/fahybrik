import Foundation

// LA LECTURA DE LO DE HOY, PARA LA ESFERA Y EL SMART STACK — función pura (P13).
//
// Del día que empuja el iPhone (`WatchTodayPayload`) y del detalle del coach (el mismo
// `AssignmentDetail` que construye el plan de la muñeca) a `ComplicacionHoy`: las líneas
// que se pintan fuera de la app. Espejo de `hoyDe` del kit del doble
// (`web/components/design-twin/kit-reloj/estructura.ts`, escenarios `esfera` y
// `smart-stack` de `reloj-antes-despues`), pero leyendo de `EntradaBrief`: el objetivo
// se escribe con LA notación del brief («a 3:45–3:55», «r 90″ suave») y no con una
// segunda, así que lo que dice la esfera es lo que se lee al tocarla.
//
//   «Hoy · desde 55 min» / «6 × 1000 m» / «a 3:45–3:55 · r 90″ suave» / la tira.
//
// NO se inventa: sin detalle del plan no hay titular de bloque (sale el título de la
// sesión) ni forma; sin duración escrita no hay «desde N min»; de mañana no se dice nada
// porque el día que llega solo es el de hoy. Compila en la app del reloj y en las pruebas
// (no en la extensión, que solo pinta el resultado).
enum ComplicacionLectura {

    /// Lo de hoy. `dia` es la clave del día en que se escribe (`ComplicacionHoy.claveDeDia`).
    static func leer(hoy payload: WatchTodayPayload?, detalle: AssignmentDetail?, dia: String) -> ComplicacionHoy {
        leer(hoy: payload, plan: WatchSessionPlan.resolve(detail: detalle).runnable, dia: dia)
    }

    /// Lo mismo con el plan ya construido (`nil` = no se puede correr o falta el detalle).
    static func leer(hoy payload: WatchTodayPayload?, plan: WorkoutPlan?, dia: String) -> ComplicacionHoy {
        guard let payload else { return .sinPlan(dia: dia) }
        let acento = payload.clubAccent?.fill

        if payload.dayKind == WatchDayKind.rest {
            return ComplicacionHoy(estado: .descanso, dia: dia, contexto: "Hoy", titulo: "Descanso",
                                   icono: .descanso, acento: acento)
        }

        let nombre = nombreDeSesion(payload)

        if payload.isDone {
            let parcial = payload.doneCompleteness == WorkoutCompleteness.partial.rawValue
            return ComplicacionHoy(
                estado: .hecha, dia: dia, contexto: "Hoy · hecha", titulo: nombre,
                detalle: [parcial ? "Sesión parcial registrada" : "Sesión completada"],
                forma: plan.map(forma) ?? [], icono: .hecha, acento: acento, parcial: parcial)
        }

        let contexto = EntradaBrief.contexto(minutos: payload.estDurationMinutes).joined(separator: " · ")
        let principal = plan.flatMap { filaPrincipal(EntradaBrief.filas($0)) }
        return ComplicacionHoy(
            estado: .sesion, dia: dia, contexto: contexto,
            titulo: principal?.titular ?? nombre,
            detalle: principal.map { ([$0.objetivo] + $0.partes).compactMap { $0 } } ?? [],
            forma: plan.map(forma) ?? [], icono: icono(payload.activityKind), acento: acento)
    }

    // MARK: - El bloque que da nombre a la sesión

    /// La fila que da nombre a la sesión: la serie repetida de la parte principal («6 × 1000 m»);
    /// si no hay serie, lo primero de la parte principal; si el plan no tiene parte principal
    /// (solo calentar), lo primero que haya. Espejo de `grupoPrincipal` del kit.
    static func filaPrincipal(_ filas: [EntradaFila]) -> EntradaFila? {
        filas.first { $0.esTrabajo && $0.esSerie } ?? filas.first { $0.esTrabajo } ?? filas.first
    }

    // MARK: - La forma: el aro desenrollado

    /// Un arco por paso del plan, el trabajo de la parte principal aparte (`Vivo.arcosDePlan`:
    /// el mismo reparto que el aro del vivo). Los arcos vecinos del mismo tipo se juntan: la
    /// tira dice «trabajo / lo demás» y en una ristra de ciento veinte pasos no cabría uno a uno.
    static func forma(_ plan: WorkoutPlan) -> [ComplicacionHoy.Arco] {
        var out: [ComplicacionHoy.Arco] = []
        for arco in Vivo.arcosDePlan(Vivo.planDe(plan, zonas: nil, entorno: nil).pasos) where arco.peso > 0 {
            if let ultimo = out.last, ultimo.trabajo == arco.trabajo {
                out[out.count - 1] = ComplicacionHoy.Arco(peso: ultimo.peso + arco.peso, trabajo: arco.trabajo)
            } else {
                out.append(ComplicacionHoy.Arco(peso: arco.peso, trabajo: arco.trabajo))
            }
        }
        return out
    }

    // MARK: - Piezas

    private static func nombreDeSesion(_ payload: WatchTodayPayload) -> String {
        let t = payload.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return t.isEmpty ? "Sesión" : t
    }

    /// El icono por la modalidad del día (`activityKind`): correr, fuerza y lo demás junto.
    private static func icono(_ activityKind: String?) -> ComplicacionHoy.Icono {
        switch activityKind {
        case "running":  return .correr
        case "strength": return .fuerza
        default:         return .mixto
        }
    }
}
