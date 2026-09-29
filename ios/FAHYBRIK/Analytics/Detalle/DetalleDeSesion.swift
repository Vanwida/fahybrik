import Foundation

// LA SESIÓN, TRAMO A TRAMO — el sobre de `GET /api/athlete/analytics/sesion/{executionId}`
// (`DetalleSesion`, `web/lib/analytics/sesion.ts`): lo prescrito frente a lo hecho de cada tramo con su carga
// y el peldaño de donde sale, las zonas y la traza. La carga de cada tramo es LA QUE EL PANEL SUMÓ (la misma
// consulta, el mismo método, las mismas anclas): el detalle no vuelve a preciar.
//
// Se decodifica SOLO lo que se pinta. De lo prescrito, la frase que ya escribe el servidor (`texto_es`, la
// misma que ve el atleta en su plan): la prescripción entera se queda en el cable. De lo hecho, las cifras
// de cada modalidad. Del mapa y de las zonas de ritmo, nada (esta pantalla no dibuja mapa).
//
// EL VEREDICTO POR TRAMO NO VIAJA AQUÍ: el servidor lo declara `pendientes: ['cumplimiento']`. Lo sirve el
// detalle del cumplimiento (`CumplimientoAnaliticas`), que la pantalla cruza por el id del tramo cuando lo
// tiene; sin él, el tramo se pinta sin sello, no con uno inventado.

struct DetalleDeSesion: Codable, Equatable {
    let executionId: String
    /// Nulo fuera del plan (una importación, un entreno libre).
    let assignmentId: String?
    /// Por qué no cuelga de una sesión del plan (`assignment_gone` · `not_own_assignment` · `no_assignment`).
    let fueraDelPlan: String?
    /// El día LOCAL del atleta.
    let dia: String
    let tituloEs: String?
    /// El formato de la plantilla (`intervals`, `emom`, `for_time`…). Nulo en un entreno libre.
    let formato: String?
    /// El RPE de la sesión, 1-10.
    let rpe: Double?
    /// Carga (contra la planificada), duración y zonas de la sesión entera: `sesion.carga`, `sesion.duracion`, `sesion.zonas`.
    @LossyArray var lecturas: [LecturaAnalitica]
    @LossyArray var tramos: [TramoDeSesion]
    /// La carga del rato que ningún tramo cubre (calentar, descansos).
    let resto: CargaDeTramo?
    let traza: TrazaDeSesion

    func lectura(_ id: String) -> LecturaAnalitica? { lecturas.first { $0.id == id } }
}

/// La carga de UN tramo, como entró en la suma del panel.
struct CargaDeTramo: Codable, Equatable {
    /// Nulo cuando ningún peldaño pudo preciar nada del tramo.
    let tss: Double?
    let segundos: Double
    let sinSaberS: Double
    /// El peldaño que precia más tiempo del tramo. Nulo si no se preció nada.
    let peldano: PeldanoDeCarga?
    /// El ancla más débil de sus partes (nula = no depende de un umbral).
    let ancla: AnclaDeLectura?
}

/// De dónde sale la carga de un tramo, en el orden de evidencia (potencia › ritmo › pulso › esfuerzo).
enum PeldanoDeCarga: String, Codable, Equatable, CaseIterable {
    case potencia, ritmo, pulso, esfuerzo
    case desconocido

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PeldanoDeCarga(rawValue: raw) ?? .desconocido
    }

    /// Cómo se dice delante del atleta.
    var nombre: String? {
        switch self {
        case .potencia: return "potencia"
        case .ritmo: return "ritmo"
        case .pulso: return "pulso"
        case .esfuerzo: return "esfuerzo"
        case .desconocido: return nil
        }
    }
}

struct TramoDeSesion: Codable, Equatable, Identifiable {
    /// El `segment_executions.id`: es el que cruza con el veredicto del cumplimiento.
    let id: String
    let posicion: Int
    /// La ronda del formato (0 = no se repite).
    let ronda: Int
    let familia: FamiliaLectura
    /// El nombre del ejercicio (con el del coach si lo renombró). Nulo sin ejercicio.
    let ejercicioEs: String?
    /// `work` · `recovery` en una carrera de series; nulo fuera.
    let papel: String?
    /// `warmup` · `main` · `cooldown` en una carrera de series; nulo fuera.
    let fase: String?
    let segundos: Double?
    /// Lo que se le pidió a ESTE tramo. Nulo si no viajó ninguna prescripción.
    let prescrito: PedidoDeTramo?
    /// Lo que hizo, tal y como lo sirve el servidor (`SegmentActual`): el MISMO tipo que ya decodifica el detalle de una sesión del Plan.
    let hecho: SegmentActualDTO?
    let carga: CargaDeTramo?
}

struct PedidoDeTramo: Codable, Equatable {
    /// Lo prescrito en una frase, escrita por el servidor con la gramática del plan.
    let textoEs: String
}

// MARK: - La traza

struct TrazaDeSesion: Codable, Equatable {
    let disponible: Bool
    /// Kilómetro a kilómetro, sobre la traza ENTERA.
    @LossyArray var parcialesKm: [ParcialDeKm]
    /// Para dibujar: reducidas, nunca fuente de un cálculo.
    let pulso: CurvaDeSesion?
    let ritmo: CurvaDeSesion?
}

struct CurvaDeSesion: Codable, Equatable {
    /// Segundos desde el inicio de la sesión.
    let offsetsS: [Double]
    let values: [Double]

    var puntos: [PuntoDeTiempo] {
        zip(offsetsS, values).map { PuntoDeTiempo(t: $0, v: $1) }
    }
}

struct PuntoDeTiempo: Equatable {
    /// Segundos desde el inicio.
    let t: Double
    let v: Double
}

struct ParcialDeKm: Codable, Equatable {
    /// 1-based.
    let index: Int
    /// Solo el último, cuando la carrera no acabó en un múltiplo de 1000 m.
    let partial: Bool
    let distanceM: Double
    let durationS: Double?
    let avgPaceSPerKm: Double?
    let avgHr: Double?
}

extension AnalyticsService {
    /// El detalle de una sesión hecha. Throwing, como el resto del motor SWR.
    static func fetchSesion(executionId: String, bearer: String) async throws -> DetalleDeSesion {
        try await APIClient.shared.get(path: "api/athlete/analytics/sesion/\(executionId)", bearer: bearer)
    }
}
