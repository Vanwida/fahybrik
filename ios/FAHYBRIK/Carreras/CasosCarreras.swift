#if DEBUG
import Foundation

// LOS VEINTE CASOS DE «CARRERAS» — atletas de ejemplo que recorren todos los estados. Espejo de
// `kit-carreras/casos.ts` y `datos.ts`: las MISMAS veinte lecturas, con los mismos números, para poder
// poner cada captura al lado de la de su doble.
//
// NINGUNO sale de la base de producción (CONTRATO-UI §7; «no hay atletas reales»): son personas y
// carreras inventadas para romper el modelo. Y con las cuentas CUADRADAS (un total = correr +
// estaciones + RoxZone, siempre), porque un ejemplo que no suma le enseña al diseño una carrera que
// no existe. Alimentan las `#Preview` y las pruebas (`DecideCarrerasTests`, la galería renderizada);
// no se compilan en release.
//
// El orden es el de una temporada, del caso lleno al mínimo (§6.3: «el caso mínimo es el caso de
// diseño»): el mínimo con objetivo (②), el que solo tiene historial (③) y el vacío total (④) van a
// la vista, no escondidos al final.

struct CasoCarreras: Identifiable {
    let id: String
    let titulo: String
    /// Qué simula y qué hay que mirar.
    let mira: String
    let lectura: LecturaCarreras
}

enum CasosCarreras {

    /// El «hoy» de todos los casos: martes 29 de septiembre de 2026.
    static let hoy = "2026-09-29"

    /// El ISO de `hoy` + n días.
    static func en(_ dias: Int) -> String { sumaDias(hoy, dias) }

    static func sumaDias(_ iso: String, _ n: Int) -> String {
        let cal = Calendar(identifier: .gregorian)
        guard let base = FechaES.fecha(iso), let d = cal.date(byAdding: .day, value: n, to: base) else { return iso }
        return FechaES.iso(d)
    }

    // MARK: Ladrillos

    static func proxima(
        _ raceId: Int,
        _ nombre: String,
        _ dias: Int?,
        tipoEvento: TipoEventoCarrera = .hyrox,
        formato: FormatoCarrera = .individual,
        division: DivisionCarrera = .open,
        categoria: CategoriaCarrera = .hombres,
        lugar: String? = nil,
        metaS: Int? = nil,
        prioridad: PrioridadCarrera = .principal
    ) -> ProximaCarrera {
        ProximaCarrera(
            raceId: raceId,
            nombre: nombre,
            tipoEvento: tipoEvento,
            formato: formato,
            division: division,
            categoria: categoria,
            fecha: dias.map(en),
            lugar: lugar,
            metaS: metaS,
            diasHasta: dias,
            prioridad: prioridad
        )
    }

    private static func estaciones(_ segundos: [Int?]) -> [ParcialEstacion] {
        DecideCarreras.indicesEstacion.enumerated().map { i, indice in
            ParcialEstacion(indice: indice, segundos: i < segundos.count ? segundos[i] : nil)
        }
    }

    static func pasada(
        _ raceId: Int,
        _ nombre: String,
        _ fecha: String?,
        _ resultadoS: Int?,
        tipoEvento: TipoEventoCarrera = .hyrox,
        formato: FormatoCarrera = .individual,
        division: DivisionCarrera = .open,
        correrS: Int? = nil,
        roxzoneS: Int? = nil,
        vueltas: [Int?] = [],
        estaciones: [ParcialEstacion] = [],
        companeros: [CompaneroDeEquipo] = [],
        puesto: Int? = nil,
        campo: Int? = nil
    ) -> CarreraPasada {
        CarreraPasada(
            raceId: raceId,
            nombre: nombre,
            fecha: fecha,
            tipoEvento: tipoEvento,
            formato: formato,
            division: division,
            resultadoS: resultadoS,
            correrS: correrS,
            roxzoneS: roxzoneS,
            vueltas: vueltas,
            estaciones: estaciones,
            companeros: companeros,
            puesto: puesto,
            campo: campo
        )
    }

    private static func equipo(_ nombres: String...) -> [CompaneroDeEquipo] {
        nombres.enumerated().map { CompaneroDeEquipo(posicion: $0 + 1, nombre: $1) }
    }

    // MARK: El historial de Nora (todo cuadra: correr + estaciones + RoxZone = total)

    static let individual2024BCN = pasada(
        101, "HYROX Barcelona", "2024-11-09", 4390,
        correrS: 2284, roxzoneS: 310,
        vueltas: [262, 268, 274, 281, 288, 296, 303, 312],
        estaciones: estaciones([262, 196, 265, 248, 251, 132, 214, 228]),
        puesto: 690, campo: 1240
    )

    static let individual2025MAD = pasada(
        102, "HYROX Madrid", "2025-03-08", 4268,
        correrS: 2245, roxzoneS: 296,
        vueltas: [258, 265, 270, 276, 284, 290, 297, 305],
        estaciones: estaciones([252, 190, 255, 240, 246, 128, 206, 210]),
        puesto: 588, campo: 1310
    )

    static let individual2025BCN = pasada(
        103, "HYROX Barcelona", "2025-11-02", 4166,
        correrS: 2216, roxzoneS: 288,
        vueltas: [256, 262, 267, 272, 279, 286, 293, 301],
        estaciones: estaciones([244, 182, 247, 228, 240, 124, 198, 199]),
        puesto: 502, campo: 1204
    )

    static let individual2026VLC = pasada(
        105, "HYROX Valencia", "2026-05-16", 4012,
        correrS: 2170, roxzoneS: 280,
        vueltas: [252, 258, 262, 268, 271, 279, 286, 294],
        estaciones: estaciones([232, 168, 231, 210, 236, 118, 182, 185]),
        puesto: 412, campo: 1180
    )

    static let dobles2026GIR = pasada(
        104, "HYROX Girona", "2026-02-14", 3745,
        formato: .dobles,
        correrS: 1960, roxzoneS: 245,
        vueltas: [232, 238, 241, 245, 246, 249, 253, 256],
        estaciones: estaciones([200, 150, 204, 190, 210, 112, 236, 238]),
        companeros: equipo("Aina Ferrer"),
        puesto: 88, campo: 420
    )

    static let dobles2025MAD = pasada(
        106, "HYROX Madrid", "2025-06-21", 3822,
        formato: .dobles,
        correrS: 2003, roxzoneS: 258,
        vueltas: [236, 243, 246, 250, 252, 255, 259, 262],
        estaciones: estaciones([204, 152, 208, 193, 215, 114, 238, 237]),
        companeros: equipo("Aina Ferrer"),
        puesto: 121, campo: 388
    )

    static let relevo2025VLC = pasada(
        107, "HYROX Valencia", "2025-05-17", 3410,
        formato: .relevos,
        correrS: 1780, roxzoneS: 200,
        vueltas: [215, 218, 220, 222, 224, 226, 227, 228],
        estaciones: estaciones([185, 138, 190, 175, 195, 98, 212, 237]),
        companeros: equipo("Aina Ferrer", "Joan Puig", "Pau Serra"),
        puesto: 34, campo: 152
    )

    /// Una carrera importada con las estaciones que sí trajo y nada más: sin vueltas, sin RoxZone, sin puesto.
    static let individualSinVueltas = pasada(
        108, "HYROX Girona", "2025-01-25", 4520,
        estaciones: estaciones([255, 200, 262, 250, 258, 136, 220, 232])
    )

    // MARK: El análisis de Valencia (la última individual)

    private static func estacion(_ indice: Int, _ tiempoS: Int?, _ deltaS: Int?, _ fraccion: Double?, _ severidad: SeveridadCarrera?) -> EstacionVsReferencia {
        EstacionVsReferencia(estacion: HyroxStation.labels[indice] ?? "", tiempoS: tiempoS, deltaS: deltaS, fraccion: fraccion, severidad: severidad)
    }

    static let estacionesValencia: [EstacionVsReferencia] = [
        estacion(2, 232, 5, 0.38, .slightlyWorse),
        estacion(4, 168, -6, 0.22, .better),
        estacion(6, 231, 31, 0.58, .worse),
        estacion(8, 210, -4, 0.33, .slightlyWorse),
        estacion(10, 236, -8, 0.19, .better),
        estacion(12, 118, 2, 0.15, .better),
        estacion(14, 182, 12, 0.47, .slightlyWorse),
        estacion(16, 185, 26, 0.66, .worse),
    ]

    static let ritmoValencia: [VueltaRitmo] = [
        VueltaRitmo(km: 1, ritmoS: 252, altura: 0.857, severidad: .better),
        VueltaRitmo(km: 2, ritmoS: 258, altura: 0.878, severidad: .better),
        VueltaRitmo(km: 3, ritmoS: 262, altura: 0.891, severidad: .better),
        VueltaRitmo(km: 4, ritmoS: 268, altura: 0.912, severidad: .slightlyWorse),
        VueltaRitmo(km: 5, ritmoS: 271, altura: 0.922, severidad: .slightlyWorse),
        VueltaRitmo(km: 6, ritmoS: 279, altura: 0.949, severidad: .worse),
        VueltaRitmo(km: 7, ritmoS: 286, altura: 0.973, severidad: .worse),
        VueltaRitmo(km: 8, ritmoS: 294, altura: 1, severidad: .worse),
    ]

    static let analisisValencia = AnalisisCarrera(
        raceId: 105, nombre: "HYROX Valencia", fecha: "2026-05-16",
        estaciones: estacionesValencia,
        caidaRitmoS: 23,
        ritmoPorKm: ritmoValencia,
        informe: nil,
        predichoVsReal: PredichoVsReal(predijimosS: 4050, hicisteS: 4012, precisionPct: 99, precisionPalabra: "clavado")
    )

    /// El análisis de una carrera que solo trajo los tiempos: sin puesto por estación ni entreno con el
    /// que comparar, así que cada fila es SOLO su tiempo.
    static func analisisSoloTiempos(_ c: CarreraPasada) -> AnalisisCarrera {
        AnalisisCarrera(
            raceId: c.raceId, nombre: c.nombre, fecha: c.fecha,
            estaciones: c.estaciones.map {
                EstacionVsReferencia(estacion: HyroxStation.labels[$0.indice] ?? "", tiempoS: $0.segundos, deltaS: nil, fraccion: nil, severidad: nil)
            },
            caidaRitmoS: nil, ritmoPorKm: [], informe: nil, predichoVsReal: nil
        )
    }

    // MARK: Los casos

    private static let base = LecturaCarreras(
        hoy: hoy, conCoach: true, noLeidosChat: 0,
        cargaHub: .lista, cargaAnalisis: .lista,
        proximas: [], pasadas: [], prediccion: .noAplica, analisis: nil
    )

    private static func caso(
        _ id: String, _ titulo: String, _ mira: String,
        conCoach: Bool = true, noLeidosChat: Int = 0,
        cargaHub: CargaCarreras = .lista, cargaAnalisis: CargaCarreras = .lista,
        proximas: [ProximaCarrera] = [], pasadas: [CarreraPasada] = [],
        prediccion: PrediccionCarrera = .noAplica, analisis: AnalisisCarrera? = nil
    ) -> CasoCarreras {
        CasoCarreras(
            id: id, titulo: titulo, mira: mira,
            lectura: LecturaCarreras(
                hoy: base.hoy, conCoach: conCoach, noLeidosChat: noLeidosChat,
                cargaHub: cargaHub, cargaAnalisis: cargaAnalisis,
                proximas: proximas, pasadas: pasadas, prediccion: prediccion, analisis: analisis
            )
        )
    }

    /// Las cinco formas que puede tener una fila de estación, y una sin dato que desaparece.
    private static var estacionesVariadas: [EstacionVsReferencia] {
        let e = estacionesValencia
        return [
            e[0],
            EstacionVsReferencia(estacion: e[1].estacion, tiempoS: e[1].tiempoS, deltaS: nil, fraccion: e[1].fraccion, severidad: e[1].severidad),
            EstacionVsReferencia(estacion: e[2].estacion, tiempoS: e[2].tiempoS, deltaS: e[2].deltaS, fraccion: nil, severidad: nil),
            EstacionVsReferencia(estacion: e[3].estacion, tiempoS: e[3].tiempoS, deltaS: nil, fraccion: nil, severidad: nil),
            EstacionVsReferencia(estacion: e[4].estacion, tiempoS: nil, deltaS: nil, fraccion: nil, severidad: nil),
            e[5], e[6], e[7],
        ]
    }

    static let historialIndividual = [individual2026VLC, individual2025BCN, individual2025MAD, individual2024BCN]
    static let historialMixto = [individual2026VLC, dobles2026GIR, individual2025BCN, individual2025MAD, individual2024BCN]

    /// El historial que trae importar el perfil `marc-vila-soler` (el del atleta de ejemplo).
    static let historialImportable = [individual2026VLC, dobles2026GIR, individual2025BCN, individual2025MAD, individual2024BCN]

    static let todos: [CasoCarreras] = [
        caso(
            "lleno", "① Objetivo a 39 días, con todo",
            "El caso LLENO: el objetivo principal a 39 días es el sujeto (foto, cuenta atrás enorme, meta y predicho completo con su hueco), una carrera de puesta a punto a 12 días debajo, y el historial con el análisis de la última individual. Mira qué es lo primero que se ve, que el predicho no lleve color en la cifra, y que dobles e individuales convivan en el historial.",
            noLeidosChat: 1,
            proximas: [
                proxima(201, "HYROX Barcelona", 39, lugar: "Fira de Barcelona", metaS: 3900),
                proxima(202, "HYROX Madrid", 12, lugar: "IFEMA Madrid", metaS: 4080, prioridad: .puestaAPunto),
            ],
            pasadas: historialMixto,
            prediccion: .cifra(totalS: 3790, huecoS: -110, pareja: nil),
            analisis: analisisValencia
        ),
        caso(
            "solo-objetivo", "② Solo un objetivo, sin historial",
            "EL CASO MÍNIMO CON OBJETIVO (§6.3): una carrera fijada y nada más. El predicho no puede dar cifra y lo dice («aún sin datos» y por qué se llena solo); «Próximas» ofrece otra carrera diciendo lo que pasa al fijarla; «Pasadas» es una invitación con su salida (importar el historial). Ningún hueco es gris sin acto.",
            proximas: [proxima(211, "HYROX Barcelona", 39, lugar: "Fira de Barcelona", metaS: 4200)],
            prediccion: .sinDatos(pareja: nil)
        ),
        caso(
            "solo-historial", "③ Solo historial, sin objetivos",
            "Sin nada por delante el sujeto pasa a ser tu última carrera (con su tiempo enorme, el parcial y el puesto) y su salida es fijar la siguiente. Debajo, el análisis de esa carrera y el historial. «Próximas» no repite el vacío: el sujeto ya invita.",
            pasadas: historialIndividual, analisis: analisisValencia
        ),
        caso(
            "vacio", "④ Recién dada de alta, sin nada",
            "EL VACÍO TOTAL (§6.3): ni carreras por delante ni por detrás. El sujeto es la invitación, con sus DOS salidas (buscar carrera, importar historial) y lo que da cada una. Sin cola muerta: la foto crece hasta llenar el alto."
        ),
        caso(
            "dobles", "⑤ Solo dobles y relevos",
            "Historial solo de equipo: cada tiempo es DEL EQUIPO y se dice (chip, «con Aina» y aviso al abrir los parciales); no hay análisis por estación ni gráfica (eso sale de individuales) y la pestaña lo explica en una frase. El objetivo es de dobles con su predicho conjunto y su pareja.",
            proximas: [proxima(231, "HYROX Barcelona", 26, formato: .dobles, categoria: .mixto, lugar: "Fira de Barcelona", metaS: 3660)],
            pasadas: [dobles2026GIR, dobles2025MAD, relevo2025VLC],
            prediccion: .cifra(totalS: 3702, huecoS: 42, pareja: "Aina")
        ),
        caso(
            "parcial", "⑥ Predicho parcial (faltan estaciones)",
            "Hay 8 tramos medidos de 10 y faltan dos (la carrera a pie y la RoxZone, que su única carrera no trajo): la previsión NO inventa un tiempo. Sin cifra, con la regleta de tramos y los que faltan por su nombre. El análisis viene de esa carrera sin vueltas ni puestos: las estaciones van sin barra y la sección lo dice.",
            proximas: [proxima(241, "HYROX Girona", 26, lugar: "Fira de Girona", metaS: 4200)],
            pasadas: [individualSinVueltas],
            prediccion: .parcial(medidos: 8, de: 10, faltan: ["Carrera · 8 km", "RoxZone"], pareja: nil),
            analisis: analisisSoloTiempos(individualSinVueltas)
        ),
        caso(
            "dia-de-carrera", "⑦ Hoy es la carrera",
            "Cuenta atrás a cero: la cifra de «39 días» pasa a la palabra «Hoy» y el kicker a «Día de carrera». El predicho ya está congelado (se fija justo antes de la prueba) y sigue leyéndose. Nada que hacer sino correr: el sujeto lo celebra, no pide.",
            proximas: [proxima(251, "HYROX Barcelona", 0, lugar: "Fira de Barcelona", metaS: 3900)],
            pasadas: [individual2026VLC, individual2025BCN, individual2025MAD],
            prediccion: .cifra(totalS: 3790, huecoS: -110, pareja: nil),
            analisis: analisisValencia
        ),
        caso(
            "ayer", "⑧ Corriste ayer, falta tu resultado",
            "El momento manda: una carrera de ayer sin resultado importado es LO PRIMERO (lo único que se puede hacer con ella), por delante del objetivo, que pasa a la primera fila de «Próximas». La salida es importar. Cuando el resultado llega, el sujeto vuelve al objetivo.",
            proximas: [proxima(261, "HYROX Barcelona", 39, lugar: "Fira de Barcelona", metaS: 3900)],
            pasadas: [pasada(262, "HYROX Madrid", en(-1), nil), individual2026VLC, individual2025BCN, individual2025MAD],
            prediccion: .cifra(totalS: 3790, huecoS: -110, pareja: nil),
            analisis: analisisValencia
        ),
        caso(
            "varios", "⑨ Muchos objetivos, dos el mismo día",
            "El denso: un principal con nombre largo y seis más (una de puesta a punto, dos el MISMO día que el principal, una DEKA, una carrera a pie que no es HYROX, otra sin fecha confirmada). Mira el orden (por día, el principal primero en empate, sin fecha al final), el pliegue «Ver 3 más» y que la de a pie no lleve individual/open/hombres inventado.",
            proximas: [
                proxima(271, "HYROX Barcelona · Campeonato de España", 39, division: .elite, categoria: .mujeres, lugar: "Fira de Barcelona", metaS: 3660),
                proxima(272, "HYROX Barcelona", 39, formato: .dobles, categoria: .mixto, lugar: "Fira de Barcelona", metaS: 3780, prioridad: .secundaria),
                proxima(273, "HYROX Madrid", 12, lugar: "IFEMA Madrid", metaS: 3960, prioridad: .puestaAPunto),
                proxima(274, "DEKA Mile Sevilla", 96, tipoEvento: .deka, lugar: "Sevilla", prioridad: .secundaria),
                proxima(275, "HYROX Valencia", nil, lugar: "Valencia", prioridad: .secundaria),
                proxima(276, "Mitja Marató de Barcelona", 141, tipoEvento: .otro, lugar: "Barcelona", metaS: 5940, prioridad: .secundaria),
                proxima(277, "HYROX Lisboa", 124, division: .pro, lugar: "Lisboa", prioridad: .secundaria),
            ],
            pasadas: [individual2026VLC, individual2025BCN],
            prediccion: .cifra(totalS: 3702, huecoS: 42, pareja: nil),
            analisis: analisisValencia
        ),
        caso(
            "sin-coach", "⑩ Sin coach (tier libre)",
            "Sin coach no hay chat en la cabecera ni «Preguntar al coach» en el menú de la carrera, y nada dice «tu entrenador». Todo lo demás es del atleta y se queda: objetivo, historial, análisis. Aquí además NO ha fijado tiempo: el hueco se declara con su salida («Fijar tiempo objetivo»).",
            conCoach: false,
            proximas: [
                proxima(281, "HYROX Barcelona", 39, lugar: "Fira de Barcelona"),
                proxima(282, "HYROX Madrid", 12, lugar: "IFEMA Madrid", prioridad: .puestaAPunto),
            ],
            pasadas: [individual2026VLC, individual2025BCN, individual2025MAD],
            prediccion: .sinMeta,
            analisis: analisisValencia
        ),
        caso(
            "cargando", "⑪ Arranque en frío",
            "Primera carga sin caché. Cada pieza es un esqueleto con la MISMA forma que tendrá (sujeto, próximas, pasadas): ni un vacío ni una invitación, porque aún no sabemos cuál de las dos toca. Nada salta de sitio cuando llegan los datos.",
            cargaHub: .fria, cargaAnalisis: .fria
        ),
        caso(
            "error", "⑫ Primer arranque sin red",
            "La carga falló y no hay caché. Hoy la pestaña lo pinta como «Sin objetivos todavía» (un fallo que parece un vacío); aquí es un error dicho, con su salida («Reintentar»), que además ejecuta.",
            cargaHub: .error, cargaAnalisis: .error
        ),
        caso(
            "importando", "⑬ Importación en curso",
            "La hoja «Importar carrera» a mitad de camino: perfil elegido, «Importando…» sin poder repetir el toque. Detrás, la pantalla espera: aquí es el caso vacío."
        ),
        caso(
            "no-soy-yo", "⑭ «No soy yo»: confirmar el borrado",
            "El historial importado era de otra persona. Tocar «¿No eres tú?» abre la confirmación que dice qué se borra y que se podrá buscar de nuevo.",
            pasadas: historialIndividual, analisis: analisisValencia
        ),
        caso(
            "sin-pareja", "⑮ Dobles sin pareja conectada",
            "El objetivo es de dobles y su pareja no está conectada: el predicho conjunto no se puede calcular y la pantalla lo dice con su salida («Conecta a tu pareja»), en vez de un número de uno solo. Ha corrido dobles y relevos, y el historial lo muestra igual.",
            proximas: [proxima(291, "HYROX Madrid", 12, formato: .dobles, categoria: .mixto, lugar: "IFEMA Madrid", metaS: 3720)],
            pasadas: [dobles2025MAD, relevo2025VLC],
            prediccion: .sinPareja
        ),
        caso(
            "informe", "⑯ Informe de la IA y filas de estación variadas",
            "Todo lo que puede llevar el análisis: el informe «a priorizar» (hoy el servidor lo manda vacío, pero la pestaña lo pinta si llega) y las formas de una fila de estación: con barra y delta, sin delta (sin entreno con el que comparar), sin barra (sin puesto), solo el tiempo, y una sin tiempo que desaparece (son siete filas, no ocho). Predicho con una sola estación por medir.",
            proximas: [proxima(301, "HYROX Barcelona", 39, lugar: "Fira de Barcelona", metaS: 3900)],
            pasadas: historialIndividual,
            prediccion: .parcial(medidos: 9, de: 10, faltan: ["Wall ball"], pareja: nil),
            analisis: AnalisisCarrera(
                raceId: analisisValencia.raceId, nombre: analisisValencia.nombre, fecha: analisisValencia.fecha,
                estaciones: estacionesVariadas,
                caidaRitmoS: analisisValencia.caidaRitmoS,
                ritmoPorKm: analisisValencia.ritmoPorKm,
                informe: InformeIA(
                    resumen: "Pierdes tiempo en el sled pull y en los wall balls con el cuerpo ya cargado. Trabaja empuje y tirón con carga y llega a los km finales con mejor ritmo.",
                    grupos: ["G03 · Ergómetros", "G09 · Circuitos f-r"]
                ),
                predichoVsReal: nil
            )
        ),
        caso(
            "llegando", "⑰ El análisis todavía llega",
            "El hub ya cargó y el análisis y el predicho siguen en camino: el historial y las próximas se ven y los bloques que faltan son esqueletos con su forma final, no un hueco que luego se llena de golpe.",
            cargaAnalisis: .fria,
            proximas: [proxima(311, "HYROX Barcelona", 39, lugar: "Fira de Barcelona", metaS: 3900)],
            pasadas: historialIndividual,
            prediccion: .cargando
        ),
        caso(
            "fallos", "⑱ El predicho y el análisis fallaron",
            "Lo principal cargó, dos lecturas secundarias no. Cada fallo es local y dicho con su salida («Reintentar»); ninguno tumba la pantalla ni se hace pasar por un vacío.",
            cargaAnalisis: .error,
            proximas: [proxima(321, "HYROX Barcelona", 39, lugar: "Fira de Barcelona", metaS: 3900)],
            pasadas: historialIndividual,
            prediccion: .error
        ),
        caso(
            "sin-principal", "⑲ Sin objetivo principal",
            "Quitó el principal y le quedan dos carreras (puesta a punto y secundaria). El sujeto es la más próxima, con su rol dicho, y su acción es la salida: «Hacer objetivo principal». El predicho se calcula solo para el principal y aquí no se inventa.",
            proximas: [
                proxima(331, "HYROX Madrid", 12, lugar: "IFEMA Madrid", metaS: 4080, prioridad: .puestaAPunto),
                proxima(332, "HYROX Girona", 71, lugar: "Fira de Girona", prioridad: .secundaria),
            ],
            pasadas: historialIndividual,
            analisis: analisisValencia
        ),
        caso(
            "no-hyrox", "⑳ Objetivo que no es HYROX",
            "Una media maratón como objetivo: solo hay fecha, meta y lugar, sin predicho tramo a tramo (eso es solo de HYROX) y sin «Individual · Open · Hombres», que el servidor rellena por defecto en las que no lo son. La acción es cambiar el tiempo objetivo.",
            proximas: [proxima(341, "Mitja Marató de Barcelona", 141, tipoEvento: .otro, lugar: "Barcelona", metaS: 5940)]
        ),
    ]

    static func caso(_ id: String) -> CasoCarreras {
        guard let c = todos.first(where: { $0.id == id }) else { fatalError("Caso de Carreras desconocido: \(id)") }
        return c
    }

    // MARK: Las invariantes de una lectura

    /// Las invariantes que el servidor garantiza y la pantalla da por buenas. Un caso que las rompa es
    /// un caso mal escrito (o un modelo mal hecho): las pruebas recorren los veinte.
    static func problemasDeLectura(_ l: LecturaCarreras) -> [String] {
        var p: [String] = []
        let raceIds = l.proximas.map(\.raceId) + l.pasadas.map(\.raceId)
        if Set(raceIds).count != raceIds.count { p.append("raceId repetido entre próximas y pasadas") }

        for c in l.proximas {
            if (c.fecha == nil) != (c.diasHasta == nil) { p.append("\(c.nombre): fecha y diasHasta deben ir juntos") }
            if let fecha = c.fecha {
                if fecha < l.hoy { p.append("\(c.nombre): una próxima con fecha anterior a hoy") }
                else if c.diasHasta != DecideCarreras.diasEntre(l.hoy, fecha) { p.append("\(c.nombre): diasHasta no cuadra con la fecha") }
            }
        }
        for c in l.pasadas {
            if let fecha = c.fecha, fecha > l.hoy { p.append("\(c.nombre): una pasada con fecha futura") }
            if c.formato == .individual && !c.companeros.isEmpty { p.append("\(c.nombre): individual con compañeros") }
            if c.formato != .individual && c.companeros.isEmpty { p.append("\(c.nombre): de equipo sin compañeros") }
            if c.vueltas.count > 8 { p.append("\(c.nombre): más de 8 vueltas") }
            if c.estaciones.contains(where: { !DecideCarreras.indicesEstacion.contains($0.indice) }) { p.append("\(c.nombre): índice de estación no canónico") }
            if let puesto = c.puesto, let campo = c.campo, puesto > campo { p.append("\(c.nombre): puesto mayor que el campo") }
            // Las cuentas cuadran: el correr son sus vueltas y el total es correr + estaciones + RoxZone.
            let vueltas = c.vueltas.compactMap { $0 }
            if let correr = c.correrS, vueltas.count == 8, vueltas.reduce(0, +) != correr { p.append("\(c.nombre): las vueltas no suman el correr") }
            if let total = c.resultadoS, let correr = c.correrS, let rox = c.roxzoneS, let est = DecideCarreras.estacionesTotalS(c), correr + rox + est != total {
                p.append("\(c.nombre): correr + estaciones + RoxZone no suma el total")
            }
        }

        let principal = DecideCarreras.principalDe(l.proximas)
        if l.cargaHub == .lista {
            if principal == nil && l.prediccion != .noAplica { p.append("sin principal, el predicho solo puede ser «no aplica»") }
            if let principal, principal.tipoEvento != .hyrox, l.prediccion != .noAplica, l.prediccion != .sinMeta {
                p.append("una carrera que no es HYROX no tiene predicho")
            }
            if case .parcial(let medidos, let de, let faltan, _) = l.prediccion {
                if medidos >= de { p.append("parcial con todos los tramos") }
                if faltan.count != de - medidos { p.append("parcial: faltan no cuadra con medidos") }
            }
            if l.prediccion == .sinMeta, principal?.metaS != nil { p.append("sin meta con meta fijada") }
        }

        if !l.conCoach {
            if l.noLeidosChat != 0 { p.append("sin coach no hay chat") }
            if l.analisis?.informe != nil { p.append("sin coach no hay informe de la IA del método") }
        }
        if let a = l.analisis {
            if let base = l.pasadas.first(where: { $0.raceId == a.raceId }) {
                if base.formato != .individual || base.resultadoS == nil { p.append("el análisis solo sale de una individual con resultado") }
            } else {
                p.append("el análisis apunta a una carrera que no está en el historial")
            }
            if a.estaciones.count > 8 { p.append("más de 8 estaciones") }
            if a.ritmoPorKm.count > 8 { p.append("más de 8 kilómetros") }
        }
        return p
    }
}
#endif
