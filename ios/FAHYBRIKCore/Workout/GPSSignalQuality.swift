import Foundation

/// How good the GPS lock is right now — drives the honest quality badge
/// ("GPS fuerte" / "GPS débil" / "Buscando GPS") and the Watch outdoor note
/// (`sin señal · buscando`). Pure classifier over CoreLocation's horizontal
/// accuracy so the badge never over-promises.
///
/// Lives in Core so the Watch and the iPhone share one threshold. The Watch
/// uses it as a lock, not as a meter counter — `CLLocation` never owns
/// `liveRunDistanceMeters` (`RunDistanceAuthority` is `.healthkit` only).
enum GPSSignalQuality: Equatable {
    case searching   // no fix yet, or accuracy too coarse to trust
    case weak        // a usable but loose fix
    case strong      // a tight fix

    /// At/under this horizontal accuracy (m) the lock is strong.
    static let strongThresholdM: Double = 15
    /// At/under this (m) it is weak; above it (or invalid) we're still searching.
    ///
    /// Por encima de esto un fix no se mira: ni pinta recorrido ni da una velocidad de
    /// fiar, así que anunciarlo como «débil» —va flojo pero va— sería prometer algo que
    /// no se está usando. Bajó de 40 a 25 el 12-ago por eso.
    static let weakThresholdM: Double = 25

    /// Si un fix con esta precisión merece mirarse (negativa = inválida). Lo consulta
    /// `RunLocationProvider` para no tener dos números que puedan divergir.
    static func isFixUsable(horizontalAccuracyM: Double) -> Bool {
        horizontalAccuracyM >= 0 && horizontalAccuracyM <= weakThresholdM
    }

    /// Classify from CoreLocation's horizontal accuracy (m; negative = invalid).
    static func from(horizontalAccuracyM: Double) -> GPSSignalQuality {
        guard horizontalAccuracyM >= 0 else { return .searching }
        if horizontalAccuracyM <= strongThresholdM { return .strong }
        if horizontalAccuracyM <= weakThresholdM { return .weak }
        return .searching
    }

    var label: String {
        switch self {
        case .strong:    return "GPS fuerte"
        case .weak:      return "GPS débil"
        case .searching: return "Buscando GPS"
        }
    }
}
