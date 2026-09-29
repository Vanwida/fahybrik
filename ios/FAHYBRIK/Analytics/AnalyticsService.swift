import Foundation

// LAS LLAMADAS DE ANALÍTICAS — el espacio de nombres de los cuatro endpoints que lee la pestaña. Cada uno vive junto a su modelo:
//
//   panel          `AnalyticsService+Panel`     GET /api/athlete/analytics/panel?ventana=
//   familia        `DetalleAnaliticas`          GET /api/athlete/analytics/familia/{familia}?ventana=
//   cumplimiento   `CumplimientoAnaliticas`     GET /api/athlete/analytics/cumplimiento?ventana=
//   sesión         `DetalleDeSesion`            GET /api/athlete/analytics/sesion/{executionId}
//
// Todos lanzan a propósito: el motor SWR de `AppDataStore` conserva la última porción buena cuando una revalidación falla.
enum AnalyticsService {}
