import Foundation

// UNA FUENTE PARA LOS METROS DE CARRERA.
//
// LEY (card 86ak2vv1m):
//   · Calle            → HKWorkout outdoor / HealthKit. Apple cuenta.
//   · Cinta enchufada  → FTMS. Ya #47.
//   · Cinta tonta      → HKWorkout indoor del Apple Watch. Apple cuenta.
//   · Sin reloj y sin cinta → no hay cifra. No se inventa.
//
// El sitio lo dice el atleta en el picker. No se adivina. PROHIBIDO reconstruir
// distancia: pasos × zancada, integrar velocidad, filtrar GPS crudo. Si Apple
// o la cinta lo dan, se lee. Si no, nil.
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

    /// Una fuente. El sitio elegido manda; la cinta viva sólo gana si el
    /// atleta dijo enchufada (o todavía no contestó y ella ha reclamado).
    static func owner(environment: RunEnvironment? = nil, beltOwns: Bool) -> Owner {
        if environment?.usesPhoneGPS == true { return .apple }
        if beltOwns, environment != .outdoor { return .treadmill }
        switch environment {
        case .treadmill:
            return .none
        case .outdoor, .indoor, .none:
            return .apple
        }
    }

    /// ¿Puede este delta convertirse en metros oficiales de carrera?
    ///
    /// Sólo `.healthkit` (HKWorkout outdoor / indoor, `distanceWalkingRunning`
    /// de Apple). Un `.gps` es el integrador nuestro — o el podómetro colado
    /// como salto entre fixes. Con la cinta reclamada, Apple también se queda
    /// fuera: una fuente. En cinta enchufada sin reclamar no hay cifra.
    static func acceptsRunSample(
        source: TraceSource,
        environment: RunEnvironment? = nil,
        beltOwns: Bool
    ) -> Bool {
        guard owner(environment: environment, beltOwns: beltOwns) == .apple else { return false }
        return source == .healthkit
    }

    /// ¿Puede la cinta FTMS firmar esta ventana? En la calle, no. En cinta
    /// tonta sí, si el atleta la enchufa de verdad a mitad: eso ya no es adivinar.
    static func acceptsTreadmill(environment: RunEnvironment?) -> Bool {
        environment != .outdoor
    }
}
