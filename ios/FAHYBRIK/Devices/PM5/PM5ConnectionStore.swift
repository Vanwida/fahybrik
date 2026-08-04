import Foundation
import Observation
import SwiftUI

// SwiftUI-facing observable. Owns the PM5Service delegate role, surfaces
// pairing state, last sample, and exposes an injection seam (`feed(_:)`)
// used by both the simulator mock and unit tests. ActiveWorkoutView reads
// `live` and feeds power/SPM/distance/calories into the existing data grid.
@Observable
final class PM5ConnectionStore: NSObject {
    /// Legacy / profile / mono-erg entry point. Multi-machine sessions use
    /// `PM5Pool.shared.store(for:)` so each role owns its own service.
    static let shared = PM5ConnectionStore(service: PM5Service.shared)

    var bluetoothState: PM5BluetoothState = .unknown
    var connectionState: PM5ConnectionState = .idle
    var discovered: [PM5Discovered] = []
    var connectedDeviceName: String? = nil
    var connectedIdentifier: UUID? = nil
    var live: PM5LiveSample = PM5LiveSample()
    /// Completed splits/intervals of the current PM5 workout (0x37+0x38 joined by
    /// interval number), ordered. Snapshotted per erg segment by the session.
    var splits: [PM5Split] = []
    var lastError: String? = nil
    /// Workout-programming handshake (send the piece to the monitor, ErgData
    /// style): idle → sending → programmed / failed. Drives the erg HUD banner.
    var programState: PM5ProgramState = .idle
    /// Hex TX/RX ring from the CSAFE exchange (max ~20 lines) — surfaced in the
    /// PM5 sheet for physical debugging at the gym.
    var csafeDiagnostics: [String] = []

    private let service: PM5Service
    private var mockTimer: Timer?
    private var mockTick: Int = 0
    /// Sim only: the mock "athlete" waits this long after a programmed piece
    /// before rowing (the monitor's "row to begin" hold, made visible).
    private var mockHoldUntil: Date? = nil
    /// Once-per-window guard, reset on every fresh connection so a PM5 that
    /// (re)connects mid-piece gets the piece programmed then.
    /// The WORK WINDOW whose piece the monitor currently holds — a segment id for a
    /// standalone piece, a tramo key for a round inside a format. Changing it is
    /// what re-sends the piece and re-zeroes the monitor.
    private var programmedWindowKey: String? = nil

    /// True when the erg dropped ON ITS OWN (not because the athlete disconnected).
    /// Nothing recovers it — this exists so the UI can SAY so and offer the list again.
    /// Cleared the moment he acts (a new scan, a new connection).
    var connectionLost: Bool = false
    /// Set by the store just before it asks the service to drop the link, so the
    /// disconnect callback can tell "he asked for this" from "the erg vanished".
    private var expectingDisconnect = false

    /// Peripheral IDs already claimed by OTHER stores in the pool — filtered out of
    /// the pick list so one PM5 cannot be bound to Remo and Ski at once. Set by
    /// the picker before presenting; empty when unused.
    var excludePeripheralIds: Set<UUID> = []

    /// Fan-out for `PM5Pool` / multi-store observers when live or connection changes.
    var onDidUpdate: (() -> Void)?

    var rememberedDeviceName: String? {
        UserDefaults.standard.string(forKey: PM5Defaults.lastPairedName)
    }

    /// The erg used last — a LABEL for the list (badge + sorted first), never a
    /// reconnect trigger. Ergs rotate: rower today, ski tomorrow, somebody else's after.
    var rememberedIdentifier: UUID? {
        UserDefaults.standard.string(forKey: PM5Defaults.lastPairedIdentifier)
            .flatMap(UUID.init(uuidString:))
    }

    var hasRememberedDevice: Bool { rememberedIdentifier != nil }

    /// The discovered ergs in the order the athlete should see them: the one he used
    /// last on top (badged), then the rest as the scan ranked them. Already-claimed
    /// peripherals (other role in the pool) are hidden.
    var discoveredForDisplay: [PM5Discovered] {
        let remembered = rememberedIdentifier
        let excluded = excludePeripheralIds
        return discovered
            .filter { !excluded.contains($0.id) }
            .enumerated().sorted { a, b in
                let aR = a.element.id == remembered, bR = b.element.id == remembered
                if aR != bR { return aR }
                return a.offset < b.offset
            }.map(\.element)
    }

    var isConnected: Bool {
        if case .streaming = connectionState { return true }
        return false
    }

    /// Inject a service so multi-PM5 sessions can hold one CBCentralManager per role.
    /// Default `PM5Service.shared` keeps mono-erg / profile behaviour unchanged.
    init(service: PM5Service = .shared) {
        self.service = service
        super.init()
        self.service.delegate = self
        self.bluetoothState = service.bluetoothState
        self.connectionState = service.connectionState
    }

    private func notifyUpdate() { onDidUpdate?() }

    // MARK: - intent
    func startScan() {
        connectionLost = false      // he's looking again; the warning did its job
        #if targetEnvironment(simulator)
        startMockStream()
        #else
        lastError = nil
        service.startScan()
        #endif
    }

    func stopScan() {
        #if targetEnvironment(simulator)
        // simulator has no scanner; mock stream stays running while
        // "connected" so the data grid keeps updating.
        #else
        service.stopScan()
        #endif
    }

    /// The athlete tapped an erg in the list. THE only way a PM5 link is ever opened.
    func connect(_ id: UUID) {
        connectionLost = false
        #if targetEnvironment(simulator)
        startMockStream()
        #else
        lastError = nil
        service.connect(id)
        #endif
    }

    func disconnect() {
        expectingDisconnect = true      // he asked → the drop is not a "lost connection"
        #if targetEnvironment(simulator)
        stopMockStream()
        connectionState = .idle
        connectedDeviceName = nil
        connectedIdentifier = nil
        programState = .idle
        programmedWindowKey = nil
        #else
        service.disconnect()
        #endif
    }

    /// "Cambiar de erg": drop the current erg and connect the tapped one — one tap,
    /// no manual disconnect first (the remembered rower must never trap the athlete
    /// away from the SKI next to it).
    func switchTo(_ id: UUID) {
        expectingDisconnect = true      // the old link drops because he chose another
        connectionLost = false
        #if targetEnvironment(simulator)
        startMockStream()
        #else
        lastError = nil
        service.switchToDevice(id)
        #endif
    }

    func forgetPaired() {
        expectingDisconnect = true
        connectionLost = false
        #if targetEnvironment(simulator)
        stopMockStream()
        UserDefaults.standard.removeObject(forKey: PM5Defaults.lastPairedIdentifier)
        UserDefaults.standard.removeObject(forKey: PM5Defaults.lastPairedName)
        connectionState = .idle
        connectedDeviceName = nil
        connectedIdentifier = nil
        programState = .idle
        programmedWindowKey = nil
        #else
        service.forgetPaired()
        #endif
    }

    // `reconnectIfPossible()` USED TO LIVE HERE. It was called from `ErgConnectCard`'s
    // tap, from the erg sheet's `onAppear`, from `DeviceConnectCard`'s chip and from
    // `ActiveWorkoutView` on appear AND on every segment change — five lifecycle paths
    // that each reopened a link to whatever machine still held that identifier. All
    // deleted. The athlete taps an erg in the list; that is the whole story.

    /// Clear the captured splits. Called by the active-workout view when a NEW erg
    /// segment starts, so each piece's interval table starts clean (the monitor's
    /// interval numbers can otherwise carry over between pieces in one session).
    func resetSplits() {
        splits = []
    }

    // MARK: - workout programming (ErgData parity)

    /// Send this erg piece to the monitor. `windowKey` is the WORK WINDOW the piece
    /// belongs to — the tramo key for per-bout series/EMOM/stations, or a stable
    /// segment key for cumulative windows (AMRAP). When the key changes, the piece
    /// is sent again, which is what makes the monitor zero its counters and wait
    /// for the next first stroke: serie 3 of a 5×500 starts from 0 m.
    ///
    /// Prefer the tramo+policy overload so each bout programs its own measure.
    /// Non-erg pieces and unmapped shapes are a no-op: the athlete can ALWAYS just
    /// row; monitor programming is never a gate.
    func programIfNeeded(for segment: WorkoutSegment, windowKey: String) {
        guard let spec = PM5WorkoutProgrammer.spec(for: segment) else { return }
        program(spec: spec, windowKey: windowKey)
    }

    /// Program the LIVE tramo under `ErgCounterPolicy`. No-op when the policy says
    /// not to program (rest / count-in / non-erg) or the key is unchanged.
    func programIfNeeded(for segment: WorkoutSegment,
                         tramo: LiveTramo,
                         policy: ErgCounterPolicy) {
        guard let key = PM5WorkoutProgrammer.programWindowKey(policy: policy, tramo: tramo, segment: segment),
              let spec = PM5WorkoutProgrammer.spec(for: tramo, segment: segment, policy: policy) else {
            return
        }
        program(spec: spec, windowKey: key)
    }

    private func program(spec: PM5WorkoutSpec, windowKey: String) {
        guard isConnected else { return }
        guard programmedWindowKey != windowKey else { return }
        programmedWindowKey = windowKey
        #if targetEnvironment(simulator)
        // No BLE on the simulator — accept the program as a success so the whole
        // flow (banner included) is demoable end-to-end.
        programState = .sending
        DispatchQueue.main.asyncAfter(deadline: .now() + PM5ProgramTiming.mockSendSeconds) { [weak self] in
            guard let self, self.programState == .sending else { return }
            self.programState = .programmed
            // A real monitor zeroes its counters and waits for the first stroke —
            // mirror that so the "rema para empezar" line is demoable, then the
            // mock "athlete" starts rowing after the hold.
            self.mockTick = 0
            self.live = PM5LiveSample()
            self.live.workoutState = .waitingToBegin
            self.splits = []
            self.mockHoldUntil = Date().addingTimeInterval(PM5ProgramTiming.mockPrepareSeconds)
        }
        _ = spec
        #else
        service.program(spec)
        #endif
    }

    /// The one-line banner state for the erg HUD: "enviando" while the CSAFE
    /// writes are in flight, "listo — rema para empezar" once the monitor holds
    /// the piece and is still waiting for the first stroke. Failures stay silent
    /// here (diagnostics carry them) — the athlete just rows.
    var programAnnouncement: PM5ProgramAnnouncement? {
        switch programState {
        case .sending:
            return .sending
        case .programmed:
            // Hide once the piece is actually rowing (the monitor leaves "wait
            // to begin" / meters start moving) — a stale "rema para empezar"
            // mid-piece would read as broken.
            let waiting = live.workoutState == .waitingToBegin
                || (live.workoutState == nil && (live.distanceMeters ?? 0) <= 0)
            return waiting ? .ready : nil
        case .idle, .failed:
            return nil
        }
    }

    // MARK: - simulator mock
    // Simulator has no real BLE — synthesize a plausible row stream so the
    // UI can be exercised end-to-end without the physical erg.
    private func startMockStream() {
        guard mockTimer == nil else { return }
        mockTick = 0
        live = PM5LiveSample()
        splits = []
        programmedWindowKey = nil   // fresh mock link — same contract as hardware
        programState = .idle
        connectionState = .streaming
        connectedDeviceName = "PM5 Simulator"
        connectedIdentifier = UUID()
        UserDefaults.standard.set(connectedIdentifier?.uuidString, forKey: PM5Defaults.lastPairedIdentifier)
        UserDefaults.standard.set("PM5 Simulator", forKey: PM5Defaults.lastPairedName)
        mockTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.advanceMock()
        }
    }

    private func stopMockStream() {
        mockTimer?.invalidate()
        mockTimer = nil
    }

    private func advanceMock() {
        if let hold = mockHoldUntil {
            guard Date() >= hold else { return }   // "row to begin" — erg still
            mockHoldUntil = nil
        }
        mockTick += 1
        let secs = Double(mockTick)
        // Steady ~2:00/500m ≈ 4.17 m/s ≈ ~225 W; jitter for realism.
        let pace = 120.0 + Double.random(in: -2...2)
        let metersPerSec = 500.0 / pace
        let prevDistance = live.distanceMeters ?? 0
        let distance = prevDistance + metersPerSec
        live.elapsedSeconds = secs
        live.distanceMeters = distance
        live.paceSecondsPer500m = pace
        live.avgPaceSecondsPer500m = 121.0                 // steady average
        live.powerWatts = 220 + Int.random(in: -10...10)
        live.strokeRate = 28 + Int.random(in: -1...1)
        live.heartRateBpm = 152 + Int.random(in: -3...3)
        live.caloriesKcal = Int(secs * 0.18)
        live.caloriesPerHour = 640 + Int.random(in: -20...20)
        live.dragFactor = 118 + Int.random(in: -1...1)
        live.peakDriveForceLbs = 92 + Double(Int.random(in: -4...4))
        live.avgDriveForceLbs = 61 + Double(Int.random(in: -3...3))
        live.strokeCount = Int(secs * (28.0 / 60.0))
        live.workoutState = .workoutRow
        live.lastUpdate = Date()

        // Emit a completed split every 250 m so the interval table + persistence
        // can be exercised end-to-end on the simulator (no physical erg).
        let splitLength = 250.0
        let crossed = Int(distance / splitLength)
        if crossed >= 1 && crossed > splits.count {
            splits.append(PM5Split(
                index: crossed,
                timeSeconds: splitLength / metersPerSec,
                distanceMeters: splitLength,
                restTimeSeconds: nil,
                restDistanceMeters: nil,
                avgPaceSecPer500m: pace,
                strokeRateSpm: live.strokeRate,
                avgPowerWatts: live.powerWatts,
                totalCalories: Int(splitLength * 0.036),
                avgCaloriesPerHour: live.caloriesPerHour,
                avgDragFactor: live.dragFactor,
                avgHeartRateBpm: live.heartRateBpm
            ))
        }
        notifyUpdate()
    }
}

extension PM5ConnectionStore: PM5ServiceDelegate {
    func pm5Service(_ service: PM5Service, didChangeBluetoothState state: PM5BluetoothState) {
        self.bluetoothState = state
        notifyUpdate()
    }

    func pm5Service(_ service: PM5Service, didUpdateDiscovered devices: [PM5Discovered]) {
        self.discovered = devices
        notifyUpdate()
    }

    func pm5Service(_ service: PM5Service, didChangeConnection state: PM5ConnectionState) {
        self.connectionState = state
        if case .failed(let msg) = state { self.lastError = msg }
        notifyUpdate()
    }

    func pm5Service(_ service: PM5Service, didConnect deviceName: String, identifier: UUID) {
        self.connectedDeviceName = deviceName
        self.connectedIdentifier = identifier
        self.lastError = nil
        self.connectionLost = false
        self.expectingDisconnect = false
        // A fresh link starts with a clean monitor — allow the current erg piece
        // to be (re)programmed onto it.
        self.programmedWindowKey = nil
        notifyUpdate()
    }

    func pm5Service(_ service: PM5Service, didReceiveSample sample: PM5LiveSample) {
        self.live = sample
        notifyUpdate()
    }

    func pm5Service(_ service: PM5Service, didUpdateSplits splits: [PM5Split]) {
        self.splits = splits
        notifyUpdate()
    }

    /// The link is down. We do NOT go back for it — not here, not on the next screen,
    /// not on the next segment. When the athlete didn't ask for this, we raise
    /// `connectionLost` so the surface can say "se perdió la conexión con el erg" and
    /// offer the list; that is the entire recovery mechanism, and it needs his finger.
    func pm5Service(_ service: PM5Service, didDisconnect error: Error?) {
        let wasLinked = self.connectedIdentifier != nil
        self.connectionLost = wasLinked && !self.expectingDisconnect
        self.expectingDisconnect = false
        self.connectedDeviceName = nil
        self.connectedIdentifier = nil
        self.programState = .idle
        if let error { self.lastError = error.localizedDescription }
        notifyUpdate()
    }

    func pm5Service(_ service: PM5Service, didChangeProgramState state: PM5ProgramState) {
        self.programState = state
        notifyUpdate()
    }

    func pm5Service(_ service: PM5Service, didUpdateCSAFELog lines: [String]) {
        self.csafeDiagnostics = lines
    }
}

/// What the erg HUD banner says about the programming handshake. Failure is
/// deliberately absent: beyond diagnostics the app stays silent — the athlete
/// can always just row.
enum PM5ProgramAnnouncement: Equatable {
    case sending   // "Enviando el entreno al PM5…"
    case ready     // "Listo — rema para empezar"
}
