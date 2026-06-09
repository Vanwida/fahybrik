import Foundation
import Observation
import CoreLocation
import HealthKit

// Live, optional, permission-guarded data sources for the active workout screen.
// Both are *fallbacks that improve the data when a dedicated device is absent*:
//   • RunLocationProvider  — phone GPS (CoreLocation) → covered distance/pace on
//     RUN segments when no erg owns the distance. Permission is requested lazily
//     and the provider stays dormant (and the workout fully functional) if the
//     athlete denies it — they fall back to manual distance entry.
//   • LiveHeartRateProvider — streams HR from HealthKit (Apple Watch writing into
//     the shared store) so the live HUD + zone math work without a PM5 strap.
//
// Neither blocks starting a workout. ActiveWorkoutView owns their lifecycle and
// forwards their callbacks into WorkoutSession (the single owner of capture
// state), so these classes hold no workout logic — only the system plumbing.

// MARK: - Run GPS (CoreLocation)

@Observable
final class RunLocationProvider: NSObject, CLLocationManagerDelegate {
    /// Coarse availability for the connection strip. `.unknown` until the first
    /// authorization callback; `.active` only once we're receiving fixes.
    enum Status { case unknown, denied, authorized, active }
    var status: Status = .unknown

    /// Called on the main actor with the incremental meters covered since the
    /// previous fix. The session sums these into the current run segment.
    var onDistanceDelta: ((Double) -> Void)?

    private let manager = CLLocationManager()
    private var lastLocation: CLLocation?
    private var isRunning = false

    /// Horizontal-accuracy gate (meters). Fixes worse than this are dropped so a
    /// poor GPS lock can't inject phantom distance. 25 m ≈ a usable urban fix.
    private static let accuracyGateMeters: CLLocationAccuracy = 25
    /// Minimum plausible step between fixes (meters). Below this is GPS jitter at
    /// standstill; above ~40 m/s (≈144 km/h) is a spurious jump — both ignored.
    private static let minStepMeters: CLLocationDistance = 2
    private static let maxStepMeters: CLLocationDistance = 60

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.activityType = .fitness
        manager.distanceFilter = Self.minStepMeters
    }

    /// Begins requesting location for a run. Safe to call repeatedly. If the
    /// athlete hasn't decided yet, this triggers the system permission prompt;
    /// if denied, status flips to `.denied` and nothing else happens.
    func start() {
        guard CLLocationManager.locationServicesEnabled() else { status = .denied; return }
        isRunning = true
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            status = .authorized
            lastLocation = nil
            manager.startUpdatingLocation()
        case .denied, .restricted:
            status = .denied
        @unknown default:
            status = .unknown
        }
    }

    func stop() {
        isRunning = false
        manager.stopUpdatingLocation()
        lastLocation = nil
    }

    // MARK: CLLocationManagerDelegate
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            status = .authorized
            if isRunning { lastLocation = nil; manager.startUpdatingLocation() }
        case .denied, .restricted:
            status = .denied
        case .notDetermined:
            status = .unknown
        @unknown default:
            status = .unknown
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard isRunning else { return }
        for loc in locations {
            guard loc.horizontalAccuracy >= 0,
                  loc.horizontalAccuracy <= Self.accuracyGateMeters else { continue }
            status = .active
            if let prev = lastLocation {
                let d = loc.distance(from: prev)
                if d >= Self.minStepMeters && d <= Self.maxStepMeters {
                    onDistanceDelta?(d)
                }
            }
            lastLocation = loc
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Transient failures (no fix yet) are normal; we just keep waiting. A
        // hard denial surfaces through the authorization callback instead.
    }
}

// MARK: - Live HR (HealthKit)

@Observable
final class LiveHeartRateProvider {
    /// Latest sampled bpm, or nil if we have no wearable HR yet. Drives whether
    /// the connection strip shows a HealthKit HR source.
    var latestBpm: Int? = nil

    /// Called on the main actor with each new bpm so the session can record it.
    var onSample: ((Int) -> Void)?

    private let store = HKHealthStore()
    private var query: HKAnchoredObjectQuery?
    private var anchor: HKQueryAnchor?
    private let hrType = HKObjectType.quantityType(forIdentifier: .heartRate)
    private let bpmUnit = HKUnit.count().unitDivided(by: .minute())

    /// Starts an anchored HR query bounded to the workout window. HealthKit never
    /// reveals READ authorization, so this is best-effort: if no wearable is
    /// writing HR, no samples arrive and the HUD simply shows "—" (no fabrication).
    func start(from startDate: Date) {
        guard HKHealthStore.isHealthDataAvailable(), let hrType else { return }
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: nil, options: .strictStartDate)
        let q = HKAnchoredObjectQuery(
            type: hrType,
            predicate: predicate,
            anchor: anchor,
            limit: HKObjectQueryNoLimit
        ) { [weak self] _, samples, _, newAnchor, _ in
            self?.handle(samples: samples, anchor: newAnchor)
        }
        q.updateHandler = { [weak self] _, samples, _, newAnchor, _ in
            self?.handle(samples: samples, anchor: newAnchor)
        }
        query = q
        store.execute(q)
    }

    func stop() {
        if let query { store.stop(query) }
        query = nil
    }

    private func handle(samples: [HKSample]?, anchor newAnchor: HKQueryAnchor?) {
        self.anchor = newAnchor
        guard let last = (samples as? [HKQuantitySample])?
            .sorted(by: { $0.endDate < $1.endDate })
            .last else { return }
        let bpm = Int(last.quantity.doubleValue(for: bpmUnit).rounded())
        guard bpm > 0 else { return }
        Task { @MainActor in
            self.latestBpm = bpm
            self.onSample?(bpm)
        }
    }
}
