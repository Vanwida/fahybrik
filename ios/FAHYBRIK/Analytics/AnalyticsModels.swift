import Foundation

// LA SERIE DE LA LÍNEA DE VO₂MÁX (piel vieja que sigue viva: ver `AnalyticsCharts`). Es lo único que queda de los modelos de la pestaña
// de siete contratos (secciones, tarjetas, periodos, drill-down): los sustituyen `PanelAnaliticas` y `DetalleAnaliticas`, que sirven
// lecturas con su unidad y su procedencia. Se borra con `LineSeriesChart` cuando Perfil pase a «El día».

struct CardSeriesPoint: Codable, Hashable, Identifiable {
    let id: String
    /// Normalised 0..1 bar height (taller = bigger magnitude).
    let height: Double
    let display: String?
    /// The most-recent / current point, accented in the UI.
    let current: Bool
    let label: String?
}

/// Line-chart y-axis end labels — the REAL formatted values at the series'
/// lowest (bottom) and highest (top) plotted points. Both come from an actual
/// point's `display`, never fabricated.
struct CardSeriesAxis: Codable, Hashable {
    let min_display: String
    let max_display: String

    enum CodingKeys: String, CodingKey {
        case min_display = "minDisplay"
        case max_display = "maxDisplay"
    }
}
