import CoreBluetooth

// GATT identifiers + tuning constants for the "Correr en cinta" live HUD (#60).
// The treadmill speaks the standard Bluetooth Fitness Machine profile (FTMS);
// heart rate comes from any standard Heart Rate Service broadcaster (chest
// strap, Garmin/Polar/watch relay). All UUIDs are the SIG-assigned 16-bit forms.
enum TreadmillGATT {
    // Fitness Machine Service + its Treadmill Data characteristic (notify).
    static let fitnessMachineService = CBUUID(string: "1826")
    static let treadmillData         = CBUUID(string: "2ACD")
    // Optional, discovered for diagnostics only (identifies the machine/vendor).
    static let fitnessMachineFeature = CBUUID(string: "2ACC")

    // Heart Rate Service + Heart Rate Measurement characteristic (notify).
    static let heartRateService     = CBUUID(string: "180D")
    static let heartRateMeasurement = CBUUID(string: "2A37")

    // Battery Service + Battery Level characteristic (read, often also notify). Read
    // on connect to surface the strap's charge in the picker — the Zwift/Wahoo
    // standard, so an athlete isn't caught out by a strap dying mid-session. A single
    // uint8 percent (0–100).
    static let batteryService       = CBUUID(string: "180F")
    static let batteryLevel         = CBUUID(string: "2A19")
}

// Bridge CoreBluetooth's radio state onto the pure, testable `BluetoothAvailability`
// so `DeviceConnection.swift` stays free of CoreBluetooth (and unit-testable).
extension BluetoothAvailability {
    init(_ state: CBManagerState) {
        switch state {
        case .poweredOn:    self = .poweredOn
        case .poweredOff:   self = .poweredOff
        case .unauthorized: self = .unauthorized
        case .unsupported:  self = .unsupported
        default:            self = .unknown
        }
    }
}

enum TreadmillConstants {
    /// Below this belt speed the treadmill is effectively stopped: pace is
    /// undefined (a divide-by-zero) and must render as "—", never a huge number.
    static let minMovingSpeedKmh: Double = 0.5

    // The single-pace judging tolerance moved to `PaceTarget.singleToleranceSecPerKm`
    // (FAHYBRIK/Plan/RunPaceModel.swift) when the pace domain was shared with the
    // watch (#68) — the judging that reads it now lives in both targets.

    // The 220−age max-HR constant moved to `PersonalHRMax.ageMaxConstant`
    // (Theme/ZoneColors.swift) when HR-max resolution became a single shared source.

    /// A device is considered stale (its chip flips to "reconnecting") if no
    /// notification arrives for this long — covers a silent drop the OS hasn't
    /// reported yet.
    static let sampleStaleSeconds: TimeInterval = 4

    /// The machine odometer (FTMS Total Distance) is trusted while it advances. If the
    /// belt is clearly moving (speed > `minMovingSpeedKmh`) yet the odometer stays flat
    /// for this many consecutive samples, we stop trusting it and integrate speed×time
    /// instead — some budget FTMS firmwares (OEM treadmills) report a broken/frozen/
    /// coarse Total Distance that would otherwise FREEZE covered meters at zero even
    /// though speed reads fine (the "los metros no suman" bug). ~3 s at a 1 Hz stream.
    static let odometerStallGraceSamples = 3

    /// Minimum odometer increase (meters) that counts as "advancing". FTMS Total
    /// Distance has 1 m resolution, so any real step is ≥ 1 m; a sub-meter epsilon
    /// absorbs float noise without masking a genuinely frozen odometer.
    static let odometerAdvanceEpsilonM: Double = 0.5

    /// Deterministic mock cadence (simulator/DEBUG only): how often the fake
    /// treadmill/HR sources emit a sample. Matches a typical ~1 Hz FTMS stream.
    static let mockTickSeconds: TimeInterval = 1.0
}
