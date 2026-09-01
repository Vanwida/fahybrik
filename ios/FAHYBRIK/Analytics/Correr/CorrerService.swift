import Foundation

// EL CABLE DEL HOGAR DEL RUNNING. Tres endpoints, uno por vista, y ninguno
// sustituye a `fetchRunningProgress`: aquel contesta «¿estoy mejorando?» y
// estos sirven el historial, las tendencias y la capacidad — preguntas
// distintas, cada una con su motor en el servidor.
//
// Bearer del atleta y snake_case, como todos los hermanos (la conversión a
// camelCase la hace el decodificador del APIClient).
enum CorrerService {

    /// TUS CARRERAS — agregados de la ventana + semanas con subtotal + filas.
    /// `tipo` filtra en el SERVIDOR: los agregados de arriba se recalculan
    /// sobre el filtro, no sobre la ventana entera (regla del mock).
    static func fetchHistorial(
        ventana: VentanaCorrer,
        tipo: String? = nil,
        bearer: String
    ) async throws -> HistorialDeCorrer {
        var path = "api/athlete/running/historial?window=\(ventana.rawValue)"
        if let tipo { path += "&tipo=\(tipo)" }
        return try await APIClient.shared.get(path: path, bearer: bearer)
    }

    /// TENDENCIAS — un cubo por semana (o mes, en ventanas largas) con las
    /// métricas del periodo. Una métrica sin fuente llega nula en TODOS los
    /// cubos y su bloque no se pinta.
    static func fetchTendencias(
        ventana: VentanaTendencias,
        bearer: String
    ) async throws -> TendenciasDeCorrer {
        try await APIClient.shared.get(
            path: "api/athlete/running/tendencias?window=\(ventana.rawValue)",
            bearer: bearer
        )
    }

    /// CAPACIDAD — umbral con procedencia, zonas del perfil, velocidad
    /// crítica, récords (calle y cinta separados) y el predictor. Viene junta
    /// a propósito: el umbral y sus zonas salen del mismo instante.
    static func fetchCapacidad(bearer: String) async throws -> CapacidadDeCorrer {
        try await APIClient.shared.get(
            path: "api/athlete/running/capacidad",
            bearer: bearer
        )
    }
}
