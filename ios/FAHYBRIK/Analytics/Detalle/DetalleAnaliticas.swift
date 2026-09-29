import Foundation

// EL DETALLE DE UNA FAMILIA — el sobre de `GET /api/athlete/analytics/familia/{familia}?ventana=`
// (`DetalleAnaliticas`, `web/lib/analytics/progreso.ts`).
//
// UN CÁLCULO, DOS PINTORES (A1). Es la lista de `Lectura` que el mismo motor (`progresoAtleta`) sirve
// al panel del coach: la PRIMERA es EXACTAMENTE la fila de la familia en el Progreso de la portada
// (`progreso.<familia>`), y detrás vienen las que la pantalla de la familia lee por su id (`correr.mejor.5000`,
// `fuerza.e1rm.<id>`…). El iPhone las PINTA: ni un umbral, ni un veredicto, ni una palabra de dato.
//
// TOLERANCIA (la regla de `PanelAnaliticas`): una familia, una lectura o una falta que este binario no
// conozca no tumban la pantalla — se pierde esa lectura y el resto se pinta.

/// Las familias con detalle propio: el parámetro de la ruta. El WOD no tiene la suya: vive dentro de
/// estaciones (`progreso-atleta.ts`, «estaciones lleva también los WOD»).
enum FamiliaDeDetalle: String, Codable, Equatable, CaseIterable {
    case correr, remo, ski, bici, fuerza, estaciones
    /// Una familia que este binario no conoce.
    case desconocida

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = FamiliaDeDetalle(rawValue: raw) ?? .desconocida
    }

    /// El detalle que abre una fila de la portada. `otro` y lo que no se conoce no tienen.
    init?(_ f: FamiliaLectura?) {
        switch f {
        case .correr?: self = .correr
        case .remo?: self = .remo
        case .ski?: self = .ski
        case .bici?: self = .bici
        case .fuerza?: self = .fuerza
        case .estaciones?, .wod?: self = .estaciones
        case .otro?, .desconocida?, nil: return nil
        }
    }

    /// La familia de lectura que da su color y su nombre.
    var lectura: FamiliaLectura {
        switch self {
        case .correr: return .correr
        case .remo: return .remo
        case .ski: return .ski
        case .bici: return .bici
        case .fuerza: return .fuerza
        case .estaciones: return .estaciones
        case .desconocida: return .desconocida
        }
    }

    /// Remo, ski y bici son UNA pantalla con la máquina como variante.
    var esErgo: Bool { self == .remo || self == .ski || self == .bici }
}

struct DetalleAnaliticas: Codable, Equatable {
    let athleteId: String
    let generadoIso: String
    let ventana: VentanaDelPanel
    /// Cuánta historia hay DE VERDAD, y si la ventana la abarca entera.
    let historia: HistoriaDelAtleta
    /// El método del coach REALMENTE usado (solo lo que esta pantalla lee).
    let metodo: MetodoDelPanel
    /// Los umbrales del atleta tal como se han resuelto, con su peldaño (el de potencia de cada máquina, el de ritmo).
    let anclas: AnclasDelPanel
    /// La familia del detalle; nula en la lista de récords.
    let familia: FamiliaDeDetalle?
    @LossyArray var lecturas: [LecturaAnalitica]

    /// «Hoy» en el calendario del atleta: el último día de la ventana. Como en el panel, toda la aritmética
    /// de fechas cuelga de esto y nunca de `Date()`.
    var hoy: String { ventana.hasta }

    /// La fila de la familia (`progreso.<familia>`): la que abre este detalle y la que pinta la portada.
    var fila: LecturaAnalitica? { lecturas.first { $0.id.hasPrefix("progreso.") } }

    func lectura(_ id: String) -> LecturaAnalitica? { lecturas.first { $0.id == id } }
    func lecturas(prefijo: String) -> [LecturaAnalitica] { lecturas.filter { $0.id.hasPrefix(prefijo) } }
}

extension AnalyticsService {
    /// El detalle de una familia en una ventana. Throwing a propósito, como `fetchPanel`: el motor SWR
    /// conserva la última porción buena cuando una revalidación falla.
    static func fetchDetalleFamilia(_ familia: FamiliaDeDetalle, ventana: VentanaClave, bearer: String) async throws -> DetalleAnaliticas {
        try await APIClient.shared.get(
            path: "api/athlete/analytics/familia/\(familia.rawValue)?ventana=\(ventana.rawValue)",
            bearer: bearer
        )
    }
}
