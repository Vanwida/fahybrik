import Foundation

// LA LECTURA DE «PLAN» SIN COACH — lo que la pestaña del atleta libre recibe, y solo eso.
//
// LA REGLA QUE LA GOBIERNA (DECISIONS 27-jul, «El Plan del free enseña EVIDENCIA»): el tier libre MIDE y
// COMPARA; el de pago DECIDE. La pantalla tiene que valer la pena aunque nadie pague nunca, así que todo lo que
// enseña son datos SUYOS. Un número que no existe no se pinta, lo que falta se dice, y primero se le da lo que
// ya tenemos y solo después se le pide algo.
//
// Sin coach no hay chat, comunicados, revisión ni batería de tests. La única pieza «de coach» que queda es la
// de CONVERSIÓN («Entrena con un coach»), que es la superficie de venta, no una función de coach, y no lleva
// ningún nombre: un atleta libre no tiene coach.
//
// Las estaciones de una carrera de dobles NO se le atribuyen jamás (se reparten entre los dos); correr y las
// transiciones sí. Eso lo decide el SERVIDOR (`shared/domain/free-plan`): aquí solo se pinta lo que llega y se
// dice cuándo es un suelo.
//
// Espejo de `web/components/design-twin/kit-plan/{contrato-libre,libre}.ts`. La lectura se construye con lo
// que la app YA lee (`MarkView`, `FreePlanPayload`, el VO₂ del reloj, las carreras importadas, la semana propia).

// MARK: - Lo que sus carreras dicen de él

/// Una carrera terminada, en corto.
struct FinalDeCarrera: Equatable {
    let tiempoS: Int
    /// «Berlín».
    let lugar: String
    /// «may 2025».
    let cuando: String?
    /// «dobles pro» · nil en individual sin división.
    let categoria: String?
    /// El oficial fue el de la PAREJA: nunca se enseña sin decirlo.
    let equipo: Bool
}

/// Sus 8 km de una carrera.
struct OchoKm: Equatable {
    /// Segundos por kilómetro.
    let ritmoSKm: Double
    let totalS: Int
    let lugar: String
    /// En dobles corren juntos: el ritmo lo marca el más lento, así que es un SUELO.
    let suelo: Bool
}

struct EvidenciaDeCarreras: Equatable {
    struct Tendencia: Equatable {
        enum Sentido: Equatable { case mejora, empeora, estable }
        let sentido: Sentido
        let deltaSKm: Double
        let carreras: Int
    }

    struct Transiciones: Equatable {
        let segundos: Int
        let lugar: String
    }

    let carreras: Int
    let mejorTiempo: FinalDeCarrera?
    let mejor8km: OchoKm?
    /// El último. Solo se enseña si no es el mismo que el mejor.
    let ultimo8km: OchoKm?
    let transiciones: Transiciones?
    /// Solo con 3+ carreras INDIVIDUALES: en dobles el ritmo lo marca la pareja.
    let tendencia: Tendencia?
}

/// Su objetivo contra su realidad (`FreeGoalCheck`).
enum Comparacion: Equatable {
    /// `deltaS = objetivo − mejor`. Positivo = el objetivo es MÁS LENTO de lo que ya corrió.
    case mejor(FinalDeCarrera, deltaS: Int)
    case sin(motivo: Motivo, categoria: String?)

    enum Motivo: Equatable { case sinCarreras, formatoDistinto }
}

struct CarreraDelPlanLibre: Equatable {
    let nombre: String
    /// Días que faltan; nil si el cable no trae cuenta atrás.
    let dias: Int?
    /// «Individual · Open · Hombres».
    let categoria: String?
    /// «1:12:30». Nil si el atleta no fijó objetivo de tiempo.
    let objetivo: String?
    let comparacion: Comparacion?
    /// Marcas que faltan para poder decirle cuánto tardaría. Solo sin evidencia de carreras.
    let faltan: [String]
}

enum CarreraLibre: Equatable {
    case fijada(CarreraDelPlanLibre)
    /// Sin carrera objetivo: se invita a ponerla (con su salida).
    case sinObjetivo
}

// MARK: - Lo que ha medido y lo que le falta

/// Una marca del catálogo del servidor. Los rótulos nunca se repiten en cliente.
struct MarcaLibre: Equatable, Identifiable {
    let slug: String
    let etiqueta: String
    /// Su mejor valor ya escrito («3:42»). Nil = sin medir.
    let valor: String?
    /// «hace 3 semanas».
    let cuando: String?
    /// «Calle o cinta, la app lo mide sola · te lleva ~4-5 min».
    let como: String
    /// Qué gana midiéndola: «Mídelo y tu semana gana la sesión de remo».
    let desbloquea: String
    /// «te lleva ~4-5 min».
    let dura: String

    var id: String { slug }
}

/// Una fila de la semana bloqueada: REAL, calculada con datos suyos.
struct SesionBloqueada: Equatable {
    /// «LUN».
    let dia: String
    let titulo: String
    let detalle: String
}

struct SemanaBloqueada: Equatable {
    let sesiones: [SesionBloqueada]
    /// Cuántas se leen sin desenfocar. El resto son sesiones reales, desenfocadas.
    let visibles: Int
    /// De dónde salen los números: «Calculado con tus 8 km de Berlín».
    let base: String
}

struct Vo2Reloj: Equatable {
    let etiqueta: String
    let valor: String
    let unidad: String
}

struct LecturaLibre: Equatable {
    struct Marcas: Equatable {
        var medidas: [MarcaLibre] = []
        var faltan: [MarcaLibre] = []
        /// Las tres de arranque (1 km, remo 500, ski 1.000) que el catálogo ofrece, en orden.
        var arranque: [MarcaLibre] = []
        /// El catálogo no se pudo leer: se dice y se ofrece reintentar.
        var falloCatalogo = false
    }

    /// Aún sin saber si hay evidencia o no: esqueleto, jamás «sin datos» un instante y luego otra cosa.
    var cargando = false
    var hoyIso: String
    var carrera: CarreraLibre = .sinObjetivo
    var vo2: Vo2Reloj?
    /// Cuántas carreras suyas están importadas (decide, con las marcas, cuál de los dos estados es).
    var carrerasImportadas = 0
    var evidencia: EvidenciaDeCarreras?
    var semanaBloqueada: SemanaBloqueada?
    var marcas = Marcas()
    /// Sin carreras importadas todavía: se le ofrece traerlas en un toque.
    var puedeImportar = true
    /// Su semana propia (sus sesiones libres). Nil mientras no llega.
    var semana: SemanaDelPlan?

    /// ¿Tiene algo real sobre sí mismo? Una marca medida o una carrera importada.
    var tieneEvidencia: Bool { !marcas.medidas.isEmpty || carrerasImportadas > 0 }
}

// MARK: - La acción anclada

/// La única acción anclada de la pestaña sin coach: la primera marca, o programar un entreno.
enum AccionLibre: Equatable {
    case medir(MarcaLibre)
    case programar
}

extension LecturaLibre {
    /// Sin nada medido la puerta es la primera marca de arranque (es lo que hay que hacer ahora); con evidencia,
    /// lo útil es programar un entreno. Nil mientras carga: aún no sabemos cuál de las dos toca.
    var accion: AccionLibre? {
        if cargando { return nil }
        if !tieneEvidencia, let primera = marcas.arranque.first { return .medir(primera) }
        return .programar
    }
}

// MARK: - Lo que se traduce del cable

extension LecturaLibre {

    /// Traduce lo que la app YA lee a la lectura. Todo lo que hay que decidir (qué marcas son medibles, en qué
    /// orden salen las de arranque, qué se compara con qué) sale de aquí y de `PlanLibreCopy`, no de la vista.
    static func desde(
        marcas catalogo: [MarkView],
        marcasCargadas: Bool,
        marcasFallaron: Bool,
        carrerasCargadas: Bool,
        carrerasImportadas: Int,
        vo2: BiometricMetricSeries?,
        retrato: FreePlanPayload?,
        carreraObjetivo: AthleteNextRace?,
        semana: SemanaDelPlan?,
        hoyIso: String
    ) -> LecturaLibre {
        // Las dos fuentes del fork «con evidencia / sin ella» han contestado (de caché o de red). Sin esto la
        // pantalla podía pintar «sin datos» un instante a quien tiene su historial en camino, y luego cambiar.
        let asentada = marcasCargadas && carrerasCargadas

        // Las marcas que la APP puede medir de punta a punta (las distancias que se registran viven en la biblioteca).
        let medibles = catalogo.filter { $0.measuredBy != "registered" }
        let medidas = medibles.filter { $0.best != nil }.map(PlanLibreCopy.marca)
        let faltan = medibles.filter { $0.best == nil }.map(PlanLibreCopy.marca)
        let arranque = PlanLibreCopy.slugsDeArranque.compactMap { slug in medibles.first { $0.slug == slug } }.map(PlanLibreCopy.marca)

        var l = LecturaLibre(hoyIso: hoyIso)
        l.cargando = !asentada
        l.vo2 = vo2.map { Vo2Reloj(etiqueta: $0.label, valor: Formato.esDecimal($0.latest), unidad: $0.unit) }
        l.carrerasImportadas = carrerasImportadas
        l.puedeImportar = carrerasImportadas == 0
        l.marcas = Marcas(medidas: medidas, faltan: faltan, arranque: arranque, falloCatalogo: marcasFallaron)
        l.evidencia = retrato?.raceEvidence.map(PlanLibreCopy.evidencia)
        l.semanaBloqueada = retrato?.week.flatMap { $0.sessions.isEmpty ? nil : PlanLibreCopy.semanaBloqueada($0) }
        l.semana = semana
        if let carreraObjetivo {
            l.carrera = .fijada(CarreraDelPlanLibre(
                nombre: carreraObjetivo.name,
                dias: carreraObjetivo.daysUntil,
                categoria: carreraObjetivo.categoryLine,
                objetivo: carreraObjetivo.goalTimeFormatted,
                comparacion: retrato?.goalCheck.map(PlanLibreCopy.comparacion),
                // Sin objetivo y sin nada que comparar, lo honesto es nombrar lo que falta. Con carreras importadas
                // esto ya no aparece: la tarjeta de sus carreras le devuelve lo que sí sabemos.
                faltan: retrato?.raceEvidence == nil
                    ? PlanLibreCopy.enOrdenDeArranque(medibles.filter { $0.best == nil }).map(\.label)
                    : []
            ))
        }
        return l
    }
}
