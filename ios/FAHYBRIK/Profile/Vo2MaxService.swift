import Foundation

// GET /api/athlete/vo2max — el número aeróbico del atleta, ya resuelto.
//
// UNA llamada trae el cuadro entero porque la regla de coherencia (cuál de los
// dos números de la misma familia manda y cuál viaja etiquetado al lado) la
// decide el servidor en `web/lib/athlete/vo2max.ts`. La app no elige: pinta.
// Snake_case del cable (`measured_on`, `iso_date`, `mark_label`) mapea solo por
// el `convertFromSnakeCase` global del APIClient.

enum Vo2MaxSource: String, Codable {
    /// Lo estima el reloj a partir de tus carreras — el que la gente reconoce.
    case watch
    /// Medido en el test de campo de 12 minutos.
    case cooper
}

/// El número del que va la pantalla, con de dónde sale y de cuándo es.
struct Vo2MaxHeadline: Codable {
    let value: Double
    let source: Vo2MaxSource
    let measuredOn: String   // yyyy-MM-dd, día local del atleta
}

struct Vo2MaxPoint: Codable {
    let isoDate: String
    let value: Double
}

/// El VDOT estimado con las marcas del atleta. Acompaña al titular con su fuente
/// escrita y NUNCA se promedia con él: es un modelo de ritmo que comparte
/// unidades, no una segunda medida de lo mismo.
struct Vo2MaxVdot: Codable {
    let value: Double
    let markLabel: String
    let recordedOn: String
}

struct AthleteVo2Max: Codable {
    /// Nil cuando nada lo ha medido todavía — el estado vacío honesto.
    let headline: Vo2MaxHeadline?
    /// Lecturas del reloj en la ventana, sólo los días que tienen una. Vacío
    /// cuando no hay las suficientes para que una línea signifique algo.
    let series: [Vo2MaxPoint]
    /// Media del tramo anterior de la serie — la referencia del «vs tu media».
    let baseline: Double?
    let vdot: Vo2MaxVdot?
}

private struct Vo2MaxResponse: Decodable {
    let vo2max: AthleteVo2Max?
}

enum Vo2MaxService {
    static func fetch(bearer: String?) async throws -> AthleteVo2Max? {
        let resp: Vo2MaxResponse = try await APIClient.shared.get(
            path: "api/athlete/vo2max",
            bearer: bearer
        )
        return resp.vo2max
    }
}
