import Foundation

// EL CUMPLIMIENTO, LEÍDO — lo que las pantallas sacan de `CumplimientoAnaliticas`. Puro y con test.
//
//   la puerta a los días   las sesiones del plan de la ventana, cada una con su marca (`MarcaDeCumplimiento`), su palabra y
//                          contra qué se comparó; un toque en una hecha abre su detalle tramo a tramo
//   lo que te piden        cuántas series con objetivo cayeron dentro, por debajo y por encima de lo pedido: el ritmo al correr
//                          (`PedidoDeSeries.correr`) y el RIR en fuerza (`PedidoDeSeries.rir`)
//   el sello de un tramo   el veredicto de cada tramo de una sesión, cruzado por su id (`VeredictosDeSesion`)
//
// Ni un umbral, ni una banda, ni una holgura aquí: el veredicto de cada tramo y de cada serie lo puso el servidor con las
// bandas y la holgura del coach. El cliente CUENTA lo que ya viene juzgado (y nunca «más» sin decir que es más intenso).

// MARK: - La marca de una sesión o de un tramo

/// La forma de un cumplimiento, con su palabra: los sellos del Plan (hecho ✓, sin hacer ✕, sin plan ○) y, para «más» o
/// «menos de lo pedido», un círculo con ▲ o ▼. La forma y la palabra van siempre; el color, solo en ✓.
enum MarcaDeCumplimiento: Equatable {
    case dentro, masDeLoPedido, menosDeLoPedido, noHecha
    /// Sin plan o sin medida con la que comparar: una marca vacía.
    case sinPlan
    /// La sesión tiene plan y este tramo no se ha podido cruzar con su veredicto (el servidor lo declara `pendientes`).
    case sinComprobar

    /// La palabra que la marca no dice con el color: la lee VoiceOver y va escrita junto a la marca.
    var palabra: String {
        switch self {
        case .dentro: return "dentro"
        case .masDeLoPedido: return "más de lo pedido"
        case .menosDeLoPedido: return "menos de lo pedido"
        case .noHecha: return "no hecha"
        case .sinPlan: return "sin plan"
        case .sinComprobar: return "sin comprobar"
        }
    }

    /// De un veredicto de tramo: «más» es MÁS INTENSO (menos segundos de ritmo, menos RIR, más kg). Sin dato, sin sello.
    init(_ v: VeredictoDeTramo) {
        switch v {
        case .dentro: self = .dentro
        case .porEncima: self = .masDeLoPedido
        case .porDebajo: self = .menosDeLoPedido
        case .sinDato, .desconocido: self = .sinComprobar
        }
    }
}

// MARK: - La puerta a los días

/// Una sesión del plan, lista para una fila de Semana a semana.
struct FilaDeSesionVista: Equatable, Identifiable {
    let id: String
    /// Nulo si no se ejecutó: solo una sesión hecha se abre.
    let executionId: String?
    let titulo: String
    /// El día en que se hizo (o el programado, si no se hizo).
    let dia: String
    let marca: MarcaDeCumplimiento
    /// Lo que la marca no dice con la forma: «dentro», «más de lo pedido»… o «hecha, sin medir», «para hoy», «en pausa».
    let palabra: String
    /// Contra qué se juzgó: «5 de 6 tramos dentro» o «92 % de la carga planificada».
    let detalle: String?
    /// Lo hecho, ya escrito («50», «31 min»), y contra cuánto («de 68»).
    let hecho: String?
    let plan: String?
    /// La familia de su principal: da el punto de color.
    let familia: FamiliaLectura?

    var seAbre: Bool { executionId != nil }
}

enum PuertaDeSesiones {

    /// Las sesiones del plan de la ventana, la más reciente primero (el orden en que las sirve el servidor).
    static func filas(_ c: CumplimientoAnaliticas) -> [FilaDeSesionVista] {
        c.sesiones.map(fila)
    }

    static func fila(_ s: FilaDeSesion) -> FilaDeSesionVista {
        let marca = marcaDe(s)
        return FilaDeSesionVista(
            id: s.assignmentId,
            executionId: s.executionId,
            titulo: s.titulo ?? "Sesión del plan",
            dia: s.diaVisible,
            marca: marca,
            palabra: palabra(s, marca: marca),
            detalle: detalle(s),
            hecho: cifra(s.hecho, s),
            plan: cifra(s.plan, s),
            familia: s.lineas.first?.familia
        )
    }

    /// La marca de una sesión: cumplida = dentro; desviada o fuera = más o menos de lo pedido según el sentido del
    /// porcentaje; sin base comparable, sin plan.
    static func marcaDe(_ s: FilaDeSesion) -> MarcaDeCumplimiento {
        switch s.estado {
        case .cumplida: return .dentro
        case .desviada, .fuera: return (s.pct ?? 0) > 100 ? .masDeLoPedido : .menosDeLoPedido
        case .noHecha: return .noHecha
        case .hechaSinMedida, .pendiente, .excluida, .desconocido: return .sinPlan
        }
    }

    private static func palabra(_ s: FilaDeSesion, marca: MarcaDeCumplimiento) -> String {
        switch s.estado {
        case .hechaSinMedida: return "hecha, sin medir"
        case .pendiente: return "para hoy"
        case .excluida: return "en pausa"
        case .noHecha: return s.saltada ? "saltada" : "no hecha"
        default: return marca.palabra
        }
    }

    /// El detalle de la fila: los tramos de trabajo dentro de lo pedido si la sesión se juzgó tramo a tramo; si no, el
    /// porcentaje de su base.
    private static func detalle(_ s: FilaDeSesion) -> String? {
        let t = s.tramos
        if t.detalle == "tramos", t.evaluables > 0 {
            return "\(t.dentro) de \(t.evaluables) \(t.evaluables == 1 ? "tramo dentro" : "tramos dentro")"
        }
        guard let pct = s.pct, let base = s.base else { return nil }
        let de: String
        switch base {
        case .carga: de = "de la carga"
        case .duracion: de = "del tiempo"
        case .distancia: de = "de la distancia"
        case .desconocida: return nil
        }
        return "\(Int(pct.rounded())) % \(de)\(s.planMinimo ? " (el plan es un mínimo)" : "")"
    }

    /// Lo hecho o lo planificado, en la unidad de la base de la sesión.
    private static func cifra(_ v: Double?, _ s: FilaDeSesion) -> String? {
        guard let v, let unidad = s.unidad else { return nil }
        switch unidad {
        case .segundos: return Formato.duracion(Int((v / 60).rounded())) ?? AnaliticasFormato.formatear(v, .segundos)
        case .metros: return AnaliticasFormato.formatear(v, .metros)
        default: return AnaliticasFormato.cifra(v, unidad)
        }
    }
}

// MARK: - Lo que te piden

/// Las series con objetivo de una familia, contadas por su veredicto: un punto por serie.
struct PedidoDeSeries: Equatable {
    /// En su banda, con la holgura del coach.
    let dentro: Int
    /// MENOS de lo pedido: menos intenso (más lento, más RIR).
    let menos: Int
    /// MÁS de lo pedido: más intenso (menos segundos de ritmo, menos RIR).
    let mas: Int
    /// Cuántas sesiones tuvieron series con objetivo.
    let sesiones: Int

    var series: Int { dentro + menos + mas }

    /// El ritmo pedido en las series de correr: los tramos de trabajo con una comprobación de ritmo juzgada. Nulo si ninguna:
    /// aún no hay series con objetivo de ritmo en la ventana.
    static func correr(_ c: CumplimientoAnaliticas) -> PedidoDeSeries? {
        contar(c, familia: .correr) { tramo in
            guard tramo.esTrabajo else { return [] }
            return [tramo.comprobaciones.first { $0.eje == EjesDelCumplimiento.ritmo && $0.pregunta == EjesDelCumplimiento.intensidad }?.veredicto]
                .compactMap { $0 }
        }
    }

    /// El RIR pedido en las series de fuerza: cada serie de trabajo (no de aproximación) con una comprobación de RIR juzgada.
    static func rir(_ c: CumplimientoAnaliticas) -> PedidoDeSeries? {
        contar(c, familia: .fuerza) { tramo in
            tramo.series.filter { !$0.aproximacion }.compactMap { serie in
                serie.comprobaciones.first { $0.eje == EjesDelCumplimiento.rir }?.veredicto
            }
        }
    }

    private static func contar(_ c: CumplimientoAnaliticas, familia: FamiliaLectura, veredictos: (TramoJuzgado) -> [VeredictoDeTramo]) -> PedidoDeSeries? {
        var dentro = 0, menos = 0, mas = 0, sesiones = 0
        for s in c.sesiones {
            var cuentaEstaSesion = 0
            for linea in s.lineas where linea.familia == familia {
                for tramo in linea.tramos {
                    for v in veredictos(tramo) {
                        switch v {
                        case .dentro: dentro += 1
                        case .porDebajo: menos += 1
                        case .porEncima: mas += 1
                        case .sinDato, .desconocido: continue
                        }
                        cuentaEstaSesion += 1
                    }
                }
            }
            if cuentaEstaSesion > 0 { sesiones += 1 }
        }
        let pedido = PedidoDeSeries(dentro: dentro, menos: menos, mas: mas, sesiones: sesiones)
        return pedido.series > 0 ? pedido : nil
    }
}

/// «Lo que te piden» antes de saber si hay algo que contar: el cumplimiento llega aparte del detalle de la familia.
enum LoQueTePiden: Equatable {
    /// El cumplimiento aún no ha llegado: la sección no se pinta (no se anuncia un vacío que puede no serlo).
    case sinCargar
    /// Llegó y no hay series con objetivo: se dice, con lo que lo cambia.
    case sinSeries
    case series(PedidoDeSeries)

    static func correr(_ c: CumplimientoAnaliticas?) -> LoQueTePiden { de(c, PedidoDeSeries.correr) }
    static func rir(_ c: CumplimientoAnaliticas?) -> LoQueTePiden { de(c, PedidoDeSeries.rir) }

    private static func de(_ c: CumplimientoAnaliticas?, _ contar: (CumplimientoAnaliticas) -> PedidoDeSeries?) -> LoQueTePiden {
        guard let c else { return .sinCargar }
        return contar(c).map(LoQueTePiden.series) ?? .sinSeries
    }
}

// MARK: - El sello de cada tramo de una sesión

/// El veredicto de cada tramo de UNA sesión, por el id del tramo (`segment_executions.id`): lo que el detalle de la sesión
/// no sirve (`pendientes: ['cumplimiento']`) y sí el cumplimiento. Sin fila (la sesión es libre, o el cumplimiento aún no
/// llegó), no hay veredictos y el tramo se pinta sin sello, no con uno inventado.
struct VeredictosDeSesion: Equatable {
    private let porTramo: [String: VeredictoDeTramo]

    init(_ fila: FilaDeSesion?) {
        var m: [String: VeredictoDeTramo] = [:]
        for l in fila?.lineas ?? [] { for t in l.tramos { m[t.segmentExecutionId] = t.veredicto } }
        porTramo = m
    }

    var estaVacio: Bool { porTramo.isEmpty }

    /// El sello de un tramo: `nil` cuando la sesión no tiene plan que cruzar (entonces «sin plan»).
    func marca(de tramoId: String, tienePlan: Bool) -> MarcaDeCumplimiento {
        guard tienePlan else { return .sinPlan }
        return porTramo[tramoId].map(MarcaDeCumplimiento.init) ?? .sinComprobar
    }
}
