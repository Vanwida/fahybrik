import Foundation

// #27 — reads GET /api/athlete/history?month=YYYY-MM.
//
// LANZA cuando no pudimos preguntar. Antes devolvía nil ante cualquier fallo
// (offline / auth / 4xx) y la pantalla lo pintaba como «Sin entrenos este mes»:
// un mes en el que el atleta SÍ entrenó salía vacío porque se había caído el wifi.
// Un mes sin entrenos es una respuesta legítima —`days` vacío— y no es lo mismo
// que no haber podido preguntar; el §5 pide estados distintos porque las salidas
// son distintas (una lleva reintento y la otra no).
enum HistoryService {
    static func fetch(month: YearMonth, bearer: String?) async throws -> AthleteHistoryMonth {
        try await APIClient.shared.get(
            path: "api/athlete/history?month=\(month.iso)",
            bearer: bearer
        )
    }
}
