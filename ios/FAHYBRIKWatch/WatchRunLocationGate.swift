import CoreLocation

/// GPS permission + accuracy for the Watch. Does not count meters.
///
/// Apple emits `distanceWalkingRunning` only after location is authorized on
/// an outdoor running activity. Fixes are classified with `GPSSignalQuality`;
/// they never enter `RunDistanceAuthority`.
@MainActor
final class WatchRunLocationGate: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var wantsGPS = false
    private(set) var horizontalAccuracyM: Double?

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
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        _ = error
    }
}
