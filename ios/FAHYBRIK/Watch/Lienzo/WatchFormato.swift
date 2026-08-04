import Foundation

// LA GRAFÍA de la muñeca: cómo se escribe cada número en el reloj, y qué se dice
// cuando un dato en vivo todavía no existe. Los dos son Foundation puro y los usan
// tanto los átomos SwiftUI del reloj (`FAHYBRIKWatch/Views/LiveHUDShared.swift`,
// de donde salen) como los guiones — que son lo que se testea desde FAHYBRIKTests
// (iOS). Por eso compilan en los dos targets: sin ellos no hay página que armar.

// MARK: - Numeral formatting

enum WatchFormat {
    /// Count-UP clock ("08:21", "1:02:40"). Delegates to the engine's formatter so
    /// the watch and phone read time identically.
    static func clock(_ seconds: Double) -> String { Formato.clock(seconds, anchoFijo: true) }

    /// STANDALONE count-DOWN readout (CEIL) — the watch is the sole display, so it
    /// shows the whole second in lock-step with the engine's audio ticks (count-in,
    /// interval, rest, tramo). The MIRROR path rounds instead (matches the phone) via
    /// `CountdownFormat.mirrored`, called directly from MirrorHUDView.
    static func countdown(_ seconds: Double) -> String { CountdownFormat.standalone(seconds) }

    /// Pace seconds → "m:ss" (e.g. 278 → "4:38").
    ///
    /// Con un ritmo medido delante SIEMPRE sabe escribirlo, así que nunca devuelve
    /// hueco. El llamante que TODAVÍA no tiene ritmo no pinta un guion: degrada a la
    /// siguiente verdad (el reloj del tramo) y lo dice en la etiqueta — ver
    /// `StructuredRunLiveView.lecturaDelTramo` y `MirrorHUDView.lecturaDeCinta`.
    static func pace(_ secondsPerUnit: Int) -> String {
        Formato.ritmoCifras(Double(secondsPerUnit))
    }

    /// Kilogramos sin el ".0" de más ("80", "82,5"). Escribía «82.5» con punto
    /// mientras el teléfono escribía «82,5»: el mismo peso, dos grafías, y el reloj
    /// es la pantalla que el atleta mira mientras levanta.
    static func kg(_ value: Double) -> String { Formato.esDecimal(value) }
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
