import CoreLocation

/// GPS permission + accuracy for the Watch. Does not count meters.
///
/// Apple emits `distanceWalkingRunning` only after location is authorized on
/// an outdoor running activity. Coordinates enable HK distance; never meter SoT.
@MainActor
final class WatchRunLocationGate: NSObject, @preconcurrency CLLocationManagerDelegate {
    /// Created on MainActor; CoreLocation delivers delegate callbacks on that thread.
    nonisolated(unsafe) private let manager = CLLocationManager()
    private var wantsGPS = false
    private(set) var horizontalAccuracyM: Double?
    /// Quien quiere los puntos (la ruta de Salud): recibe cada lote tal como lo da CoreLocation.
    var onLocations: (([CLLocation]) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.activityType = .fitness
    }

    func apply(wantsGPS: Bool) {
        self.wantsGPS = wantsGPS
        guard wantsGPS else {
            manager.stopUpdatingLocation()
            horizontalAccuracyM = nil
            return
        }
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
        default:
            break
        }
    }

    func stop() {
        wantsGPS = false
        manager.stopUpdatingLocation()
        horizontalAccuracyM = nil
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        apply(wantsGPS: wantsGPS)
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        horizontalAccuracyM = locations.last?.horizontalAccuracy
        onLocations?(locations)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        _ = error
    }
}
