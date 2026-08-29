import Foundation

// UN KILÓMETRO CUMPLIDO ES UN SUCESO, Y LO DETECTA UNA SOLA COSA.
//
// Lo detectaba `RunCueEngine`, que es el cerebro del AUDIO. Consecuencias, las tres
// reales:
//
//  1. El suceso moría en la voz. Nadie más podía enterarse — ni la grabación de
//     Apple (que tiene un tipo para esto, `HKWorkoutEvent.lap`) ni el resumen.
//  2. Lo alimentaban DOS modelos de HUD, calle y cinta, cada uno desde su propio
//     timer de medio segundo y cada uno con su idea de «metros cubiertos» y de
//     «segundos del tramo». Dos entradas al mismo cursor.
//  3. El cursor se reiniciaba desde UNO de los dos: la cinta llamaba a
//     `enterContinuousRun()` al abrir un tramo nuevo y la calle no. Así que en un
//     rodaje de calle el kilómetro seguía contando desde el tramo anterior.
//
// Aquí el detector vive donde entran los metros, que es el motor. Emite el suceso y
// quien lo necesite lo escucha: la voz lo dice, la muñeca lo escribe como vuelta en
// el HKWorkout, y el resumen lo lee de la traza. Una detección, tres lectores.

/// El kilómetro que se acaba de cerrar y lo que costó.
struct RunKmSplit: Equatable {
    /// El kilómetro cumplido: 1 al cruzar los 1.000 m, 2 a los 2.000…
    let km: Int
    /// Lo que costó ESE kilómetro, no el acumulado.
    let splitSeconds: Double
    /// Segundos de tramo en el instante del cruce — el ancla temporal del suceso.
    let atElapsedSeconds: Double

    /// En un kilómetro, el ritmo por kilómetro ES el parcial. No hay regla de tres
    /// que aplicar, y por eso este es el número que se anuncia y se escribe.
    var paceSecPerKm: Int { Int(splitSeconds.rounded()) }
}

/// El cursor del kilómetro de un rodaje. Puro y sin relojes: se le dan los metros
/// cubiertos y los segundos del tramo, y contesta si acaba de cerrarse un kilómetro.
struct RunKmSplits: Equatable {
    private var lastKm = 0
    private var lastElapsed: Double = 0

    /// Tramo nuevo, cuenta nueva. «Kilómetro 1» es el primero de ESTE rodaje.
    mutating func reset() {
        lastKm = 0
        lastElapsed = 0
    }

    /// - Returns: el parcial si se acaba de cruzar el kilómetro siguiente; nil si no.
    ///
    /// SALTARSE MÁS DE UN KILÓMETRO NO PRODUCE PARCIAL. Con un salto de GPS (un túnel,
    /// un arranque sembrado desde una traza anterior) los metros pueden pasar de 900 a
    /// 2.100 de golpe, y entonces no se sabe qué costó cada uno de los dos kilómetros:
    /// repartir los segundos a medias sería fabricar dos ritmos que nadie midió (§7).
    /// El cursor se re-ancla en silencio y el siguiente kilómetro vuelve a ser medible.
    mutating func step(coveredMeters: Double, elapsedSeconds: Double) -> RunKmSplit? {
        let km = Int(coveredMeters / 1000)
        guard km > lastKm else { return nil }
        let saltados = km - lastKm
        let split = elapsedSeconds - lastElapsed
        lastKm = km
        lastElapsed = elapsedSeconds
        guard saltados == 1, split > 0 else { return nil }
        return RunKmSplit(km: km, splitSeconds: split, atElapsedSeconds: elapsedSeconds)
    }
}
