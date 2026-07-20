import XCTest
@testable import FAHYBRIK

// The hub forwards a strap's Battery Level callback into its published
// `hrBatteryPercent` (the picker reads it), clamps a malformed byte to 0–100, and
// clears it when the whole workout tears down. Driven with an injected fake HR
// source — no CoreBluetooth.
final class DeviceHubBatteryTests: XCTestCase {

    /// Minimal HR source: the hub wires `onBattery` on it during init (via the
    /// channel's `onSourceCreated`), so a test just fires the callback.
    final class FakeHR: HeartRateSource {
        var onBpm: ((Int) -> Void)?
        var onBattery: ((Int) -> Void)?
        var onLink: ((DeviceLink) -> Void)?
        var onDiscovered: (([DeviceCandidate]) -> Void)?
        var onBluetooth: ((BluetoothAvailability) -> Void)?
        func startScan() {}
        func connect(_ id: DeviceID) {}
        func disconnect() {}
        func stop() {}
        func diagnosticsText() -> String? { nil }
    }

    func testStrapBatteryPublishesToHub() {
        let fake = FakeHR()
        let hub = DeviceHub(hr: fake)
        XCTAssertNil(hub.hrBatteryPercent)          // nothing until the strap reports
        fake.onBattery?(77)
        XCTAssertEqual(hub.hrBatteryPercent, 77)
    }

    func testMalformedBatteryByteIsClampedToHundred() {
        let fake = FakeHR()
        let hub = DeviceHub(hr: fake)
        fake.onBattery?(200)                        // a bad packet must never show 200 %
        XCTAssertEqual(hub.hrBatteryPercent, 100)
    }

    func testStopAllClearsBattery() {
        let fake = FakeHR()
        let hub = DeviceHub(hr: fake)
        fake.onBattery?(64)
        XCTAssertEqual(hub.hrBatteryPercent, 64)
        hub.stopAll()
        XCTAssertNil(hub.hrBatteryPercent)          // cleared at workout teardown
    }
}
