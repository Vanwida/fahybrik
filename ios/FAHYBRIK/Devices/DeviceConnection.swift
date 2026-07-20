import Foundation
import Observation

// The connection concern for the two generic BLE fitness devices — the FTMS
// treadmill and the standard BLE heart-rate strap — lifted OUT of the CoreBluetooth
// sources so it can be modeled and unit-tested with zero Bluetooth. It is the
// Concept2-PM5 pattern (scan → list the found devices by NAME → the athlete picks →
// remember it) generalized to cinta + banda.
//
// WHY THIS EXISTS (the gym failure it fixes): the old sources auto-connected to the
// FIRST advertiser they saw. In a gym with several treadmills / other people's HR
// straps that means grabbing a STRANGER'S machine — the athlete "mareó a la gente
// que entrenaba en otra cinta" and the HR chip latched onto someone else's Polar.
// The rule here is blunt: NEVER auto-connect to an unknown device. Auto-connect
// happens for exactly ONE case — the single device found is the one you used last.
// Everything else surfaces a list and the athlete chooses.

/// A CoreBluetooth peripheral identity — the stable per-install UUID the OS assigns
/// a peripheral. Used to remember a chosen device and to reconnect to that EXACT
/// machine amid others, never "the first one found".
typealias DeviceID = UUID

/// One device the scan turned up: its advertised name (or a short id fallback) and
/// signal strength, so the athlete recognises their own machine by name + proximity.
struct DeviceCandidate: Identifiable, Equatable {
    let id: DeviceID
    let name: String
    let rssi: Int
}

/// System Bluetooth availability, surfaced to the picker so it can guide the athlete
/// ("enciende el Bluetooth", "desbloquéalo en Ajustes") instead of spinning forever.
enum BluetoothAvailability: Equatable {
    case unknown        // radio still booting
    case poweredOn      // ready to scan
    case poweredOff     // BT switched off
    case unauthorized   // the app was denied BT — needs Settings
    case unsupported    // no BLE on this device
}

/// The connection seam every generic BLE source implements. The DATA seam
/// (`onSample` for the belt, `onBpm` for the strap) is added by the refining
/// protocols. The channel drives ONLY these members and never touches CoreBluetooth.
protocol ConnectableSource: AnyObject {
    var onLink: ((DeviceLink) -> Void)? { get set }
    /// The running set of devices this scan has found (deduped, may grow tick by
    /// tick). The channel decides what to do with it.
    var onDiscovered: (([DeviceCandidate]) -> Void)? { get set }
    var onBluetooth: ((BluetoothAvailability) -> Void)? { get set }
    /// Begin a service-filtered scan, ACCUMULATING candidates (never auto-connecting).
    func startScan()
    /// Connect to a specific candidate the athlete (or the auto-rule) chose.
    func connect(_ id: DeviceID)
    /// Fast-path: try to connect straight to a remembered identifier without waiting
    /// for a scan (CoreBluetooth can reach a known peripheral by UUID). Falls back to
    /// a scan internally if the OS no longer knows it.
    func connectRemembered(_ id: DeviceID)
    /// Athlete-initiated cut. Ends the link, stops auto-reconnect, KEEPS the
    /// remembered device (so the next tap reconnects fast). Deterministic.
    func disconnect()
    /// Full teardown for the end of the whole workout (kills scan + link).
    func stop()
    func diagnosticsText() -> String?
}

// MARK: - Pure scan decision (fully unit-tested, no CoreBluetooth)

/// What to do given the current scan state. Pure — a function of (what's been found,
/// what we remember, whether the short settle window has elapsed).
enum ScanDecision: Equatable {
    /// Still inside the settle window and nothing decisive — keep listening so a
    /// device that advertises a beat late still makes the list.
    case keepScanning
    /// Exactly one device and it's the remembered one → connect with no picker.
    case autoConnect(DeviceID)
    /// Hand the athlete the list to choose from (sorted strongest-signal first).
    case present([DeviceCandidate])
}

enum ScanDecisionEngine {
    /// The one rule that fixes the gym bug: auto-connect ONLY to the single remembered
    /// device; a lone UNKNOWN device is never auto-connected (it might be someone
    /// else's). Multiple, unknown, or "remembered not here" all resolve to a list —
    /// but only once the settle window has elapsed, so the list isn't presented before
    /// a second machine has had a chance to appear (and before the single-remembered
    /// auto-connect gets its shot).
    static func decide(candidates: [DeviceCandidate],
                       remembered: DeviceID?,
                       settleElapsed: Bool) -> ScanDecision {
        if candidates.count == 1, let only = candidates.first, only.id == remembered {
            return .autoConnect(only.id)      // your machine, alone → straight in
        }
        guard settleElapsed else { return .keepScanning }
        return .present(candidates.sorted { $0.rssi > $1.rssi })
    }
}

// MARK: - Remembered device (per type), one source of truth

/// Persists the last device the athlete chose for one device TYPE (cinta / banda),
/// mirroring how the PM5 store already remembers its erg. Only the CoreBluetooth
/// identifier + a display name — no PII.
struct RememberedDeviceStore {
    let idKey: String
    let nameKey: String
    private let defaults: UserDefaults

    init(idKey: String, nameKey: String, defaults: UserDefaults = .standard) {
        self.idKey = idKey
        self.nameKey = nameKey
        self.defaults = defaults
    }

    var id: DeviceID? { defaults.string(forKey: idKey).flatMap(UUID.init(uuidString:)) }
    var name: String? { defaults.string(forKey: nameKey) }
    var has: Bool { id != nil }

    func remember(_ id: DeviceID, name: String) {
        defaults.set(id.uuidString, forKey: idKey)
        defaults.set(name, forKey: nameKey)
    }

    func forget() {
        defaults.removeObject(forKey: idKey)
        defaults.removeObject(forKey: nameKey)
    }
}

/// Persistence keys for the two generic devices (the PM5 keeps its own in
/// PM5Constants — already shipped and referenced by ProfileView).
enum DeviceDefaults {
    static let treadmill = RememberedDeviceStore(idKey: "device.treadmill.id",
                                                 nameKey: "device.treadmill.name")
    static let heartRate = RememberedDeviceStore(idKey: "device.hr.id",
                                                 nameKey: "device.hr.name")
}

// MARK: - Device channel — the per-type connection coordinator

/// Owns ONE generic device's connection lifecycle: it drives the source's scan,
/// runs the pure `ScanDecisionEngine`, keeps the remembered device, presents the
/// picker when a choice is needed, and disconnects deterministically. The hub holds
/// two of these (cinta, banda) and wires each source's data callback itself.
///
/// TESTABILITY: every timer just calls one of the internal `…Elapsed()` hooks, and
/// every decision routes through the pure engine — so tests inject a fake source,
/// push candidates, call the hooks directly, and assert what the channel asked the
/// source to do. No real Bluetooth, no real clocks.
@Observable
final class DeviceChannel {
    /// Live link state for the chip.
    private(set) var link: DeviceLink = .idle
    /// The devices found so far this scan (for the picker), strongest signal first.
    private(set) var candidates: [DeviceCandidate] = []
    /// System Bluetooth availability (drives the picker's guidance states).
    private(set) var bluetooth: BluetoothAvailability = .unknown
    /// True when the athlete must choose from the list — the UI observes this to
    /// present the picker sheet.
    var isPresentingPicker: Bool = false

    let title: String                 // "Cinta" / "Banda de pulso" — for the picker
    let icon: String
    /// Empty-list guidance shown while scanning finds nothing yet. Per-channel
    /// because the belt and the strap need different instructions — the strap must
    /// also cover any watch broadcasting HR over BLE, which makes no sense for a belt.
    let scanHint: String
    /// PERSISTENT guidance shown even once devices appear (unlike `scanHint`) — how to
    /// pick YOUR machine among several, and which machines are supported. Non-technical
    /// athletes don't recognise a raw BLE name (Gerard didn't know his own treadmill's).
    let pickHint: String?
    private let makeSource: () -> ConnectableSource
    private let remembered: RememberedDeviceStore

    /// Called once, right after the source is lazily created, so the owner (the hub)
    /// can wire the type-specific telemetry callback (`onSample` / `onBpm`) that lives
    /// on the refining protocol, outside `ConnectableSource`.
    var onSourceCreated: ((ConnectableSource) -> Void)?

    /// The CoreBluetooth source is created LAZILY on first use so opening the app
    /// never triggers the Bluetooth power alert — it only appears when the athlete
    /// actually taps to connect.
    private var _source: ConnectableSource?
    private func source() -> ConnectableSource {
        if let s = _source { return s }
        let s = makeSource()
        wire(s)
        onSourceCreated?(s)
        _source = s
        return s
    }

    /// Bumped on every fresh connect attempt so a stale settle/fallback timer from a
    /// previous attempt is ignored.
    private var generation = 0
    private var settleElapsed = false

    init(title: String, icon: String,
         scanHint: String = "Enciende tu dispositivo y acércate. Aparecerá aquí en cuanto lo encuentre.",
         pickHint: String? = nil,
         remembered: RememberedDeviceStore,
         makeSource: @escaping () -> ConnectableSource) {
        self.title = title
        self.icon = icon
        self.scanHint = scanHint
        self.pickHint = pickHint
        self.remembered = remembered
        self.makeSource = makeSource
    }

    var rememberedName: String? { remembered.name }
    var rememberedID: DeviceID? { remembered.id }
    var hasRemembered: Bool { remembered.has }
    var isConnected: Bool { link.isLive }
    /// The name to show once connected (real advertised name), else nil.
    var connectedName: String? { link.deviceName }

    // MARK: - Intents

    /// The athlete tapped the chip, OR the HUD is (re)entering. `autoPresentPicker` =
    /// true for an explicit chip tap (surface the list if a choice is needed); false
    /// for a silent HUD re-entry: only the remembered device is tried, and if it can't
    /// be reached the channel sits at `.idle` (the HUD prompts "Elige tu cinta")
    /// instead of scanning indefinitely or grabbing a stranger.
    func beginConnect(autoPresentPicker: Bool) {
        guard !isBusy else { return }
        // Silent path with nothing remembered → nothing to auto-connect to, and we
        // must never blind-connect. Sit idle; the athlete opens the picker explicitly.
        if remembered.id == nil, !autoPresentPicker {
            link = .idle
            return
        }
        startAttempt(autoPresent: autoPresentPicker)
    }

    /// Explicitly open the picker (chip tap, the HUD's "Elegir", or the run pre-start
    /// flow's inline "Cintas cerca" step). Marks the picker as on-screen and makes sure
    /// a scan is running and will END IN A LIST.
    ///
    /// THE FIELD BUG THIS FIXES: a remembered belt triggers a SILENT attempt
    /// (`beginConnect(autoPresentPicker: false)`) the moment the connect guide appears.
    /// The channel is then `isBusy`, so this used to early-return — leaving
    /// `autoPresentPicker == false` from that silent attempt. When the settle window
    /// elapsed, `evaluate()` took the silent branch and did `_source?.stop()` +
    /// `link = .idle`, KILLING the live scan underneath the picker the athlete was
    /// already reading ("veo el nombre de mi cinta y desaparece sola").
    ///
    /// So opening the picker UPGRADES the attempt in flight instead of bailing: from
    /// here on the settle window presents the list. The scan itself is deliberately NOT
    /// restarted — restarting would clear the candidates already found and make the
    /// list flicker. The auto-connect rule is untouched: `ScanDecisionEngine` still
    /// only ever auto-connects the single REMEMBERED device.
    func openPicker() {
        isPresentingPicker = true
        guard !isConnected else { return }
        if isBusy {
            autoPresentPicker = true    // upgrade in place — never stop the source now
            return
        }
        startAttempt(autoPresent: true)
    }

    /// Shared scan/connect kickoff: try the remembered device directly (by identifier,
    /// never "first found") AND scan for the picker list in parallel.
    private func startAttempt(autoPresent: Bool) {
        generation += 1
        settleElapsed = false
        candidates = []
        pickInFlight = false
        self.autoPresentPicker = autoPresent
        let src = source()
        if let id = remembered.id {
            link = .connecting
            lastConnectingID = id
            src.connectRemembered(id)
            src.startScan()
            scheduleRememberedFallback(for: generation)
        } else {
            link = .scanning
            src.startScan()
        }
        scheduleSettle(for: generation)
    }

    /// The athlete picked a device from the list. Dismissing the sheet right after must
    /// NOT abort this connect (see `cancelConnect`), so flag the pick as in flight.
    func connect(_ id: DeviceID) {
        pickInFlight = true
        isPresentingPicker = false
        link = .connecting
        lastConnectingID = id
        source().connect(id)
    }

    /// The athlete tapped "Desconectar". Deterministic — the source cuts the link and
    /// forces `.idle` within its own timeout even if the peripheral is gone. No-op if
    /// nothing was ever connected (no source created).
    func disconnect() {
        generation += 1                 // cancel any pending settle/fallback
        pickInFlight = false
        isPresentingPicker = false
        _source?.disconnect()
        if _source == nil { link = .idle }
    }

    /// Cut AND forget — next session won't fast-path to it.
    func forget() {
        remembered.forget()
        disconnect()
    }

    /// The sheet closed. If the athlete just PICKED a device (connect in flight) or is
    /// already connected, keep the link — do nothing. Otherwise they dismissed while
    /// browsing: stop the scan (battery) and cancel pending timers so the fallback
    /// can't re-pop the sheet, then rest at idle.
    func cancelConnect() {
        if isConnected || pickInFlight { return }
        generation += 1
        isPresentingPicker = false
        _source?.stop()
        link = .idle
    }

    /// Full teardown at the end of the workout.
    func stop() {
        generation += 1
        isPresentingPicker = false
        _source?.stop()
    }

    func diagnosticsText() -> String? { _source?.diagnosticsText() }

    /// Force the source to be created + wired NOW. Used only for the injected/test
    /// path (fakes have no CoreBluetooth, so eager creation is free) so a test can
    /// drive the source's callbacks without going through a real scan. On device the
    /// source stays lazy so the Bluetooth power alert only appears on an explicit tap.
    func prewireInjectedSource() { _ = source() }

    // MARK: - Decision hooks (called by the timers; called DIRECTLY by tests)

    /// Re-evaluate whenever the candidate set changes — this is what lets the single
    /// remembered device auto-connect the instant it appears, before settle.
    func onCandidatesChanged() { evaluate() }

    /// The short settle window elapsed → a decision is now due.
    func settleWindowElapsed() {
        settleElapsed = true
        evaluate()
    }

    /// The remembered fast-path didn't connect in time → make sure we scan + surface
    /// the list rather than sitting on a "connecting" that will never land.
    func rememberedFallbackElapsed() {
        guard !isConnected else { return }
        settleElapsed = true
        evaluate()
    }

    // MARK: - Core evaluation (pure engine + effects)

    private var autoPresentPicker = true
    /// True between a pick (`connect(_:)`) and the resulting `.connected` — so the
    /// sheet's dismiss doesn't abort the connection that dismiss was triggered by.
    private var pickInFlight = false

    private func evaluate() {
        guard !isConnected else { return }
        switch ScanDecisionEngine.decide(candidates: candidates,
                                          remembered: remembered.id,
                                          settleElapsed: settleElapsed) {
        case .keepScanning:
            break
        case .autoConnect(let id):
            link = .connecting
            lastConnectingID = id
            source().connect(id)
        case .present(let list):
            candidates = list
            if autoPresentPicker {
                isPresentingPicker = true
            } else {
                // Silent path: the remembered device got its chance and didn't land →
                // stop the pointless scan and rest at idle so the HUD prompts the
                // athlete to choose (never auto-connect to a machine we don't know).
                _source?.stop()
                link = .idle
            }
        }
    }

    private var isBusy: Bool {
        switch link {
        case .connected, .connecting, .scanning, .reconnecting: return true
        case .idle, .unavailable, .failed: return false
        }
    }

    // MARK: - Source wiring

    private func wire(_ source: ConnectableSource) {
        source.onLink = { [weak self] newLink in
            guard let self else { return }
            self.link = newLink
            if case let .connected(name) = newLink {
                self.isPresentingPicker = false
                self.pickInFlight = false
                self.generation += 1     // stop pending timers
                self.candidates = []
                // Persist the EXACT identifier we connected to (so next session's
                // fast-path reaches that same machine) plus its advertised name. If a
                // silent reconnect landed without a fresh pick, refresh the name only.
                if let id = self.lastConnectingID {
                    self.remembered.remember(id, name: name)
                } else if let id = self.remembered.id {
                    self.remembered.remember(id, name: name)
                }
            }
        }
        source.onDiscovered = { [weak self] found in
            guard let self else { return }
            self.candidates = found
            self.onCandidatesChanged()
        }
        source.onBluetooth = { [weak self] state in
            self?.bluetooth = state
        }
    }

    /// Track which id we last asked the source to connect, so `onLink(.connected)`
    /// can persist the exact identifier alongside the advertised name.
    private var lastConnectingID: DeviceID?

    // MARK: - Timers (thin — all logic lives in the hooks above)

    private func scheduleSettle(for gen: Int) {
        DispatchQueue.main.asyncAfter(deadline: .now() + DeviceConnectionTiming.scanSettleSeconds) { [weak self] in
            guard let self, self.generation == gen else { return }
            self.settleWindowElapsed()
        }
    }

    private func scheduleRememberedFallback(for gen: Int) {
        DispatchQueue.main.asyncAfter(deadline: .now() + DeviceConnectionTiming.rememberedFallbackSeconds) { [weak self] in
            guard let self, self.generation == gen else { return }
            self.rememberedFallbackElapsed()
        }
    }
}

enum DeviceConnectionTiming {
    /// How long to accumulate candidates before presenting the list — long enough for
    /// a second nearby machine to advertise, short enough not to feel laggy.
    static let scanSettleSeconds: TimeInterval = 3
    /// How long to wait for the remembered device's direct connect before falling to
    /// the picker list.
    static let rememberedFallbackSeconds: TimeInterval = 5
    /// How long to wait for CoreBluetooth's disconnect callback before FORCING the
    /// state to disconnected (fixes the "PM5 se queda pillado" hang).
    static let disconnectTimeoutSeconds: TimeInterval = 3
}
