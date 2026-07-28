import Foundation

// Deterministic fake devices so the whole connect → pick → stream flow is visible in
// the iOS simulator, which has NO Bluetooth. The PROFILES are pure (a value per tick)
// so tests can assert the ramp without a timer; the SOURCE classes are thin Timer
// wrappers gated to the simulator so a real device never mistakes them for hardware.
//
// Each fake advertises ONE candidate with a STABLE identifier — so the first session
// surfaces the picker (demonstrating the new selection UX), the athlete picks it, and
// every later session fast-paths straight to that remembered "machine".

/// A believable treadmill session: an 8→13 km/h warm-up ramp then a steady hold,
/// a small incline step, distance integrated from speed, its own elapsed clock.
enum MockTreadmillProfile {
    /// Stable identifier for the single simulated belt (so "remember last used" works).
    static let deviceID = UUID(uuidString: "00000000-0000-0000-0000-0000CADE0001")!
    static let deviceName = "Cinta (demo)"

    static func speedKmh(tick: Int) -> Double {
        8.0 + min(Double(max(0, tick)), 10) * 0.5   // 8 → 13 over 10 ticks, then steady
    }
    static func inclinePct(tick: Int) -> Double { tick < 10 ? 1.0 : 2.0 }

    static func totalDistanceM(tick: Int) -> Double {
        let dt = TreadmillConstants.mockTickSeconds
        var d = 0.0
        for k in 0...max(0, tick) { d += (speedKmh(tick: k) / 3.6) * dt }
        return d
    }

    static func sample(tick: Int) -> TreadmillSample {
        TreadmillSample(
            speedKmh: speedKmh(tick: tick),
            inclinePct: inclinePct(tick: tick),
            totalDistanceM: totalDistanceM(tick: tick),
            elapsedS: Int(Double(max(0, tick)) * TreadmillConstants.mockTickSeconds),
            hrBpm: nil,
            lastUpdate: Date()
        )
    }
}

/// A believable HR response that rises with the effort and settles.
enum MockHRProfile {
    static let deviceID = UUID(uuidString: "00000000-0000-0000-0000-00000BEA7001")!
    static let deviceName = "Banda (demo)"

    static func bpm(tick: Int) -> Int {
        min(168, 96 + max(0, tick) * 3)   // 96 → 168 over ~24 ticks, then steady
    }
}

#if targetEnvironment(simulator)
/// Simulator belt that ALSO speaks the control seam, so the whole drive-the-belt UX
/// (steppers, 3·2·1 start, STOP, and the app↔belt sync) is exercisable with no
/// hardware. It starts STOPPED and reports full control; the hero speed visibly ramps
/// toward whatever target the app sets, mirroring a real machine's response.
final class MockTreadmillSource: TreadmillDataSource, TreadmillControllable {
    var onSample: ((TreadmillSample) -> Void)?
    var onLink: ((DeviceLink) -> Void)?
    var onDiscovered: (([DeviceCandidate]) -> Void)?
    var onBluetooth: ((BluetoothAvailability) -> Void)?
    var onControlCapability: ((TreadmillControlCapability) -> Void)?
    var onMachineEvent: ((TreadmillMachineEvent) -> Void)?
    var onControlResult: ((TreadmillControlResult) -> Void)?

    private var timer: Timer?
    private var tick = 0
    private var targetSpeed = 0.0
    private var actualSpeed = 0.0
    private var incline = 1.0
    private var distanceM = 0.0

    /// A Titanium-like range so the steppers behave as they would on a real belt. It
    /// DECLARES both targets — the fully obedient machine we don't have in a gym yet — so
    /// flipping `TreadmillControlPolicy.appDrivesMachines` brings the whole control surface
    /// back in the simulator with no other change.
    private let capability = TreadmillControlCapability(
        hasControlPoint: true, canControlSpeed: true, canControlIncline: true,
        declaresSpeedTarget: true, declaresInclineTarget: true,
        speed: FTMSControl.Range(min: 0.8, max: 25, step: 0.5),
        incline: FTMSControl.Range(min: 0, max: 15, step: 0.5))

    func startScan() {
        onBluetooth?(.poweredOn)
        onLink?(.scanning)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.onDiscovered?([DeviceCandidate(id: MockTreadmillProfile.deviceID,
                                                 name: MockTreadmillProfile.deviceName, rssi: -48)])
        }
    }

    func connect(_ id: DeviceID) { beginStream() }

    private func beginStream() {
        onLink?(.connecting)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            guard let self else { return }
            self.onLink?(.connected(name: MockTreadmillProfile.deviceName))
            self.onControlCapability?(self.capability)
            self.timer = Timer.scheduledTimer(withTimeInterval: TreadmillConstants.mockTickSeconds,
                                              repeats: true) { [weak self] _ in self?.emit() }
        }
    }

    /// Ramp actual toward target (≤0.8 km/h per tick) and stream it — so the hero speed
    /// chases the target the app set instead of jumping, exactly like a real belt.
    private func emit() {
        let delta = targetSpeed - actualSpeed
        actualSpeed = max(0, actualSpeed + max(-0.8, min(0.8, delta)))
        if actualSpeed > 0 { distanceM += actualSpeed / 3.6 * TreadmillConstants.mockTickSeconds }
        onSample?(TreadmillSample(speedKmh: actualSpeed, inclinePct: incline, totalDistanceM: distanceM,
                                  elapsedS: Int(Double(tick) * TreadmillConstants.mockTickSeconds),
                                  hrBpm: nil, lastUpdate: Date()))
        tick += 1
    }

    func send(_ command: TreadmillControlCommand) {
        switch command {
        case .requestControl, .reset:
            onControlResult?(.success)
        case .start:
            if targetSpeed < 1 { targetSpeed = 4.0 }         // gentle start
            onMachineEvent?(.startedByUser); onControlResult?(.success)
        case .stop:
            targetSpeed = 0; onMachineEvent?(.stoppedByUser); onControlResult?(.success)
        case .pause:
            targetSpeed = 0; onMachineEvent?(.pausedByUser); onControlResult?(.success)
        case .setTargetSpeedKmh(let v):
            targetSpeed = v; onControlResult?(.success)
        case .setTargetInclinePct(let v), .setTargetInclineLevel(let v):
            incline = v; onControlResult?(.success)
        case .setTargetedDistanceM(let m):
            // Mirror a machine that accepts the programmed piece onto its own display.
            onMachineEvent?(.targetedDistanceChangedM(m)); onControlResult?(.success)
        case .setTargetedTrainingTimeS(let s):
            onMachineEvent?(.targetedTrainingTimeChangedS(s)); onControlResult?(.success)
        }
    }

    func disconnect() { timer?.invalidate(); timer = nil; onLink?(.idle) }
    func stop() { timer?.invalidate(); timer = nil; onLink?(.idle) }
    func diagnosticsText() -> String? { "Simulador — cinta de demostración con control (sin Bluetooth real)." }
}

final class MockHeartRateSource: HeartRateSource {
    var onBpm: ((Int) -> Void)?
    var onBattery: ((Int) -> Void)?
    var onLink: ((DeviceLink) -> Void)?
    var onDiscovered: (([DeviceCandidate]) -> Void)?
    var onBluetooth: ((BluetoothAvailability) -> Void)?
    private var timer: Timer?
    private var tick = 0

    func startScan() {
        onBluetooth?(.poweredOn)
        onLink?(.scanning)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.onDiscovered?([DeviceCandidate(id: MockHRProfile.deviceID,
                                                 name: MockHRProfile.deviceName, rssi: -52)])
        }
    }

    func connect(_ id: DeviceID) { beginStream() }

    private func beginStream() {
        onLink?(.connecting)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            guard let self else { return }
            self.onLink?(.connected(name: MockHRProfile.deviceName))
            self.onBattery?(85)   // fixed charge so the simulator shows the battery pill
            self.timer = Timer.scheduledTimer(withTimeInterval: TreadmillConstants.mockTickSeconds,
                                              repeats: true) { [weak self] _ in
                guard let self else { return }
                self.onBpm?(MockHRProfile.bpm(tick: self.tick))
                self.tick += 1
            }
        }
    }

    func disconnect() { timer?.invalidate(); timer = nil; onLink?(.idle) }
    func stop() { timer?.invalidate(); timer = nil; onLink?(.idle) }
    func diagnosticsText() -> String? { "Simulador — banda de pulso de demostración." }
}
#endif
