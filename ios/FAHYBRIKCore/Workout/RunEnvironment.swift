import Foundation

// Dónde corre HOY — la UNA decisión del atleta antes de empezar un tramo de
// carrera. Tres sitios, tres fuentes. No se adivina.
//
//   · Calle            → CoreLocation del teléfono. Cifra y mapa = un stream.
//   · Cinta enchufada  → FTMS.
//   · Cinta tonta      → HealthKit indoor del reloj. Sin mapa.
//
// Se elige en `RunPreStartFlow` (brief prescrito y constructor libre), viaja
// en la sesión y abre el HUD correcto. Ephemeral — no se persiste.
enum RunEnvironment: String, Equatable, CaseIterable {
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

    /// Lo que HealthKit / watchOS necesita para no prohibir el GPS en la calle
    /// ni encenderlo en una cinta.
    var isIndoorForHealthKit: Bool { self != .outdoor }

    /// Superficie de la lectura / marca: las dos cintas son cinta.
    var isTreadmillSurface: Bool { self != .outdoor }
}
