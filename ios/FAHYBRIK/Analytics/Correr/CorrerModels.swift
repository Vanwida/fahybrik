import Foundation

// EL HOGAR DEL RUNNING — wire models (espejo Codable de
// web/lib/athlete/running/{historial,tendencias,capacidad}.ts).
//
// Convención idéntica a AnalyticsModels: el APIClient decodifica con
// `.convertFromSnakeCase`, así que toda clave multi-palabra lleva CodingKey
// explícita apuntando a la forma YA convertida (camelCase). Los valores nunca
// se convierten: los slugs llegan tal cual.
//
// HONESTIDAD DEL CABLE: todo lo que el servidor pueda no saber es opcional, y
// un opcional que llega nulo se queda nulo — la vista decide callarse, nunca
// rellenar. Un campo ausente jamás tira la pantalla entera: preferimos perder
// una columna a perder el historial.

// MARK: - Historial

/// La ventana del historial y de tendencias. NO es `AnalyticsPeriod`: aquella
/// habla el contrato de secciones (7d/mes/año/custom con fechas); esta es la
/// ventana móvil del hogar del running (el mock la fijó: 7d · Mes · Año · Todo).
enum VentanaCorrer: String, CaseIterable, Identifiable, Hashable {
    case sieteDias = "7d"
    case mes = "30d"
    case anio = "365d"
    case todo = "all"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .sieteDias: return "7 d"
        case .mes:       return "Mes"
        case .anio:      return "Año"
        case .todo:      return "Todo"
        }
    }
}

struct HistorialDeCorrer: Codable, Equatable {
    let aggregates: AgregadosDeCorrer
    /// SOLO los tipos con sesiones en la ventana — el filtro nunca ofrece una
    /// opción vacía (todo circular: cada chip lleva a filas reales).
    let tipos: [TipoDeCorrer]
    let weeks: [SemanaDeCorrer]
}

struct AgregadosDeCorrer: Codable, Equatable {
    let km: Double
    let salidas: Int
    let seconds: Double
    let elevationM: Double?

    enum CodingKeys: String, CodingKey {
        case km, salidas, seconds
        case elevationM
    }
}

struct TipoDeCorrer: Codable, Equatable, Identifiable, Hashable {
    let slug: String
    let labelEs: String
    let count: Int

    var id: String { slug }
}

struct SemanaDeCorrer: Codable, Equatable, Identifiable {
    /// El lunes ISO de la semana — la identidad del grupo.
    let monday: String
    let km: Double
    let rows: [CarreraDelHistorial]

    var id: String { monday }
}

struct CarreraDelHistorial: Codable, Equatable, Identifiable {
    /// SIEMPRE presente: la ejecución existe aunque nadie la prescribiera
    /// (importadas de Salud/Garmin, mig 0191).
    let executionId: String
    /// Presente solo si la sesión colgaba del plan — es la llave que abre la
    /// ficha (`ExecutedWorkoutView`). Nula → la fila no navega en esta tanda.
    let assignmentId: String?
    let fecha: String
    /// Slug cerrado derivado de la estructura prescrita; nulo en libres e
    /// importadas sin estructura (la fila sale sin chip, no con uno inventado).
    let tipoSlug: String?
    /// «6×800» — la dosis con nombre, cuando la estructura la tiene.
    let dosisLabel: String?
    let km: Double
    let ritmoSKm: Double?
    let fcMedia: Double?
    let desnivelM: Double?
    /// `app` (vivida aquí) · `imported` (Salud / archivo del reloj).
    let origen: String
    let record: Bool
    /// `ok` · `aviso` — solo si la sesión fue prescrita y su juicio ya estaba
    /// calculado. Una importada no lleva veredicto: nadie le pidió nada.
    let veredicto: String?

    var id: String { executionId }

    enum CodingKeys: String, CodingKey {
        case executionId
        case assignmentId
        case fecha
        case tipoSlug
        case dosisLabel
        case km
        case ritmoSKm
        case fcMedia
        case desnivelM
        case origen, record, veredicto
    }
}

// MARK: - Tendencias

/// La ventana de tendencias NO es la del historial: aquí «7 días» no dibuja
/// una tendencia de nada, así que el peldaño corto es un mes (el mock lo fijó:
/// 4 sem · 6 meses · Año · Todo).
enum VentanaTendencias: String, CaseIterable, Identifiable, Hashable {
    case cuatroSemanas = "4w"
    case seisMeses = "6m"
    case anio = "1y"
    case todo = "all"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .cuatroSemanas: return "4 sem"
        case .seisMeses:     return "6 meses"
        case .anio:          return "Año"
        case .todo:          return "Todo"
        }
    }
}

struct TendenciasDeCorrer: Codable, Equatable {
    let buckets: [CuboDeTendencia]
    /// La ventana anterior DEL MISMO LARGO, para los deltas. Nula cuando no hay
    /// una ventana anterior completa que comparar (p. ej. «Todo»).
    let prev: AgregadoPrevio?
}

struct CuboDeTendencia: Codable, Equatable, Identifiable {
    /// El primer día del cubo (lunes en semanas, día 1 en meses).
    let start: String
    let km: Double
    let seconds: Double
    let ritmoMedioSKm: Double?
    let fcMedia: Double?
    let desnivelM: Double?
    let vo2max: Double?
    let cadenciaSpm: Double?

    var id: String { start }

    enum CodingKeys: String, CodingKey {
        case start, km, seconds
        case ritmoMedioSKm
        case fcMedia
        case desnivelM
        case vo2max
        case cadenciaSpm
    }
}

struct AgregadoPrevio: Codable, Equatable {
    let km: Double?
    let seconds: Double?
    let ritmoMedioSKm: Double?
    let fcMedia: Double?
    let desnivelM: Double?
    let vo2max: Double?

    enum CodingKeys: String, CodingKey {
        case km, seconds
        case ritmoMedioSKm
        case fcMedia
        case desnivelM
        case vo2max
    }
}

// MARK: - Capacidad

struct CapacidadDeCorrer: Codable, Equatable {
    let umbral: UmbralDeCapacidad?
    let zonas: [ZonaDeCapacidad]
    let records: [RecordDeCorrer]
    /// Nulo sin base de la que proyectar — el bloque dice de qué saldría.
    let predictor: [PrediccionDeDistancia]?
    /// El test de zonas de correr LANZABLE, si la batería lo tiene. Es la única
    /// salida de la pantalla y aterriza en SU test, jamás en la batería entera.
    let testZonas: TestDeZonas?

    enum CodingKeys: String, CodingKey {
        case umbral, zonas, records, predictor
        case testZonas
    }
}

struct UmbralDeCapacidad: Codable, Equatable {
    let ritmoSKm: Double
    /// «De tu test del 2 ago» — lo escribe el servidor; aquí no se redacta.
    let origenLabel: String?
    let haceDias: Int?
    let sinRevisar: Bool

    enum CodingKeys: String, CodingKey {
        case ritmoSKm
        case origenLabel
        case haceDias
        case sinRevisar
    }
}

struct ZonaDeCapacidad: Codable, Equatable, Identifiable {
    let z: Int
    let nombre: String
    let desdeSKm: Double?
    let hastaSKm: Double?
    /// El hexadecimal del perfil del coach — aquí el color ES dato.
    let color: String

    var id: Int { z }

    enum CodingKeys: String, CodingKey {
        case z, nombre
        case desdeSKm
        case hastaSKm
        case color
    }
}

struct RecordDeCorrer: Codable, Equatable, Identifiable {
    let slug: String
    let labelEs: String
    /// `street` · `treadmill` — un 5K en cinta jamás bate al de calle.
    let contexto: String
    /// La marca, en SU unidad: el Cooper de 12 min se guarda en METROS (la
    /// única del catálogo donde más alto es mejor). Servir metros bajo una
    /// clave `segundos` sería un dato falso agazapado — de ahí el par.
    let valor: Double
    /// `seconds` · `meters`.
    let unidad: String
    let fecha: String?
    /// Batido hace poco — la estrella del historial.
    let reciente: Bool

    var id: String { "\(slug)-\(contexto)" }

    enum CodingKeys: String, CodingKey {
        case slug
        case labelEs
        case contexto, valor, unidad, fecha, reciente
    }
}

struct PrediccionDeDistancia: Codable, Equatable, Identifiable {
    let distanciaM: Int
    let segundos: Double
    /// Contra la proyección de hace unas semanas; nulo sin base anterior.
    let deltaS: Double?

    var id: Int { distanciaM }

    enum CodingKeys: String, CodingKey {
        case distanciaM
        case segundos
        case deltaS
    }
}

struct TestDeZonas: Codable, Equatable {
    let slug: String
    let labelEs: String

    enum CodingKeys: String, CodingKey {
        case slug
        case labelEs
    }
}
