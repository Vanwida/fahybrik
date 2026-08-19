import Foundation

// UNA FUENTE PARA LOS METROS DE CARRERA.
//
// LEY (card 86ak2vv1m):
//   · Cinta FTMS conectada → FTMS. Ya #47.
//   · Calle → HKWorkout outdoor / HealthKit. Apple cuenta.
//   · Indoor / cinta tonta (sin Bluetooth) → HKWorkout indoor del Apple Watch.
//   · Sin reloj y sin cinta → no hay cifra. No se inventa.
//
// PROHIBIDO reconstruir distancia: pasos × zancada, integrar velocidad, filtrar
// GPS crudo para “inventar km”. Ya pasó. Si Apple lo da, se lee. Si no, nil.
//
// Esta autoridad es pura a propósito: el motor y los tests contestan la misma
// pregunta, y un `sampleRunDistance(.gps)` vuelve a ser un no.

enum RunDistanceAuthority {

    /// Quién puede firmar los metros oficiales de este instante.
    enum Owner: Equatable {
        case treadmill
        case apple
        case none
    }

    /// FTMS, si ha reclamado la ventana, gana siempre. Si no, Apple. Nunca las dos.
    static func owner(beltOwns: Bool) -> Owner {
        beltOwns ? .treadmill : .apple
    }

    /// ¿Puede este delta convertirse en metros oficiales de carrera?
    ///
    /// Sólo `.healthkit` (HKWorkout / `distanceWalkingRunning` de Apple). Un
    /// `.gps` es el integrador nuestro — o el podómetro, que es pasos × zancada.
    /// Con la cinta reclamada, Apple también se queda fuera: una fuente.
    static func acceptsRunSample(source: TraceSource, beltOwns: Bool) -> Bool {
        guard !beltOwns else { return false }
        return source == .healthkit
    }
}
