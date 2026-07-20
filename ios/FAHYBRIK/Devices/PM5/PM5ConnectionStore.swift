import Foundation
import Observation
import SwiftUI

// SwiftUI-facing observable. Owns the PM5Service delegate role, surfaces
// pairing state, last sample, and exposes an injection seam (`feed(_:)`)
// used by both the simulator mock and unit tests. ActiveWorkoutView reads
// `live` and feeds power/SPM/distance/calories into the existing data grid.
@Observable
final class PM5ConnectionStore: NSObject {
    static let shared = PM5ConnectionStore()

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

    private let service: PM5Service
    private var mockTimer: Timer?
    private var mockTick: Int = 0

    var rememberedDeviceName: String? {
        UserDefaults.standard.string(forKey: PM5Defaults.lastPairedName)
    }

    var hasRememberedDevice: Bool {
        UserDefaults.standard.string(forKey: PM5Defaults.lastPairedIdentifier) != nil
    }

    var isConnected: Bool {
        if case .streaming = connectionState { return true }
        return false
    }

    override init() {
        self.service = PM5Service.shared
        super.init()
        self.service.delegate = self
        self.bluetoothState = service.bluetoothState
        self.connectionState = service.connectionState
    }

    // MARK: - intent
    func startScan() {
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

    func connect(_ id: UUID) {
        #if targetEnvironment(simulator)
        startMockStream()
        #else
        lastError = nil
        service.connect(id)
        #endif
    }

    func disconnect() {
        #if targetEnvironment(simulator)
        stopMockStream()
        connectionState = .idle
        connectedDeviceName = nil
        connectedIdentifier = nil
        #else
        service.disconnect()
        #endif
    }

    /// "Cambiar de erg": drop the current erg and connect the tapped one — one tap,
    /// no manual disconnect first (the remembered rower must never trap the athlete
    /// away from the SKI next to it).
    func switchTo(_ id: UUID) {
        #if targetEnvironment(simulator)
        startMockStream()
        #else
        lastError = nil
        service.switchToDevice(id)
        #endif
    }

    func forgetPaired() {
        #if targetEnvironment(simulator)
        stopMockStream()
        UserDefaults.standard.removeObject(forKey: PM5Defaults.lastPairedIdentifier)
        UserDefaults.standard.removeObject(forKey: PM5Defaults.lastPairedName)
        connectionState = .idle
        connectedDeviceName = nil
        connectedIdentifier = nil
        #else
        service.forgetPaired()
        #endif
    }

    func reconnectIfPossible() {
        #if targetEnvironment(simulator)
        startMockStream()
        #else
        service.reconnectLastPaired()
        #endif
    }

    /// Clear the captured splits. Called by the active-workout view when a NEW erg
    /// segment starts, so each piece's interval table starts clean (the monitor's
    /// interval numbers can otherwise carry over between pieces in one session).
    func resetSplits() {
        splits = []
    }

    // MARK: - simulator mock
    // Simulator has no real BLE — synthesize a plausible row stream so the
    // UI can be exercised end-to-end without the physical erg.
    private func startMockStream() {
        guard mockTimer == nil else { return }
        mockTick = 0
        live = PM5LiveSample()
        splits = []
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
    }
}

extension PM5ConnectionStore: PM5ServiceDelegate {
    func pm5Service(_ service: PM5Service, didChangeBluetoothState state: PM5BluetoothState) {
        self.bluetoothState = state
    }

    func pm5Service(_ service: PM5Service, didUpdateDiscovered devices: [PM5Discovered]) {
        self.discovered = devices
    }

    func pm5Service(_ service: PM5Service, didChangeConnection state: PM5ConnectionState) {
        self.connectionState = state
        if case .failed(let msg) = state { self.lastError = msg }
    }

    func pm5Service(_ service: PM5Service, didConnect deviceName: String, identifier: UUID) {
        self.connectedDeviceName = deviceName
        self.connectedIdentifier = identifier
        self.lastError = nil
    }

    func pm5Service(_ service: PM5Service, didReceiveSample sample: PM5LiveSample) {
        self.live = sample
    }

    func pm5Service(_ service: PM5Service, didUpdateSplits splits: [PM5Split]) {
        self.splits = splits
    }

    func pm5Service(_ service: PM5Service, didDisconnect error: Error?) {
        self.connectedDeviceName = nil
        self.connectedIdentifier = nil
        if let error { self.lastError = error.localizedDescription }
    }
}
