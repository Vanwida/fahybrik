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
    /// The link DROPPED and we are NOT recovering it. Nothing in this app ever
    /// reconnects on its own: gym equipment rotates constantly, so "the machine you
    /// were on" is very likely someone else's right now — and we can DRIVE belts.
    /// The surface says so honestly and offers a button back into the scan list.
    case lost
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
    var incline: FTMSControl.Range?   // % — or console LEVELS when `inclineIsLevel`
    /// The machine FAMILY detected from its advertised name. It seeds where the dialect
    /// ladders start; it no longer decides units or prelude on its own.
    var profile: FTMSControlProfile = .standard
    /// The prelude rung currently on the wire (S1…S5) — shown in the field-diagnosis
    /// screen and in the shared trace.
    var strategy: FTMSControlStrategy = .s2
    /// How the machine's Inclination field is being interpreted right now. Resolved by
    /// watching what the belt reports back, not by assuming a family.
    var inclineDialect: FTMSInclineDialect = .grade
    /// The machine ADVERTISES that it accepts a programmed distance / training time
    /// (0x2ACC Target Setting Features bits 8 / 9). Unlike speed and incline, these ops
    /// are genuinely conditional in the spec (C.9 / C.10), so here the bits ARE the gate.
    var canSetTargetDistance = false
    var canSetTargetTime = false
    /// The raw Target Setting Features word, purely for the diagnostics dump — we no
    /// longer let it decide whether the athlete gets controls.
    var targetFeatureBits: UInt32?

    /// TRUE FOR ANY MACHINE WITH A WRITABLE CONTROL POINT.
    ///
    /// This deliberately does NOT consult the Fitness Machine Feature bits any more. Those
    /// bits were the gate here, and on his TM2000 they are the reason the app "solo recoge
    /// la info": a firmware that reports a zeroed (or truncated) Target Setting Features
    /// word switched every control off before a single byte was ever written. qdomyos-zwift
    /// never reads them; neither do we. A belt is read-only only when it has no writable
    /// Control Point at all — a fact, not a claim.
    var canControl: Bool { hasControlPoint }

    /// Incline is expressed in console levels, not percent grade, on this machine.
    var inclineIsLevel: Bool { inclineDialect == .level }

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
    /// Best-effort: program the PIECE on the machine's own display (targeted distance /
    /// training time). A refusal is swallowed — it never blocks or errors the workout.
    func sendBestEffort(_ command: TreadmillControlCommand)
    /// FIELD DIAGNOSIS: pin the prelude rung by hand (`nil` = back to the automatic
    /// ladder), so a dialect can be found in a gym in seconds without a new build.
    func forceStrategy(_ strategy: FTMSControlStrategy?)
    /// FIELD DIAGNOSIS: pin how the Inclination field is interpreted (`nil` = automatic).
    func forceInclineDialect(_ dialect: FTMSInclineDialect?)
}

/// Defaults so a read-only fake / test double doesn't have to care about the control
/// plane. Only the real FTMS source overrides these.
extension TreadmillControllable {
    func sendBestEffort(_ command: TreadmillControlCommand) { send(command) }
    func forceStrategy(_ strategy: FTMSControlStrategy?) {}
    func forceInclineDialect(_ dialect: FTMSInclineDialect?) {}
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
