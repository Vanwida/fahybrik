import Foundation

// LA LECTURA DEL HUB DE TESTS — lo que la pantalla PINTA, ya decidido.
//
// El hub mezclaba dos cosas en la vista: cargar (servicios, historiales por test) y decidir (qué estado es,
// qué acción lleva cada tarjeta, cuál es «el siguiente acto» que ancla abajo). La decisión vive aquí, en un
// tipo puro y testeable (`TestsHubLecturaTests`); la vista solo traduce esta lectura a piezas del kit.
//
// Un arquetipo se degrada, no se rompe (CONTRATO-UI §6.2): con batería publicada la pantalla es una LISTA
// (`llena` + scroll, con el siguiente acto anclado abajo); sin nada programado ES un VACÍO (`centra`, con
// salida real); cargar y fallar son sus propios estados, con esqueleto de la misma forma y con reintento.

/// Lo que el hub sabe de sí mismo en este instante: lo cargado, lo que está en marcha y el día.
struct EntradaTestsHub {
    var cargando: Bool
    var fallo: Bool
    var estado: BatteryStatus?
    var zonas: [ZoneModalityProfile]
    var zonasCargadas: Bool
    /// calibrationSlug → series de marcas de ESE test (ya agrupadas por su contrato de resultados).
    var historiales: [String: [BenchmarkSeries]]
    /// El slug cuyo `/start` está en vuelo (el «Probarme» de esa tarjeta gira).
    var preparando: String?
    /// El slug cuyo `/start` falló (aviso en línea en esa tarjeta).
    var falloAlPreparar: String?
    var haySesion: Bool
    /// «YYYY-MM-DD» del día del atleta (el mismo con que el plan programa).
    var hoy: String
}

enum LecturaTestsHub: Equatable {
    case cargando
    case error
    case vacio
    case lista(ListaTests)

    static func desde(_ e: EntradaTestsHub) -> LecturaTestsHub {
        if e.cargando && e.estado == nil { return .cargando }
        if e.fallo && e.estado == nil { return .error }
        guard let estado = e.estado, estado.isScheduled else { return .vacio }
        return .lista(ListaTests.desde(estado, e))
    }
}

// MARK: - La lista

struct ListaTests: Equatable {
    let hechos: Int
    let total: Int
    /// Tests que corrieron pero cuyo número nunca se capturó: lo más accionable de la batería.
    let sinResultado: Int
    let zonas: ZonasTests
    let tests: [FichaTest]
    /// El acto global que ancla la pantalla. Nil con la batería cerrada: una barra vacía abajo es
    /// exactamente el hueco que el §6.1 prohíbe.
    let siguiente: SiguienteTest?

    /// Cada test tiene su resultado dentro: la batería está cerrada.
    var completa: Bool { total > 0 && hechos >= total }

    fileprivate static func desde(_ estado: BatteryStatus, _ e: EntradaTestsHub) -> ListaTests {
        let fichas = estado.tests.map { FichaTest.desde($0, e) }
        return ListaTests(
            hechos: estado.completed,
            total: estado.total,
            sinResultado: estado.tests.filter { $0.displayState == .resultPending }.count,
            zonas: ZonasTests.desde(e.zonas, cargadas: e.zonasCargadas),
            tests: fichas,
            siguiente: SiguienteTest.desde(estado, fichas: fichas, hoy: e.hoy)
        )
    }
}

// MARK: - Las zonas que calibran los tests

enum ZonasTests: Equatable {
    case cargando
    case sinZonas
    case filas([ZonaFila])

    static func desde(_ perfiles: [ZoneModalityProfile], cargadas: Bool) -> ZonasTests {
        if perfiles.isEmpty { return cargadas ? .sinZonas : .cargando }
        return .filas(perfiles.map(ZonaFila.init))
    }
}

struct ZonaFila: Equatable, Identifiable {
    let id: String
    let modalidad: String
    let fecha: String?
    /// «3:55/km». Nil cuando el perfil no guarda umbral: la fila lo dice, no lo inventa.
    let umbral: String?

    init(_ p: ZoneModalityProfile) {
        id = p.modality
        modalidad = p.modalityLabel
        fecha = p.recordedDateLabel
        umbral = p.thresholdLabel
    }

    var etiquetaAccesible: String { "\(modalidad), umbral \(umbral ?? "sin dato")" }
}

// MARK: - Una tarjeta de test

struct FichaTest: Equatable, Identifiable {
    let id: String
    let slug: String
    let nombre: String
    /// Se mide con la cámara (un salto), no con el vivo de siempre.
    let esSalto: Bool
    let estado: EstadoFicha
    /// Qué preparar (solo un salto que aún no se ha hecho): viene del briefing del coach.
    let preparacion: String?
    let marcas: MarcasTest
    let falloAlPreparar: Bool
    let accion: AccionTest

    static func desde(_ t: CalibrationTestStatus, _ e: EntradaTestsHub) -> FichaTest {
        FichaTest(
            id: t.assignmentId,
            slug: t.calibrationSlug,
            nombre: t.label,
            esSalto: t.isJumpVideo,
            estado: EstadoFicha.de(t, hoy: e.hoy),
            preparacion: t.isJumpVideo && t.displayState != .done ? t.brief?.dayCard : nil,
            marcas: MarcasTest.de(t, historiales: e.historiales),
            falloAlPreparar: e.falloAlPreparar == t.calibrationSlug,
            accion: AccionTest.de(t, e)
        )
    }
}

/// El estado visible de una fila: el rótulo honesto de un vistazo.
enum EstadoFicha: Equatable {
    case hecho
    case faltaResultado
    case hoy
    case programado(String)

    static func de(_ t: CalibrationTestStatus, hoy: String) -> EstadoFicha {
        switch t.displayState {
        case .done: return .hecho
        case .resultPending: return .faltaResultado
        case .pending:
            return t.scheduledFor == hoy ? .hoy : .programado(FechaES.corta(t.scheduledFor, hoy: hoy) ?? t.scheduledFor)
        }
    }

    /// La tarjeta pide un acto del atleta ahora (falta su número o toca hoy): se tiñe del acento.
    var pideUnActo: Bool {
        switch self {
        case .faltaResultado, .hoy: return true
        case .hecho, .programado: return false
        }
    }
}

// MARK: - Las marcas de un test

enum MarcasTest: Equatable {
    /// Una serie por marca que el test produce (una batería de 1RM: tres).
    case series([SerieMarca])
    /// Sin historial, el último resultado tal como lo formateó el servidor.
    case ultima(String)
    /// Ni marcas ni resultado: la primera vez fija la referencia.
    case primera

    static func de(_ t: CalibrationTestStatus, historiales: [String: [BenchmarkSeries]]) -> MarcasTest {
        let series = (historiales[t.calibrationSlug] ?? []).filter { !$0.results.isEmpty }
        if !series.isEmpty {
            return .series(series.map { SerieMarca($0, conEtiqueta: series.count > 1) })
        }
        if let ultima = t.resultLabel { return .ultima(ultima) }
        return .primera
    }
}

struct SerieMarca: Equatable, Identifiable {
    let id: String
    /// El nombre de la marca, solo cuando hay varias (con una sola, el título de la tarjeta ya lo dice).
    let etiqueta: String?
    let cifra: String
    let unidad: String
    let unit: String
    let delta: Double?
    /// La curva, sin normalizar: un 5K que mejora BAJA (honesto, como en cualquier app seria).
    let valores: [Double]

    init(_ s: BenchmarkSeries, conEtiqueta: Bool) {
        id = s.exerciseSlug
        etiqueta = conEtiqueta ? s.label : nil
        let partes = BenchmarkDelta.split(unit: s.unit, value: s.lastValue ?? 0)
        cifra = partes.cifra
        unidad = partes.unidad
        unit = s.unit
        delta = s.lastDelta
        valores = s.results.map(\.value)
    }

    var etiquetaAccesible: String {
        let nombre = etiqueta.map { "\($0), " } ?? ""
        let valor = unidad.isEmpty ? cifra : "\(cifra) \(unidad)"
        guard let delta else { return nombre + valor }
        return nombre + valor + ", " + BenchmarkDelta.deltaLabel(unit: unit, delta: delta)
    }
}

// MARK: - La acción de una tarjeta

/// Lo que hace el botón de una tarjeta. Los mismos cinco casos del hub de siempre, con un nombre cada uno.
enum AccionTest: Equatable {
    /// Abrir el informe del salto hecho. Sin informe ni perfil no hay nada que abrir.
    case verResultado(habilitada: Bool)
    /// La sesión corrió y el número no se capturó: se pide a mano.
    case anadirResultado
    /// Toca hoy y es un salto: primero el briefing (trípode, carga, orden).
    case continuarSalto
    /// Toca hoy: la sesión de siempre, con su cursor guiado y su audio.
    case continuarVivo
    /// «Probarme»: crea o reutiliza la asignación de hoy y lanza la sesión normal.
    case probarme(preparando: Bool, habilitada: Bool)

    var titulo: String {
        switch self {
        case .verResultado: return "Ver resultado"
        case .anadirResultado: return "Añadir resultado"
        case .continuarSalto, .continuarVivo: return "Continuar"
        case .probarme(let preparando, _): return preparando ? "Preparando…" : "Probarme"
        }
    }

    var habilitada: Bool {
        switch self {
        case .verResultado(let h), .probarme(_, let h): return h
        case .anadirResultado, .continuarSalto, .continuarVivo: return true
        }
    }

    static func de(_ t: CalibrationTestStatus, _ e: EntradaTestsHub) -> AccionTest {
        let hoy = t.scheduledFor == e.hoy
        switch t.displayState {
        case .done where t.isJumpVideo:
            return .verResultado(habilitada: t.jumpReport != nil || t.jumpProfile != nil)
        case .resultPending:
            return .anadirResultado
        case .pending where hoy && t.isJumpVideo:
            return .continuarSalto
        case .pending where hoy:
            return .continuarVivo
        default:
            return .probarme(preparando: e.preparando == t.calibrationSlug, habilitada: e.preparando == nil && e.haySesion)
        }
    }
}

// MARK: - El siguiente acto (el que ancla la pantalla)

/// El acto que la barra anclada ofrece sin que el atleta tenga que buscar la tarjeta. El orden es el de
/// urgencia real: un número que falta bloquea la calibración, lo de hoy va antes que lo de pasado, y solo
/// después se propone empezar el siguiente. La acción es LA MISMA que llevaría la tarjeta (un salto de hoy
/// abre su briefing desde la barra igual que desde la tarjeta).
struct SiguienteTest: Equatable {
    /// Qué test, en una línea sobre el botón: «Probarme» a secas no dice cuál cuando hay cuatro tarjetas.
    let asunto: String
    let testId: String
    let accion: AccionTest

    static func desde(_ estado: BatteryStatus, fichas: [FichaTest], hoy: String) -> SiguienteTest? {
        func ficha(_ t: CalibrationTestStatus) -> FichaTest? { fichas.first { $0.id == t.assignmentId } }

        if let pendiente = estado.firstPendingResult, let f = ficha(pendiente) {
            return SiguienteTest(asunto: pendiente.label, testId: f.id, accion: f.accion)
        }
        if let deHoy = estado.tests.first(where: { $0.displayState == .pending && $0.scheduledFor == hoy }), let f = ficha(deHoy) {
            return SiguienteTest(asunto: "\(deHoy.label) · hoy", testId: f.id, accion: f.accion)
        }
        if let siguiente = estado.tests.first(where: { $0.displayState == .pending }), let f = ficha(siguiente) {
            let cuando = FechaES.corta(siguiente.scheduledFor, hoy: hoy) ?? siguiente.scheduledFor
            return SiguienteTest(asunto: "\(siguiente.label) · \(cuando)", testId: f.id, accion: f.accion)
        }
        return nil
    }
}
