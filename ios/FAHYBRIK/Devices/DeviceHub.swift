import Foundation
import Observation

// Session-scoped owner of the two BLE fitness devices the live workout streams
// from — the FTMS treadmill and the standard BLE heart-rate strap. A SINGLETON so
// the exact connection the athlete makes in the pre-workout brief SURVIVES into the
// active workout and its treadmill HUD (Zwift/KinoMap standard: connect, then run).
// It mirrors `PM5ConnectionStore.shared`, which already owns the Concept2 erg this
// same way — so the three connectable devices (cinta, banda, remo) live in one
// shared device layer with one lifecycle.
//
// WHY A HUB (and not the old model-owned sources): `TreadmillHUDModel` used to
// create + start + stop the sources itself, tied to the treadmill cover's
// appear/disappear. That made "connected" impossible before the cover opened (mid-
// workout) and dropped the link every time the cover was dismissed. The hub lifts
// the sources ABOVE any single screen: the brief and the HUD share ONE instance.
//
// LIFECYCLE: sources are created LAZILY on first connect (so CoreBluetooth's power
// alert only appears when the athlete opts in, never at launch) and torn down by
// `stopAll()` when the WHOLE workout closes (`WorkoutContainer.onDisappear`) —
// never when a sub-screen like the treadmill HUD is merely dismissed. Dismissing
// the HUD only UNSUBSCRIBES its model (see `TreadmillHUDModel.teardown`); the belt
// stays live so re-opening the HUD is instant and mid-run.
@Observable
final class DeviceHub {
    /// The one shared instance the brief, the active workout and the treadmill HUD
    /// all talk to. Tests build their own throwaway hubs with injected fakes.
    static let shared = DeviceHub()

    /// Live link state for the brief chips + the HUD header. `.idle` until the
    /// athlete taps to connect; driven by the sources' own callbacks.
    private(set) var treadmillLink: DeviceLink = .idle
    private(set) var hrLink: DeviceLink = .idle
    /// Latest BLE-strap bpm, or nil if none yet. The active model reads it via the
    /// `onBpm` forward; kept here too so the brief can show a live pulse once linked.
    private(set) var bleBpm: Int?

    /// The active treadmill model subscribes here for RAW telemetry so its per-leg
    /// accumulation + auto-advance run exactly as before. Nil while no live HUD is
    /// consuming (the belt may still be connected — just nothing reading it).
    var onSample: ((TreadmillSample) -> Void)?
    var onBpm: ((Int) -> Void)?

    private var treadmill: TreadmillDataSource?
    private var hr: HeartRateSource?
    private let injectedTreadmill: TreadmillDataSource?
    private let injectedHR: HeartRateSource?

    /// `shared` passes nil → real BLE on device / deterministic mocks in the
    /// simulator, both created lazily. Tests inject fakes they drive directly.
    init(treadmill: TreadmillDataSource? = nil, hr: HeartRateSource? = nil) {
        self.injectedTreadmill = treadmill
        self.injectedHR = hr
    }

    var treadmillConnected: Bool { treadmillLink.isLive }
    var hrConnected: Bool { hrLink.isLive }

    // MARK: - Connect (idempotent — a re-tap while busy is a no-op)

    /// Start (or retry) scanning for the treadmill. No-op while already
    /// scanning/connecting/connected so a second tap never restarts a live link
    /// (which would flash the chip back to "buscando").
    func connectTreadmill() {
        guard !isBusy(treadmillLink) else { return }
        ensureTreadmill().start()
    }

    /// Start (or retry) scanning for the BLE heart-rate strap. Same idempotency.
    func connectHR() {
        guard !isBusy(hrLink) else { return }
        ensureHR().start()
    }

    /// True while a link is live or in flight — retry is allowed only from a
    /// resting/failed state (idle / unavailable / failed).
    private func isBusy(_ link: DeviceLink) -> Bool {
        switch link {
        case .connected, .connecting, .scanning, .reconnecting: return true
        case .idle, .unavailable, .failed: return false
        }
    }

    private func ensureTreadmill() -> TreadmillDataSource {
        if let treadmill { return treadmill }
        let src = injectedTreadmill ?? Self.makeTreadmill()
        src.onLink = { [weak self] in self?.treadmillLink = $0 }
        src.onSample = { [weak self] in self?.onSample?($0) }
        treadmill = src
        return src
    }

    private func ensureHR() -> HeartRateSource {
        if let hr { return hr }
        let src = injectedHR ?? Self.makeHR()
        src.onLink = { [weak self] in self?.hrLink = $0 }
        src.onBpm = { [weak self] in self?.handleBpm($0) }
        hr = src
        return src
    }

    private func handleBpm(_ bpm: Int) {
        bleBpm = bpm
        onBpm?(bpm)
    }

    /// A shareable dump of what the treadmill advertised — the first-connection
    /// tool for identifying a non-standard machine (surfaced by the HUD).
    func treadmillDiagnostics() -> String? { treadmill?.diagnosticsText() }

    // MARK: - Teardown (the WHOLE workout closed)

    /// Disconnect both devices and forget the sources — called once, from the
    /// workout container's teardown, so a lingering belt/strap can't drain the
    /// battery after the athlete leaves. Idempotent and safe when nothing is
    /// connected. Deliberately NOT called when the treadmill HUD alone is
    /// dismissed (the connection is session-scoped, not screen-scoped).
    func stopAll() {
        onSample = nil
        onBpm = nil
        treadmill?.stop()
        hr?.stop()
        treadmill = nil
        hr = nil
        treadmillLink = .idle
        hrLink = .idle
        bleBpm = nil
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
