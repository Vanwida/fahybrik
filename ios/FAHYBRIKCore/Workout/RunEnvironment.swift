import Foundation

// Dónde corre HOY — la UNA decisión del atleta antes de empezar un tramo de
// carrera (card 86ak2vv1m). Tres sitios, tres fuentes. No se adivina.
//
//   · Calle            → HKWorkout outdoor. Apple cuenta.
//   · Cinta enchufada  → FTMS. Ya #47.
//   · Cinta tonta      → HKWorkout indoor del reloj. Apple cuenta.
//
// Se elige en `RunPreStartFlow` (brief prescrito y constructor libre), viaja
// en la sesión y en el snapshot (`PersistedWorkoutState.runEnvironment`) para
// reabrir el HUD correcto. `String` + `Codable`: Apple sintetiza encode/decode
// con el raw value; sin esto el snapshot no es `Decodable`.
enum RunEnvironment: String, Codable, Equatable, CaseIterable {
    case outdoor     // Calle
    case treadmill   // Cinta con conexión (FTMS)
    case indoor      // Cinta sin conexión (tonta)

    /// ¿Arranca ya, o hay que pasar por conectar la cinta?
    var startsImmediately: Bool { self != .treadmill }

    /// ¿La distancia oficial la firma la cinta FTMS?
    var usesFTMS: Bool { self == .treadmill }

    /// GPS / mapa / barómetro del teléfono: sólo en la calle. En cinta el GPS
    /// indoor lee ruido como ritmo fantasma.
    var usesPhoneGPS: Bool { self == .outdoor }

    /// El podómetro del teléfono (motor de Apple) sólo en la calle. En cinta
    /// tonta cuenta el HKWorkout indoor del reloj; sin reloj no hay cifra.
    var usesPhonePedometer: Bool { self == .outdoor }

    /// Lo que HealthKit / watchOS necesita para no prohibir el GPS en la calle
    /// ni encenderlo en una cinta.
    var isIndoorForHealthKit: Bool { self != .outdoor }

    /// Superficie de la lectura / marca: las dos cintas son cinta.
    var isTreadmillSurface: Bool { self != .outdoor }
}

/// Calle o cinta — la decisión de cromo, no un segundo presentador.
/// Indoor (cinta tonta) reutiliza el HUD de cinta, ya sin guía de conectar.
enum RunCoverAutoOpen: Equatable {
    case treadmill(empiezaSinCinta: Bool)
    case outdoor

    static func decide(environment: RunEnvironment) -> RunCoverAutoOpen {
        switch environment {
        case .treadmill: return .treadmill(empiezaSinCinta: false)
        case .indoor:    return .treadmill(empiezaSinCinta: true)
        case .outdoor:   return .outdoor
        }
    }
}
