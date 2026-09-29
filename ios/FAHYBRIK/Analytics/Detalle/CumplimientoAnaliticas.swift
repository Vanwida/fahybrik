import Foundation

// EL CUMPLIMIENTO, POR SESIÓN Y POR TRAMO — el detalle de `GET /api/athlete/analytics/cumplimiento?ventana=`
// (`DetalleCumplimiento`, `shared/domain/analytics/cumplimiento.ts`): cada sesión del PLAN del coach con su
// color, contra qué base se compara y, dentro, sus líneas y sus tramos con el veredicto de cada uno.
//
// De aquí salen dos cosas que ni el panel ni el detalle de una familia sirven: la PUERTA A LOS DÍAS
// (las sesiones de Semana a semana, cada una un toque hasta su detalle) y «lo que te piden» de correr y de
// fuerza (cuántas series cayeron dentro, por debajo y por encima de lo pedido).
//
// Se decodifica SOLO lo que se pinta: las lecturas de la ventana ya viajan en el panel, y la banda, la holgura
// y el motivo de cada comprobación son del servidor (el cliente no juzga ni cuenta días).
//
// TOLERANCIA: un estado, un veredicto o una base nuevos caen a su `desconocid…`; una sesión o un tramo roto
// se pierde solo (`@LossyArray`) sin tumbar la lista.

// MARK: - El sobre

struct CumplimientoAnaliticas: Codable, Equatable {
    /// El periodo que se juzgó: la ventana del panel, salvo en «todo», que aquí es la historia DEL PLAN.
    let ventana: VentanaDelPanel
    /// Las sesiones del plan de la ventana, la más reciente primero.
    @LossyArray var sesiones: [FilaDeSesion]
    /// Lo hecho SIN plan del coach en la ventana (libre, fuera del plan, importado): cuenta en la carga y no en el cumplimiento.
    let sinPlan: ResumenSinPlan

    /// «Hoy»: el último día de la ventana.
    var hoy: String { ventana.hasta }
}

struct ResumenSinPlan: Codable, Equatable {
    let sesiones: Int
    let segundos: Double
    /// Nulo cuando ninguna se pudo preciar.
    let tss: Double?
}

// MARK: - Una sesión del plan

/// Cómo quedó una sesión del plan frente a su plan (`EstadoSesion`).
enum EstadoDeSesion: String, Codable, Equatable {
    /// Hecha dentro de la banda verde.
    case cumplida
    /// Hecha en la ámbar.
    case desviada
    /// Hecha fuera de la ámbar.
    case fuera
    /// Debida y sin hacer (su día LOCAL ya terminó, o la saltó).
    case noHecha = "no_hecha"
    /// Hecha, pero ninguna base se sabe por las dos partes: cuenta como hecha y no tiene color.
    case hechaSinMedida = "hecha_sin_medida"
    /// Es de hoy y aún no está hecha.
    case pendiente
    /// Cae en una pausa o en un descanso por lesión.
    case excluida
    case desconocido

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = EstadoDeSesion(rawValue: raw) ?? .desconocido
    }
}

/// El color que el coach da al porcentaje (`ColorSesion`). Nulo en pendiente, excluida y hecha sin medida.
enum ColorDeSesion: String, Codable, Equatable {
    case verde, ambar, rojo, gris
    case desconocido

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ColorDeSesion(rawValue: raw) ?? .desconocido
    }
}

/// Contra qué se comparó la sesión con su plan: la primera base del coach que saben las dos partes.
enum BaseDeSesion: String, Codable, Equatable {
    case carga, duracion, distancia
    case desconocida

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = BaseDeSesion(rawValue: raw) ?? .desconocida
    }
}

struct FilaDeSesion: Codable, Equatable, Identifiable {
    let assignmentId: String
    /// Nulo si no se ejecutó: solo una sesión hecha tiene detalle que abrir.
    let executionId: String?
    /// El día programado.
    let dia: String
    let diaHecha: String?
    let titulo: String?
    let estado: EstadoDeSesion
    let color: ColorDeSesion?
    let hecha: Bool
    let saltada: Bool
    let base: BaseDeSesion?
    let unidad: UnidadLectura?
    let plan: Double?
    let hecho: Double?
    /// Lo hecho como porcentaje del plan en su base. Nulo sin base comparable.
    let pct: Double?
    /// El plan es un SUELO: algo accesorio (calentamiento, vuelta) no se sabe.
    let planMinimo: Bool
    let tramos: ResumenDeTramos
    @LossyArray var lineas: [LineaDeSesion]

    var id: String { assignmentId }
    /// El día en que se hizo (el local del atleta), o el programado si no se hizo.
    var diaVisible: String { diaHecha ?? dia }
}

/// Los tramos de TRABAJO de la sesión, por veredicto (`ResumenTramos`). Las recuperaciones van aparte y
/// nunca se funden con el trabajo en un porcentaje.
struct ResumenDeTramos: Codable, Equatable {
    /// `tramos`, `sin_detalle` (no hay tramos enlazados al plan) o `sin_ejecucion`.
    let detalle: String
    let total: Int
    /// Con veredicto, más las líneas que no se ejecutaron (cuentan fuera).
    let evaluables: Int
    let dentro: Int
    let porEncima: Int
    let porDebajo: Int
    let sinDato: Int
    let sinEjecutar: Int
}

// MARK: - Líneas, tramos y series juzgados

struct LineaDeSesion: Codable, Equatable {
    let familia: FamiliaLectura
    @LossyArray var tramos: [TramoJuzgado]
}

/// El veredicto de una comprobación (`VeredictoCumplimiento`): con DIRECCIÓN, nunca solo color.
/// `porEncima` es MÁS INTENSO (menos segundos de ritmo, menos RIR, más kg), o pasarse de un descanso.
enum VeredictoDeTramo: String, Codable, Equatable {
    case dentro
    case porEncima = "por_encima"
    case porDebajo = "por_debajo"
    /// No hay contra qué, o no se midió.
    case sinDato = "sin_dato"
    case desconocido

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = VeredictoDeTramo(rawValue: raw) ?? .desconocido
    }
}

struct TramoJuzgado: Codable, Equatable {
    /// El `segment_executions.id` del tramo: es el mismo que lleva el detalle de la sesión.
    let segmentExecutionId: String
    /// `trabajo` o `recuperacion`.
    let papel: String
    let veredicto: VeredictoDeTramo
    @LossyArray var comprobaciones: [ComprobacionDeTramo]
    @LossyArray var series: [SerieJuzgada]

    var esTrabajo: Bool { papel == "trabajo" }
}

struct SerieJuzgada: Codable, Equatable {
    /// Una serie de aproximación se enseña y no se juzga ni cuenta como de trabajo.
    let aproximacion: Bool
    let veredicto: VeredictoDeTramo
    @LossyArray var comprobaciones: [ComprobacionDeTramo]
}

/// Una pregunta sobre un tramo o una serie, en la unidad de su eje.
struct ComprobacionDeTramo: Codable, Equatable {
    /// `ritmo`, `split`, `vatios`, `pulso`, `rpe`, `rir`, `carga`, `distancia`, `tiempo`, `reps`… (`EjeCumplimiento`).
    let eje: String
    /// `intensidad`, `dosis` o `resultado`.
    let pregunta: String
    let veredicto: VeredictoDeTramo
}

/// Los ejes y preguntas del cumplimiento que el iPhone reconoce, escritos UNA vez (`cumplimiento-bandas.ts`).
enum EjesDelCumplimiento {
    static let intensidad = "intensidad"
    static let ritmo = "ritmo"
    static let rir = "rir"
}

extension AnalyticsService {
    /// El cumplimiento de la ventana, con sus sesiones, líneas y tramos. Throwing, como el resto del motor SWR.
    static func fetchCumplimiento(ventana: VentanaClave, bearer: String) async throws -> CumplimientoAnaliticas {
        try await APIClient.shared.get(
            path: "api/athlete/analytics/cumplimiento?ventana=\(ventana.rawValue)",
            bearer: bearer
        )
    }
}
