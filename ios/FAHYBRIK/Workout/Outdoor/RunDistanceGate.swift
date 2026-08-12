import Foundation

// LA PUERTA DE LA DISTANCIA. Qué tramo entre dos fixes cuenta como metros reales.
//
// EL FALLO QUE CIERRA (encontrado corriendo, 12-ago). La puerta anterior aceptaba un
// tramo sólo si medía entre 2 y 60 metros. Y 60 metros no son implausibles: lo son
// sólo si ocurren DEPRISA. A 5:00/km se recorren 60 m en 18 s; a 3:30, en 12. Así que
// cualquier hueco de señal de más de ~15 s tiraba el 100 % de esa distancia — un
// túnel, una calle entre edificios, un tramo bajo árboles. Y cuanto más rápido corre
// el atleta, antes cruza el umbral: las series perdían más que los rodajes, que es
// justo al revés de lo que uno querría.
//
// Peor: se componía con el filtro de precisión. Un fix malo se descarta sin mover el
// ancla —eso está bien—, pero eso CREA el hueco; y cuando la señal volvía, el salto
// acumulado valía el bache entero, pasaba de 60 m y moría justo el fix que lo iba a
// recuperar todo. Descartar por precisión no perdía nada por sí solo: perdía porque
// el tope mataba al rescatador.
//
// LA REGLA NUEVA: SE JUZGA LA VELOCIDAD, NO LA DISTANCIA. Con el tiempo entre los dos
// fixes, un tramo es real si la velocidad que implica es posible para un humano
// corriendo, mida 5 metros o 300. Un límite por velocidad no necesita saber cuánto
// duró el hueco: se defiende solo.
//
// Y LO DESCARTADO NO MUEVE EL ANCLA. El fallo era irreversible porque la referencia
// avanzaba aunque el tramo se tirara, así que esos metros no volvían nunca. Aquí sólo
// `accept` autoriza a avanzar; todo lo demás deja el ancla donde estaba, así que el
// siguiente fix vuelve a medir desde el último punto BUENO. Eso arregla de paso el
// goteo de los avances cortos: dejan de evaporarse de uno en uno y se suman solos
// hasta cruzar el umbral.

struct RunDistanceGate {

    /// Qué hacer con el tramo entre el último punto bueno y este fix.
    enum Verdict: Equatable {
        /// Metros reales. **Es el ÚNICO caso que autoriza a mover el ancla.**
        case accept(meters: Double)
        /// Ruido de estar parado. No cuenta todavía, pero tampoco se pierde: como el
        /// ancla no se mueve, el siguiente fix mide desde el mismo sitio y los
        /// avances pequeños acaban sumando.
        case tooSmallYet
        /// Ningún humano corriendo hace eso: el GPS ha saltado.
        case implausible
        /// Sin tiempo entre fixes no hay velocidad que juzgar (relojes iguales o
        /// hacia atrás). No se cuenta y no se mueve nada.
        case unmeasurable
    }

    /// Techo de velocidad para creerse un tramo (m/s). 12,5 m/s son 45 km/h: por
    /// encima del pico de Usain Bolt (12,42 m/s), así que NINGÚN humano corriendo
    /// cae por aquí — sólo un salto del GPS o un trayecto en coche.
    ///
    /// Es MECANISMO, no método: no es un juicio sobre el atleta ni algo que otro
    /// entrenador pondría distinto, es la frontera de lo que un cuerpo humano puede
    /// hacer. Por eso vive en código y no como dato del coach.
    static let maxPlausibleSpeedMps: Double = 12.5

    /// Por debajo de esto, entre dos fixes, es temblor del GPS estando parado. NO se
    /// tira: se acumula (ver `tooSmallYet`).
    static let minStepMeters: Double = 2

    /// Precisión horizontal máxima aceptable de un fix (m). Un fix más flojo no entra
    /// a la puerta siquiera — y no mueve el ancla, así que el hueco que crea lo
    /// rescata entero el primer fix bueno que llegue.
    static let accuracyGateMeters: Double = 25

    /// - Parameters:
    ///   - meters: distancia entre el último punto bueno y este fix.
    ///   - seconds: tiempo entre los dos, del reloj de CoreLocation (no del nuestro:
    ///     los fixes pueden llegar en lote y con retraso, y lo que importa es cuándo
    ///     se midieron).
    static func judge(meters: Double, seconds: TimeInterval) -> Verdict {
        guard meters.isFinite, seconds.isFinite, seconds > 0 else { return .unmeasurable }
        guard meters / seconds <= maxPlausibleSpeedMps else { return .implausible }
        guard meters >= minStepMeters else { return .tooSmallYet }
        return .accept(meters: meters)
    }

    /// Si un fix con esta precisión horizontal merece mirarse (negativa = inválida).
    static func isFixUsable(horizontalAccuracyM: Double) -> Bool {
        horizontalAccuracyM >= 0 && horizontalAccuracyM <= accuracyGateMeters
    }
}
