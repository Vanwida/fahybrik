import Foundation

// LA GRAFÍA de la muñeca: cómo se escribe cada número en el reloj, y qué se dice
// cuando un dato en vivo todavía no existe. Los dos son Foundation puro y los usan
// tanto los átomos SwiftUI del reloj (`FAHYBRIKWatch/Views/LiveHUDShared.swift`,
// de donde salen) como los guiones — que son lo que se testea desde FAHYBRIKTests
// (iOS). Por eso compilan en los dos targets: sin ellos no hay página que armar.

// MARK: - Numeral formatting

enum WatchFormat {
    /// Count-UP clock ("08:21", "63:00"). Delegates to the engine's formatter so el
    /// reloj y el teléfono lean el tiempo igual.
    ///
    /// EN MINUTOS, TAMBIÉN PASADA LA HORA — y no es una preferencia de estilo, es el
    /// ancho del lienzo. Escribía «1:02:40», que son SIETE glifos, y el sujeto de la
    /// muñeca tiene un tope de cinco: por encima el numeral se encoge por debajo de
    /// su suelo de 43 pt y deja de leerse como el dato. Un rodaje largo pasa de la
    /// hora casi siempre, así que el caso no es raro: es el entreno más habitual de
    /// todos. Con `enHoras: false` el mismo tiempo es «62:40», cinco glifos, que
    /// entran justos.
    ///
    /// El teléfono sigue escribiendo las horas: allí sobra el ancho, y quien quiere
    /// saber la hora de un rodaje la lee ahí.
    static func clock(_ seconds: Double) -> String {
        Formato.clock(seconds, anchoFijo: true, enHoras: false)
    }

    /// Count-DOWN readout (count-in, intervalo, descanso, tramo). Una sola regla en
    /// las dos vías del reloj — y la del móvil, que es el dueño del tiempo. Ver
    /// `CountdownFormat`.
    static func countdown(_ seconds: Double) -> String { CountdownFormat.remaining(seconds) }

    /// Pace seconds → "m:ss" (e.g. 278 → "4:38").
    ///
    /// Con un ritmo medido delante SIEMPRE sabe escribirlo, así que nunca devuelve
    /// hueco. El llamante que TODAVÍA no tiene ritmo no pinta un guion: degrada a la
    /// siguiente verdad (el reloj del tramo) y lo dice en la etiqueta — ver
    /// `StructuredRunLiveView.lecturaDelTramo`.
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
