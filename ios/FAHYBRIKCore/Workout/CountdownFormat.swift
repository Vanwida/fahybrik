import Foundation

// LA CUENTA ATRÁS, UNA SOLA REGLA.
//
// Había dos funciones — `standalone` (CEIL) y `mirrored` (ROUND) — porque el reloj
// tenía dos ideas del mismo segundo: el count-in redondeaba hacia arriba y el
// crono del héroe hacia el más cercano, así que la misma cuenta atrás se leía
// distinta según qué la pintara. La de arriba iba además 1 s POR DELANTE del
// móvil (la foto del bug de Alex).
//
// Manda el móvil, que es el dueño del tiempo: formatea con `Formato.clock`
// (ROUND), así que la muñeca redondea igual y el mismo `remaining` cae en el
// mismo entero en las dos pantallas. El háptico del 3-2-1 se dispara con ESTE
// entero, no con otro calculado aparte: número y golpe no pueden discrepar.
//
// Pura y compartida por los dos targets, así que la recorre FAHYBRIKTests (no hay
// target de test del reloj). Por debajo del minuto se lee ":34" (el estilo de
// intervalo del mockup); de un minuto en adelante delega en el formateador
// compartido. Nunca negativa.
//
// LO QUE SIGUE ABIERTO, Y NO ES EL REDONDEO: la muñeca pinta
// `countdownRemaining - sinceFrame(now)`, una cifra que el móvil nunca pintó, así
// que entre tramas las dos pantallas siguen pudiendo diferir en un segundo por el
// viaje del paquete. El arreglo de raíz es mandar el INSTANTE de vencimiento en
// vez de los segundos que quedan — un dato absoluto que las dos calculan igual
// contra un reloj de pared que ya está sincronizado. Ver docs/DECISIONS.md.
enum CountdownFormat {
    /// Los segundos que QUEDAN, con la regla del móvil (round to nearest).
    static func remaining(_ seconds: Double) -> String {
        format(max(0, Int(seconds.rounded())))
    }

    /// El entero que se PINTA. El háptico del 3-2-1 lo lee de aquí para que el
    /// golpe caiga en el segundo que el atleta está viendo.
    static func wholeSeconds(_ seconds: Double) -> Int {
        max(0, Int(seconds.rounded()))
    }

    private static func format(_ wholeSeconds: Int) -> String {
        if wholeSeconds < 60 { return String(format: ":%02d", wholeSeconds) }
        return Formato.clock(Double(wholeSeconds), anchoFijo: true)
    }
}
