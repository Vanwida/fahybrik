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

    /// Called on every ACCURACY-GATED fix with CoreLocation's instantaneous speed
    /// (m/s) and its speed-accuracy (m/s; negative = invalid) — the source the
    /// outdoor HUD smooths into a live pace and the auto-pause reads (#64). Fired
    /// per fix, INDEPENDENT of the distance min-step gate: a stopped athlete produces
    /// sub-step fixes with a valid speed≈0, which auto-pause needs.
    var onSpeed: ((_ speedMps: Double, _ speedAccuracyMps: Double) -> Void)?

    /// Called with the coordinate of each fix that also produced real movement (the
    /// same fixes that feed `onDistanceDelta`), plus the first fix — so the live
    /// route trace (#64) is well-spaced and free of standstill jitter.
    var onCoordinate: ((CLLocationCoordinate2D) -> Void)?

    /// Latest fix's horizontal accuracy (m; negative = none yet) — the outdoor HUD
    /// classifies it into the honest "GPS fuerte / débil / buscando" badge.
    private(set) var latestHorizontalAccuracyM: Double = -1

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
        // We run our OWN auto-pause; iOS auto-pausing the location stream when it
        // thinks we've stopped would kill the fixes that detect movement RESUMING.
        manager.pausesLocationUpdatesAutomatically = false
    }

    /// Keep receiving fixes with the screen locked / phone pocketed DURING an active
    /// outdoor run only — enabled at run start, disabled at end/cancel (battery). The
    /// caller must pair this with the `location` UIBackgroundMode; setting it true
    /// without that mode throws, so it's opt-in per outdoor session.
    func setBackgroundUpdates(_ enabled: Bool) {
        manager.allowsBackgroundLocationUpdates = enabled
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
            latestHorizontalAccuracyM = loc.horizontalAccuracy
            guard loc.horizontalAccuracy >= 0,
                  loc.horizontalAccuracy <= Self.accuracyGateMeters else { continue }
            status = .active
            // Speed fires for EVERY good fix (auto-pause needs the standstill reading
            // that the min-step distance gate below would swallow).
            onSpeed?(loc.speed, loc.speedAccuracy)
            if let prev = lastLocation {
                let d = loc.distance(from: prev)
                if d >= Self.minStepMeters && d <= Self.maxStepMeters {
                    onDistanceDelta?(d)
                    onCoordinate?(loc.coordinate)   // trace point on real movement
                }
            } else {
                onCoordinate?(loc.coordinate)       // seed the trace at the first fix
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

    /// How old a HealthKit sample may be and still count as a LIVE reading.
    ///
    /// This is the difference between two completely different things that arrive
    /// through the same query. A watch RECORDING a workout writes HR every few
    /// seconds. A watch that is merely on the wrist writes a passive background
    /// reading every few minutes, taken at rest — and this query cannot tell them
    /// apart by type. On 28-jul Alex skied 400 m at 165 W with the watch app never
    /// joining: the passive readings came through as live HR and the session was
    /// recorded as avg 70 / max 80 bpm, 121 seconds in zone 1. A resting pulse
    /// presented as effort is worse than no pulse at all, because the coach's zone
    /// analytics then treat a hard piece as easy.
    ///
    /// 45 s is far beyond any real live cadence and far below the passive one.
    private static let liveSampleMaxAgeSeconds: TimeInterval = 45

    /// Starts an anchored HR query bounded to the workout window. HealthKit never
    /// reveals READ authorization, so this is best-effort: if no wearable is
    /// writing HR, no samples arrive y el HUD dice «sin reloj» en vez de una cifra
    /// (nunca se fabrica un pulso).
    func start(from startDate: Date) {
        // AUDIT-6 — idempotent: a second start (e.g. the wrist dropping mid-run) must
        // tear down the previous anchored query first, never leak a second one.
        stop()
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
        // Only a FRESH sample is a live reading — see `liveSampleMaxAgeSeconds`.
        // A stale one is the watch's passive background sampling and describes rest,
        // not the piece being rowed; forwarding it would fabricate training data.
        guard Date().timeIntervalSince(last.endDate) <= Self.liveSampleMaxAgeSeconds else { return }
        let bpm = Int(last.quantity.doubleValue(for: bpmUnit).rounded())
        guard bpm > 0 else { return }
        Task { @MainActor in
            self.latestBpm = bpm
            self.onSample?(bpm)
        }
    }
}
