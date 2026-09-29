#if DEBUG
import Foundation

// LOS CASOS DE «PLAN» — dieciocho atletas de ejemplo CON coach que recorren todos los estados (el tier
// libre, en `PlanEjemplosLibre.swift`). NINGUNO sale de la base de producción (CONTRATO-UI §7; «no hay
// atletas reales»): son personas inventadas para probar el modelo, y lo que las hace útiles es qué
// estado de cada pieza ejercitan. Espejo de `web/components/design-twin/kit-plan/casos.ts`, con el mismo
// orden (del caso lleno al mínimo: §6.3) y los mismos ids, que son los nombres de las capturas.
//
// Cada pieza de la pantalla tiene sus cuatro estados cubiertos por al menos un caso: matriz al pie.

struct CasoPlan: Identifiable {
    let id: String
    let titulo: String
    let lectura: LecturaPlan
    /// Con qué semana y día se abre (por defecto: hoy, esta semana). Es de la demo, no del dominio.
    var nav = NavegacionPlan()
}

extension EjemplosPlan {

    /// El atleta de partida: con coach, semana cargada y nada raro. Cada caso pisa lo que ejercita.
    private static func lectura(
        _ actual: SemanaDelPlan?,
        siguiente: SemanaHojeada? = nil,
        pisa: (inout LecturaPlan) -> Void = { _ in }
    ) -> LecturaPlan {
        var l = LecturaPlan(
            coach: "Mar", companero: nil, hoyIso: hoy,
            cargando: false, errorCarga: false, pausa: nil,
            actual: actual, hojeadas: siguiente.map { [1: $0] } ?? [:], muro: nil,
            desgloses: [:]
        )
        var semanas = [actual]
        if case let .llego(s)? = siguiente { semanas.append(s) }
        l.desgloses = desgloses(de: semanas)
        pisa(&l)
        return l
    }

    private static let bloque = "Bloque 2 · fuerza y ritmo"

    /// La semana que viene, llena, para los casos donde se puede hojear.
    private static func semanaQueViene() -> SemanaHojeada {
        .llego(semana(
            lunes: lunesQueViene, hoy: hoy,
            dias: [[d(.series400)], [d(.fuerzaInferior)], [d(.remo5x1000)], [], [d(.fuerzaSuperior)], [d(.tiradaLarga)], []],
            datos: DatosSemana(
                nombreBloque: bloque, posicion: (4, 6),
                intencion: "Semana de asimilación: bajamos un punto para llegar fresco a la simulación.")
        ))
    }

    private static func datos(_ intencion: String, posicion: (Int, Int?) = (3, 6), nombre: String? = bloque, mas: Bool = true) -> DatosSemana {
        DatosSemana(nombreBloque: nombre, posicion: posicion, intencion: intencion, hayMasAdelante: mas)
    }

    private static func semanaDeHoy(_ dias: [[Spec]], _ datos: DatosSemana) -> SemanaDelPlan {
        semana(lunes: lunes, hoy: hoy, dias: dias, datos: datos)
    }

    static let casosPlan: [CasoPlan] = [
        // ① El caso LLENO: hoy toca «Series 6×800», con sus tres partes y la nota del coach.
        CasoPlan(
            id: "lleno", titulo: "Nora · jueves, semana 3 de 6",
            lectura: lectura(semanaDeHoy(
                [[d(.remo5x1000, .hecha)], [d(.fuerzaInferior, .hecha)], [d(.rodaje8k)], [d(.series800)], [d(.fuerzaSuperior)], [d(.hyroxSim)], []],
                datos("Semana fuerte: acumulamos volumen y cerramos con la simulación entera.")
            ), siguiente: semanaQueViene())),

        // ② AM hecha y PM pendiente: el sujeto es LA QUE TOCA (la de la tarde), no la primera del día.
        CasoPlan(
            id: "doble", titulo: "Marina · dos sesiones, la de la mañana hecha",
            lectura: lectura(semanaDeHoy(
                [[d(.series400, .hecha)], [d(.fuerzaInferior, .hecha)], [],
                 [d(.remo5x1000, .hecha, franja: "AM"), d(.fuerzaSuperior, .pendiente, franja: "PM")],
                 [d(.rodaje8k)], [d(.tiradaLarga)], []],
                DatosSemana(nombreBloque: "Bloque 1 · base aeróbica", posicion: (2, 4),
                            intencion: "Jueves de dos sesiones: remo por la mañana, empuje y tirón por la tarde.", hayMasAdelante: true)
            ), siguiente: semanaQueViene())),

        // ③ La sesión de hoy está HECHA: tinte verde, los minutos MEDIDOS, y debajo lo que viene.
        CasoPlan(
            id: "hecho-manana", titulo: "Dídac · hoy hecho, mañana toca",
            lectura: lectura(semanaDeHoy(
                [[d(.fuerzaInferior, .hecha)], [d(.remo5x1000, .hecha)], [], [d(.rodaje8k, .hecha)], [d(.series400)], [d(.tiradaLarga)], []],
                datos("Semana de calidad en el rodaje y fuerza al principio.")
            ), siguiente: semanaQueViene())),

        // ④ Terminó la fuerza antes de tiempo: ámbar suave y los minutos que sí midió. NO es un ✓.
        CasoPlan(
            id: "a-medias", titulo: "Iván · hoy a medias",
            lectura: lectura(semanaDeHoy(
                [[d(.series800, .hecha)], [], [d(.remo5x1000, .hecha)], [d(.fuerzaInferior, .parcial)], [d(.rodaje8k)], [d(.emom20)], []],
                datos("Semana fuerte: acumulamos volumen.")
            ), siguiente: semanaQueViene())),

        // ⑤ Hoy sin hacer, y el martes también: gris, sin rojo (un hecho, no un juicio).
        CasoPlan(
            id: "sin-hacer", titulo: "Carla · hoy sin hacer, y el martes también",
            lectura: lectura(semanaDeHoy(
                [[d(.fuerzaInferior, .hecha)], [d(.series400)], [d(.remo5x1000, .hecha)], [d(.rodaje45, .saltada)], [d(.fuerzaSuperior)], [d(.tiradaLarga)], []],
                datos("Semana de rodajes y fuerza. Lo importante es la tirada del sábado.")
            ), siguiente: semanaQueViene())),

        // ⑥ Un día HOJEADO: la card NO dice «Hoy», el acento es el suave y hoy queda marcado en el carril.
        CasoPlan(
            id: "otro-dia", titulo: "Ona · mirando el sábado, no es hoy",
            lectura: lectura(semanaDeHoy(
                [[d(.remo5x1000, .hecha)], [d(.fuerzaInferior, .hecha)], [], [d(.series800)], [d(.fuerzaSuperior)], [d(.tiradaLarga)], []],
                datos("Semana fuerte: acumulamos volumen.")
            ), siguiente: semanaQueViene()),
            nav: NavegacionPlan(offset: 0, seleccion: "2026-10-03")),

        // ⑦ Hoy no hay nada: no se fabrica una sesión. Sitúa con AYER (medido) y MAÑANA (escrito).
        CasoPlan(
            id: "descanso", titulo: "Biel · hoy descansa",
            lectura: lectura(semanaDeHoy(
                [[d(.series800, .hecha)], [d(.fuerzaInferior, .hecha)], [d(.remo5x1000, .hecha)], [], [d(.series400)], [d(.tiradaLarga)], []],
                datos("Semana fuerte: acumulamos volumen.")
            ), siguiente: semanaQueViene())),

        // ⑧ La duración es el reloj que ESCRIBE el plan o la razón por la que no lo hay: las cuatro, ninguna con cifra.
        CasoPlan(
            id: "sin-reloj", titulo: "Pol · hoy no hay reloj que escribir",
            lectura: lectura(semanaDeHoy(
                [[d(.remo5x1000, .hecha)], [], [d(.fuerzaInferior, .hecha)], [d(.chipper)], [d(.muerteBurpees)], [d(.circuitoPierna)], []],
                datos("Semana de trabajo funcional: sin reloj, con la cabeza.")
            ), siguiente: semanaQueViene())),

        // ⑨ Esta semana vacía pero el plan YA está programado: se dice la fecha exacta y hay salida a la que viene.
        CasoPlan(
            id: "empieza-despues", titulo: "Nuria · su plan empieza el lunes",
            lectura: lectura(
                semana(lunes: lunes, hoy: hoy, dias: [[], [], [], [], [], [], []],
                       datos: DatosSemana(planStartsOn: lunesQueViene, hayMasAdelante: true)),
                siguiente: .llego(semana(
                    lunes: lunesQueViene, hoy: hoy,
                    dias: [[d(.series400)], [d(.fuerzaInferior)], [], [d(.remo5x1000)], [d(.rodaje8k)], [d(.tiradaLarga)], []],
                    datos: DatosSemana(nombreBloque: "Bloque 1 · base aeróbica", posicion: (1, 4),
                                       intencion: "Primera semana: sin prisa, aprendiendo a que el ritmo sea tuyo.")
                )))),

        // ⑩ EL CASO MÍNIMO (§6.3): sin ninguna sesión y sin fecha de inicio. Se dice que se está preparando.
        CasoPlan(
            id: "alta", titulo: "Lía · recién dada de alta, nada publicado",
            lectura: lectura(semana(lunes: lunes, hoy: hoy, dias: [[], [], [], [], [], [], []]))),

        // ⑪ El coach ha pausado el plan: ni sesiones caducadas ni carril. El texto no supone el motivo.
        CasoPlan(
            id: "pausa", titulo: "Aina · plan en pausa",
            lectura: lectura(
                semana(lunes: lunes, hoy: hoy,
                       dias: [[d(.fuerzaInferior, .hecha)], [], [d(.series800)], [], [], [], []],
                       datos: DatosSemana(nombreBloque: bloque)),
                pisa: { $0.pausa = PausaDelPlan(desde: "2026-09-14") })),

        // ⑫ La sesión más larga: 16 estaciones y tres partes. La acción sigue anclada abajo.
        CasoPlan(
            id: "hyrox", titulo: "Jan · hoy es la simulación HYROX",
            lectura: lectura(semanaDeHoy(
                [[d(.remo5x1000, .hecha)], [d(.fuerzaInferior, .hecha)], [], [d(.hyroxSim)], [], [d(.rodaje45)], []],
                DatosSemana(nombreBloque: "Bloque 3 · puesta a punto", posicion: (5, 6),
                            intencion: "Hoy, la simulación entera. Es la última antes de la carrera.", hayMasAdelante: true)
            ), siguiente: semanaQueViene())),

        // ⑬ Hay semana más adelante pero el club no deja verla, y hoy el servidor NO sirvió el desglose.
        {
            let s = semanaDeHoy(
                [[d(.series800, .hecha)], [d(.fuerzaInferior, .hecha)], [], [d(.rodaje8k)], [d(.fuerzaSuperior)], [d(.tiradaLarga)], []],
                DatosSemana(nombreBloque: bloque, posicion: (3, 6), intencion: "Semana fuerte: acumulamos volumen.", bloqueadaPorHorizonte: true))
            let sesionDeHoy = s.dias[3].sesiones[0].assignmentId
            return CasoPlan(
                id: "horizonte", titulo: "Sara · la semana que viene, bloqueada por su club",
                lectura: lectura(s, pisa: {
                    $0.muro = "Tu club publica el plan con una semana de antelación. Se abre el lunes."
                    $0.desgloses[sesionDeHoy] = nil
                }))
        }(),

        // ⑭ Toca «›»: la semana que viene se pide y falla. Se dice «no pudimos cargarla», con «Reintentar».
        CasoPlan(
            id: "sin-red", titulo: "Óscar · la semana que viene no carga",
            lectura: lectura(semanaDeHoy(
                [[d(.series800, .hecha)], [d(.fuerzaInferior, .hecha)], [], [d(.rodaje8k)], [d(.fuerzaSuperior)], [d(.tiradaLarga)], []],
                datos("Semana fuerte: acumulamos volumen.")
            ), siguiente: .falla)),

        // ⑮ Plan sin bloque: «Semana 5» a secas (el total no es un hecho) y sin línea del coach.
        CasoPlan(
            id: "plan-directo", titulo: "Neus · plan directo, sin nombre de bloque ni línea del coach",
            lectura: lectura(semanaDeHoy(
                [[d(.remo5x1000, .hecha)], [], [d(.rodaje45, .hecha)], [d(.emom20)], [d(.movilidadCore)], [], []],
                DatosSemana(posicion: (5, nil))
            ))),

        // ⑯ El peor caso: pareja de dobles, tres sesiones un mismo día, línea del coach de cuatro líneas y bloque larguísimo.
        CasoPlan(
            id: "denso", titulo: "Berta · todo reclamando a la vez",
            lectura: lectura(
                semanaDeHoy(
                    [[d(.fuerzaInferior, .hecha)], [d(.libreRodaje, .hecha)], [],
                     [d(.test1k, .pendiente, franja: "AM"), d(.importada, .pendiente, franja: "PM"), d(.libreRodaje, .pendiente, franja: "AM", libre: true)],
                     [d(.fuerzaSuperior)], [d(.tiradaLarga)], []],
                    DatosSemana(
                        nombreBloque: "Bloque 2 · fuerza, ritmo y un test en medio del bloque", posicion: (3, 6),
                        intencion: "Esta semana quiero que te fíes del ritmo y no del reloj. El lunes y el martes son para asimilar la carga del bloque anterior; el jueves toca test y volumen; el sábado cerramos con una tirada progresiva. Si algo duele, me escribes antes de entrenar.",
                        hayMasAdelante: true)),
                siguiente: semanaQueViene(),
                pisa: { $0.companero = "Biel" })),

        // ⑰ Primera carga sin caché: esqueletos con la MISMA forma que tendrán.
        CasoPlan(
            id: "cargando", titulo: "Arranque en frío (todavía sin semana)",
            lectura: lectura(nil, pisa: { $0.cargando = true; $0.desgloses = [:] })),

        // ⑱ Sin semana y sin caché: error con su salida.
        CasoPlan(
            id: "error", titulo: "Primer arranque sin red",
            lectura: lectura(nil, pisa: { $0.errorCarga = true; $0.desgloses = [:] })),
    ]

    static func casoPlan(_ id: String) -> CasoPlan {
        guard let c = casosPlan.first(where: { $0.id == id }) else { preconditionFailure("Caso de Plan desconocido: \(id)") }
        return c
    }
}

// ── MATRIZ: cada pieza, sus cuatro estados ───────────────────────────────────
//  Cromo         con datos ①(compartir, ciclo, historial, chat) · dobles ⑯ · sin semana ⑩ (sin compartir) · cargando ⑰ · error ⑱
//  Cabecera      con voz del coach ① · sin nombre ni línea ⑮ · cargando ⑰ · (sin cabecera: pausa ⑪, vacíos ⑨⑩, error ⑱)
//  Carril        con sellos ①②③④⑤ · otro día ⑥ · cargando ⑰ · semana que viene ①(›) · sin red ⑭ · bloqueada ⑬
//  Card sesión   pendiente hoy ① · hecha ③ · a medias ④ · sin hacer ⑤ · otro día ⑥ · sin reloj ⑧ · larga ⑫ · cargando ⑰
//  Card descanso hoy ⑦ · otro día (interactivo) · vacía con salida ⑨⑩ · pausa ⑪ · error ⑱
//  Partes        varias ①⑫ · una sola ⑮ · muchas (+ N más) ⑯ · cargando (al cambiar de día) · sin detalle ⑬
//  Fila 2ª       una ② · varias ⑯
//  Acción        empezar ① · ver hecho ③ · ver siguiente ⑦ · reintentar ⑭⑱ · escribir al coach ⑩⑪ · ver semana que viene ⑨
//  Menú          pendiente ① · hecha ③ · a medias ④ · libre ⑯
#endif
