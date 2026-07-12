import Foundation

// Deterministic fake devices so the whole HUD is visible in the iOS simulator,
// which has NO Bluetooth. The PROFILES are pure (a value per tick) so tests can
// assert the ramp without a timer; the SOURCE classes are thin Timer wrappers
// gated to the simulator so a real device never mistakes them for a treadmill.

/// A believable treadmill session: an 8→13 km/h warm-up ramp then a steady hold,
/// a small incline step, distance integrated from speed, its own elapsed clock.
enum MockTreadmillProfile {
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
    static func bpm(tick: Int) -> Int {
        min(168, 96 + max(0, tick) * 3)   // 96 → 168 over ~24 ticks, then steady
    }
}

#if targetEnvironment(simulator)
final class MockTreadmillSource: TreadmillDataSource {
    var onSample: ((TreadmillSample) -> Void)?
    var onLink: ((DeviceLink) -> Void)?
    private var timer: Timer?
    private var tick = 0

    func start() {
        onLink?(.connecting)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            guard let self else { return }
            self.onLink?(.connected(name: "Cinta (demo)"))
            self.timer = Timer.scheduledTimer(withTimeInterval: TreadmillConstants.mockTickSeconds,
                                              repeats: true) { [weak self] _ in
                guard let self else { return }
                self.onSample?(MockTreadmillProfile.sample(tick: self.tick))
                self.tick += 1
            }
        }
    }

    func stop() { timer?.invalidate(); timer = nil; onLink?(.idle) }
    func diagnosticsText() -> String? { "Simulador — cinta de demostración (sin Bluetooth real)." }
}

final class MockHeartRateSource: HeartRateSource {
    var onBpm: ((Int) -> Void)?
    var onLink: ((DeviceLink) -> Void)?
    private var timer: Timer?
    private var tick = 0

    func start() {
        onLink?(.connecting)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            guard let self else { return }
            self.onLink?(.connected(name: "Banda (demo)"))
            self.timer = Timer.scheduledTimer(withTimeInterval: TreadmillConstants.mockTickSeconds,
                                              repeats: true) { [weak self] _ in
                guard let self else { return }
                self.onBpm?(MockHRProfile.bpm(tick: self.tick))
                self.tick += 1
            }
        }
    }

    func stop() { timer?.invalidate(); timer = nil; onLink?(.idle) }
    func diagnosticsText() -> String? { "Simulador — banda de pulso de demostración." }
}
#endif
