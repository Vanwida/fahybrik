import Foundation

// QUÉ SENSORES DEL TELÉFONO DEBEN ESTAR VIVOS DURANTE UN TRAMO DE CORRER.
//
// Extraído de `ActiveWorkoutView.updateRunGPS()` para que el guion se pueda
// testear sin montar la vista entera. Es una decisión PURA — nada de
// `CLLocationManager` aquí, sólo qué debería estar encendido.
//
// UNA DISTANCIA: cifra y mapa beben el mismo CoreLocation. El podómetro
// como fuente oficial era el sustituto que partía el stream. Ya no está.
enum RunPhoneSensorPlan {

    /// Qué debe estar encendido este instante. Cada campo es independiente.
    struct Decision: Equatable {
        /// El `RunLocationProvider` PROPIO de esta vista (velocidad + metros +
        /// permiso de fondo). Se aparta cuando la superficie de calle ya tiene
        /// el suyo propio vivo: un solo `CLLocationManager`, un stream.
        let ownGPS: Bool
        /// El barómetro (desnivel). Va con la calle, no con qué pantalla la pinta.
        let altimeter: Bool

        static let allOff = Decision(ownGPS: false, altimeter: false)
    }

    /// - Parameters:
    ///   - isRunSegment: el tramo activo AHORA es de correr.
    ///   - environment: dónde corre el atleta, o nil si todavía no ha contestado.
    ///   - streetScreenOwnsSurface: la pantalla de calle es la que está pintando
    ///     — sólo ella arranca su propio proveedor de localización.
    static func decide(
        isRunSegment: Bool,
        environment: RunEnvironment?,
        streetScreenOwnsSurface: Bool
    ) -> Decision {
        guard isRunSegment else { return .allOff }
        return Decision(
            ownGPS: !streetScreenOwnsSurface && environment?.usesPhoneGPS == true,
            altimeter: environment?.usesPhoneGPS == true
        )
    }
}
