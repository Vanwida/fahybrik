import Foundation

// EL PANEL DE ANALÍTICAS — el sobre único de `GET /api/athlete/analytics/panel?ventana=`
// (docs/analiticas/modelo.md §5; `shared/domain/analytics/panel.ts`).
//
// UN CÁLCULO, DOS PINTORES (A1). El servidor devuelve EXACTAMENTE este objeto al
// atleta y al coach. Cada bloque es una LISTA de lecturas (`LecturaAnalitica`, el
// mismo espejo Codable del contrato de agosto, ampliado el 29-09 con familia,
// comparación, plan en la misma serie, ancla y veredicto): el cliente dibuja las
// que conoce por su FORMA y las ignora si no.
//
// LOS BLOQUES QUE AÚN NO SE SIRVEN VIAJAN COMO `pendientes`, no como listas
// vacías mudas: una lista vacía es «no hay nada que decir»; un bloque pendiente
// es «todavía no está construido», y la portada los pinta distinto.
//
// TOLERANCIA (la regla de `Lecturas.swift`): **nada de aquí lanza por un valor
// nuevo**. Un bloque, una ventana o una unidad que este binario no conozca caen
// a su caso `desconocid…`; una lectura rota dentro de un bloque se pierde sola
// (`@LossyArray`) sin tumbar el panel; un campo del método que el servidor aún
// no sirva llega nulo y la pieza que lo necesita se calla.
//
// AQUÍ NO SE CALCULA NADA: iOS pinta, no calcula (como las zonas).

struct PanelAnaliticas: Codable, Equatable {
    let athleteId: String
    let generadoIso: String
    let ventana: VentanaDelPanel
    /// Cuánta historia hay DE VERDAD, y si la ventana la abarca entera.
    let historia: HistoriaDelAtleta
    /// El método del coach REALMENTE usado (solo lo que esta pantalla LEE).
    let metodo: MetodoDelPanel
    /// Los umbrales del atleta tal como se han resuelto, con su peldaño.
    let anclas: AnclasDelPanel
    let bloques: BloquesDelPanel
    /// Bloques que hoy vienen vacíos POR CONSTRUCCIÓN (aún no servidos), no por dato.
    let pendientes: [BloqueDelPanel]
    /// Lo que el panel puede AFIRMAR, en lenguaje de atleta. Puede venir vacío.
    @LossyArray var hechos: [Hecho]

    /// «Hoy» en el calendario del atleta: el último día de la ventana. TODA la
    /// aritmética de fechas de la portada cuelga de esto y nunca de `Date()`: un
    /// panel pedido «a fecha de» tiene que pintarse igual el día que se mira.
    var hoy: String { ventana.hasta }

    /// Un bloque está pendiente cuando el servidor lo dice, no cuando llega vacío.
    func estaPendiente(_ bloque: BloqueDelPanel) -> Bool { pendientes.contains(bloque) }
}

// MARK: - Los ocho bloques (modelo §3), en el orden en que se enseñan

enum BloqueDelPanel: String, Codable, Equatable, CaseIterable {
    case estado, forma, semanas, intensidad, progreso, records, carrera, recuperacion
    /// Un bloque que este binario no conoce. Se ignora, no se rompe.
    case desconocido

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = BloqueDelPanel(rawValue: raw) ?? .desconocido
    }

    /// Los que se pintan, en el orden de la portada (el Estado va en la cabecera fija).
    static let delCuerpo: [BloqueDelPanel] = [.forma, .semanas, .intensidad, .progreso, .records, .carrera, .recuperacion]

    var titulo: String {
        switch self {
        case .estado: return "Estado"
        case .forma: return "Forma y fatiga"
        case .semanas: return "Semana a semana"
        case .intensidad: return "Intensidad"
        case .progreso: return "Progreso"
        case .records: return "Récords"
        case .carrera: return "Carrera"
        case .recuperacion: return "Recuperación"
        case .desconocido: return ""
        }
    }

    /// La pregunta que responde cada bloque (§3): es el subtítulo, no un adorno.
    var pregunta: String {
        switch self {
        case .estado: return "¿Cómo estoy hoy?"
        case .forma: return "¿Gano forma o me paso? ¿Llego fresco?"
        case .semanas: return "¿Hago lo que toca?"
        case .intensidad: return "¿Entreno a la intensidad que toca?"
        case .progreso: return "¿Mejoro? Una marca por familia"
        case .records: return "¿Qué marcas tengo?"
        case .carrera: return "¿Llego a mi carrera?"
        case .recuperacion: return "¿Asimilo? Contra tu basal"
        case .desconocido: return ""
        }
    }
}

/// Las ocho listas. Una clave ausente decodifica como lista vacía; una lectura
/// rota se pierde sola sin tumbar su bloque (`LossyArray`, tolerante a la ausencia).
struct BloquesDelPanel: Codable, Equatable {
    @LossyArray var estado: [LecturaAnalitica]
    @LossyArray var forma: [LecturaAnalitica]
    @LossyArray var semanas: [LecturaAnalitica]
    @LossyArray var intensidad: [LecturaAnalitica]
    @LossyArray var progreso: [LecturaAnalitica]
    @LossyArray var records: [LecturaAnalitica]
    @LossyArray var carrera: [LecturaAnalitica]
    @LossyArray var recuperacion: [LecturaAnalitica]

    init(estado: [LecturaAnalitica] = [], forma: [LecturaAnalitica] = [], semanas: [LecturaAnalitica] = [],
         intensidad: [LecturaAnalitica] = [], progreso: [LecturaAnalitica] = [], records: [LecturaAnalitica] = [],
         carrera: [LecturaAnalitica] = [], recuperacion: [LecturaAnalitica] = []) {
        self.estado = estado; self.forma = forma; self.semanas = semanas; self.intensidad = intensidad
        self.progreso = progreso; self.records = records; self.carrera = carrera; self.recuperacion = recuperacion
    }

    subscript(bloque: BloqueDelPanel) -> [LecturaAnalitica] {
        switch bloque {
        case .estado: return estado
        case .forma: return forma
        case .semanas: return semanas
        case .intensidad: return intensidad
        case .progreso: return progreso
        case .records: return records
        case .carrera: return carrera
        case .recuperacion: return recuperacion
        case .desconocido: return []
        }
    }

    /// Todas, en una lista plana (para buscar por id).
    var todas: [LecturaAnalitica] { BloqueDelPanel.allCases.flatMap { self[$0] } }
}

// MARK: - La ventana (A4): una para toda la pestaña

/// `7d · 4s · 12s · 6m · 1a · todo`, cortada en el día LOCAL del atleta. El orden
/// de `todas` es el del selector.
enum VentanaClave: String, Codable, Equatable, CaseIterable {
    case sieteDias = "7d"
    case cuatroSemanas = "4s"
    case doceSemanas = "12s"
    case seisMeses = "6m"
    case unAno = "1a"
    case todo
    /// Una clave que este binario no conoce (el servidor no la pide nunca de vuelta).
    case desconocida

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = VentanaClave(rawValue: raw) ?? .desconocida
    }

    /// Lo que se mira por defecto (`VENTANA_PANEL_POR_DEFECTO`).
    static let porDefecto: VentanaClave = .doceSemanas
    /// Las seis del selector, en su orden.
    static let todas: [VentanaClave] = [.sieteDias, .cuatroSemanas, .doceSemanas, .seisMeses, .unAno, .todo]

    /// Cómo se escribe en el selector: corto, sin siglas raras.
    var etiqueta: String {
        switch self {
        case .sieteDias: return "7 d"
        case .cuatroSemanas: return "4 sem"
        case .doceSemanas: return "12 sem"
        case .seisMeses: return "6 m"
        case .unAno: return "1 a"
        case .todo: return "Todo"
        case .desconocida: return ""
        }
    }

    /// La ventana dicha en una frase, para el sobretítulo de la pestaña: siempre se ve cuál rige (A4).
    var frase: String {
        switch self {
        case .sieteDias: return "Últimos 7 días"
        case .cuatroSemanas: return "Últimas 4 semanas"
        case .doceSemanas: return "Últimas 12 semanas"
        case .seisMeses: return "Últimos 6 meses"
        case .unAno: return "Último año"
        case .todo: return "Desde que empezaste"
        case .desconocida: return ""
        }
    }
}

/// Un tramo de días LOCALES del atleta, ambos extremos inclusive.
struct PeriodoDelPanel: Codable, Equatable {
    let desde: String
    let hasta: String
    let dias: Int
}

struct VentanaDelPanel: Codable, Equatable {
    let clave: VentanaClave
    let desde: String
    let hasta: String
    let dias: Int
    /// El periodo anterior de igual longitud. Nulo en `todo`.
    let anterior: PeriodoDelPanel?
    /// True cuando la ventana alcanza la primera sesión: es toda su historia.
    let cubreTodo: Bool
}

// MARK: - El método del coach — SOLO lo que esta pantalla lee

/// Mismo criterio que `MetodoAnalitico` (agosto): el resto de la fila viaja y no
/// se nombra. Todo opcional menos las dos ventanas de Banister, que existen
/// desde el primer día: un campo que el servidor aún no sirva no puede dejar la
/// pestaña en blanco, solo callar la pieza que lo necesita.
struct MetodoDelPanel: Codable, Equatable {
    /// Días de la media móvil del fondo (Forma) y de lo reciente (Fatiga).
    let ctlDays: Int
    let atlDays: Int
    /// Subida de fondo por semana a partir de la cual avisa («aviso a partir de 5»).
    let rampAlertTssPerWeek: Double?
    /// Cobertura mínima para que la frescura diga su palabra (defecto 90).
    let coberturaVeredictoMinPct: Double?
    /// Noches mínimas de basal para la recuperación.
    let hrvMinNightsBaseline: Int?
    let basalDias: Int?
}

// MARK: - Las anclas: el umbral por modalidad, con su peldaño

struct AnclaResuelta: Codable, Equatable {
    let valor: Double
    let ancla: AnclaDeLectura
    /// Clave estable de la fuente (`perfil_test`, `declarada_coach`, `vdot_run_5k`…).
    let fuente: String
    /// Cómo se explica al atleta.
    let explicaEs: String
    /// Desde cuándo vale. Nulo cuando la fuente no tiene fecha (la edad).
    let desdeIso: String?
}

struct AnclasDelPanel: Codable, Equatable {
    /// Umbral de pulso, en ppm.
    let pulso: AnclaResuelta?
    /// Umbral de ritmo por modalidad (`run`, `row`, `ski`, `bike`): s/km al correr, s/500 m en los ergos.
    let ritmo: [String: AnclaResuelta?]
    /// Umbral de potencia por máquina (`row`, `ski`, `bike`), en vatios.
    let potencia: [String: AnclaResuelta?]

    init(pulso: AnclaResuelta? = nil, ritmo: [String: AnclaResuelta?] = [:], potencia: [String: AnclaResuelta?] = [:]) {
        self.pulso = pulso; self.ritmo = ritmo; self.potencia = potencia
    }

    private enum K: String, CodingKey { case pulso, ritmo, potencia }

    /// Cada diccionario admite `null` por modalidad (un atleta sin umbral de bici),
    /// y una clave ausente es un diccionario vacío.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        pulso = try c.decodeIfPresent(AnclaResuelta.self, forKey: .pulso)
        ritmo = (try? c.decodeIfPresent([String: AnclaResuelta?].self, forKey: .ritmo)) ?? [:]
        potencia = (try? c.decodeIfPresent([String: AnclaResuelta?].self, forKey: .potencia)) ?? [:]
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: K.self)
        try c.encode(pulso, forKey: .pulso)
        try c.encode(ritmo, forKey: .ritmo)
        try c.encode(potencia, forKey: .potencia)
    }
}

// MARK: - El vocabulario del servidor que la portada reconoce

/// Los id y códigos que el panel nombra, escritos UNA vez (`intensidad.ts`,
/// `records.ts`, `carrera.ts`, `recuperacion-panel.ts`). Cambiar uno allí es
/// cambiarlo aquí; una lectura con un id que no está en esta lista se ignora.
enum IdsDelPanel {
    static let polarizacion = "intensidad.polarizacion"
    static let readiness = "recuperacion.readiness"
    /// Las lecturas del Estado (`estado.ts`): las tres cifras de carga y la disposición de hoy.
    static let estadoForma = "estado.forma"
    static let estadoFatiga = "estado.fatiga"
    static let estadoFrescura = "estado.frescura"
    static let estadoDisposicion = "estado.readiness"
    /// El servidor titula esta lectura con el nombre técnico; al atleta se le dice «Disposición».
    static let etiquetaDeReadiness = "Disposición"
    static let carreraObjetivo = "carrera.objetivo"
    static let carreraDisposicion = "carrera.disposicion"
    static let carreraPrevision = "carrera.prevision"
    static let prefijoTramo = "carrera.tramo."
    /// `referencia.de` de un récord: el que había antes.
    static let referenciaRecordAnterior = "record_anterior"
    static let referenciaObjetivoCoach = "objetivo_coach"
    static let referenciaPresupuestoTramo = "presupuesto_objetivo"
    /// `veredicto.code` de un récord que se ha batido en la ventana.
    static let veredictoRecordNuevo = "nuevo"
    /// El cumplimiento de la ventana: el número que el coach eligió más el reparto de sus sesiones.
    static let semanasCumplimiento = "semanas.cumplimiento"

    /// Los `parte.code` del reparto por sesión de `semanas.cumplimiento` (`cumplimiento.ts`).
    enum SesionCumplida {
        static let cumplida = "cumplida"
        static let desviada = "desviada"
        static let fuera = "fuera"
        static let noHecha = "no_hecha"
        static let hechaSinMedida = "hecha_sin_medida"
        static let sinPlan = "sin_plan"
    }

    /// Una zona semanal: `intensidad.z1` … `intensidad.zN`. NO lo es `intensidad.zonas`,
    /// que es el total del periodo.
    static func esZonaSemanal(_ id: String) -> Bool {
        id.range(of: #"^intensidad\.z[0-9]+$"#, options: .regularExpression) != nil
    }
}

// MARK: - Buscar

extension Array where Element == LecturaAnalitica {
    /// Las que TIENEN número: `medida` con dato y unidad escribible.
    var conDato: [LecturaAnalitica] {
        filter { $0.estado == .medida && $0.dato != nil && $0.dato?.unidad != .desconocida }
    }
}
