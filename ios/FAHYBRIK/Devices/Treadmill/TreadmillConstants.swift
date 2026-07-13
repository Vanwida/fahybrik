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

    /// The standard textbook estimate of maximum heart rate. Only ever applied
    /// when the athlete's age is known, and the resulting zone is ALWAYS labeled
    /// "estimada" — there is no measured HR threshold anywhere in the product.
    static let hrMaxAgeConstant: Int = 220

    /// A device is considered stale (its chip flips to "reconnecting") if no
    /// notification arrives for this long — covers a silent drop the OS hasn't
    /// reported yet.
    static let sampleStaleSeconds: TimeInterval = 4

    /// Deterministic mock cadence (simulator/DEBUG only): how often the fake
    /// treadmill/HR sources emit a sample. Matches a typical ~1 Hz FTMS stream.
    static let mockTickSeconds: TimeInterval = 1.0
}
