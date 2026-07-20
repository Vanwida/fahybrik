import Foundation

// The seam the HUD reads. Concrete implementations own CoreBluetooth (FTMS
// treadmill, HR strap) or a deterministic mock; the HUD/model consume ONLY these
// protocols and never touch CoreBluetooth directly — so the whole screen runs in
// the simulator (which has no Bluetooth) against the mock. The callback shape
// mirrors the existing live providers (RunLocationProvider.onDistanceDelta,
// LiveHeartRateProvider.onSample) for consistency.

/// One decoded telemetry snapshot from an FTMS treadmill (Treadmill Data 0x2ACD).
/// Every field is optional: a given notification only carries the fields its
/// Flags bitfield advertises, so a partial packet never wipes a value already
/// held — the model merges snapshots additively.
struct TreadmillSample: Equatable {
    /// Instantaneous belt speed, km/h (the treadmill's native unit). Present in
    /// essentially every packet.
    var speedKmh: Double?
    /// Belt inclination, percent grade. Negative on decline-capable treadmills. nil on
    /// machines whose Inclination field is NOT a grade (see `inclineLevel`) — we leave it
    /// empty rather than publish a number that isn't a percentage.
    var inclinePct: Double?
    /// Belt inclination as a CONSOLE LEVEL (1…15), for families whose Inclination field
    /// carries internal units instead of grade — the BH / Exercycle i.Concept line. Only
    /// one of `inclinePct` / `inclineLevel` is ever populated, per machine family.
    var inclineLevel: Double?
    /// Machine-reported cumulative distance, meters. Not every treadmill sends it;
    /// the model integrates speed when it's absent.
    var totalDistanceM: Double?
    /// Machine-reported elapsed time, seconds (its own workout clock).
    var elapsedS: Int?
    /// Heart rate the treadmill itself relays (some belts forward a paired strap).
    var hrBpm: Int?
    /// When this snapshot was produced (CoreBluetooth callback time).
    var lastUpdate: Date = .distantPast

    /// Belt speed in meters per second, for distance integration.
    var speedMps: Double? { speedKmh.map { $0 / 3.6 } }
}

/// Coarse connection state surfaced to the HUD chips. One enum for both the
/// treadmill and the HR strap so the two chips read identically.
enum DeviceLink: Equatable {
    case idle                    // nothing started yet
    case scanning                // looking for a compatible device
    case connecting              // found one, opening the link
    case connected(name: String) // streaming
    case reconnecting            // dropped mid-session, trying to recover
    case unavailable             // Bluetooth off / unauthorized / nothing found
    case failed(String)          // hard error, human-readable

    var isLive: Bool { if case .connected = self { return true }; return false }

    /// The peripheral name when connected, else nil.
    var deviceName: String? { if case let .connected(name) = self { return name }; return nil }
}

/// Live treadmill telemetry for the HUD. The CONNECTION concern (scan → list → pick
/// → disconnect) is the shared `ConnectableSource`; this only adds the belt's data
/// callback. `diagnosticsText()` is declared on `ConnectableSource`.
protocol TreadmillDataSource: ConnectableSource {
    var onSample: ((TreadmillSample) -> Void)? { get set }
}

/// What THIS connected treadmill lets the app DRIVE — read from the machine itself at
/// connect time (Fitness Machine Feature + Supported Ranges + a writable Control
/// Point). We DETECT it, never assume it: a belt that only broadcasts data reports
/// `canControl == false`, and the UI says so instead of pretending to drive a machine
/// that will ignore it. Any FTMS treadmill is covered without per-brand code.
struct TreadmillControlCapability: Equatable {
    var hasControlPoint: Bool
    var canControlSpeed: Bool
    var canControlIncline: Bool
    var speed: FTMSControl.Range?     // km/h
    var incline: FTMSControl.Range?   // % — or console LEVELS when `profile.inclineIsLevel`
    /// The control dialect detected for THIS machine (and any mid-session escalation).
    /// The UI reads it to label incline honestly: a percentage where the field really is
    /// a grade, "Nivel N" where it isn't.
    var profile: FTMSControlProfile = .standard

    /// True only when the machine has a writable Control Point AND declares at least
    /// one settable target — the gate the UI uses to offer controls at all.
    var canControl: Bool { hasControlPoint && (canControlSpeed || canControlIncline) }

    /// Incline is expressed in console levels, not percent grade, on this machine.
    var inclineIsLevel: Bool { profile.inclineIsLevel }

    static let none = TreadmillControlCapability(hasControlPoint: false,
                                                 canControlSpeed: false,
                                                 canControlIncline: false,
                                                 speed: nil, incline: nil)
}

/// The CONTROL seam, adopted ONLY by sources that can drive the belt (the real FTMS
/// source + the simulator mock). The generic `TreadmillDataSource` stays read-only, so
/// every existing conformer (and every test fake) needs no change — the hub feature-
/// detects control with `as? TreadmillControllable`.
protocol TreadmillControllable: AnyObject {
    /// Fired once the machine's control capability is known (after connect + a feature
    /// read). `.none` for a belt that can't be driven.
    var onControlCapability: ((TreadmillControlCapability) -> Void)? { get set }
    /// Fired on every machine-reported state change (console, safety key, or our own
    /// command taking effect) — the bidirectional-sync seam.
    var onMachineEvent: ((TreadmillMachineEvent) -> Void)? { get set }
    /// Fired with the ack of a control command we sent.
    var onControlResult: ((TreadmillControlResult) -> Void)? { get set }
    /// Send a control command. The source owns the Request-Control handshake — callers
    /// just say what they want.
    func send(_ command: TreadmillControlCommand)
}

/// Live heart rate for the HUD (chest strap / watch / band over standard BLE). Adds
/// the bpm data callback on top of the shared connection seam, plus an OPTIONAL
/// strap-battery callback. Battery lives here (not on `ConnectableSource`) because it
/// is HR-specific — the FTMS treadmill / PM5 don't surface it. It only fires for
/// straps that expose the standard Battery Level characteristic (0x180F/0x2A19).
protocol HeartRateSource: ConnectableSource {
    var onBpm: ((Int) -> Void)? { get set }
    var onBattery: ((Int) -> Void)? { get set }
}
