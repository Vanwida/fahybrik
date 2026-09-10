import Foundation

/// Display-only GPS lock badge — never gates distance, speed, or route capture.
/// Meters come from HealthKit (`RunDistanceAuthority`); map coords from CLLocation.
enum GPSSignalQuality: Equatable {
    case searching
    case weak
    case strong

    static let strongThresholdM: Double = 15
    static let weakThresholdM: Double = 25

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
