import XCTest
@testable import FAHYBRIK

// The DeviceChannel connection coordinator: it turns a scan into the right action
// (auto-connect the remembered device, or present the picker), remembers what the
// athlete chose, and disconnects. Driven here with a fake source + an in-memory
// UserDefaults + the channel's own decision hooks — no CoreBluetooth, no real timers.
final class DeviceChannelTests: XCTestCase {

    // MARK: - Fake source (records what the channel asked for)

    final class FakeConnectable: ConnectableSource {
        var onLink: ((DeviceLink) -> Void)?
        var onDiscovered: (([DeviceCandidate]) -> Void)?
        var onBluetooth: ((BluetoothAvailability) -> Void)?

        private(set) var scanStarted = 0
        private(set) var connectedID: DeviceID?
        private(set) var rememberedAttemptID: DeviceID?
        private(set) var disconnectCount = 0
        private(set) var stopCount = 0

        func startScan() { scanStarted += 1 }
        func connect(_ id: DeviceID) { connectedID = id }
        func connectRemembered(_ id: DeviceID) { rememberedAttemptID = id }
        func disconnect() { disconnectCount += 1 }
        func stop() { stopCount += 1 }
        func diagnosticsText() -> String? { nil }

        // Simulate the source's own callbacks:
        func discover(_ c: [DeviceCandidate]) { onDiscovered?(c) }
        func land(name: String) { onLink?(.connected(name: name)) }
    }

    // MARK: - Fixtures

    private func id(_ tail: UInt8) -> DeviceID {
        UUID(uuidString: "00000000-0000-0000-0000-0000000000\(String(format: "%02X", tail))")!
    }
    private func cand(_ tail: UInt8, rssi: Int = -50) -> DeviceCandidate {
        DeviceCandidate(id: id(tail), name: "Dev \(tail)", rssi: rssi)
    }

    private func makeChannel(remembered: DeviceID? = nil, name: String = "Belt")
        -> (channel: DeviceChannel, source: FakeConnectable, store: RememberedDeviceStore) {
        let suite = "test.device.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        let store = RememberedDeviceStore(idKey: "id", nameKey: "name", defaults: defaults)
        if let r = remembered { store.remember(r, name: name) }
        let fake = FakeConnectable()
        let channel = DeviceChannel(title: "Cinta", icon: "figure.run",
                                    remembered: store, makeSource: { fake })
        return (channel, fake, store)
    }

    // MARK: - un-solo-y-recordado → auto

    func testSingleRememberedAutoConnectsWithoutPicker() {
        let mine = cand(1)
        let (ch, src, _) = makeChannel(remembered: mine.id)
        ch.beginConnect(autoPresentPicker: true)
        XCTAssertEqual(src.rememberedAttemptID, mine.id)   // tried directly by id
        src.discover([mine])                               // the scan turns up only it
        XCTAssertEqual(src.connectedID, mine.id)           // → auto-connected
        XCTAssertFalse(ch.isPresentingPicker)              // no list needed
    }

    // MARK: - varios → lista

    func testMultipleAlwaysPresentsList() {
        let mine = cand(1, rssi: -70)
        let other = cand(2, rssi: -40)
        let (ch, src, _) = makeChannel(remembered: mine.id)
        ch.beginConnect(autoPresentPicker: true)
        src.discover([mine, other])
        XCTAssertNil(src.connectedID)                      // did NOT auto-connect
        XCTAssertFalse(ch.isPresentingPicker)              // ...not before settle
        ch.settleWindowElapsed()
        XCTAssertTrue(ch.isPresentingPicker)               // list presented
        XCTAssertEqual(ch.candidates.map(\.id), [other.id, mine.id])  // strongest first
        XCTAssertNil(src.connectedID)
    }

    // MARK: - recordado-ausente → lista tras timeout

    func testRememberedAbsentPresentsListAfterFallback() {
        let mine = cand(1)
        let stranger = cand(9)
        let (ch, src, _) = makeChannel(remembered: mine.id)
        ch.beginConnect(autoPresentPicker: true)
        src.discover([stranger])                           // only a stranger showed up
        XCTAssertNil(src.connectedID)
        XCTAssertFalse(ch.isPresentingPicker)
        ch.rememberedFallbackElapsed()                     // 5s passed, remembered never came
        XCTAssertTrue(ch.isPresentingPicker)
        XCTAssertEqual(ch.candidates.map(\.id), [stranger.id])
        XCTAssertNil(src.connectedID)                      // never auto-connected the stranger
    }

    // MARK: - The gym bug: a single UNKNOWN device is never grabbed

    func testSingleUnknownIsNeverAutoConnected() {
        let unknown = cand(7)
        let (ch, src, _) = makeChannel(remembered: nil)
        ch.beginConnect(autoPresentPicker: true)
        src.discover([unknown])
        ch.settleWindowElapsed()
        XCTAssertNil(src.connectedID)                      // NOT connected blindly
        XCTAssertTrue(ch.isPresentingPicker)               // athlete must choose
    }

    // MARK: - Silent HUD path: nothing remembered → idle, no scan, no picker

    func testSilentPathWithNothingRememberedRestsIdle() {
        let (ch, src, _) = makeChannel(remembered: nil)
        ch.beginConnect(autoPresentPicker: false)
        XCTAssertEqual(src.scanStarted, 0)                 // no blind scan
        XCTAssertFalse(ch.isPresentingPicker)
        XCTAssertFalse(ch.isConnected)
    }

    // MARK: - Silent HUD path: remembered absent → stop scan + idle (HUD prompts choose)

    func testSilentPathRememberedAbsentStopsAndIdles() {
        let mine = cand(1)
        let stranger = cand(9)
        let (ch, src, _) = makeChannel(remembered: mine.id)
        ch.beginConnect(autoPresentPicker: false)
        XCTAssertEqual(src.rememberedAttemptID, mine.id)
        src.discover([stranger])
        ch.rememberedFallbackElapsed()
        XCTAssertFalse(ch.isPresentingPicker)              // silent → no sheet
        XCTAssertGreaterThan(src.stopCount, 0)             // stopped the pointless scan
        XCTAssertNil(src.connectedID)
    }

    // MARK: - Picking + remembering

    func testPickingConnectsAndRemembers() {
        let other = cand(2)
        let (ch, src, store) = makeChannel(remembered: nil)
        ch.beginConnect(autoPresentPicker: true)
        src.discover([other])
        ch.settleWindowElapsed()
        XCTAssertTrue(ch.isPresentingPicker)

        ch.connect(other.id)                               // athlete taps the row
        XCTAssertEqual(src.connectedID, other.id)
        XCTAssertFalse(ch.isPresentingPicker)              // sheet dismisses on pick

        src.land(name: "Titanium T1")                      // the source reports streaming
        XCTAssertTrue(ch.isConnected)
        XCTAssertEqual(ch.connectedName, "Titanium T1")
        XCTAssertEqual(store.id, other.id)                 // remembered by identifier
        XCTAssertEqual(store.name, "Titanium T1")          // ...and by real name
    }

    // MARK: - Disconnect

    func testDisconnectCutsAndKeepsRemembered() {
        let mine = cand(1)
        let (ch, src, store) = makeChannel(remembered: mine.id)
        ch.beginConnect(autoPresentPicker: true)
        src.discover([mine])
        src.land(name: "Belt")
        XCTAssertTrue(ch.isConnected)

        ch.disconnect()
        XCTAssertEqual(src.disconnectCount, 1)
        XCTAssertFalse(ch.isPresentingPicker)
        XCTAssertTrue(store.has)                            // disconnect keeps the memory
    }

    func testForgetClearsMemory() {
        let mine = cand(1)
        let (ch, src, store) = makeChannel(remembered: mine.id)
        ch.beginConnect(autoPresentPicker: true)
        src.discover([mine])
        src.land(name: "Belt")
        ch.forget()
        XCTAssertFalse(store.has)                           // forget wipes it
        XCTAssertEqual(src.disconnectCount, 1)             // and disconnects
    }

    // MARK: - Sheet dismiss must not abort an in-flight pick

    func testDismissRightAfterPickDoesNotAbortConnection() {
        let other = cand(2)
        let (ch, src, _) = makeChannel(remembered: nil)
        ch.beginConnect(autoPresentPicker: true)
        src.discover([other])
        ch.settleWindowElapsed()
        ch.connect(other.id)                     // athlete taps a row
        XCTAssertEqual(src.connectedID, other.id)
        ch.cancelConnect()                       // the sheet's onDisappear fires immediately after
        XCTAssertEqual(src.stopCount, 0)         // connection NOT torn down
        src.land(name: "Belt")
        XCTAssertTrue(ch.isConnected)
    }

    func testDismissWhileBrowsingStopsScan() {
        let a = cand(1), b = cand(2)
        let (ch, src, _) = makeChannel(remembered: nil)
        ch.beginConnect(autoPresentPicker: true)
        src.discover([a, b])
        ch.settleWindowElapsed()
        XCTAssertTrue(ch.isPresentingPicker)
        ch.cancelConnect()                       // dismissed without choosing
        XCTAssertGreaterThan(src.stopCount, 0)   // scan stopped (battery)
        XCTAssertNil(src.connectedID)
    }

    // MARK: - Idempotent re-entry

    func testReentryWhileBusyIsNoOp() {
        let mine = cand(1)
        let (ch, src, _) = makeChannel(remembered: mine.id)
        ch.beginConnect(autoPresentPicker: true)
        let scans = src.scanStarted
        ch.beginConnect(autoPresentPicker: true)           // second tap while connecting
        XCTAssertEqual(src.scanStarted, scans)             // no restart
    }
}
