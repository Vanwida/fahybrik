import Foundation
@testable import FAHYBRIK

// LOS ESCENARIOS DE «DEL COACH» — la semana en la que se rehace el plan.
//
// Viven fuera de las pruebas que los dibujan porque son ESCENARIO y no arnés: la
// misma semana la miran las capturas de diseño y la mirará cualquier prueba que
// venga después, y metidos dentro de una clase de test quedan escondidos.
//
// Todo lo que hay aquí es MÉTODO de un coach (los nombres de sus microciclos,
// sus pasos, sus opciones) y por eso es dato de un escenario: en producción lo
// escribe él y el servidor lo sirve tal cual.

enum EscenariosComunicados {
    static func comunicado(
        id: String,
        kind: ComunicadoTipo,
        title: String,
        body: String? = nil,
        finalNote: String? = nil,
        ancla: ComunicadoAncla = .general,
        state: ComunicadoEstado = .publicado,
        blocks: Bool = false,
        dueDate: String? = nil,
        items: [ComunicadoItem] = [],
        marcados: [String] = [],
        answered: String? = nil,
        publicado: String = "2026-08-09T07:00:00Z"
    ) -> Comunicado {
        let seen: Date? = state == .publicado ? nil : Date(timeIntervalSince1970: 1_000)
        let done: Date? = state == .hecho ? Date(timeIntervalSince1970: 2_000) : nil
        let answeredAt: Date? = state == .respondido ? Date(timeIntervalSince1970: 3_000) : nil
        return Comunicado(
            id: id, kind: kind, title: title, body: body, finalNote: finalNote,
            anchorKind: ancla, anchorRef: nil, dueDate: dueDate, expiresAt: nil,
            blocks: blocks,
            publishedAt: ISO8601DateFormatters.parse(publicado)!,
            coachName: "Pablo Amigo", items: items, state: state,
            seenAt: seen, doneAt: done, answeredItemId: answered, answeredAt: answeredAt,
            markedItemIds: marcados,
            claimsAttention: Comunicado.reclama(kind: kind, state: state)
        )
    }

    static func pregunta(state: ComunicadoEstado = .publicado, answered: String? = nil) -> Comunicado {
        comunicado(
            id: "101", kind: .pregunta,
            title: "¿Tu wave es el jueves o el sábado?",
            body: "El taper está montado contando con el sábado 14. Si tu wave es el jueves 12, todo se adelanta dos días.",
            ancla: .plan, state: state, blocks: true,
            items: [
                ComunicadoItem(id: "9001", position: 0, label: nil, content: "Jueves 12",
                               consequence: "Openers el martes 10 y carbos desde el lunes 9. El resto no cambia."),
                ComunicadoItem(id: "9002", position: 1, label: nil, content: "Sábado 14",
                               consequence: "El plan se queda como está."),
            ],
            answered: answered,
            publicado: "2026-08-08T09:12:00Z"
        )
    }

    static func paso(
        _ id: String, _ marca: String, _ texto: String, checkable: Bool = true
    ) -> ComunicadoItem {
        ComunicadoItem(
            id: id, position: 0, label: marca, content: texto,
            consequence: nil, checkable: checkable
        )
    }

    /// Siete pasos, y dos de ellos son para LEER (la hidratación y el gel):
    /// ponerle casilla a beber agua no mide si bebió, mide si tocó un
    /// círculo. Es el caso mezclado, que es el normal.
    static let pasos: [ComunicadoItem] = [
        paso("9101", "−40'", "Movilidad de cadera y tobillo, 5'."),
        paso("9102", "−35'", "Trote progresivo 10', acabando a tu ritmo de carrera."),
        paso("9103", "−30'", "Desde aquí, sorbos cortos de agua con sales.", checkable: false),
        paso("9104", "−25'", "3 × 30\" de skipping y técnica."),
        paso("9105", "−12'", "2 aceleraciones de 60 m."),
        paso("9106", "−8'", "Openers: 5 wall balls y 5 burpees, tranquilos."),
        paso("9107", "−5'", "El gel, con agua y sin prisa.", checkable: false),
    ]

    static func protocolo(marcados: [String] = []) -> Comunicado {
        comunicado(
            id: "102", kind: .protocolo,
            title: "Calentamiento del día de carrera",
            finalNote: "Nada de potenciación pesada: la evidencia no supera el efecto del propio calentamiento.",
            ancla: .carrera,
            state: marcados.isEmpty ? .publicado : .visto,
            items: pasos, marcados: marcados
        )
    }

    /// Un protocolo SIN un solo paso: título, cuerpo y nota final. Se lee y
    /// ya está — ni avance ni «hecho».
    static let protocoloDeLectura = comunicado(
        id: "107", kind: .protocolo,
        title: "Cómo comer la víspera",
        body: "Cena pronto y sin fibra: arroz, pollo y poco más. Desayuna 3 h antes de tu salida, con lo de siempre, y no estrenes nada.",
        finalNote: "Si te levantas con el estómago cerrado, tira de líquido y no fuerces el sólido.",
        ancla: .carrera
    )

    static let nota = comunicado(
        id: "106", kind: .nota,
        title: "Tu plan, rehecho para Singles Pro",
        body: "Por qué el objetivo son 1:15 a 1:18 y cómo se reparten las 12 semanas.",
        ancla: .plan,
        items: [
            ComunicadoItem(id: "9601", position: 0, label: "Qué ha cambiado",
                           content: "Pasar a Singles Pro rompe 5 de las 6 premisas del plan: haces el 100 % de cada estación, cada trineo lleva 50 kg más, los wall balls suben 3 kg y el remo va a damper 7.",
                           consequence: nil),
            ComunicadoItem(id: "9602", position: 1, label: "Tu objetivo",
                           content: "La banda se cierra con los tests de la semana 1. Tu referencia real es el Singles Open de hace un año, 1h09, y el salto de Open a Pro cuesta entre 5 y 9 minutos.",
                           consequence: nil),
        ]
    )

    // MARK: Las formas de una nota

    /// El camino real de un ciclo: los tests que abren, la acumulación
    /// donde está hoy, la descarga y el bloque específico con su simulacro.
    /// Los nombres son los del coach y aquí van cableados porque esto es un
    /// escenario: en producción los pone él y el servidor los sirve tal cual.
    static let camino = CaminoDelPlan(
        totalWeeks: 11,
        currentPosition: 1,
        segments: [
            TramoDelPlan(
                position: 0, firstWeek: 1, weekCount: 1, weeksLabel: "S1",
                title: "Tests", detail: "Los cuatro tests de calibración.",
                startDate: "2026-08-10", endDate: "2026-08-16",
                currentWeek: nil, milestone: true, tone: 0
            ),
            TramoDelPlan(
                position: 1, firstWeek: 2, weekCount: 4, weeksLabel: "S2-S5",
                title: "Acumulación", detail: nil,
                startDate: "2026-08-17", endDate: "2026-09-13",
                currentWeek: 2, milestone: false, tone: 1
            ),
            TramoDelPlan(
                position: 2, firstWeek: 6, weekCount: 1, weeksLabel: "S6",
                title: "Descarga", detail: nil,
                startDate: "2026-09-14", endDate: "2026-09-20",
                currentWeek: nil, milestone: false, tone: 2
            ),
            TramoDelPlan(
                position: 3, firstWeek: 7, weekCount: 5, weeksLabel: "S7-S11",
                title: "Específico", detail: "Simulacro completo en la S10.",
                startDate: "2026-09-21", endDate: "2026-10-25",
                currentWeek: nil, milestone: true, tone: 3
            ),
        ]
    )

    static func seccion(
        _ id: String, _ posicion: Int, etiqueta: String?, contenido: String = "",
        forma: ComunicadoForma = .texto,
        trozos: [TrozoReparto] = [],
        camino: CaminoDelPlan? = nil
    ) -> ComunicadoItem {
        ComunicadoItem(
            id: id, position: posicion, label: etiqueta, content: contenido,
            consequence: nil, display: forma.rawValue, segments: trozos, camino: camino
        )
    }

    /// La nota del plan rehecho, con sus cuatro formas y la pregunta al pie.
    static func notaConFormas(
        conCamino: Bool = true,
        enlaceResuelto: Bool = false
    ) -> Comunicado {
        var n = comunicado(
            id: "106", kind: .nota,
            title: "Tu plan, rehecho para Singles Pro",
            body: "Por qué el objetivo son 1:15 a 1:18 y cómo se reparten las once semanas.",
            ancla: .plan,
            items: [
                seccion("9601", 0, etiqueta: "Qué ha cambiado",
                        contenido: "Pasar a Singles Pro rompe 5 de las 6 premisas del plan: haces el 100 % de cada estación, cada trineo lleva 50 kg más, los wall balls suben 3 kg y el remo va a damper 7."),
                seccion("9602", 1, etiqueta: "La banda se cierra con los tests de la semana 1",
                        contenido: "1:15 a 1:18", forma: .cifra),
                seccion("9603", 2, etiqueta: "Cómo se reparte la semana", forma: .reparto,
                        trozos: [
                            TrozoReparto(position: 0, valueNum: 3, label: "duras"),
                            TrozoReparto(position: 1, valueNum: 2, label: "moderadas"),
                            TrozoReparto(position: 2, valueNum: 1, label: "de absorción"),
                        ]),
                seccion("9604", 3, etiqueta: "Por dónde vas a pasar", forma: .camino,
                        camino: conCamino ? camino : nil),
            ]
        )
        n.linked = ComunicadoEnlazado(
            id: "101", kind: .pregunta,
            title: "¿Tu wave es el jueves o el sábado?",
            blocks: true,
            state: enlaceResuelto ? .respondido : .publicado
        )
        return n
    }

    static let foco = comunicado(
        id: "105", kind: .foco,
        title: "Dormir más de 6 horas",
        body: "Sigues en menos de 6 h desde mayo. Es lo único de esta lista que puede darte más minutos que cualquier sesión.",
        ancla: .checkin, state: .visto,
        publicado: "2026-05-04T07:00:00Z"
    )

    /// La semana en la que se rehace el plan: la pregunta bloquea, una tarea
    /// venció y otra vence el domingo, el protocolo va por tres de siete.
    static let semanaFuerte: [Comunicado] = [
        pregunta(),
        comunicado(
            id: "103", kind: .tarea, title: "Empieza la beta-alanina",
            body: "Necesita 4 a 6 semanas de carga y lleva pendiente desde mayo.",
            dueDate: "2026-08-09"
        ),
        protocolo(marcados: ["9101", "9102", "9103"]),
        comunicado(
            id: "104", kind: .tarea, title: "Haz los tests de la semana 1",
            body: "Sin ellos, los bloques 1 a 3 van con ritmos estimados.",
            ancla: .test, dueDate: "2026-08-16"
        ),
        foco,
        nota,
    ]

    /// Lo mismo, resuelto. La calma es información.
    static let alDia: [Comunicado] = [
        pregunta(state: .respondido, answered: "9002"),
        comunicado(
            id: "103", kind: .tarea, title: "Empieza la beta-alanina",
            body: "Necesita 4 a 6 semanas de carga.", state: .hecho, dueDate: "2026-08-09"
        ),
        comunicado(
            id: "104", kind: .tarea, title: "Haz los tests de la semana 1",
            ancla: .test, state: .hecho, dueDate: "2026-08-16"
        ),
        comunicado(
            id: "102", kind: .protocolo, title: "Calentamiento del día de carrera",
            ancla: .carrera, state: .hecho, items: pasos, marcados: pasos.map(\.id)
        ),
        foco,
        comunicado(
            id: "106", kind: .nota, title: "Tu plan, rehecho para Singles Pro",
            body: "Por qué el objetivo son 1:15 a 1:18.", ancla: .plan, state: .visto
        ),
    ]
}
