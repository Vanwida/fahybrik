import Foundation

// QUÉ SENSORES DEL TELÉFONO DEBEN ESTAR VIVOS DURANTE UN TRAMO DE CORRER.
//
// Extraído de `ActiveWorkoutView.updateRunGPS()` (card 101, ago-2026) para que el
// guion se pueda testear sin montar la vista entera. Es una decisión PURA — nada
// de `CMPedometer` ni `CLLocationManager` aquí, sólo qué debería estar encendido.
//
// LA LÍNEA QUE SE CRUZABA: el podómetro (los metros OFICIALES, ver
// `RunDistanceAuthority`) y el GPS propio de esta vista (velocidad + altímetro,
// NUNCA distancia) compartían una sola guarda — "¿posee la pantalla de calle la
// superficie ahora mismo?". Esa pregunta es la correcta para el GPS propio (dos
// `CLLocationManager` vivos a la vez duplicarían cada muestra de velocidad, porque
// `OutdoorRunHUDModel` arranca el suyo cuando manda), pero es la pregunta
// EQUIVOCADA para el podómetro: los metros de la carrera no pueden depender de qué
// vista está montada. Compartir la guarda apagaba el podómetro justo en el caso
// normal (un run recto en calle, sin relevo ni EMOM) — `pedometro.start()` era
// código inalcanzable.
enum RunPhoneSensorPlan {

    /// Qué debe estar encendido este instante. Cada campo es independiente.
    struct Decision: Equatable {
        /// `CMPedometer` — los metros oficiales de calle. Vive TODO el tramo,
        /// gane la pantalla que gane la superficie. Se aparta ante la muñeca:
        /// una sola fuente de metros, siempre.
        let pedometer: Bool
        /// El `RunLocationProvider` PROPIO de esta vista (velocidad + altímetro +
        /// permiso de fondo). Se aparta cuando la superficie de calle ya tiene el
        /// suyo propio vivo, para no duplicar la serie de velocidad.
        let ownGPS: Bool
        /// El barómetro (desnivel). Va con la calle, no con qué pantalla la pinta.
        let altimeter: Bool

        static let allOff = Decision(pedometer: false, ownGPS: false, altimeter: false)
    }

    /// - Parameters:
    ///   - isRunSegment: el tramo activo AHORA es de correr.
    ///   - environment: dónde corre el atleta (calle / cinta enchufada / cinta
    ///     tonta), o nil si todavía no ha contestado la puerta del bloque.
    ///   - streetScreenOwnsSurface: la pantalla de calle (`superficieViva ==
    ///     .correrFuera`) es la que está pintando ahora mismo — sólo ella arranca
    ///     su propio proveedor de localización.
    ///   - wristIsRecording: hay una sesión espejo viva en la muñeca
    ///     (`PhoneMirrorService.wristJoined`). El reloj mide con el MISMO motor de
    ///     Apple que el podómetro, pero sobre el cuerpo en vez de sobre el bolsillo,
    ///     así que sus metros mandan y el podómetro se aparta — si los dos entregan,
    ///     la sesión cuenta cada metro dos veces. Mismo reparto que ya tiene el
    ///     pulso: cuando la muñeca emite, el lector del teléfono calla.
    static func decide(
        isRunSegment: Bool,
        environment: RunEnvironment?,
        streetScreenOwnsSurface: Bool,
        wristIsRecording: Bool
    ) -> Decision {
        guard isRunSegment else { return .allOff }
        return Decision(
            pedometer: !wristIsRecording && environment?.usesPhonePedometer == true,
            ownGPS: !streetScreenOwnsSurface && environment?.usesPhoneGPS == true,
            altimeter: environment?.usesPhoneGPS == true
        )
    }
}
