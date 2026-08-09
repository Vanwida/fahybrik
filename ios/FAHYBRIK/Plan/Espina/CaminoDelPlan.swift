import Foundation

// EL CAMINO DEL PLAN — por dónde va a pasar el atleta en las próximas semanas.
//
// El espejo Swift de `shared/domain/plan-path.ts`. Llega dentro de una sección
// de nota, pero NO es del comunicado: es del PLAN, y las mismas piezas son las
// que dibujan la espina en la vista de un ciclo.
//
// UN TRAMO NO ES UNA SEMANA. Son las semanas SEGUIDAS que ocupa un microciclo
// del coach: doce nodos repitiendo el mismo nombre no son la estructura del
// plan, son doce filas de ruido. Dónde está hoy se dice DENTRO del tramo
// (`currentWeek`), que sitúa mejor que un nodo aparte.
//
// NO HAY CATÁLOGO DE FASES, y eso es una decisión y no un hueco: la identidad
// de un microciclo es su NOMBRE y el ORDEN de los microciclos ES la
// periodización. Por eso el título de un tramo es el que le puso el coach, sin
// interpretar: si él lo llama «Descarga», se lee «Descarga».
//
// El COLOR sale de la POSICIÓN y no de ningún vocabulario de entrenador. El
// servidor ya lo deriva y lo manda en `tone`; aquí sólo se vuelve a derivar
// cuando no llega, con la misma regla, para que nadie pinte dos escalas
// distintas del mismo plan.

/// Un tramo del camino: las semanas seguidas de UN microciclo del coach.
struct TramoDelPlan: Codable, Equatable {
    /// Su sitio en el plan (0-based). Es lo que decide el tono.
    let position: Int
    /// Índice de su primera semana dentro del plan entero (1-based).
    let firstWeek: Int
    let weekCount: Int
    /// Ya rotulado como se lee: «S1» o «S2-S5». Lo rotula el servidor para que
    /// las dos superficies no puedan escribir la misma semana de dos maneras.
    let weeksLabel: String
    /// El nombre que el coach le puso a su microciclo.
    let title: String
    /// Lo que pasa dentro y el nombre no dice: un simulacro, unos tests.
    let detail: String?
    /// Lunes de su primera semana y domingo de la última («YYYY-MM-DD»).
    ///
    /// Cadena y no `Date`, igual que `dueDate`: la estrategia de fechas del
    /// cable espera un ISO 8601 completo y una fecha suelta tumbaría la fila.
    let startDate: String
    let endDate: String
    /// Qué semana de ESTE tramo es la de hoy (1-based). Nil si hoy no cae aquí.
    let currentWeek: Int?
    /// ¿Rompe la rutina? Hoy: lleva un simulacro o unos tests. Se pinta relleno.
    ///
    /// Por defecto NO: un servidor anterior al campo no marcaba ninguno, y
    /// leerlo como sí llenaría el camino entero de hitos que nadie declaró.
    @DefaultFalse var milestone: Bool = false
    /// El tono, ya derivado por el servidor. Opcional para que un payload sin él
    /// no tumbe el tramo: se vuelve a derivar de la posición (`tono`).
    let tone: Int?

    /// El tono que le toca: el que manda el servidor o, si no viene, el de su
    /// posición. Una sola regla, escrita dos veces a propósito — el cliente
    /// tiene que poder pintar el camino aunque el campo llegue vacío.
    var tono: Int { tone ?? CaminoDelPlan.tono(position) }

    /// ¿Es donde está hoy? Se dice con la semana, no con una bandera aparte.
    var esActual: Bool { currentWeek != nil }
}

/// El camino entero: los tramos en orden y dónde cae hoy.
struct CaminoDelPlan: Codable, Equatable {
    /// Cuántas semanas dura el plan. No se pinta en la espina; se dice en voz
    /// alta para quien la escucha con VoiceOver.
    let totalWeeks: Int?
    /// La posición del tramo en el que está hoy. Nil si hoy no cae en el plan.
    let currentPosition: Int?
    /// Un tramo mal formado se cae solo en vez de llevarse el camino entero.
    @LossyArray var segments: [TramoDelPlan]

    /// Sin un solo tramo no hay camino que dibujar. Quien lo pinta NO enseña un
    /// hueco: un camino de cero pasos se leería como «tu plan está vacío»,
    /// cuando lo que pasa es que aún no empieza.
    var estaVacio: Bool { segments.isEmpty }

    /// Cuántos tonos distintos antes de repetir. Cinco: un plan de más de cinco
    /// microciclos seguidos vuelve a empezar la escala, y a esa distancia dos
    /// tramos del mismo tono ya no se comparan entre sí.
    static let tonos = 5

    /// El tono de un tramo por su posición. Estable (añadir un tramo al final no
    /// recolorea los anteriores) y sin vocabulario de coach.
    static func tono(_ position: Int) -> Int {
        let n = position % tonos
        return n < 0 ? n + tonos : n
    }
}
