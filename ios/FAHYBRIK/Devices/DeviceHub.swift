import Foundation
import Observation

// Session-scoped owner of the two generic BLE fitness devices the live workout
// streams from — the FTMS treadmill and the standard BLE heart-rate strap. A
// SINGLETON so the exact connection the athlete makes in the pre-workout brief
// SURVIVES into the active workout and its treadmill HUD (Zwift/KinoMap standard:
// connect, then run). It mirrors `PM5ConnectionStore.shared`, which owns the
// Concept2 erg the same way — so the three connectable devices (cinta, banda, remo)
// live in one shared device layer with one lifecycle.
//
// Each generic device's connection concern (scan → LIST by name → the athlete picks
// → remember it → disconnect) lives in a `DeviceChannel`; the hub holds two and
// wires each source's telemetry callback. WHY channels: in a shared gym, blindly
// auto-connecting to the first advertiser grabs a stranger's machine — the channel +
// its pure `ScanDecisionEngine` make selection explicit and remember the athlete's
// own device by identifier.
//
// LIFECYCLE: each channel's CoreBluetooth source is created LAZILY on first connect
// (so the power alert only appears when the athlete opts in) and torn down by
// `stopAll()` when the WHOLE workout closes (`WorkoutContainer.onDisappear`) — never
// when a sub-screen like the treadmill HUD is merely dismissed. Dismissing the HUD
// only UNSUBSCRIBES its model (see `TreadmillHUDModel.teardown`); the belt stays live.
@Observable
final class DeviceHub {
    /// The one shared instance the brief, the active workout and the treadmill HUD
    /// all talk to. Tests build their own throwaway hubs with injected fakes.
    static let shared = DeviceHub()

    /// The per-device connection channels the chips + picker read directly (link,
    /// candidates, disconnect). Public so the card / HUD can bind the picker sheet.
    let treadmill: DeviceChannel
    let heartRate: DeviceChannel

    /// Latest BLE-strap bpm, or nil if none yet. The active model reads it via the
    /// `onBpm` forward; kept here too so the brief can show a live pulse once linked.
    private(set) var bleBpm: Int?

    /// Latest BLE-strap battery percentage (0–100), or nil when no strap is
    /// connected / it doesn't expose the Battery Service. The picker shows it beside
    /// the connected strap's name (Zwift/Wahoo standard). Cleared on `stopAll`.
    private(set) var hrBatteryPercent: Int?

    /// The active treadmill model subscribes here for RAW telemetry so its per-leg
    /// accumulation + auto-advance run exactly as before. Nil while no live HUD is
    /// consuming (the belt may still be connected — just nothing reading it).
    var onSample: ((TreadmillSample) -> Void)?
    var onBpm: ((Int) -> Void)?

    // --- Treadmill machine control (drive the belt + stay synced) ---
    /// What the connected belt lets the app drive — `.none` for a read-only machine or
    /// in the simulator. Published so the HUD can decide whether to offer controls.
    private(set) var treadmillControl: TreadmillControlCapability = .none
    /// Fired when the capability is (re)known — the HUD binds this to show/hide controls.
    var onControlCapability: ((TreadmillControlCapability) -> Void)?
    /// Fired on every machine-reported state change (console / safety key / our command).
    var onMachineEvent: ((TreadmillMachineEvent) -> Void)?
    /// Fired with each control command's ack.
    var onControlResult: ((TreadmillControlResult) -> Void)?
    /// The controllable source, if the connected belt supports it. Weak: owned by the
    /// channel. nil on a read-only belt / simulator mock (feature-detected).
    private weak var treadmillControllable: (any TreadmillControllable)?

    /// `shared` passes nil → real BLE on device / deterministic mocks in the
    /// simulator, both created lazily. Tests inject fakes they drive directly.
    init(treadmill injectedTreadmill: TreadmillDataSource? = nil,
         hr injectedHR: HeartRateSource? = nil) {
        // The channels are cheap (no CoreBluetooth yet); the source is created lazily
        // on the first connect. `onSourceCreated` (wired below) forwards each source's
        // telemetry into the hub's fan-out once the source exists.
        treadmill = DeviceChannel(
            title: "Cinta", icon: "figure.run",
            scanHint: "Enciende tu cinta y acércate. Aparecerá aquí en cuanto la encuentre.",
            pickHint: "¿No sabes cuál es la tuya? La de señal más fuerte suele ser la que tienes delante — aléjate de otras cintas para distinguirla. Solo aparecen cintas compatibles por Bluetooth (FTMS, como las Titanium).",
            remembered: DeviceDefaults.treadmill,
            makeSource: { injectedTreadmill ?? Self.makeTreadmill() })
        heartRate = DeviceChannel(
            title: "Banda de pulso", icon: "heart.fill",
            // Covers straps AND any watch broadcasting HR over BLE — most watches
            // (Garmin, Polar, Amazfit, Apple with a relay app) can emit their pulse.
            scanHint: "Enciende tu banda de pulso — o pon tu reloj a emitir pulso por Bluetooth (en los ajustes del reloj: «difundir» o «compartir» frecuencia cardiaca). Aparecerá aquí en cuanto la encuentre.",
            remembered: DeviceDefaults.heartRate,
            makeSource: { injectedHR ?? Self.makeHR() })

        treadmill.onSourceCreated = { [weak self] src in
            (src as? TreadmillDataSource)?.onSample = { [weak self] in self?.onSample?($0) }
            // Feature-detect control: only a controllable belt (real FTMS source) wires
            // these; a read-only machine / the simulator mock simply never reports.
            guard let self, let control = src as? (any TreadmillControllable) else { return }
            self.treadmillControllable = control
            control.onControlCapability = { [weak self] cap in
                self?.treadmillControl = cap
                self?.onControlCapability?(cap)
            }
            control.onMachineEvent = { [weak self] event in self?.onMachineEvent?(event) }
            control.onControlResult = { [weak self] result in self?.onControlResult?(result) }
        }
        heartRate.onSourceCreated = { [weak self] src in
            guard let hr = src as? HeartRateSource else { return }
            hr.onBpm = { [weak self] in self?.handleBpm($0) }
            hr.onBattery = { [weak self] in self?.handleBattery($0) }
        }

        // Injected (test) fakes have no CoreBluetooth → wire them eagerly so a test can
        // drive their callbacks without a scan. Real sources stay lazy (power alert).
        if injectedTreadmill != nil { treadmill.prewireInjectedSource() }
        if injectedHR != nil { heartRate.prewireInjectedSource() }
    }

    // MARK: - Backward-compatible surface (read by the HUD model + chips)

    var treadmillLink: DeviceLink { treadmill.link }
    var hrLink: DeviceLink { heartRate.link }
    var treadmillConnected: Bool { treadmill.isConnected }
    var hrConnected: Bool { heartRate.isConnected }

    /// Silent (re)connect used by the HUD on entry: try the remembered device, but
    /// don't pop a picker sheet on run-start — the HUD offers "Elegir" if a choice is
    /// needed. Idempotent (a no-op while already busy).
    func connectTreadmill() { treadmill.beginSilentReconnect() }
    func connectHR() { heartRate.beginSilentReconnect() }

    /// Drive the connected belt (start/stop, target speed/incline). No-op on a
    /// read-only machine or in the simulator — the caller can gate on `treadmillControl
    /// .canControl` to hide the controls entirely.
    func sendTreadmill(_ command: TreadmillControlCommand) { treadmillControllable?.send(command) }

    private func handleBpm(_ bpm: Int) {
        bleBpm = bpm
        onBpm?(bpm)
    }

    /// Clamp the raw strap byte to a sane 0–100 % before publishing — a malformed
    /// packet must never render "200 %".
    private func handleBattery(_ pct: Int) {
        hrBatteryPercent = max(0, min(100, pct))
    }

    /// A shareable dump of what the treadmill advertised — the first-connection tool
    /// for identifying a non-standard machine (surfaced by the HUD).
    func treadmillDiagnostics() -> String? { treadmill.diagnosticsText() }

    // MARK: - Teardown (the WHOLE workout closed)

    /// Disconnect both devices and forget the live sources — called once, from the
    /// workout container's teardown, so a lingering belt/strap can't drain the battery
    /// after the athlete leaves. Idempotent. Deliberately NOT called when the HUD alone
    /// is dismissed (the connection is session-scoped, not screen-scoped).
    func stopAll() {
        onSample = nil
        onBpm = nil
        onControlCapability = nil
        onMachineEvent = nil
        onControlResult = nil
        treadmill.stop()
        heartRate.stop()
        bleBpm = nil
        hrBatteryPercent = nil
        treadmillControllable = nil
        treadmillControl = .none
    }

    // MARK: - Source construction (real on device, mock in the simulator)

    private static func makeTreadmill() -> TreadmillDataSource {
        #if targetEnvironment(simulator)
        return MockTreadmillSource()
        #else
        return FTMSTreadmillSource()
        #endif
    }

    private static func makeHR() -> HeartRateSource {
        #if targetEnvironment(simulator)
        return MockHeartRateSource()
        #else
        return BLEHeartRateSource()
        #endif
    }
}
