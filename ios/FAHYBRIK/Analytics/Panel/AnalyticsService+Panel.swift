import Foundation

// EL PANEL, POR VENTANA — `GET /api/athlete/analytics/panel?ventana=7d|4s|12s|6m|1a|todo`.
//
// Una llamada trae los ocho bloques del mismo instante (A1): pedirlos por
// separado permitiría que dos respuestas de instantes distintos se contradijeran
// en la misma pantalla. La caché por ventana y el refresco viven en
// `AppDataStore.panelAnaliticas(_:)` / `refreshPanelAnaliticas(_:force:)` — el
// mismo motor SWR + disco que el resto de la app, no un segundo.
extension AnalyticsService {

    /// Throwing a propósito: el motor SWR conserva la última porción buena cuando
    /// una revalidación falla (offline-first).
    static func fetchPanel(ventana: VentanaClave, bearer: String) async throws -> PanelAnaliticas {
        try await APIClient.shared.get(
            path: "api/athlete/analytics/panel?ventana=\(ventana.rawValue)",
            bearer: bearer
        )
    }
}
