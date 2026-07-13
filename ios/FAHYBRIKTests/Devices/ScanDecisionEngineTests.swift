import XCTest
@testable import FAHYBRIK

// The pure scan-decision core — the rule that fixes the gym failure. Given what the
// scan has found + what we remember + whether the settle window elapsed, it decides:
// keep scanning, auto-connect the single remembered device, or present the list.
// No CoreBluetooth, no timers, no view.
final class ScanDecisionEngineTests: XCTestCase {

    private func cand(_ tail: UInt8, rssi: Int = -50) -> DeviceCandidate {
        let id = UUID(uuidString: "00000000-0000-0000-0000-0000000000\(String(format: "%02X", tail))")!
        return DeviceCandidate(id: id, name: "Dev \(tail)", rssi: rssi)
    }

    private func decide(_ candidates: [DeviceCandidate], remembered: DeviceID?, settle: Bool) -> ScanDecision {
        ScanDecisionEngine.decide(candidates: candidates, remembered: remembered, settleElapsed: settle)
    }

    // MARK: - The three named cases

    func testSingleRememberedAutoConnects() {
        let mine = cand(1)
        // Even before the settle window: your machine, alone → straight in.
        XCTAssertEqual(decide([mine], remembered: mine.id, settle: false), .autoConnect(mine.id))
        XCTAssertEqual(decide([mine], remembered: mine.id, settle: true), .autoConnect(mine.id))
    }

    func testMultipleAlwaysPresentsAfterSettle() {
        let a = cand(1, rssi: -70), b = cand(2, rssi: -40)
        // Before settle → keep listening (a third might appear); after → list.
        XCTAssertEqual(decide([a, b], remembered: a.id, settle: false), .keepScanning)
        // Sorted strongest-signal first (b before a).
        XCTAssertEqual(decide([a, b], remembered: a.id, settle: true), .present([b, a]))
    }

    func testRememberedAbsentFallsToListAfterTimeout() {
        let stranger = cand(9)
        let mine = cand(1)
        // Remembered device isn't among what we found → never auto; list after settle.
        XCTAssertEqual(decide([stranger], remembered: mine.id, settle: false), .keepScanning)
        XCTAssertEqual(decide([stranger], remembered: mine.id, settle: true), .present([stranger]))
    }

    // MARK: - The gym bug: never auto-connect to a stranger

    func testSingleUnknownIsNeverAutoConnected() {
        let unknown = cand(7)
        // No remembered device, one machine found — the OLD code grabbed it. Now: list.
        XCTAssertEqual(decide([unknown], remembered: nil, settle: false), .keepScanning)
        XCTAssertEqual(decide([unknown], remembered: nil, settle: true), .present([unknown]))
    }

    func testSingleNonRememberedIsNeverAutoConnected() {
        let mine = cand(1)
        let other = cand(2)
        // One machine found, but it's NOT the one we remember → list, don't auto.
        XCTAssertEqual(decide([other], remembered: mine.id, settle: true), .present([other]))
    }

    // MARK: - Empty

    func testEmptyBeforeSettleKeepsScanning() {
        XCTAssertEqual(decide([], remembered: nil, settle: false), .keepScanning)
    }

    func testEmptyAfterSettlePresentsEmptyList() {
        XCTAssertEqual(decide([], remembered: nil, settle: true), .present([]))
    }
}
