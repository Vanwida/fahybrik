import XCTest
@testable import FAHYBRIK

// A guard on the SOURCE TEXT of the device layer.
//
// WHY A TEST THAT READS SOURCE. The behavioural tests cover everything reachable
// without a radio: `ScanDecisionEngine`, `DeviceChannel`, the fake-source paths. They
// cannot reach the two places auto-connect actually lived and did the damage — the
// `CBCentralManagerDelegate` callbacks in `FTMSTreadmillSource` / `BLEHeartRateSource`
// (which called `central.connect(peripheral)` again on every unexpected drop) and
// `PM5Service.reconnectLastPaired()`. Exercising those needs real CoreBluetooth and a
// real machine in the room, which a unit test will never have.
//
// So this reads the files and fails if the deleted APIs, or a reconnect inside a
// disconnect/failure callback, ever come back. It is blunt on purpose: the rule it
// protects is "NOTHING EVER CONNECTS AUTOMATICALLY", and the cost of a regression is a
// treadmill moving under somebody who did not ask for it.
final class NoAutoConnectSourceGuardTests: XCTestCase {

    /// The device layer's sources, located relative to THIS file (baked in at compile
    /// time, so it follows the checkout).
    private var deviceDirectory: URL {
        URL(fileURLWithPath: #filePath)             // …/FAHYBRIKTests/Devices/<this>.swift
            .deletingLastPathComponent()            // …/FAHYBRIKTests/Devices
            .deletingLastPathComponent()            // …/FAHYBRIKTests
            .deletingLastPathComponent()            // …/ios
            .appendingPathComponent("FAHYBRIK/Devices")
    }

    private func swiftSources() throws -> [(name: String, text: String)] {
        let fm = FileManager.default
        try XCTSkipUnless(fm.fileExists(atPath: deviceDirectory.path),
                          "sources not present in this run — behavioural tests still cover the rule")
        guard let walker = fm.enumerator(at: deviceDirectory,
                                         includingPropertiesForKeys: nil) else { return [] }
        var out: [(String, String)] = []
        for case let url as URL in walker where url.pathExtension == "swift" {
            out.append((url.lastPathComponent, try String(contentsOf: url, encoding: .utf8)))
        }
        XCTAssertFalse(out.isEmpty, "found no device sources to check — the guard would pass vacuously")
        return out
    }

    /// Source with comments stripped, so the prose EXPLAINING why these APIs are gone
    /// (which necessarily names them) doesn't trip the guard.
    private func code(_ text: String) -> String {
        text.split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> Substring in
                guard let slashes = line.range(of: "//") else { return line }
                return line[line.startIndex..<slashes.lowerBound]
            }
            .joined(separator: "\n")
    }

    /// The deleted entry points. Each one existed to reach a device by remembered
    /// identifier, with no list and no tap — and each was wired to a lifecycle hook.
    func testDeletedAutoConnectAPIsNeverComeBack() throws {
        let banned = [
            "connectRemembered",     // channel → source fast path, by identifier
            "reconnectLastPaired",   // PM5Service, straight to the last paired erg
            "reconnectIfPossible",   // PM5 store, called from four lifecycle hooks
            "beginSilentReconnect",  // channel, called from onAppear
            "autoConnect",           // the ScanDecision case that skipped the picker
            "autoReconnect",
        ]
        for (name, text) in try swiftSources() {
            let source = code(text)
            for symbol in banned {
                XCTAssertFalse(source.contains(symbol),
                               "\(name) reintroduces `\(symbol)`. Nothing may connect without an explicit tap — see DeviceConnection.swift.")
            }
        }
    }

    /// The single most dangerous line the device layer ever had: a `connect` inside the
    /// callback that fires when a link drops. It silently re-grabbed the machine — and
    /// gym equipment rotates, so that machine is frequently someone else's by then.
    func testDisconnectAndFailureCallbacksNeverReconnect() throws {
        let callbacks = ["didDisconnectPeripheral", "didFailToConnect"]
        for (name, text) in try swiftSources() {
            let source = code(text)
            for callback in callbacks {
                for body in bodies(of: callback, in: source) {
                    XCTAssertFalse(body.contains("central.connect("),
                                   "\(name): `\(callback)` reconnects. After a drop the athlete is told and CHOOSES — the app never goes back for a machine on its own.")
                    XCTAssertFalse(body.contains(".connect(peripheral"),
                                   "\(name): `\(callback)` reconnects to the peripheral it just lost.")
                }
            }
        }
    }

    /// Brace-matched body of every function whose signature mentions `marker`.
    private func bodies(of marker: String, in source: String) -> [String] {
        var found: [String] = []
        var searchFrom = source.startIndex
        while let hit = source.range(of: marker, range: searchFrom..<source.endIndex) {
            searchFrom = hit.upperBound
            guard let open = source[hit.upperBound...].firstIndex(of: "{") else { continue }
            var depth = 0
            var index = open
            while index < source.endIndex {
                if source[index] == "{" { depth += 1 }
                if source[index] == "}" {
                    depth -= 1
                    if depth == 0 { found.append(String(source[open...index])); break }
                }
                index = source.index(after: index)
            }
        }
        return found
    }

    /// FH-72: one `CBCentralManager` per iOS process, in `DeviceCentral` only.
    func testProductHasExactlyOneCBCentralManagerInit() throws {
        var hits: [(String, Int)] = []
        for (name, text) in try swiftSources() {
            let n = code(text).components(separatedBy: "CBCentralManager(").count - 1
            if n > 0 { hits.append((name, n)) }
        }
        XCTAssertEqual(hits.count, 1, "exactly one product file may construct CBCentralManager")
        XCTAssertEqual(hits.first?.name, "DeviceCentral.swift")
        XCTAssertEqual(hits.first?.1, 1)
    }

    /// Restore re-engages THIS session's peripheral. It is not reconnect-anyone:
    /// no scan, no second central, no 180D else-branch.
    func testWillRestoreStateIsNotReconnectAnyone() throws {
        let sources = try swiftSources()
        guard let text = sources.first(where: { $0.name == "DeviceCentral.swift" })?.text else {
            return XCTFail("DeviceCentral.swift missing")
        }
        let source = code(text)
        let restoreBodies = bodies(of: "willRestoreState", in: source)
        XCTAssertFalse(restoreBodies.isEmpty, "willRestoreState must exist on the one central")
        for body in restoreBodies {
            XCTAssertFalse(body.contains("scanForPeripherals"),
                           "willRestoreState must not scan")
            XCTAssertFalse(body.contains("CBCentralManager("),
                           "willRestoreState must not create another central")
            XCTAssertFalse(body.contains("180D"),
                           "do not copy Apple sample's UserDefaults + 180D else")
            XCTAssertTrue(body.contains("chosenStation"),
                          "connect only after the identifier is THIS session/role/station")
            XCTAssertTrue(body.contains("CBCentralManagerRestoredStatePeripheralsKey"),
                          "only restored peripherals")
        }
        for (name, text) in sources {
            XCTAssertFalse(code(text).contains("NotifyOnDisconnectionKey"),
                           "\(name) uses NotifyOnDisconnectionKey — Apple's alert is for apps without bluetooth-central")
        }
    }

    /// Restore UID is THIS live (`plan.id` + `startedAt`). HealthKit's session
    /// UUID is Watch/FH-75 and must not change the key after the first instantiate.
    func testRestoreUIDIsTheLivePlanIdentityNotHealthKit() {
        let plan = UUID(uuidString: "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA")!
        let started = Date(timeIntervalSince1970: 1_700_000_123.456)
        XCTAssertEqual(
            DeviceCentral.restoreUID(planId: plan, startedAt: started),
            "\(plan.uuidString)|\(Int(started.timeIntervalSince1970 * 1000))"
        )
        XCTAssertEqual(
            DeviceCentral.restoreUID(planId: plan, startedAt: started),
            DeviceCentral.restoreUID(planId: plan, startedAt: started)
        )
    }
}
