import Foundation

// LO QUE ESCRIBIMOS EN APPLE SALUD LLEVA NUESTRA FIRMA, Y LO FIRMAN LOS DOS LADOS.
//
// La marca vivía en `HealthKitWorkoutWriter` (target del teléfono), así que la muñeca
// no podía firmar. Y la muñeca es justo quien escribe el HKWorkout de casi todas las
// sesiones: el reloj graba mientras el móvil lleva el motor.
//
// LO QUE COSTÓ NO TENERLA (debugger del 29-ago, Z2 de Alex, asignación 494): al
// terminar, la app tenía 3,78 km · 22:33 · 153 ppm · 5:58. Al reabrir la sesión
// guardada: **22:40 y cero bloques**. El entreno del atleta lo había escrito el
// volcado de Salud, no la app — porque el HKWorkout de la muñeca llegaba al servidor
// sin firma, indistinguible de una importación ajena, y `linkExecution`
// (`web/lib/sync/ingest-healthkit.ts`) lo adoptaba: duración de RELOJ DE PARED
// (22:40, con la puerta del bloque y el 3-2-1 dentro) y ni un tramo, porque un
// volcado de Salud no tiene tramos que traer. Y encima marcaba la sesión completa.
//
// Sus cuatro guardas —uuid ya grabado, solape de tiempo, `source = garmin`,
// `recorded_via = live`— no fallaron: **todas preguntan por evidencia que sólo existe
// si nuestro POST llegó primero**. O sea que eran una carrera, y ese día la perdimos.
//
// Con la firma, la pregunta deja de ser «¿llegó ya el nuestro?» (una carrera) y pasa a
// ser «¿es nuestro?» (una identidad). El HKWorkout de una sesión de la app NUNCA sube
// al volcado, así que no hay nada que sobrescribir.
//
// LA RED DE SEGURIDAD NO DESAPARECE, CAMBIA DE SITIO: si el POST de la ejecución no
// tiene línea, se encola (`enqueueOnFailure: true` en `guardarLoMedido`) y sale en el
// próximo arranque con lo MEDIDO dentro. Antes la red era este volcado, y era una red
// que mentía: prefería un número de reloj de pared sin tramos a esperar el bueno.
enum SaludNuestra {
    /// La firma que llevan las muestras y los entrenos que escribe FAHYBRID.
    ///
    /// EL LITERAL NO SE TOCA. Es la clave con la que están sellados los datos que ya
    /// viven en Apple Salud de cada atleta: HealthKit no reescribe metadata, así que
    /// renombrarla no migra nada y todo lo escrito hasta hoy dejaría de reconocerse
    /// como nuestro — volvería a contarse como medido por un dispositivo. NO derivar
    /// de `Marca`. Ver docs/ios-clonabilidad.md § lo que no se toca.
    static let firma = "FAHYBRIDWrittenByApp"

    /// El diccionario de metadata con la firma puesta, para pasárselo tal cual a
    /// `HKWorkoutBuilder.addMetadata` / `HKQuantitySample(metadata:)`.
    ///
    /// Calculado, no guardado: un `[String: Any]` global no es `Sendable`, y esto lo
    /// llaman el teléfono y la muñeca desde contextos asíncronos.
    static var metadata: [String: Any] { [firma: true] }

    /// ¿Lo escribimos nosotros? La pregunta que hacen los lectores antes de tragarse
    /// un dato como si lo hubiera medido un aparato.
    static func esNuestro(_ metadata: [String: Any]?) -> Bool {
        metadata?[firma] != nil
    }
}
