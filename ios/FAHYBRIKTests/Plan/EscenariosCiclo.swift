import Foundation
@testable import FAHYBRIK

// LOS ESCENARIOS DEL CICLO — los casos de diseño de `PlanCicloView`, en un sitio.
//
// Hermano de `EscenariosComunicados`, y por lo mismo: las pruebas de lectura y las
// de dibujo tienen que mirar EL MISMO ciclo, o dejan de decir nada la una de la
// otra. Los nombres de los tramos son los del coach y van cableados porque esto es
// un escenario: en producción los pone él y el servidor los sirve tal cual.
enum EscenariosCiclo {

    /// El «hoy» de los escenarios, fijo: una cuenta atrás que cambia según el día
    /// en que se corra la prueba no fija nada.
    static let hoy = FechaES.fecha("2026-08-19")!

    // MARK: Los tramos

    static func tramo(
        _ posicion: Int,
        primera: Int,
        semanas: Int,
        etiqueta: String,
        titulo: String,
        detalle: String? = nil,
        inicio: String,
        fin: String,
        semanaActual: Int? = nil,
        hito: Bool = false,
        nivel: String? = "Avanzado",
        eventos: [HitoDelTramo] = []
    ) -> TramoDelPlan {
        TramoDelPlan(
            position: posicion, firstWeek: primera, weekCount: semanas, weeksLabel: etiqueta,
            title: titulo, detail: detalle,
            startDate: inicio, endDate: fin,
            currentWeek: semanaActual, milestone: hito, tone: posicion,
            level: nivel, events: eventos
        )
    }

    /// Las cuatro etapas publicadas, con hoy dentro de la segunda y dos marcas en
    /// su calendario. Es el caso normal.
    static var tramos: [TramoDelPlan] {
        [
            tramo(0, primera: 1, semanas: 1, etiqueta: "S1", titulo: "Tests",
                  detalle: "Los cuatro tests de calibración.",
                  inicio: "2026-08-03", fin: "2026-08-09", hito: true),
            tramo(1, primera: 2, semanas: 4, etiqueta: "S2-S5", titulo: "Acumulación",
                  inicio: "2026-08-10", fin: "2026-09-06", semanaActual: 2, hito: true,
                  eventos: [
                      HitoDelTramo(kind: "test", title: "Test de 5 km", date: "2026-08-20"),
                      HitoDelTramo(kind: "sim", title: "Simulación media", date: "2026-08-26"),
                  ]),
            tramo(2, primera: 6, semanas: 1, etiqueta: "S6", titulo: "Descarga",
                  inicio: "2026-09-07", fin: "2026-09-13"),
            tramo(3, primera: 7, semanas: 5, etiqueta: "S7-S11", titulo: "Específico",
                  detalle: "Simulacro completo en la S10.",
                  inicio: "2026-09-14", fin: "2026-10-18", hito: true),
        ]
    }

    // MARK: Las respuestas del cable

    static func respuesta(
        tramos: [TramoDelPlan]? = nil,
        semanas: Int? = 11,
        posicionActual: Int? = 1,
        alAcabar: String? = "repeat",
        carrera: CarreraDelCiclo? = laCarrera
    ) -> CicloDelPlanResponse {
        CicloDelPlanResponse(
            camino: CaminoDelPlan(
                totalWeeks: semanas,
                currentPosition: posicionActual,
                segments: tramos ?? Self.tramos
            ),
            alAcabar: alAcabar,
            carrera: carrera
        )
    }

    static let laCarrera = CarreraDelCiclo(
        name: "HYROX Barcelona", date: "2026-10-31", goalTimeS: 5_400
    )

    /// El ciclo completo: cursor dentro, política declarada y carrera con objetivo.
    static var completo: CicloDelPlan { CicloDelPlan(respuesta(), hoy: hoy)! }

    /// Lo publicado se acaba y nadie ha dicho qué viene: el camino se rompe.
    static var conHueco: CicloDelPlan { CicloDelPlan(respuesta(alAcabar: nil), hoy: hoy)! }

    /// La carrera sin objetivo puesto: NO se escribe ninguno.
    static var sinObjetivo: CicloDelPlan {
        CicloDelPlan(
            respuesta(carrera: CarreraDelCiclo(name: "HYROX Madrid", date: "2026-11-14", goalTimeS: nil)),
            hoy: hoy
        )!
    }

    /// Una sola etapa publicada: la escala del ciclo y la de la etapa coinciden, y
    /// entonces el pie del sujeto no repite la cuenta.
    static var unaSolaEtapa: CicloDelPlan {
        CicloDelPlan(
            respuesta(
                tramos: [
                    tramo(0, primera: 1, semanas: 4, etiqueta: "S1-S4", titulo: "Acumulación",
                          inicio: "2026-08-17", fin: "2026-09-13", semanaActual: 1)
                ],
                semanas: 4,
                posicionActual: 0
            ),
            hoy: hoy
        )!
    }

    /// El plan se acabó y no hay nada después: hoy no cae en ninguna etapa.
    static var sinEtapaActiva: CicloDelPlan {
        let pasados = tramos.map {
            tramo($0.position, primera: $0.firstWeek, semanas: $0.weekCount,
                  etiqueta: $0.weeksLabel, titulo: $0.title, detalle: $0.detail,
                  inicio: $0.startDate, fin: $0.endDate,
                  semanaActual: nil, hito: $0.milestone, nivel: $0.level, eventos: $0.events)
        }
        return CicloDelPlan(respuesta(tramos: pasados, posicionActual: nil), hoy: hoy)!
    }
}
