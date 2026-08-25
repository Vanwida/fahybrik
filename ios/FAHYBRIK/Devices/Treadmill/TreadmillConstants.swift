import CoreBluetooth

// GATT identifiers + tuning constants for the "Correr en cinta" live HUD (#60).
// The treadmill speaks the standard Bluetooth Fitness Machine profile (FTMS);
// heart rate comes from any standard Heart Rate Service broadcaster (chest
// strap, Garmin/Polar/watch relay). All UUIDs are the SIG-assigned 16-bit forms.
enum TreadmillGATT {
    // Fitness Machine Service + its Treadmill Data characteristic (notify).
    static let fitnessMachineService = CBUUID(string: "1826")
    static let treadmillData         = CBUUID(string: "2ACD")
    // Fitness Machine Feature (read): its Target Setting Features word tells us whether
    // the belt lets the app set speed / inclination targets at all.
    static let fitnessMachineFeature = CBUUID(string: "2ACC")

    // --- Machine CONTROL (drive the belt from the app + stay in sync) ---
    /// Fitness Machine Control Point (write + indicate): where we write start/stop and
    /// target speed/incline, and read back each command's ack. Its mere presence (and
    /// being writable) is what makes a belt controllable.
    static let controlPoint          = CBUUID(string: "2AD9")
    /// Machine Status (notify): the belt reports its OWN state changes here (started/
    /// stopped/paused by the athlete on the console, safety-key stop, target changed) —
    /// the seam that keeps the app mirrored to the machine.
    static let machineStatus         = CBUUID(string: "2ADA")
    /// Supported Speed Range (read): min / max / step, so the UI clamps to what the belt
    /// actually accepts.
    static let supportedSpeedRange   = CBUUID(string: "2AD4")
    /// Supported Inclination Range (read): min / max / step for incline.
    static let supportedInclineRange = CBUUID(string: "2AD5")

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
    /// undefined (a divide-by-zero), so it comes back nil and the surface says the
    /// belt is stopped — never a huge number, y nunca un guion (§7 del CONTRATO-UI).
    static var minMovingSpeedKmh: Double { BeltWorkClock.minMovingKmh }

    // The single-pace judging tolerance moved to `PaceTarget.singleToleranceSecPerKm`
    // (FAHYBRIKCore/Plan/RunPaceModel.swift) when the pace domain was shared with the
    // watch (#68) — the judging that reads it now lives in both targets.

    // There is no max-HR estimation on this side. HR zones are resolved by the
    // server from the athlete's threshold and arrive as absolute bands
    // (`HRZoneProfile`, Theme/ZoneColors.swift).

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

    /// How often the raw Treadmill Data (0x2ACD) packet is echoed to the `[CINTA]` console
    /// trace — often enough to see the parse (instantaneous speed vs the odometer) live at
    /// the gym, rare enough not to flood a ~1 Hz stream into an unreadable wall.
    static let rawDataLogIntervalSeconds: TimeInterval = 2.0
}
