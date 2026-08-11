import Foundation

// EL CICLO DEL ATLETA — «¿hacia dónde voy y cuánto queda?».
//
// El espejo Swift de la propuesta del doble (`web/components/design-twin/screens/
// plan-ciclo/` + `plan/modelo.ts`). Aquí vive todo lo DERIVADO: qué semana del
// ciclo es hoy, qué nivel declara lo publicado, si el camino tiene un agujero al
// final y qué paradas tiene. Es puro a propósito — se puede fijar con pruebas y
// no depende de ninguna vista.
//
// ---------------------------------------------------------------------------
// LA LEY QUE ESTE MODELO HACE ESTRUCTURAL
// ---------------------------------------------------------------------------
//
// El futuro tiene dos mitades y solo una se sabe:
//
//   · La ESTRUCTURA está DECIDIDA: cuántos tramos hay, en qué orden, cuántas
//     semanas dura cada uno, cómo los llamó el coach, dónde cae hoy, qué hay
//     puesto en el calendario y cuándo es la carrera. Nada de eso depende de lo
//     que el atleta haga, así que se pinta con seguridad.
//   · El RESULTADO MEDIDO del futuro NO se sabe. Por eso aquí no hay ni un campo
//     donde quepa una carga, un volumen o una intensidad previstos, y las marcas
//     de semana son POSICIÓN y no cantidad. La v1 de esta pantalla enseñaba el
//     cumplimiento semana a semana; eso es PASADO y su sitio es otro — el ciclo
//     responde adónde vas, no cómo te ha ido.
//
// AGNÓSTICO: la etiqueta de un tramo es el NOMBRE que le puso el coach
// (`program_month_templates.name`) y el color es su POSICIÓN. La migración 0064
// borró la entidad «fase», así que aquí no hay catálogo, ni orden de fases
// asumido, ni una sola constante con un nombre de fase dentro.

// MARK: - Lo que llega del cable

/// Qué pasa al acabar el último tramo (`program_sequences.end_policy`).
///
/// Un solo caso, y no es un hueco: `repeat` es el único valor que la producción
/// escribe hoy. Los demás llegarán con su frase cuando existan; hasta entonces
/// un valor desconocido se trata como «no se sabe» (ver `politica`), que es lo
/// mismo que no declarar nada y hace que el camino dibuje su hueco.
enum AlAcabarDelCiclo: String {
    case repite = "repeat"

    /// Lo que se le dice al atleta. Una frase por política y ninguna genérica.
    var frase: String {
        switch self {
        case .repite: return "Al acabar, el ciclo vuelve a empezar con más carga."
        }
    }
}

/// La carrera que cierra el camino (`races` con `priority='target'`).
struct CarreraDelCiclo: Codable, Equatable {
    /// `races.name`, sin reescribir.
    let name: String
    /// «YYYY-MM-DD».
    let date: String
    /// `races.goal_time_seconds`. Nil = el atleta no se ha puesto objetivo, y
    /// entonces NO se escribe ninguno: un tiempo por defecto parecería suyo.
    let goalTimeS: Int?

    /// «1:30:00». Nil sin objetivo puesto. Sale de la MISMA implementación que
    /// escribe el objetivo en Inicio y en Carreras, para que no puedan divergir.
    var objetivo: String? { AthleteNextRace.goalTimeFormatted(goalTimeS) }

    /// Cuántos días faltan. Nil cuando la fecha no se lee.
    func enDias(hoy: Date = Date()) -> Int? { FechaES.diasHasta(date, desde: hoy) }
}

/// La respuesta de `GET /api/athlete/plan/ciclo`.
struct CicloDelPlanResponse: Codable, Equatable {
    /// El camino resuelto por el servidor. Nil = el atleta no tiene ninguna
    /// estructura publicada, y entonces la pantalla es un Vacío.
    let camino: CaminoDelPlan?
    /// `program_sequences.end_policy` CRUDA. Se guarda la cadena y no el enum
    /// para que un valor que este binario no conozca no tumbe la respuesta: se
    /// lee como «no se sabe» y el camino dibuja su hueco (ver `politica`).
    let alAcabar: String?
    let carrera: CarreraDelCiclo?

    /// La política ya interpretada. Nil cuando no llega o cuando llega algo que
    /// esta versión no sabe escribir — las dos cosas significan lo mismo para el
    /// atleta: lo que viene después no se sabe, y se dice.
    var politica: AlAcabarDelCiclo? {
        alAcabar.flatMap(AlAcabarDelCiclo.init(rawValue:))
    }
}

// MARK: - El ciclo, ya resuelto

/// Una parada del camino, ya decidida y todavía sin dibujar.
///
/// Espejo de `NodoCiclo` (`plan-ciclo/espina.ts`): aquí se decide QUÉ dice cada
/// parada —su rótulo de semanas, su tono, si ya pasó, qué se lee en voz alta— y
/// el dibujo lo pone la espina compartida.
struct NodoDelCiclo: Identifiable, Equatable {
    /// Qué clase de parada es. La forma del nodo sale de aquí, no al revés.
    enum Clase: Equatable { case tramo, hueco, carrera }

    let id: String
    let clase: Clase
    /// Su sitio en `tramos`. Nil en el hueco y en la carrera.
    let indiceTramo: Int?
    /// «S1» o «S5-S8». Vacío = esta parada no ocupa semanas.
    let semanas: String
    let titulo: String
    let detalle: String?
    /// Tono por posición. Solo lo llevan los tramos: el hueco y la carrera no
    /// tienen tono propio y su color lo dice su FORMA (igual que en el doble).
    let tono: Int
    let pasado: Bool
    let actual: Bool
    let semanaActual: Int?
    /// Dentro pasa algo que rompe la rutina.
    let destacado: Bool
    /// El rótulo que se lee en voz alta. El dibujo se calla; esto lo dice todo.
    let etiqueta: String
}

/// EL CICLO con el cursor de hoy dentro, listo para que una vista lo pinte.
///
/// Se construye solo cuando hay al menos un tramo publicado: sin estructura no
/// hay camino que repartir y la pantalla degrada a Vacío en vez de pintar un
/// camino de cero pasos, que se leería como «tu plan está vacío» cuando lo que
/// pasa es que aún no empieza.
struct CicloDelPlan {
    let tramos: [TramoDelPlan]
    /// Semanas del plan entero, según el servidor. Se conserva aparte de la suma
    /// de los tramos porque es el dato que él rotula.
    let semanasDeclaradas: Int?
    let politica: AlAcabarDelCiclo?
    let carrera: CarreraDelCiclo?
    /// El «hoy» con el que se calculan las cuentas atrás. Inyectable para que una
    /// prueba no cambie de resultado según el día en que se corra.
    let hoy: Date

    init?(_ respuesta: CicloDelPlanResponse, hoy: Date = Date()) {
        guard let camino = respuesta.camino, !camino.estaVacio else { return nil }
        self.tramos = camino.segments
        self.semanasDeclaradas = camino.totalWeeks
        self.politica = respuesta.politica
        self.carrera = respuesta.carrera
        self.hoy = hoy
    }

    // MARK: Dónde estás

    /// El índice del tramo en el que cae hoy, o -1 cuando hoy no cae en ninguno
    /// — y eso pasa de verdad: un plan que se acabó y no tiene continuación.
    ///
    /// Se deriva de `currentWeek` y no de `currentPosition` a propósito: la semana
    /// dentro del tramo es el hecho que se ESCRIBE en pantalla («estás aquí,
    /// semana 2»), así que es la que tiene que decidir quién es el actual. Dos
    /// fuentes para el mismo hecho es el sitio donde acaban discrepando.
    var indiceActual: Int {
        tramos.firstIndex(where: \.esActual) ?? -1
    }

    var tramoActual: TramoDelPlan? {
        indiceActual >= 0 ? tramos[indiceActual] : nil
    }

    /// Semana dentro del tramo actual (1-based). Nil cuando no hay cursor.
    var semanaEnTramo: Int? { tramoActual?.currentWeek }

    /// Semanas totales del ciclo: las que declara el servidor o, si no las
    /// declara, la suma de sus tramos. Una sola regla, en un sitio.
    var semanasTotales: Int {
        if let semanasDeclaradas, semanasDeclaradas > 0 { return semanasDeclaradas }
        return tramos.reduce(0) { $0 + max(0, $1.weekCount) }
    }

    /// En qué semana del CICLO entero estás (1-based). Nil cuando hoy no cae en
    /// ningún tramo: sin cursor no hay posición, y no se extrapola.
    var semanaDelCiclo: Int? {
        guard indiceActual >= 0, let dentro = semanaEnTramo else { return nil }
        let antes = tramos.prefix(indiceActual).reduce(0) { $0 + max(0, $1.weekCount) }
        return antes + dentro
    }

    /// El nivel que declara lo publicado: el del tramo donde caes hoy, o el que
    /// comparten TODOS cuando hoy no cae en ninguno. Si declaran niveles
    /// distintos y no hay cursor, no existe «el nivel del ciclo» y no se pinta.
    ///
    /// Se resuelve una vez para que el nivel salga UNA vez en el cromo en lugar
    /// de repetirse en cada parada: una parada solo lo dice cuando se sale de lo
    /// que declara el resto, que es justo cuando el dato informa de algo.
    var nivelDeLoPublicado: String? {
        if let actual = tramoActual { return actual.level }
        let niveles = Set(tramos.map { $0.level })
        return niveles.count == 1 ? tramos.first?.level : nil
    }

    /// ¿El camino tiene un agujero al final? Dos procedencias, un mismo hecho: o
    /// hoy no cae dentro de ningún tramo, o la secuencia no declara qué pasa al
    /// acabar. En los dos casos lo que viene después NO se sabe, y se dice.
    var hayHueco: Bool { indiceActual < 0 || politica == nil }

    // MARK: Las paradas

    /// Las paradas del camino, en orden: los tramos publicados, el agujero del
    /// final si lo hay, y la carrera cerrando.
    var nodos: [NodoDelCiclo] {
        let cursor = indiceActual
        let nivelComun = nivelDeLoPublicado
        var salida: [NodoDelCiclo] = []

        for (i, tramo) in tramos.enumerated() {
            let esActual = i == cursor
            salida.append(NodoDelCiclo(
                id: "tramo-\(tramo.position)-\(tramo.startDate)",
                clase: .tramo,
                indiceTramo: i,
                semanas: tramo.weeksLabel,
                titulo: tramo.title,
                // El nivel solo cuando se sale del que declara el resto del
                // ciclo; si no, repetiría lo que ya dice el cromo.
                detalle: detalleDeTramo(tramo, nivelComun: nivelComun),
                tono: tramo.tono,
                // Sin cursor no se sabe qué queda detrás: un ciclo sin «hoy»
                // dentro no convierte en pasado a nadie, aunque sus fechas
                // hayan quedado atrás.
                pasado: cursor >= 0 && i < cursor,
                actual: esActual,
                semanaActual: esActual ? tramo.currentWeek : nil,
                destacado: tramo.milestone,
                etiqueta: etiquetaDeTramo(tramo, indice: i, cursor: cursor)
            ))
        }

        if hayHueco {
            let detalle = cursor < 0
                ? "Lo que tu coach ha montado se termina antes de hoy."
                : "Después de esta etapa no hay nada montado todavía."
            salida.append(NodoDelCiclo(
                id: "hueco",
                clase: .hueco,
                indiceTramo: nil,
                semanas: "",
                titulo: LoPublicaElCoach.tituloDelHueco,
                detalle: detalle,
                tono: 0,
                pasado: false,
                actual: false,
                semanaActual: nil,
                destacado: false,
                etiqueta: "\(LoPublicaElCoach.tituloDelHueco). \(detalle) \(LoPublicaElCoach.frase)"
            ))
        }

        if let carrera {
            salida.append(NodoDelCiclo(
                id: "carrera",
                clase: .carrera,
                indiceTramo: nil,
                semanas: "",
                titulo: carrera.name,
                // Sin objetivo puesto no se escribe ninguno.
                detalle: carrera.objetivo.map { "Tu carrera · objetivo \($0)" } ?? "Tu carrera",
                tono: 0,
                pasado: false,
                actual: false,
                semanaActual: nil,
                destacado: false,
                etiqueta: etiquetaDeCarrera(carrera)
            ))
        }

        return salida
    }

    private func detalleDeTramo(_ tramo: TramoDelPlan, nivelComun: String?) -> String? {
        if let nivel = tramo.level, nivel != nivelComun { return nivel }
        return tramo.detail
    }

    /// El rótulo accesible de un tramo.
    ///
    /// El estado solo se dice con palabras cuando hoy cae dentro de alguno: sin
    /// cursor no se sabe si un tramo queda por delante o por detrás, y afirmarlo
    /// sería inventarlo.
    private func etiquetaDeTramo(_ tramo: TramoDelPlan, indice: Int, cursor: Int) -> String {
        var partes = [
            "\(tramo.title), \(Plural.de(tramo.weekCount, "semana", "semanas")) (\(tramo.weeksLabel))"
        ]
        if indice == cursor, let semana = tramo.currentWeek {
            partes.append("estás en la semana \(semana)")
        } else if cursor >= 0, indice < cursor {
            partes.append("ya pasó")
        }
        if let nivel = tramo.level { partes.append("nivel \(nivel)") }
        var frase = partes.joined(separator: ", ")
        if !tramo.events.isEmpty {
            let marcas = tramo.events
                .map { "\($0.title), \(Self.cuandoElHito($0, hoy: hoy))" }
                .joined(separator: "; ")
            let cuantas = Plural.de(tramo.events.count, "marca en el calendario", "marcas en el calendario")
            frase += ". \(cuantas): \(marcas)"
        }
        return frase
    }

    private func etiquetaDeCarrera(_ carrera: CarreraDelCiclo) -> String {
        var frase = "Tu carrera: \(carrera.name)"
        if let dias = carrera.enDias(hoy: hoy) {
            frase += dias < 0 ? ", ya pasó" : ", en \(Plural.de(dias, "día", "días"))"
        }
        if let objetivo = carrera.objetivo { frase += ", objetivo \(objetivo)" }
        return frase
    }

    // MARK: Cuándo cae un hito

    /// Cuándo cae un hito, en palabras: «hoy» · «mañana» · «en 5 días» · «en 3
    /// semanas» · «ya pasó».
    ///
    /// Pasadas dos semanas la cuenta en días deja de situar a nadie («en 34
    /// días») y se dice en semanas. Sin fecha legible se dice «sin fecha» en vez
    /// de inventar una.
    static func cuandoElHito(_ hito: HitoDelTramo, hoy: Date = Date()) -> String {
        guard let dias = FechaES.diasHasta(hito.date, desde: hoy) else { return "sin fecha" }
        switch dias {
        case ..<0:  return "ya pasó"
        case 0:     return "hoy"
        case 1:     return "mañana"
        case 2..<14: return "en \(dias) días"
        default:
            let semanas = Int((Double(dias) / 7).rounded())
            return "en \(Plural.de(semanas, "semana", "semanas"))"
        }
    }
}

// MARK: - Quién desbloquea lo que el atleta no puede desbloquear

/// Dicho UNA sola vez, porque sale en dos momentos —el vacío de «aún no tienes
/// plan» y el hueco del final del camino— y las dos frases tienen que ser LA
/// MISMA: son el mismo hecho visto desde dos sitios.
enum LoPublicaElCoach {
    static let quien = "tu coach"
    static let cuando = "Todavía no hay fecha"
    static let tituloDelHueco = "Aquí acaba lo publicado"
    /// «Lo publica tu coach. Todavía no hay fecha.»
    static var frase: String { "Lo publica \(quien). \(cuando)." }
}

// MARK: - Plural

/// «1 semana» / «3 semanas» — en un solo sitio, para que dos rótulos de la misma
/// magnitud no lo escriban de dos maneras.
enum Plural {
    static func de(_ n: Int, _ singular: String, _ plural: String) -> String {
        "\(n) \(n == 1 ? singular : plural)"
    }
}
