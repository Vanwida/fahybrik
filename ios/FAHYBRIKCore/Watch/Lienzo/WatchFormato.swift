import Foundation

// LA GRAFÍA de la muñeca: cómo se escribe cada número en el reloj, y qué se dice
// cuando un dato en vivo todavía no existe. Los dos son Foundation puro y los usan
// los átomos SwiftUI del reloj (`FAHYBRIKWatch/Views/LiveHUDShared.swift`, de donde
// salen) y las pantallas que no son de la pila (resumen, puerta de bloque, espejo).

// MARK: - Numeral formatting

enum WatchFormat {
    /// Count-UP clock ("08:21", "1:02:40"). Delegates to the engine's formatter so
    /// the watch and phone read time identically.
    static func clock(_ seconds: Double) -> String { Formato.clock(seconds, anchoFijo: true) }
}

// MARK: - Por qué no hay dato

/// Las razones ciertas de que un dato en vivo todavía no exista EN LA MUÑECA.
///
/// §7 del contrato de UI: lo que no se sabe no se pinta — se pinta la razón, que es
/// lo único accionable. Aquí «sin reloj» nunca vale como razón: el reloj ES el
/// dispositivo. Vive aquí porque la dicen tres sitios (la pastilla de pulso, la celda
/// de FC del rodaje y el encabezado de la barra de zona) y antes cada uno se
/// inventaba su propio `?? "—"`.
///
/// PENDIENTE: su sitio natural es `Vocab` (`Theme/Formato.swift`, ya compilado en el
/// reloj); no se movió ahí para no tocar la app del teléfono en esta tanda.
enum WatchSinDato {
    /// El sensor de la muñeca aún no ha entregado una pulsación.
    static let pulso = "buscando pulso"
}
