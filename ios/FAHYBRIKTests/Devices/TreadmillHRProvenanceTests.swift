import XCTest
@testable import FAHYBRIK

// The treadmill HUD must label HR by WHO is actually recording (the engine's
// hrSource), not merely by which channel is connected — so it never says "reloj"
// while the strap records, or "banda" while the watch does. It also still reads the
// hub's published strap bpm for its live readout (the strap→engine wiring moved to
// ActiveWorkoutView; the HUD only displays).
final class TreadmillHRProvenanceTests: XCTestCase {

    // MARK: - Injected source doubles (no CoreBluetooth)

    final class FakeTreadmill: TreadmillDataSource {
        var onSample: ((TreadmillSample) -> Void)?
        var onLink: ((DeviceLink) -> Void)?
        var onDiscovered: (([DeviceCandidate]) -> Void)?
        var onBluetooth: ((BluetoothAvailability) -> Void)?
        func startScan() {}
        func connect(_ id: DeviceID) {}
        func connectRemembered(_ id: DeviceID) {}
        func disconnect() {}
        func stop() {}
        func diagnosticsText() -> String? { nil }
    }
    final class FakeHR: HeartRateSource {
        var onBpm: ((Int) -> Void)?
        var onLink: ((DeviceLink) -> Void)?
        var onDiscovered: (([DeviceCandidate]) -> Void)?
        var onBluetooth: ((BluetoothAvailability) -> Void)?
        func startScan() {}
        func connect(_ id: DeviceID) {}
        func connectRemembered(_ id: DeviceID) {}
        func disconnect() {}
        func stop() {}
        func diagnosticsText() -> String? { nil }
    }

    /// A model over injected fakes. No `start()` needed — the fakes are wired to the
    /// throwaway hub at construction, so we can drive link + bpm directly.
    private func makeModel() -> (TreadmillHUDModel, FakeHR, WorkoutSession) {
        let s = WorkoutSession(plan: .minimal(title: "Test"))
        let hr = FakeHR()
        let model = TreadmillHUDModel(session: s, hrMaxSource: nil,
                                      treadmill: FakeTreadmill(), hr: hr)
        return (model, hr, s)
    }

    func testEffectiveLinkLabelsByEngineProvenance() {
        let (model, hr, s) = makeModel()
        hr.onLink?(.connected(name: "Polar H10"))     // strap channel live

        s.hrSource = .strap                            // strap records → its real name
        XCTAssertEqual(model.effectiveHRLink.deviceName, "Polar H10")

        s.hrSource = .healthkit                        // watch records → "reloj" (never "banda")
        XCTAssertEqual(model.effectiveHRLink.deviceName, "reloj")

        s.hrSource = .pm5                              // PM5-paired strap → "remo"
        XCTAssertEqual(model.effectiveHRLink.deviceName, "remo")
    }

    func testStrapProvenanceWithoutLiveChannelFallsToBandLabel() {
        let (model, _, s) = makeModel()
        s.hrSource = .strap                            // owns HR, channel not yet live
        XCTAssertEqual(model.effectiveHRLink.deviceName, "banda")
    }

    func testNoEngineProvenanceFallsToChannelState() {
        let (model, hr, s) = makeModel()
        XCTAssertNil(s.hrSource)
        XCTAssertFalse(model.effectiveHRLink.isLive)   // idle channel + no engine HR
        hr.onLink?(.connected(name: "Polar H10"))      // channel live, engine not yet fed
        XCTAssertEqual(model.effectiveHRLink.deviceName, "Polar H10")
    }

    func testHubStrapBpmFeedsCurrentBpmWhenChannelLive() {
        let (model, hr, _) = makeModel()
        hr.onLink?(.connected(name: "Polar H10"))      // hrLink.isLive
        hr.onBpm?(147)                                 // → hub.bleBpm = 147 (published)
        XCTAssertEqual(model.bleBpm, 147)
        XCTAssertEqual(model.currentBpm, 147)
    }
}
