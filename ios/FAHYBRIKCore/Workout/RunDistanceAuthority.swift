import Foundation

// UNA DISTANCIA. Cifra y mapa beben el mismo stream.
//
//   · Calle            → CoreLocation del teléfono. El mismo fix que pinta
//     el mapa suma los metros. Un `.healthkit` o un podómetro aquí es un
//     sustituto: se tira.
//   · Cinta enchufada  → FTMS. Ya #47.
//   · Cinta tonta      → HealthKit indoor de la muñeca. No hay mapa.
//   · Reloj solo       → HealthKit. No hay mapa en la muñeca.
//
// El sitio lo dice el atleta. No se adivina. No se reconstruye por zancada.

enum RunDistanceAuthority {

    /// Quién firma los metros de este instante.
    enum Owner: Equatable {
        case treadmill
        case gps
        case apple
        case none
    }

    /// El sitio manda. En la calle el GPS del teléfono es el stream; la cinta
    /// viva sólo gana si el atleta no está en calle.
    static func owner(environment: RunEnvironment? = nil, beltOwns: Bool) -> Owner {
        if environment == .outdoor { return .gps }
        if beltOwns, environment != .outdoor { return .treadmill }
        switch environment {
        case .treadmill:
            return .none
        case .outdoor, .indoor, .none:
            return .apple
        }
    }

    /// ¿Puede este delta convertirse en metros oficiales?
    ///
    /// Calle: sólo `.gps` (el mismo CoreLocation que el mapa). Indoor / reloj
    /// solo: `.healthkit`. La cinta entra por `sampleTreadmillDistance`.
    static func acceptsRunSample(
        source: TraceSource,
        environment: RunEnvironment? = nil,
        beltOwns: Bool
    ) -> Bool {
        switch owner(environment: environment, beltOwns: beltOwns) {
        case .gps: return source == .gps
        case .apple: return source == .healthkit
        case .treadmill, .none: return false
        }
    }

    /// ¿Puede la cinta FTMS firmar esta ventana? En la calle, no.
    static func acceptsTreadmill(environment: RunEnvironment?) -> Bool {
        environment != .outdoor
    }
}
