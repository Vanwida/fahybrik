import Foundation

// EL CONTRATO DE «CARRERAS» — lo que la pestaña recibe, y solo eso.
//
// Es el espejo, campo a campo, de `web/components/design-twin/kit-carreras/contrato.ts`: la
// pestaña PINTA una `LecturaCarreras` ya resuelta y no decide nada por su cuenta. Quien decide es
// `DecideCarreras` (el sujeto, el orden, la acción, las cuentas), y quien construye la lectura
// desde lo que la app ya lee (el hub de carreras, el análisis, el predicho) es
// `LecturaCarreras.desde(...)` en `LecturaCarreras+Cable.swift`. Así la app y el doble no pueden
// divergir: son la misma lectura con los mismos tests.
//
// ── LÍMITES YA DECIDIDOS (docs/DECISIONS.md), que esta pestaña respeta ────────────────────────
//  · Analíticas: el volumen, el ritmo y las tendencias del ENTRENO viven allí. Aquí solo hay
//    carreras: objetivos futuros y resultados.
//  · «Ningún hueco se cobra al objetivo»: mientras falte un tramo el total del predicho es NULO y
//    los tramos sin dato se NOMBRAN. Nunca una cifra a medias (`PrediccionCarrera.parcial`).
//  · Un solo «hoy» (el del atleta) para que una carrera nunca caiga entre «próximas» y
//    «pasadas»: llega resuelto en `hoy` y en `diasHasta`.
//  · Una carrera objetivo por sí sola no arranca ni cambia el plan: fijar una nueva pasa la actual
//    a secundaria (un solo principal, invariante del servidor); la pantalla lo dice ANTES de fijar.
//
// ── DECISIONES DE MODELO ───────────────────────────────────────────────────────────────────────
//  · La «última carrera» y la «evolución» salen de las pasadas del hub, no del `history` del
//    análisis (que llegaba con otra forma y no se decodificaba nunca).
//  · Los tiempos viajan en SEGUNDOS. El servidor manda algunos ya formateados (`time`, `delta`,
//    `pace`): se leen UNA vez en el borde (`DuracionDeCable`) y de ahí en adelante son números.
//  · Las notas en prosa del servidor son estructura disfrazada de frase: «no hay puesto por
//    estación» se deduce de la lista y «+18 s/km en la segunda mitad» es `caidaRitmoS`.

// MARK: - Vocabulario del servidor (tokens de cable, no texto)

/// `priority`. Un `priority` ausente cuenta como principal (la ruta de creación lo pone por defecto).
enum PrioridadCarrera: Hashable {
    case principal
    case secundaria
    case puestaAPunto

    /// nil → principal (fila antigua sin prioridad); `tune_up` → puesta a punto; cualquier otro
    /// token, secundaria (un valor que la app no conoce no promueve una carrera a principal).
    init(wire: String?) {
        switch wire?.lowercased() {
        case nil, "target": self = .principal
        case "tune_up": self = .puestaAPunto
        default: self = .secundaria
        }
    }

    /// «Tune-up» es inglés: en español de box, la carrera de puesta a punto.
    var etiqueta: String {
        switch self {
        case .principal: return "Objetivo principal"
        case .secundaria: return "Secundaria"
        case .puestaAPunto: return "Puesta a punto"
        }
    }
}

enum FormatoCarrera: String, Hashable {
    case individual = "singles"
    case dobles = "doubles"
    case relevos = "relay"

    /// nil si el token no es de la app: quien lo necesita decide el defecto, no se inventa aquí.
    init?(wire: String?) {
        guard let wire, let f = FormatoCarrera(rawValue: wire.lowercased()) else { return nil }
        self = f
    }

    var esDeEquipo: Bool { self != .individual }

    var etiqueta: String {
        switch self {
        case .individual: return "Individual"
        case .dobles: return "Dobles"
        case .relevos: return "Relevos"
        }
    }
}

enum DivisionCarrera: String, Hashable {
    case open, pro, elite

    init?(wire: String?) {
        guard let wire, let d = DivisionCarrera(rawValue: wire.lowercased()) else { return nil }
        self = d
    }

    var etiqueta: String {
        switch self {
        case .open: return "Open"
        case .pro: return "Pro"
        case .elite: return "Elite"
        }
    }
}

enum CategoriaCarrera: String, Hashable {
    case hombres = "men"
    case mujeres = "women"
    case mixto = "mixed"

    init?(wire: String?) {
        guard let wire, let c = CategoriaCarrera(rawValue: wire.lowercased()) else { return nil }
        self = c
    }

    var etiqueta: String {
        switch self {
        case .hombres: return "Hombres"
        case .mujeres: return "Mujeres"
        case .mixto: return "Mixto"
        }
    }
}

/// `event_type`. Solo `hyrox` tiene predicho tramo a tramo.
enum TipoEventoCarrera: String, Hashable {
    case hyrox
    case deka
    case otro = "other"

    /// Un token desconocido cuenta como «otro»: no hereda el predicho ni la línea de categoría.
    init(wire: String?) {
        self = wire.flatMap { TipoEventoCarrera(rawValue: $0.lowercased()) } ?? .otro
    }
}

/// El veredicto de una estación o de un kilómetro contra su referencia. Los nombres son los del
/// cable (`better | slightly_worse | worse`), como la severidad de siempre.
enum SeveridadCarrera: Hashable {
    case better
    case slightlyWorse
    case worse

    /// Un token desconocido degrada a la lectura peor-neutra en vez de tirar la carga.
    init(wire raw: String) {
        switch raw.lowercased() {
        case "better": self = .better
        case "slightly_worse": self = .slightlyWorse
        default: self = .worse
        }
    }

    /// Tu puesto en el campo, en palabras (el color solo no basta, §4.2).
    var puestoEnCampo: String {
        switch self {
        case .better: return "Arriba"
        case .slightlyWorse: return "Medio"
        case .worse: return "Abajo"
        }
    }

    /// Un kilómetro contra el mejor de la carrera, en palabras (para VoiceOver).
    var ritmoEnPalabras: String {
        switch self {
        case .better: return "cerca de tu mejor km"
        case .slightlyWorse: return "algo por detrás"
        case .worse: return "claramente más lento"
        }
    }
}

/// Cada pieza de datos es independiente: el hub y el análisis son dos rebanadas del store.
enum CargaCarreras: Hashable {
    /// Nunca se ha cargado (ni caché ni disco): esqueleto con la forma final.
    case fria
    case lista
    /// La carga falló y NO hay nada guardado que enseñar: un fallo, no un vacío.
    case error
}

// MARK: - Próximas

struct ProximaCarrera: Hashable, Identifiable {
    /// `races.id`. Es la clave de todo: quitar, hacer principal, la foto, el chat.
    let raceId: Int
    let nombre: String
    let tipoEvento: TipoEventoCarrera
    /// Solo cuentan para `hyrox` o `deka`: en el resto el servidor rellena los defectos.
    let formato: FormatoCarrera
    /// nil = el servidor no lo mandó: ese trozo de la línea de categoría se calla.
    let division: DivisionCarrera?
    let categoria: CategoriaCarrera?
    /// ISO `YYYY-MM-DD`. nil = «fecha por confirmar».
    let fecha: String?
    let lugar: String?
    /// La meta en segundos. nil = sin tiempo objetivo.
    let metaS: Int?
    /// Días que faltan desde `hoy` (0 = hoy es la carrera). nil si no hay fecha.
    let diasHasta: Int?
    let prioridad: PrioridadCarrera

    var id: Int { raceId }
}

/// El «predicho hoy» del objetivo principal, reducido a lo que la pestaña pinta. Sea cual sea el
/// motivo de que no haya cifra, se DECLARA (ley del dato, §7): jamás un tiempo inventado.
enum PrediccionCarrera: Hashable {
    /// Todavía pidiéndolo (esqueleto con la forma final).
    case cargando
    /// La lectura falló: se dice y se reintenta.
    case error
    /// No hay predicho que dar: sin objetivo principal, o una carrera que no es HYROX.
    case noAplica
    /// Sin tiempo objetivo no hay contra qué medir. Salida: fijarlo.
    case sinMeta
    /// Dobles sin pareja conectada. Salida: conectarla.
    case sinPareja
    /// Nada medido todavía. Se llena solo al entrenar.
    case sinDatos(pareja: String?)
    /// Hay tramos medidos y faltan otros: SIN cifra, con los tramos que faltan por su nombre.
    case parcial(medidos: Int, de: Int, faltan: [String], pareja: String?)
    /// El predicho completo. `huecoS` = predicho − objetivo (negativo = por delante); nil si el
    /// servidor no lo manda.
    case cifra(totalS: Int, huecoS: Int?, pareja: String?)
}

// MARK: - Pasadas

struct CompaneroDeEquipo: Hashable {
    let posicion: Int
    let nombre: String
}

struct ParcialEstacion: Hashable {
    /// Índice canónico HYROX (2, 4, … 16).
    let indice: Int
    /// nil = la importación no trajo ese parcial.
    let segundos: Int?
}

struct CarreraPasada: Hashable, Identifiable {
    let raceId: Int
    let nombre: String
    /// nil = «fecha por confirmar».
    let fecha: String?
    let tipoEvento: TipoEventoCarrera
    let formato: FormatoCarrera
    let division: DivisionCarrera
    /// nil = todavía sin resultado importado («resultado pendiente»). Un objetivo vencido cae aquí.
    let resultadoS: Int?
    let correrS: Int?
    let roxzoneS: Int?
    /// Hasta 8 vueltas de 1 km; una que la importación no trajo es nil (no ocupa celda).
    let vueltas: [Int?]
    let estaciones: [ParcialEstacion]
    /// Equipo en dobles y relevos (vacío en individual). Con equipo, todo parcial es DEL EQUIPO.
    let companeros: [CompaneroDeEquipo]
    /// Puesto general y tamaño del campo. nil si no se sabe.
    let puesto: Int?
    let campo: Int?

    var id: Int { raceId }
}

// MARK: - Análisis (solo de carreras INDIVIDUALES: el tiempo de una estación de dobles es del equipo)

struct EstacionVsReferencia: Hashable {
    /// Nombre canónico de la estación (`HyroxStation.labels`).
    let estacion: String
    let tiempoS: Int?
    /// Carrera − tu nivel de entreno (positivo = más lento que entrenando). nil sin entreno.
    let deltaS: Int?
    /// 0…1 según tu puesto entre el campo (más corta = mejor puesto). nil sin puesto: sin barra ni veredicto.
    let fraccion: Double?
    let severidad: SeveridadCarrera?
}

struct VueltaRitmo: Hashable {
    let km: Int
    let ritmoS: Int?
    /// 0…1 respecto a la vuelta más lenta (más alta = más lenta).
    let altura: Double
    let severidad: SeveridadCarrera
}

/// `RaceIAReport`. El servidor hoy lo manda siempre nulo; la vista lo pinta si llega.
struct InformeIA: Hashable {
    let resumen: String
    let grupos: [String]
}

/// `PredictionReview`, solo lo que enseña la puerta. El detalle completo no se rehace aquí.
struct PredichoVsReal: Hashable {
    let predijimosS: Int?
    let hicisteS: Int?
    /// 0-100, más alto = más cerca.
    let precisionPct: Double?
    /// La palabra del servidor («clavado», «muy afinado», «afinando», «aún lejos»).
    let precisionPalabra: String?
}

struct AnalisisCarrera: Hashable {
    /// La carrera individual de la que salen estos bloques (la última con resultado).
    let raceId: Int
    let nombre: String
    let fecha: String?
    let estaciones: [EstacionVsReferencia]
    /// Segundos por km que se pierde en la segunda mitad. nil = no hay caída que decir.
    let caidaRitmoS: Int?
    let ritmoPorKm: [VueltaRitmo]
    let informe: InformeIA?
    let predichoVsReal: PredichoVsReal?
}

// MARK: - La lectura entera de la pestaña

struct LecturaCarreras: Hashable {
    /// El «hoy» del atleta, ISO `YYYY-MM-DD`. Toda cuenta atrás y toda ventana se miden desde aquí.
    var hoy: String
    /// Con coach o sin él (tier libre). Sin coach no hay chat, ni «Preguntar al coach» en el menú
    /// de la carrera, ni informe de la IA del método. Nada más cambia.
    var conCoach: Bool
    /// Sin leer en el chat (globito). 0 = sin globito.
    var noLeidosChat: Int
    var cargaHub: CargaCarreras
    var cargaAnalisis: CargaCarreras

    /// `racesHub.upcoming`, la más próxima primero (el orden lo pone `DecideCarreras.ordenarProximas`).
    var proximas: [ProximaCarrera]
    /// `racesHub.past`, la más reciente primero.
    var pasadas: [CarreraPasada]
    /// Del objetivo principal; `noAplica` si no lo hay.
    var prediccion: PrediccionCarrera
    /// nil = ninguna carrera individual con resultado todavía.
    var analisis: AnalisisCarrera?
}
