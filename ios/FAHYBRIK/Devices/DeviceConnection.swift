import Foundation
import Observation

// The connection concern for the two generic BLE fitness devices — the FTMS
// treadmill and the standard BLE heart-rate strap — lifted OUT of the CoreBluetooth
// sources so it can be modeled and unit-tested with zero Bluetooth. It is the
// Concept2-PM5 pattern (scan → list the found devices by NAME → the athlete picks →
// remember it) generalized to cinta + banda.
//
// ══════════════════════════════════════════════════════════════════════════════
// THE ONE RULE: NOTHING EVER CONNECTS BY ITSELF. NOT EVEN TO THE DEVICE YOU
// USED LAST. NOT EVEN AFTER A DROP.
// ══════════════════════════════════════════════════════════════════════════════
//
// A connection exists because a FINGER asked for it, in this session, from a list
// of what is actually around. There is no auto-connect, no silent reconnect, no
// retry loop, no "fast path to the remembered device" — those are all deleted, not
// merely disabled, so they cannot creep back.
//
// WHY (the field failures, in order):
//   1. The first sources auto-connected to the FIRST advertiser they saw. In a gym
//      that grabs a STRANGER'S machine — the athlete "mareó a la gente que
//      entrenaba en otra cinta" and the HR chip latched onto someone else's Polar.
//   2. So we narrowed it to "auto-connect only the single REMEMBERED device". That
//      still auto-connected in the gym, and it is the dangerous case: the app can
//      now DRIVE belts (FTMS speed/incline/start/stop). Grabbing a belt that is
//      mid-workout under another athlete is not rude, it is a safety incident.
//   3. Equipment ROTATES. People move between machines constantly. Yesterday's
//      belt — or the one you were on ten minutes ago — is very likely someone
//      else's right now. "Remembered" is therefore NOT evidence of ownership.
//
// What "remembered" is allowed to be: a LABEL. It badges its row "ÚLTIMO USADO"
// and sorts it to the top so the athlete finds it in one glance. It is never an
// action, never a trigger, never a reason to skip the list.
//
// After ANY disconnection, expected or not, the link goes to a truthful state
// (`.idle` / `.lost`) and the surface offers a button back into the scan. Never a
// spinner that silently re-grabs a machine.

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
    /// Connect to the ONE candidate the athlete tapped. This is the ONLY way a link is
    /// ever opened — there is deliberately no "connect to the remembered one" entry
    /// point, because the remembered device is a label, not an instruction.
    func connect(_ id: DeviceID)
    /// Athlete-initiated cut. Ends the link and KEEPS the remembered device — as a
    /// label for next time's list, never as a reconnect trigger. Deterministic.
    func disconnect()
    /// Full teardown for the end of the whole workout (kills scan + link).
    func stop()
    func diagnosticsText() -> String?
}

// MARK: - Pure scan decision (fully unit-tested, no CoreBluetooth)

/// What to do given the current scan state. Pure — a function of (what's been found,
/// what we remember, whether the short settle window has elapsed).
///
/// THERE ARE ONLY TWO OUTCOMES, AND NEITHER OF THEM CONNECTS. A scan can keep
/// listening or hand the athlete a list; opening a link is a separate act that only a
/// tap performs. Any future case that connects is a safety regression — see the
/// header of this file and `ScanDecisionEngineTests`.
enum ScanDecision: Equatable {
    /// Still inside the settle window — keep listening so a device that advertises a
    /// beat late still makes the list.
    case keepScanning
    /// Hand the athlete the list to choose from (remembered first, then by signal).
    case present([DeviceCandidate])
}

enum ScanDecisionEngine {
    /// A settled scan ALWAYS resolves to a list. Always — including the case that used
    /// to be treated as safe: exactly one device found and it is the one we remember.
    /// That case is NOT safe. Equipment rotates; yesterday's belt (or the one from ten
    /// minutes ago) is very likely someone else's right now, possibly mid-workout, and
    /// this app can drive belts. "Remembered" only earns that device the top of the
    /// list and an "ÚLTIMO USADO" badge — the athlete still taps it.
    static func decide(candidates: [DeviceCandidate],
                       remembered: DeviceID?,
                       settleElapsed: Bool) -> ScanDecision {
        guard settleElapsed else { return .keepScanning }
        return .present(sorted(candidates, remembered: remembered))
    }

    /// Remembered device first (it is what the athlete is most likely looking for),
    /// then strongest signal — the machine you are standing in front of is loudest.
    static func sorted(_ candidates: [DeviceCandidate], remembered: DeviceID?) -> [DeviceCandidate] {
        candidates.sorted { a, b in
            let aRemembered = a.id == remembered, bRemembered = b.id == remembered
            if aRemembered != bRemembered { return aRemembered }
            return a.rssi > b.rssi
        }
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
/// runs the pure `ScanDecisionEngine`, keeps the remembered device, PUBLISHES the
/// candidates when a choice is needed, and disconnects deterministically. The hub
/// holds two of these (cinta, banda) and wires each source's data callback itself.
///
/// IT DOES NOT PRESENT ANYTHING. A device channel has no idea which screen the
/// athlete is on, so it must never raise a modal — it only ever answers "here is what
/// I found". See `isPresentingPicker` for the field bug that taught us this.
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
    /// True ONLY because the athlete explicitly asked for the picker SHEET (a chip
    /// tap). The channel NEVER raises this by itself — see `evaluate()`. It stays
    /// writable so the sheet's own dismiss gesture can lower it.
    ///
    /// THE FIELD BUG THIS CONTRACT FIXES: this flag is CHANNEL-owned but drives
    /// `.sheet(isPresented:)` in `DeviceConnectCard` and `TreadmillHUDView`. While the
    /// device layer could raise it on its own (a scan settling on its own timer), a
    /// sheet tried to present from a screen buried UNDER the run pre-start
    /// `.fullScreenCover` — UIKit refused it ("Currently, only presenting a single
    /// sheet is supported") and the presentation fight swallowed the athlete's taps,
    /// making the belt list vanish. Presentation is now EXPLICIT-ONLY: a modal exists
    /// because a finger asked for it, never because a timer fired.
    var isPresentingPicker: Bool = false

    /// The device the athlete just tapped that is WAITING FOR HIS CONFIRMATION, on a
    /// channel that requires one (belts — the machines we can drive). Non-nil means a
    /// dialog is up and NOTHING has been connected yet. Cleared by confirm, cancel, or
    /// any teardown, so it can never strand a half-made decision.
    private(set) var pendingConfirmation: DeviceCandidate?

    /// Raised while an INLINE candidate list owns the screen (the run pre-start flow's
    /// paso 3). While it is up, `isPresentingPicker` CANNOT go true: the athlete is
    /// already looking at the list, and a sheet over a fullScreenCover is exactly the
    /// collision above. A latch makes that invariant STRUCTURAL instead of "we audited
    /// every caller today".
    private var inlineSelectionActive = false

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
    /// True for machines the app can DRIVE (the treadmill: speed, incline, start, stop).
    /// Tapping such a row asks "¿es TU cinta?" before connecting, because connecting to
    /// the wrong one can move a belt under whoever is running on it. False for read-only
    /// devices (an HR strap can't hurt anybody) — there the tap connects straight away.
    let requiresConfirmation: Bool
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
         requiresConfirmation: Bool = false,
         remembered: RememberedDeviceStore,
         makeSource: @escaping () -> ConnectableSource) {
        self.title = title
        self.icon = icon
        self.scanHint = scanHint
        self.pickHint = pickHint
        self.requiresConfirmation = requiresConfirmation
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
    //
    // NONE OF THESE CONNECT. The only member of this type that opens a link is
    // `connect(_:)`, and the only things that call it are an athlete's tap on a list
    // row (`requestConnect` → for a belt, after he confirms). Everything here just
    // decides who is showing the list.

    /// A screen that uses this device appeared (the HUD opening, the brief showing its
    /// chips). It makes the state TRUTHFUL and nothing else: no connect, no scan, not
    /// even a CoreBluetooth source (so the system Bluetooth alert still only appears on
    /// a real tap).
    ///
    /// THIS USED TO BE `beginSilentReconnect()` AND IT CONNECTED. It fired from
    /// `onAppear` hooks and reached straight for the remembered device by identifier —
    /// which is exactly how the app grabbed a belt in the gym by itself. It is renamed
    /// so no future reader can mistake it for a reconnect, and it is kept deliberately
    /// inert: re-entering a screen must never move a machine.
    func prepare() {
        guard !isConnected else { return }   // a live link the athlete made stays
        generation += 1                      // drop any timer from an abandoned scan
        pendingConfirmation = nil
        // Rest at a state the UI can be honest about. `.lost` is preserved on purpose:
        // "se perdió la conexión" must survive a re-render, or the athlete never learns
        // his belt dropped.
        if link != .lost { link = .idle }
    }

    /// The athlete tapped a device chip that shows the picker SHEET (`DeviceConnectCard`,
    /// the treadmill HUD's header chip / "Buscar mi cinta"). Raises the sheet IMMEDIATELY
    /// — the tap is the intent, so the athlete watches the scan fill in instead of
    /// staring at a chip until a timer decides to pop something at them.
    func openPicker() {
        // The latch: an inline list already owns the screen, so a sheet here would be
        // a modal fighting a fullScreenCover. Keep the scan, drop the presentation.
        if !inlineSelectionActive { isPresentingPicker = true }
        ensureListScan()
    }

    /// The athlete stepped into an INLINE candidate list (the run pre-start flow's paso
    /// 3, which renders "Cintas cerca" as a full-screen STEP, not a sheet). Does exactly
    /// what `openPicker()` does to the SCAN — including the upgrade-in-flight above — but
    /// never touches `isPresentingPicker`, and latches it down so nothing else can raise
    /// a sheet over the flow while the list is up.
    func beginInlineSelection() {
        inlineSelectionActive = true
        isPresentingPicker = false      // an inline list owns the screen: no sheet, ever
        ensureListScan()
    }

    /// The inline list left the screen (the back arrow). Releases the latch and, if the
    /// athlete never chose, tears the scan down exactly like dismissing the sheet does.
    /// Symmetric with `beginInlineSelection()` so the latch can never be stranded — a
    /// stranded latch would silently mute the chip sheets for the rest of the session.
    func endInlineSelection() {
        inlineSelectionActive = false
        cancelConnect()
    }

    /// Shared by both explicit list intents: make sure a scan is running. A scan already
    /// in flight is LEFT ALONE — restarting it would clear the candidates already found
    /// and make the list flicker under the athlete's finger.
    private func ensureListScan() {
        guard !isConnected, !isBusy else { return }
        startAttempt()
    }

    /// Scan kickoff. It SCANS. That is all it has ever been allowed to do since the
    /// remembered-device fast path was deleted: there is no identifier to reach for
    /// here, no `.connecting` to enter, nothing to fall back from.
    private func startAttempt() {
        generation += 1
        settleElapsed = false
        candidates = []
        pickInFlight = false
        link = .scanning
        source().startScan()
        scheduleSettle(for: generation)
    }

    // MARK: - Connecting (the ONLY path, and it starts at a fingertip)

    /// The athlete tapped a row. For a device we can only READ (an HR strap), that tap
    /// is the whole decision and this connects. For a device we can DRIVE (a treadmill:
    /// speed, incline, start, stop) it first raises a confirmation — grabbing the wrong
    /// belt can move it under whoever is running on it.
    func requestConnect(_ candidate: DeviceCandidate) {
        guard requiresConfirmation else {
            connect(candidate.id)
            return
        }
        pendingConfirmation = candidate
    }

    /// The athlete confirmed "sí, es mi cinta" → now, and only now, we connect.
    func confirmPendingConnect() {
        guard let candidate = pendingConfirmation else { return }
        pendingConfirmation = nil
        connect(candidate.id)
    }

    /// He backed out of the confirmation. Nothing was touched; the list stays up.
    func cancelPendingConnect() { pendingConfirmation = nil }

    /// Open the link to ONE device the athlete chose. Every caller traces back to a tap:
    /// `requestConnect` / `confirmPendingConnect`. Nothing timed, nothing on appear,
    /// nothing after a drop. Dismissing the sheet right after must NOT abort this
    /// connect (see `cancelConnect`), so flag the pick as in flight.
    func connect(_ id: DeviceID) {
        pickInFlight = true
        pendingConfirmation = nil
        isPresentingPicker = false
        link = .connecting
        lastConnectingID = id
        source().connect(id)
    }

    /// The athlete tapped "Desconectar". Deterministic — the source cuts the link and
    /// forces `.idle` within its own timeout even if the peripheral is gone. No-op if
    /// nothing was ever connected (no source created).
    func disconnect() {
        generation += 1                 // cancel any pending settle timer
        pickInFlight = false
        pendingConfirmation = nil
        isPresentingPicker = false
        inlineSelectionActive = false
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
        pendingConfirmation = nil
        _source?.stop()
        link = .idle
    }

    /// Full teardown at the end of the workout.
    func stop() {
        generation += 1
        isPresentingPicker = false
        inlineSelectionActive = false
        pendingConfirmation = nil
        _source?.stop()
    }

    func diagnosticsText() -> String? { _source?.diagnosticsText() }

    /// Force the source to be created + wired NOW. Used only for the injected/test
    /// path (fakes have no CoreBluetooth, so eager creation is free) so a test can
    /// drive the source's callbacks without going through a real scan. On device the
    /// source stays lazy so the Bluetooth power alert only appears on an explicit tap.
    func prewireInjectedSource() { _ = source() }

    // MARK: - Decision hooks (called by the timers; called DIRECTLY by tests)

    /// Re-evaluate whenever the candidate set changes, so the list on screen stays live
    /// as machines appear. It can only ever re-sort and re-publish — see `evaluate()`.
    func onCandidatesChanged() { evaluate() }

    /// The short settle window elapsed → the list is due.
    func settleWindowElapsed() {
        settleElapsed = true
        evaluate()
    }

    // MARK: - Core evaluation (pure engine + effects)

    /// True between a pick (`connect(_:)`) and the resulting `.connected` — so the
    /// sheet's dismiss doesn't abort the connection that dismiss was triggered by.
    private var pickInFlight = false

    /// PUBLISH, NEVER PRESENT, NEVER CONNECT. This runs off a timer, and a timer knows
    /// neither which screen the athlete is on nor which machine he is standing in front
    /// of. It therefore does exactly one thing: keep `candidates` current for whatever
    /// list is already on screen because he asked for it.
    ///
    /// (Raising `isPresentingPicker` here is how a picker sheet once ended up fighting
    /// the run pre-start `.fullScreenCover` — "only presenting a single sheet is
    /// supported" — and swallowed his taps. Connecting here is how the app grabbed a
    /// stranger's belt. Both are structurally impossible now: the enum has no
    /// auto-connect case and this method has no presentation effect.)
    private func evaluate() {
        guard !isConnected else { return }
        switch ScanDecisionEngine.decide(candidates: candidates,
                                          remembered: remembered.id,
                                          settleElapsed: settleElapsed) {
        case .keepScanning:
            break
        case .present(let list):
            candidates = list
        }
    }

    private var isBusy: Bool {
        switch link {
        case .connected, .connecting, .scanning: return true
        case .idle, .lost, .unavailable, .failed: return false
        }
    }

    // MARK: - Source wiring

    private func wire(_ source: ConnectableSource) {
        source.onLink = { [weak self] newLink in
            guard let self else { return }
            self.link = newLink
            if case let .connected(name) = newLink {
                self.isPresentingPicker = false
                self.inlineSelectionActive = false   // the list did its job; latch released
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
}

enum DeviceConnectionTiming {
    /// How long to accumulate candidates before presenting the list — long enough for
    /// a second nearby machine to advertise, short enough not to feel laggy.
    static let scanSettleSeconds: TimeInterval = 3
    /// How long to wait for CoreBluetooth's disconnect callback before FORCING the
    /// state to disconnected (fixes the "PM5 se queda pillado" hang).
    static let disconnectTimeoutSeconds: TimeInterval = 3
}
